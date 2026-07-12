import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import type { Feature, FeatureCollection } from 'geojson';
import * as THREE from 'three';
import type { MapStyle } from '../mapStyles';
import type { Fight, FightVideo, GlobePoint } from '../types';
import ClusterPopover from './ClusterPopover';
import HoverCard from './HoverCard';

const COLOR_ACTIVE = '#e66767';
const COLOR_HISTORICAL = '#9085e9';
const DARK_CONTOUR = 'rgba(8, 11, 22, 0.85)';

/** One rendered marker: either a single team or a zoom-level cluster. */
export interface Marker {
  key: string;
  kind: 'single' | 'cluster';
  lat: number;
  lng: number;
  point?: GlobePoint;
  members?: GlobePoint[];
  active: boolean;
  selected: boolean;
}

/** Cluster merge distance in degrees, proportional to camera altitude. */
function radiusForAltitude(altitude: number): number {
  return Math.min(8, Math.max(0.12, altitude * 3.2));
}

function clusterPoints(points: GlobePoint[], radius: number, excludeId?: string): Marker[] {
  const clusters: GlobePoint[][] = [];
  for (const p of points) {
    if (p.id === excludeId) continue;
    const home = clusters.find((c) => {
      const cy = c.reduce((s, m) => s + m.glat, 0) / c.length;
      const cx = c.reduce((s, m) => s + m.glng, 0) / c.length;
      return Math.hypot(p.glat - cy, p.glng - cx) < radius;
    });
    if (home) home.push(p);
    else clusters.push([p]);
  }
  return clusters.map((members) => {
    if (members.length === 1) {
      const p = members[0];
      return {
        key: `s:${p.id}`,
        kind: 'single' as const,
        lat: p.glat,
        lng: p.glng,
        point: p,
        active: p.active,
        selected: false,
      };
    }
    const lat = members.reduce((s, m) => s + m.glat, 0) / members.length;
    const lng = members.reduce((s, m) => s + m.glng, 0) / members.length;
    return {
      key: `c:${members.map((m) => m.id).join('.')}`,
      kind: 'cluster' as const,
      lat,
      lng,
      members,
      active: members.some((m) => m.active),
      selected: false,
    };
  });
}

/* ---------- marker textures (canvas-drawn, cached) ---------- */

const textureCache = new Map<string, THREE.CanvasTexture>();

/** Circle badge for every marker — count label for clusters, dot for singles.
 * Dark contour under a white ring keeps it readable on any map style. */
function badgeTexture(color: string, label: string | null, selected: boolean): THREE.CanvasTexture {
  const key = `badge|${color}|${label ?? ''}|${selected}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const cx = S / 2;
  const r = S * 0.33;

  const glow = ctx.createRadialGradient(cx, cx, r * 0.5, cx, cx, S * 0.5);
  glow.addColorStop(0, `${color}90`);
  glow.addColorStop(1, `${color}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);

  ctx.beginPath();
  ctx.arc(cx, cx, r, 0, 2 * Math.PI);
  ctx.lineWidth = selected ? 26 : 20;
  ctx.strokeStyle = DARK_CONTOUR;
  ctx.stroke();
  ctx.lineWidth = selected ? 15 : 9;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();

  if (label) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${label.length > 2 ? 74 : 88}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cx + 4);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cx, S * 0.09, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

interface BotGlobeProps {
  points: GlobePoint[];
  selected: GlobePoint | null;
  onSelect: (point: GlobePoint | null) => void;
  mapStyle: MapStyle;
  fights: Fight[];
  matchVideos: Record<string, FightVideo>;
  onPlayVideo: (video: FightVideo) => void;
}

/** Aggregated head-to-head record between two mapped bots. */
export interface PairRecord {
  a: GlobePoint;
  b: GlobePoint;
  count: number;
  aWins: number;
  bWins: number;
}

interface ArcDatum {
  pair: PairRecord;
  /** head-to-head outcome from the selected bot's perspective */
  outcome: 'won' | 'lost' | 'even';
  video: FightVideo | null;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
}

const ARC_WON = ['rgba(72, 205, 115, 0.85)', 'rgba(72, 205, 115, 0.3)'];
const ARC_LOST = ['rgba(230, 103, 103, 0.85)', 'rgba(230, 103, 103, 0.3)'];
const ARC_EVEN = ['rgba(237, 161, 0, 0.8)', 'rgba(237, 161, 0, 0.3)'];

