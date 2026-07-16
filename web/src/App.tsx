import { useEffect, useMemo, useRef, useState } from 'react';
import { trackEvent } from './analytics';
import BotGlobe from './components/BotGlobe';
import ChatWidget, { type ChatAction } from './components/ChatWidget';
import FightMode from './components/FightMode';
import Header from './components/Header';
import NewsTicker, { type NewsItem } from './components/NewsTicker';

const NEWS_ENABLED = true;
const CHAT_ENABLED = false;
import TeamPanel, { type ContactGroups } from './components/TeamPanel';
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
  const [contacts, setContacts] = useState<Record<string, ContactGroups>>({});
  const [news, setNews] = useState<NewsItem[]>([]);
  const [playing, setPlaying] = useState<FightVideo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GlobePoint | null>(null);
  // Head-to-head: a challenger waiting for an opponent, then the locked pair.
  const [challenger, setChallenger] = useState<GlobePoint | null>(null);
  const [fightPair, setFightPair] = useState<[GlobePoint, GlobePoint] | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; altitude: number; nonce: number } | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'historical'>('all');
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  // set when a fresh-post icon on the globe is clicked
  const [newsFocus, setNewsFocus] = useState<{ teamId: string; nonce: number } | null>(null);
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
    fetch('/data/contacts.json')
      .then((r) => (r.ok ? (r.json() as Promise<{ contacts: Record<string, ContactGroups> }>) : null))
      .then((c) => c && setContacts(c.contacts))
      .catch(() => null);
    // community news only, from the CDN-cached /api/news function
    fetch('/api/news')
      .then((r) => (r.ok ? (r.json() as Promise<{ items: NewsItem[] }>) : null))
      .then((live) => live && setNews(live.items.slice(0, 80)))
      .catch(() => null);
  }, []);

  const points = useMemo(() => (data ? toGlobePoints(data.teams) : []), [data]);

  // teams with a post in the last 7 days get their platform's icon above
  // their globe pin — the globe itself shows who's active this week
  const freshPosts = useMemo(() => {
    const cutoff = new Date(Date.now() - 7 * 86400e3).toISOString().slice(0, 10);
    const map: Record<string, string> = {};
    for (const n of news) {
      if (n.source === 'team' && n.team_id && n.platform && n.date >= cutoff && !map[n.team_id]) {
        map[n.team_id] = n.platform;
      }
    }
    return map;
  }, [news]);

  // deep links from the static SEO pages: /?bot=<id> selects that robot
  useEffect(() => {
    if (points.length === 0) return;
    const id = new URLSearchParams(window.location.search).get('bot');
    const p = id && points.find((x) => x.id === id);
    if (p) setSelected(p);
  }, [points]);

  // Legend filter: show only one category on the globe when selected.
  // A team filter (from the header stat) narrows further to that team's bots.
  const globePoints = useMemo(() => {
    const byCategory =
      filter === 'all' ? points : points.filter((p) => (filter === 'active' ? p.active : !p.active));
    return teamFilter ? byCategory.filter((p) => p.team === teamFilter) : byCategory;
  }, [points, filter, teamFilter]);

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

  // Filter the globe down to one team's robots and fly the camera to them.
  const focusTeam = (team: string) => {
    const members = points.filter((p) => p.team === team);
    if (members.length === 0) return;
    const lat = members.reduce((s, p) => s + p.lat, 0) / members.length;
    const lng = members.reduce((s, p) => s + p.lng, 0) / members.length;
    const spread = Math.max(...members.map((p) => Math.hypot(p.lat - lat, p.lng - lng)), 0);
    const altitude = Math.min(2.2, Math.max(0.5, spread * 0.055 + 0.35));
    trackEvent('team_focus', { team });
    setSelected(null);
    setTeamFilter(team);
    setFocus({ lat, lng, altitude, nonce: Date.now() });
  };

  // The team banner is draggable (mouse/touch) so it never blocks what the
  // user wants to see — especially on mobile. The offset lives in refs and is
  // written straight to CSS vars during the drag: no re-renders mid-gesture,
  // and the spot is remembered while the app is open.
  const bannerPos = useRef({ x: 0, y: 0 });
  const bannerDrag = useRef<{ id: number; sx: number; sy: number; bx: number; by: number } | null>(null);
  const bannerDragged = useRef(false); // suppresses the button click that follows a drag
  const applyBannerOffset = (el: HTMLDivElement | null) => {
    el?.style.setProperty('--drag-x', `${bannerPos.current.x}px`);
    el?.style.setProperty('--drag-y', `${bannerPos.current.y}px`);
  };
  const onBannerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    bannerDrag.current = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      bx: bannerPos.current.x,
      by: bannerPos.current.y,
    };
    // capture is taken lazily in pointermove: capturing here would retarget
    // the tap's click event to this div and the ✕ button would never fire
  };
  const onBannerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = bannerDrag.current;
    if (!d || e.pointerId !== d.id) return;
    let nx = d.bx + e.clientX - d.sx;
    let ny = d.by + e.clientY - d.sy;
    if (!bannerDragged.current && Math.hypot(nx - d.bx, ny - d.by) <= 5) return;
    if (!bannerDragged.current) e.currentTarget.setPointerCapture(e.pointerId);
    bannerDragged.current = true;
    // clamp the prospective position so the banner can't leave the viewport
    const r = e.currentTarget.getBoundingClientRect();
    const left = r.left + (nx - bannerPos.current.x);
    const top = r.top + (ny - bannerPos.current.y);
    nx += Math.min(Math.max(left, 8), window.innerWidth - r.width - 8) - left;
    ny += Math.min(Math.max(top, 8), window.innerHeight - r.height - 8) - top;
    bannerPos.current = { x: nx, y: ny };
    applyBannerOffset(e.currentTarget);
  };
  const onBannerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (bannerDrag.current?.id !== e.pointerId) return;
    bannerDrag.current = null;
    // the click event fires synchronously after pointerup: let it see the
    // dragged flag (and be suppressed), then clear it for future clicks
    if (bannerDragged.current) setTimeout(() => (bannerDragged.current = false), 0);
  };

  const startFight = (a: GlobePoint, b: GlobePoint, via: 'search' | 'arc' | 'challenge') => {
    if (a.id === b.id) return;
    trackEvent('fight_mode', { a: a.id, b: b.id, via });
    setChallenger(null);
    setSelected(null);
    setFocus(null);
    setFightPair([a, b]);
  };

  // leaving fight mode returns to the bot the fight started with,
  // panel open and camera flying back to it
  const closeFight = () => {
    setFightPair((pair) => {
      if (pair) setSelected(pair[0]);
      return null;
    });
  };

  const playVideo = (v: FightVideo) => {
    trackEvent('video_play', { video: v.id, title: v.title.slice(0, 80) });
    setPlaying(v);
  };

  const openNews = (item: NewsItem) => {
    trackEvent('news_click', { text: item.text.slice(0, 80) });
    if (item.vs) {
      const a = points.find((p) => p.id === item.vs![0]);
      const b = points.find((p) => p.id === item.vs![1]);
      if (a && b) startFight(a, b, 'search');
      return;
    }
    if (item.bot) {
      const p = points.find((x) => x.id === item.bot);
      if (p) {
        setChallenger(null);
        setFightPair(null);
        setSelected(p);
      }
      return;
    }
    if (item.url) {
      window.open(item.url, item.url.startsWith('http') ? '_blank' : '_self', 'noopener');
    }
  };

  // Pit Boss drives the globe through the same paths the UI uses
  const chatAction = (action: ChatAction) => {
    if (action.type === 'bot') {
      const p = points.find((x) => x.id === action.id);
      if (p) {
        setChallenger(null);
        setFightPair(null);
        setSelected(p);
      }
    } else if (action.type === 'vs') {
      const a = points.find((x) => x.id === action.a);
      const b = points.find((x) => x.id === action.b);
      if (a && b) startFight(a, b, 'search');
    } else if (action.type === 'country') {
      const match = points.find(
        (x) => (x.country ?? '').toLowerCase() === action.name.toLowerCase(),
      );
      if (match?.country) focusCountry(match.country);
    }
  };

  // While a challenger waits, the next bot picked becomes the opponent.
  const handleSelect = (p: GlobePoint | null) => {
    if (fightPair) {
      // clicking the globe backs out of fight mode, back to the challenger
      if (!p) closeFight();
      return;
    }
    if (challenger && p && p.id !== challenger.id) {
      startFight(challenger, p, 'challenge');
      return;
    }
    if (p) trackEvent('bot_selected', { bot: p.id });
    // picking a bot outside the current team filter (via search/chips)
    // releases the filter so its marker isn't invisible on the globe
    if (p && teamFilter && p.team !== teamFilter) setTeamFilter(null);
    setSelected(p);
  };

  // Escape backs out one layer: video modal handles its own Escape first,
  // then fight mode, then opponent-select, then the team panel, then the
  // team filter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || playing) return;
      if (fightPair) closeFight();
      else if (challenger) setChallenger(null);
      else if (selected) setSelected(null);
      else if (teamFilter) setTeamFilter(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, fightPair, challenger, selected, teamFilter]);

  return (
    <div className="app">
      <BotGlobe
        points={globePoints}
        allPoints={points}
        freshPosts={freshPosts}
        selected={selected}
        onSelect={handleSelect}
        mapStyle={mapStyle}
        fights={fights}
        matchVideos={matchVideos}
        onPlayVideo={playVideo}
        focus={focus}
        fightPair={fightPair}
        onFight={(a, b) => startFight(a, b, 'arc')}
        onOpenNews={(teamId) => {
          trackEvent('news_click', { team: teamId, via: 'globe_icon' });
          setNewsFocus({ teamId, nonce: Date.now() });
        }}
      />
      <Header
        points={points}
        onSelect={handleSelect}
        onFocusCountry={focusCountry}
        onFocusTeam={focusTeam}
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

      {teamFilter && !fightPair && !challenger && (
        <div
          className="challenge-banner team-banner"
          role="status"
          ref={applyBannerOffset}
          onPointerDown={onBannerPointerDown}
          onPointerMove={onBannerPointerMove}
          onPointerUp={onBannerPointerUp}
          onPointerCancel={onBannerPointerUp}
        >
          <span className="team-banner-grip" aria-hidden="true">⠿</span>
          <span className="challenge-banner-text">
            Showing <b>{teamFilter}</b> —{' '}
            {points.filter((p) => p.team === teamFilter).length} robots
          </span>
          <button onClick={() => !bannerDragged.current && setTeamFilter(null)}>
            ✕ Show all robots
          </button>
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
          contacts={contacts[selected.id]}
          onPlay={playVideo}
          onClose={() => setSelected(null)}
          onFocusTeam={focusTeam}
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
          onClose={closeFight}
        />
      )}
      {playing && <VideoModal video={playing} onClose={() => setPlaying(null)} />}
      {NEWS_ENABLED && !fightPair && (
        <NewsTicker
          items={news}
          markers={Object.fromEntries(points.map((p) => [p.id, p.marker]))}
          openRequest={newsFocus}
          onOpen={openNews}
        />
      )}
      {CHAT_ENABLED && (
        <ChatWidget
          hidden={Boolean(selected) || Boolean(fightPair) || Boolean(playing)}
          onAction={chatAction}
        />
      )}

      {!data && !error && <div className="loading">Loading the arena…</div>}
      {error && <div className="loading error">Failed to load team data: {error}</div>}
    </div>
  );
}
