import { useEffect, useMemo, useState } from 'react';
import { trackEvent } from './analytics';
import BotGlobe from './components/BotGlobe';
import FightMode from './components/FightMode';
import Header from './components/Header';
import TeamPanel from './components/TeamPanel';
import VideoModal from './components/VideoModal';
import { recordFor } from './fightStats';
import { resolveMapStyle } from './mapStyles';
import type { Fight, FightsFile, FightVideo, GlobePoint, MatchVideosFile, Team, TeamsFile, VideosFile } from './types';

/**
 * Every robot gets its own pin. Teams in the same city would stack exactly,
 * so co-located groups (within ~0.25°) fan out on a small golden-angle spiral.
 */
const STACK_RADIUS = 0.25;
const GOLDEN_ANGLE = 2.399963;

function toGlobePoints(teams: Team[]): GlobePoint[] {
  const groups: Team[][] = [];
  for (const t of teams) {
    const home = groups.find(
      (g) => Math.hypot(t.lat - g[0].lat, t.lng - g[0].lng) < STACK_RADIUS,
    );
    if (home) home.push(t);
    else groups.push([t]);
  }
  const points: GlobePoint[] = [];
  for (const group of groups) {
    group.forEach((t, i) => {
      if (i === 0) {
        points.push({ ...t, glat: t.lat, glng: t.lng });
        return;
      }
      const r = 0.22 * Math.sqrt(i);
      const a = i * GOLDEN_ANGLE;
      points.push({ ...t, glat: t.lat + r * Math.sin(a), glng: t.lng + r * Math.cos(a) });
    });
  }
  return points;
}