// Vector world data, fetched once and shared across style switches.
let landCache: Promise<FeatureCollection> | null = null;
let cityCache: Promise<[number, number][]> | null = null;

function loadLand(): Promise<FeatureCollection> {
  landCache ??= fetch('/data/world-land.geojson').then((r) => r.json());
  return landCache;
}

function loadCities(): Promise<[number, number][]> {
  cityCache ??= fetch('/data/cities.json').then((r) => r.json());
  return cityCache;
}

export default function BotGlobe({ points, selected, onSelect, mapStyle, fights, matchVideos, onPlayVideo }: BotGlobeProps) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const altitudeThrottle = useRef(0);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [hovered, setHovered] = useState<Marker | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [altitude, setAltitude] = useState(2.2);
  const [popover, setPopover] = useState<{ members: GlobePoint[]; x: number; y: number } | null>(
    null,
  );
  const [hoveredArc, setHoveredArc] = useState<ArcDatum | null>(null);
  const [land, setLand] = useState<Feature[]>([]);
  const [cities, setCities] = useState<[number, number][]>([]);

  // vector styles need the land polygons (and city sparkles) loaded once
  useEffect(() => {
    if (!mapStyle.vector) return;
    loadLand().then((geo) => setLand(geo.features));
    loadCities().then(setCities);
  }, [mapStyle]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width && height) setSize({ w: width, h: height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const setAutoRotate = useCallback((on: boolean) => {
    const controls = globeRef.current?.controls();
    if (controls) controls.autoRotate = on;
  }, []);

  const handleGlobeReady = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) return;
    globe.pointOfView({ lat: 25, lng: -40, altitude: 2.2 }, 0);
    globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
    controls.minDistance = 120;
    // re-cluster when the camera zoom changes (quantized to avoid churn)
    controls.addEventListener('change', () => {
      const now = performance.now();
      if (now - altitudeThrottle.current < 150) return;
      altitudeThrottle.current = now;
      const alt = globe.pointOfView().altitude;
      setAltitude((prev) => (Math.abs(prev - alt) > 0.04 ? alt : prev));
    });
  }, []);

  const handleInteractionStart = useCallback(() => {
    setAutoRotate(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (!selected) setAutoRotate(true);
    }, 8000);
  }, [selected, setAutoRotate]);

  useEffect(() => {
    if (selected) {
      setAutoRotate(false);
      globeRef.current?.pointOfView(
        { lat: selected.glat, lng: selected.glng, altitude: 0.9 },
        1200,
      );
    } else {
      setAutoRotate(true);
    }
  }, [selected, setAutoRotate]);

  const markers = useMemo(() => {
    const list = clusterPoints(points, radiusForAltitude(altitude), selected?.id);
    if (selected) {
      list.push({
        key: `sel:${selected.id}`,
        kind: 'single',
        lat: selected.glat,
        lng: selected.glng,
        point: selected,
        active: selected.active,
        selected: true,
      });
    }
    return list;
  }, [points, altitude, selected]);

  const makeMarker = useCallback(
    (m: Marker): THREE.Sprite => {
      const color = m.active ? COLOR_ACTIVE : COLOR_HISTORICAL;
      const zoomFactor = Math.min(1, Math.max(0.45, 0.35 + altitude * 0.3));
      const label = m.kind === 'cluster' ? String(m.members!.length) : null;
      const material = new THREE.SpriteMaterial({
        map: badgeTexture(color, label, m.selected),
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      const s =
        (m.kind === 'cluster'
          ? 4.0 + Math.min(1.4, m.members!.length * 0.12)
          : m.selected
            ? 4.6
            : m.active
              ? 2.7
              : 2.2) * zoomFactor;
      sprite.scale.set(s, s, 1);
      sprite.renderOrder = m.selected ? 3 : m.kind === 'cluster' ? 2 : 1;
      return sprite;
    },
    [altitude],
  );

  const handleMarkerClick = useCallback(
    (m: Marker) => {
      setPopover(null);
      if (m.kind === 'single') {
        onSelect(m.point!);
        return;
      }
      // Cluster: zoom in to split it; if it can't split further (same metro),
      // show the member list instead.
      const globe = globeRef.current;
      const alt = globe?.pointOfView().altitude ?? altitude;
      const spread = Math.max(
        ...m.members!.map((p) => Math.hypot(p.glat - m.lat, p.glng - m.lng)),
      );
      if (spread > radiusForAltitude(alt) * 0.12 && alt > 0.3) {
        globe?.pointOfView({ lat: m.lat, lng: m.lng, altitude: Math.max(alt * 0.32, 0.25) }, 800);
      } else {
        setPopover({ members: m.members!, x: cursor.x, y: cursor.y });
      }
    },
    [onSelect, altitude, cursor],
  );

  const rings = useMemo(() => {
    const base = markers
      .filter((m) => m.active && !m.selected)
      .map((m) => ({ lat: m.lat, lng: m.lng, __selected: false }));
    return selected
      ? [...base, { lat: selected.glat, lng: selected.glng, __selected: true }]
      : base;
  }, [markers, selected]);

  // head-to-head aggregation: one record per pair of mapped bots
  const pairRecords = useMemo(() => {
    const byId = new Map(points.map((p) => [p.id, p]));
    const map = new Map<string, PairRecord>();
    for (const f of fights) {
      const a = byId.get(f.a);
      const b = byId.get(f.b);
      if (!a || !b) continue;
      const key = `${f.a}|${f.b}`;
      let rec = map.get(key);
      if (!rec) {
        rec = { a, b, count: 0, aWins: 0, bWins: 0 };
        map.set(key, rec);
      }
      rec.count += 1;
      if (f.winner === f.a) rec.aWins += 1;
      else if (f.winner === f.b) rec.bWins += 1;
    }
    return [...map.values()];
  }, [fights, points]);

  // Arcs appear only for the selected bot: one slim line per past opponent,
  // fanning out from it, colored by the head-to-head outcome (green = leads,
  // red = trails, amber = even).
  const arcs = useMemo<ArcDatum[]>(() => {
    if (!selected) return [];
    return pairRecords
      .filter((r) => r.a.id === selected.id || r.b.id === selected.id)
      .map((pair) => {
        const selIsA = pair.a.id === selected.id;
        const opponent = selIsA ? pair.b : pair.a;
        const selWins = selIsA ? pair.aWins : pair.bWins;
        const oppWins = selIsA ? pair.bWins : pair.aWins;
        return {
          pair,
          outcome: (selWins > oppWins ? 'won' : selWins < oppWins ? 'lost' : 'even') as
            | 'won'
            | 'lost'
            | 'even',
          video: matchVideos[`${pair.a.id}|${pair.b.id}`] ?? null,
          startLat: selected.glat,
          startLng: selected.glng,
          endLat: opponent.glat,
          endLng: opponent.glng,
        };
      });
  }, [pairRecords, selected, matchVideos]);

  // texture styles use a plain material; vector styles tint the bare sphere
  // as the ocean and draw land as crisp polygons on top
  const globeMaterial = useMemo(() => {
    const material = new THREE.MeshPhongMaterial();
    if (mapStyle.vector) {
      material.color = new THREE.Color(mapStyle.vector.ocean);
    } else if (mapStyle.tint) {
      material.color = new THREE.Color(...mapStyle.tint); // >1 brightens the texture
    }
    return material;
  }, [mapStyle]);

  const vectorLand = mapStyle.vector ? land : [];
  const cityDots = useMemo(
    () =>
      mapStyle.vector?.cities
        ? cities.map(([lng, lat]) => ({ lat, lng }))
        : ([] as { lat: number; lng: number }[]),
    [mapStyle, cities],
  );

  return (
    <div
      ref={containerRef}
      className="globe-container"
      onPointerDown={handleInteractionStart}
      onWheel={handleInteractionStart}
      onPointerMove={(e) => setCursor({ x: e.clientX, y: e.clientY })}
    >
      <Globe
        ref={globeRef}
        width={size.w}
        height={size.h}
        globeImageUrl={mapStyle.url ?? null}
        globeMaterial={globeMaterial}
        bumpImageUrl={mapStyle.vector ? null : '/textures/earth-topology.png'}
        backgroundImageUrl="/textures/night-sky.png"
        atmosphereColor={mapStyle.atmosphere}
        atmosphereAltitude={0.28}
        onGlobeReady={handleGlobeReady}
        polygonsData={vectorLand}
        polygonCapColor={() => mapStyle.vector?.land ?? '#000'}
        polygonSideColor={() => 'rgba(0,0,0,0)'}
        polygonStrokeColor={() => mapStyle.vector?.border ?? '#000'}
        polygonAltitude={0.004}
        polygonsTransitionDuration={0}
        pointsData={cityDots}
        pointLat="lat"
        pointLng="lng"
        pointColor={() => mapStyle.vector?.cities ?? '#fff'}
        pointAltitude={0.005}
        pointRadius={0.09}
        pointsMerge={true}
        objectsData={markers}
        objectLat="lat"
        objectLng="lng"
        objectAltitude={0.008}
        objectThreeObject={(d) => makeMarker(d as Marker)}
        onObjectHover={(d) => setHovered((d as Marker | null) ?? null)}
        onObjectClick={(d) => handleMarkerClick(d as Marker)}
        onGlobeClick={() => {
          setPopover(null);
          onSelect(null);
        }}
        ringsData={rings}
        ringLat="lat"
        ringLng="lng"
        ringColor={(d: object) =>
          (d as { __selected: boolean }).__selected
            ? (t: number) => `rgba(255, 255, 255, ${Math.max(0, 1 - t) * 0.9})`
            : (t: number) => `rgba(230, 103, 103, ${Math.max(0, 1 - t) * 0.45})`
        }
        ringMaxRadius={(d: object) => ((d as { __selected: boolean }).__selected ? 4 : 2.4)}
        ringPropagationSpeed={(d: object) => ((d as { __selected: boolean }).__selected ? 2.2 : 1.3)}
        ringRepeatPeriod={(d: object) => ((d as { __selected: boolean }).__selected ? 900 : 1700)}
        arcsData={arcs}
        arcStartLat="startLat"
        arcStartLng="startLng"
        arcEndLat="endLat"
        arcEndLng="endLng"
        arcColor={(d: object) => {
          const o = (d as ArcDatum).outcome;
          return o === 'won' ? ARC_WON : o === 'lost' ? ARC_LOST : ARC_EVEN;
        }}
        arcStroke={(d: object) => Math.min(0.38, 0.14 + (d as ArcDatum).pair.count * 0.05)}
        arcAltitudeAutoScale={0.35}
        arcsTransitionDuration={300}
        onArcHover={(d) => setHoveredArc((d as ArcDatum | null) ?? null)}
        onArcClick={(d) => {
          const arc = d as ArcDatum;
          if (arc.video) onPlayVideo(arc.video);
        }}
      />
      {hovered?.kind === 'single' && hovered.point && (
        <HoverCard point={hovered.point} x={cursor.x} y={cursor.y} />
      )}
      {hovered?.kind === 'cluster' && (
        <div className="globe-tip cluster-tip" style={{ left: cursor.x + 14, top: cursor.y + 14 }}>
          <div className="globe-tip-text">
            <div className="globe-tip-bot">{hovered.members!.length} robots</div>
            <div className="globe-tip-place">click to explore</div>
          </div>
        </div>
      )}
      {hoveredArc && (
        <div className="globe-tip arc-tip" style={{ left: cursor.x + 14, top: cursor.y + 14 }}>
          {hoveredArc.video && (
            <span className="arc-tip-thumb">
              <img src={`https://i.ytimg.com/vi/${hoveredArc.video.id}/mqdefault.jpg`} alt="" />
              <span className="video-play" aria-hidden="true">▶</span>
            </span>
          )}
          <div className="globe-tip-text">
            <div className="globe-tip-bot">
              {hoveredArc.pair.a.bot} vs {hoveredArc.pair.b.bot}
            </div>
            <div className="globe-tip-place">
              {hoveredArc.pair.count} fight{hoveredArc.pair.count > 1 ? 's' : ''} ·{' '}
              {hoveredArc.pair.aWins}–{hoveredArc.pair.bWins}
            </div>
            {hoveredArc.video && <div className="arc-tip-cta">▶ Click the arc to watch this fight</div>}
          </div>
        </div>
      )}
      {popover && (
        <ClusterPopover
          members={popover.members}
          x={popover.x}
          y={popover.y}
          onPick={(p) => {
            setPopover(null);
            onSelect(p);
          }}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}
