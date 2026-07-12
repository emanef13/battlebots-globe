import { useEffect, useMemo, useState } from 'react';
import BotGlobe from './components/BotGlobe';
import Header from './components/Header';
import TeamPanel from './components/TeamPanel';
import Ticker from './components/Ticker';
import VideoModal from './components/VideoModal';
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

/** Win–loss record for a bot across the mapped fight history. */
function recordFor(fights: Fight[], id: string): { wins: number; losses: number } | null {
  let wins = 0;
  let losses = 0;
  for (const f of fights) {
    if (f.a !== id && f.b !== id) continue;
    if (f.winner === id) wins += 1;
    else if (f.winner) losses += 1;
  }
  return wins + losses > 0 ? { wins, losses } : null;
}

export default function App() {
  const [data, setData] = useState<TeamsFile | null>(null);
  const [videos, setVideos] = useState<VideosFile | null>(null);
  const [fights, setFights] = useState<Fight[]>([]);
  const [matchVideos, setMatchVideos] = useState<Record<string, FightVideo>>({});
  const [playing, setPlaying] = useState<FightVideo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GlobePoint | null>(null);
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

  // Escape closes the panel (the video modal handles its own Escape first)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !playing) setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing]);

  return (
    <div className="app">
      <BotGlobe
        points={points}
        selected={selected}
        onSelect={setSelected}
        mapStyle={mapStyle}
        fights={fights}
        matchVideos={matchVideos}
        onPlayVideo={setPlaying}
      />
      <Header points={points} onSelect={setSelected} />

      <div className="legend" role="note" aria-label="Map legend">
        <span className="legend-item">
          <span className="legend-ring" aria-hidden="true" /> Pro League 2026
        </span>
        <span className="legend-item">
          <span className="legend-dot is-historical" aria-hidden="true" /> Historical robot
        </span>
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

      {selected && (
        <TeamPanel
          team={selected}
          videos={videos?.videos[selected.id] ?? []}
          record={recordFor(fights, selected.id)}
          onPlay={setPlaying}
          onClose={() => setSelected(null)}
        />
      )}
      {playing && <VideoModal video={playing} onClose={() => setPlaying(null)} />}
      <Ticker points={points} onSelect={setSelected} />

      {!data && !error && <div className="loading">Loading the arena…</div>}
      {error && <div className="loading error">Failed to load team data: {error}</div>}
    </div>
  );
}