export default function App() {
  const [data, setData] = useState<TeamsFile | null>(null);
  const [videos, setVideos] = useState<VideosFile | null>(null);
  const [fights, setFights] = useState<Fight[]>([]);
  const [matchVideos, setMatchVideos] = useState<Record<string, FightVideo>>({});
  const [playing, setPlaying] = useState<FightVideo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GlobePoint | null>(null);
  // Head-to-head: a challenger waiting for an opponent, then the locked pair.
  const [challenger, setChallenger] = useState<GlobePoint | null>(null);
  const [fightPair, setFightPair] = useState<[GlobePoint, GlobePoint] | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; altitude: number; nonce: number } | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'historical'>('all');
  // Always Night — Classic; ?map= still works for demos.
  const mapStyle = useMemo(
    () =>
      resolveMapStyle(new URLSearchParams(window.location.search).get('map') ?? 'night-classic'),
    [],
  );

  useEffect(() => {
    fetch('/data/teams.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<TeamsFile>;
      })
      .then(setData)
      .catch((e) => setError(String(e)));
    // videos and fight history are optional — the globe works without them
    fetch('/data/videos.json')
      .then((r) => (r.ok ? (r.json() as Promise<VideosFile>) : null))
      .then(setVideos)
      .catch(() => null);
    fetch('/data/fights.json')
      .then((r) => (r.ok ? (r.json() as Promise<FightsFile>) : null))
      .then((f) => f && setFights(f.fights))
      .catch(() => null);
    fetch('/data/match_videos.json')
      .then((r) => (r.ok ? (r.json() as Promise<MatchVideosFile>) : null))
      .then((m) => m && setMatchVideos(m.videos))
      .catch(() => null);
  }, []);

  const points = useMemo(() => (data ? toGlobePoints(data.teams) : []), [data]);

  // deep links from the static SEO pages: /?bot=<id> selects that robot
  useEffect(() => {
    if (points.length === 0) return;
    const id = new URLSearchParams(window.location.search).get('bot');
    const p = id && points.find((x) => x.id === id);
    if (p) setSelected(p);
  }, [points]);

  // Legend filter: show only one category on the globe when selected.
  const globePoints = useMemo(
    () =>
      filter === 'all' ? points : points.filter((p) => (filter === 'active' ? p.active : !p.active)),
    [points, filter],
  );

  const toggleFilter = (category: 'active' | 'historical') => {
    trackEvent('filter_toggle', { filter: category });
    setFilter((f) => (f === category ? 'all' : category));
    setSelected((sel) =>
      sel && ((category === 'active' && !sel.active) || (category === 'historical' && sel.active))
        ? null
        : sel,
    );
  };

  // Fly the camera to a country: centroid of its teams, altitude by spread.
  const focusCountry = (country: string) => {
    const members = points.filter((p) => p.country === country);
    if (members.length === 0) return;
    const lat = members.reduce((s, p) => s + p.lat, 0) / members.length;
    const lng = members.reduce((s, p) => s + p.lng, 0) / members.length;
    const spread = Math.max(
      ...members.map((p) => Math.hypot(p.lat - lat, p.lng - lng)),
      0,
    );
    const altitude = Math.min(2.2, Math.max(0.5, spread * 0.055 + 0.35));
    trackEvent('country_focus', { country });
    setSelected(null);
    setFocus({ lat, lng, altitude, nonce: Date.now() });
  };

  const startFight = (a: GlobePoint, b: GlobePoint, via: 'search' | 'arc' | 'challenge') => {
    if (a.id === b.id) return;
    trackEvent('fight_mode', { a: a.id, b: b.id, via });
    setChallenger(null);
    setSelected(null);
    setFocus(null);
    setFightPair([a, b]);
  };

  const playVideo = (v: FightVideo) => {
    trackEvent('video_play', { video: v.id, title: v.title.slice(0, 80) });
    setPlaying(v);
  };

  // While a challenger waits, the next bot picked becomes the opponent.
  const handleSelect = (p: GlobePoint | null) => {
    if (fightPair) {
      // clicking the globe backs out of fight mode, like closing the panel
      if (!p) setFightPair(null);
      return;
    }
    if (challenger && p && p.id !== challenger.id) {
      startFight(challenger, p, 'challenge');
      return;
    }
    if (p) trackEvent('bot_selected', { bot: p.id });
    setSelected(p);
  };

  // Escape backs out one layer: video modal handles its own Escape first,
  // then fight mode, then opponent-select, then the team panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || playing) return;
      if (fightPair) setFightPair(null);
      else if (challenger) setChallenger(null);
      else setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, fightPair, challenger]);

  return (
    <div className="app">
      <BotGlobe
        points={globePoints}
        selected={selected}
        onSelect={handleSelect}
        mapStyle={mapStyle}
        fights={fights}
        matchVideos={matchVideos}
        onPlayVideo={playVideo}
        focus={focus}
        fightPair={fightPair}
        onFight={(a, b) => startFight(a, b, 'arc')}
      />
      <Header
        points={points}
        onSelect={handleSelect}
        onFocusCountry={focusCountry}
        onVersus={(a, b) => startFight(a, b, 'search')}
      />

      {challenger && !fightPair && (
        <div className="challenge-banner" role="status">
          <span className="challenge-banner-text">
            ⚔ Choose an opponent for <b>{challenger.bot}</b> — click any robot
          </span>
          <button onClick={() => setChallenger(null)}>Cancel</button>
        </div>
      )}

      {!fightPair && (
      <div className="legend" role="note" aria-label="Map legend">
        <button
          className={`legend-item legend-toggle ${filter === 'historical' ? 'is-off' : ''}`}
          onClick={() => toggleFilter('active')}
          title="Show only Pro League robots"
        >
          <span className="legend-ring" aria-hidden="true" /> Pro League 2026
        </button>
        <button
          className={`legend-item legend-toggle ${filter === 'active' ? 'is-off' : ''}`}
          onClick={() => toggleFilter('historical')}
          title="Show only historical robots"
        >
          <span className="legend-dot is-historical" aria-hidden="true" /> Historical robot
        </button>
        {selected && (
          <>
            <span className="legend-item">
              <span className="legend-line line-won" aria-hidden="true" /> Leads rivalry
            </span>
            <span className="legend-item">
              <span className="legend-line line-lost" aria-hidden="true" /> Trails rivalry
            </span>
            <span className="legend-item">
              <span className="legend-line line-even" aria-hidden="true" /> Even
            </span>
          </>
        )}
      </div>
      )}

      {selected && !fightPair && (
        <TeamPanel
          team={selected}
          videos={videos?.videos[selected.id] ?? []}
          record={recordFor(fights, selected.id)}
          onPlay={playVideo}
          onClose={() => setSelected(null)}
          onChallenge={() => {
            trackEvent('challenge_started', { bot: selected.id });
            setChallenger(selected);
            setSelected(null);
          }}
        />
      )}
      {fightPair && (
        <FightMode
          a={fightPair[0]}
          b={fightPair[1]}
          points={points}
          fights={fights}
          matchVideos={matchVideos}
          onPlayVideo={playVideo}
          onClose={() => setFightPair(null)}
        />
      )}
      {playing && <VideoModal video={playing} onClose={() => setPlaying(null)} />}

      {!data && !error && <div className="loading">Loading the arena…</div>}
      {error && <div className="loading error">Failed to load team data: {error}</div>}
    </div>
  );
}
