import { useEffect, useState } from 'react';

export interface NewsItem {
  date: string;
  text: string;
  bot?: string | null;
  vs?: [string, string] | null;
  url?: string | null;
  /** scraped items carry their origin; curated globe updates have none */
  source?: 'official' | 'instagram' | 'reddit' | 'news' | 'team' | string;
  /** team-channel posts: which bot/team posted, and on which platform */
  team_id?: string;
  team?: string;
  platform?: string;
}

/* platform favicons in web/public/icons/ — the same real brand artwork
 * used for the team contact links; no invented circles or recolors */
const SOURCE_META: Record<string, { label: string; handle: string; color: string; icon: string }> = {
  official: { label: 'Facebook', handle: 'BattleBots', color: '#0866FF', icon: '/icons/facebook.png' },
  instagram: { label: 'Instagram', handle: 'battlebots', color: '#FF0069', icon: '/icons/instagram.png' },
  reddit: { label: 'Reddit', handle: 'r/battlebots', color: '#FF4500', icon: '/icons/reddit.png' },
  news: { label: 'Google News', handle: 'Google News', color: '#4285F4', icon: '/icons/google.png' },
  team: { label: 'Teams', handle: 'Team channel', color: '#eda100', icon: '/icons/youtube.png' },
};
const sourceOf = (n: NewsItem) => (n.source && SOURCE_META[n.source] ? n.source : null);

interface NewsTickerProps {
  items: NewsItem[];
  /** id -> globe marker sprite, for team-post avatars */
  markers: Record<string, string | null | undefined>;
  onOpen: (item: NewsItem) => void;
}

const SEEN_KEY = 'bb-news-seen';

/** Floating "Arena News" pill under the site title. Hover (or tap) opens a
 * simple branded dropdown with the community feed: official posts,
 * r/battlebots, and the teams' own channels. */
export default function NewsTicker({ items, markers, onOpen }: NewsTickerProps) {
  const [open, setOpen] = useState(false);
  const [feedFilter, setFeedFilter] = useState('all');
  const canHover = window.matchMedia('(hover: hover)').matches;
  // "N new since your last visit" — the reason to click back in
  const [lastSeen, setLastSeen] = useState(() => localStorage.getItem(SEEN_KEY) ?? '');
  const newCount = items.filter((n) => n.date > lastSeen).length;

  const openFeed = () => {
    setOpen(true);
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(SEEN_KEY, today);
    setLastSeen(today);
  };

  // Esc closes before the app-level handler; outside tap closes on touch
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onOutside = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest('.news-float')) setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onOutside, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onOutside, true);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div
      className="news-float"
      onMouseEnter={canHover ? openFeed : undefined}
      onMouseLeave={canHover ? () => setOpen(false) : undefined}
    >
      <button
        className="news-pill"
        onClick={() => (open ? setOpen(false) : openFeed())}
        aria-expanded={open}
        aria-label="Arena news"
      >
        <span className="news-live-dot" aria-hidden="true" />
        Arena News
        {newCount > 0 && <span className="news-new-count">{newCount > 9 ? '9+' : newCount}</span>}
      </button>

      {open && (
        <div className="news-panel" role="region" aria-label="Community news feed">
          <nav className="news-tabs" aria-label="Filter by source">
            {Object.keys(SOURCE_META)
              .filter((k) => items.some((n) => sourceOf(n) === k))
              .map((k) => (
                <button
                  key={k}
                  className={`news-tab${feedFilter === k ? ' is-on' : ''}`}
                  style={{ '--tab': SOURCE_META[k].color } as React.CSSProperties}
                  onClick={() => setFeedFilter((f) => (f === k ? 'all' : k))}
                  aria-pressed={feedFilter === k}
                  title={feedFilter === k ? 'Show all sources' : `Only ${SOURCE_META[k].label}`}
                >
                  <img src={SOURCE_META[k].icon} alt={SOURCE_META[k].label} />
                </button>
              ))}
          </nav>
          <div className="news-list">
            {items
              .filter((n) => sourceOf(n) !== null)
              .filter((n) => feedFilter === 'all' || sourceOf(n) === feedFilter)
              .map((n, i) => {
                const key = sourceOf(n)!;
                const meta = SOURCE_META[key];
                const isTeam = key === 'team' && n.team_id;
                const marker = isTeam ? markers[n.team_id!] : null;
                const canOpen = Boolean(n.bot || n.vs || n.url);
                const date = new Date(`${n.date}T00:00:00Z`).toLocaleDateString('en', {
                  month: 'short',
                  day: 'numeric',
                });
                return (
                  <button
                    key={`${n.url ?? n.text}-${i}`}
                    className="news-post"
                    disabled={!canOpen}
                    onClick={() => {
                      if (!canOpen) return;
                      setOpen(false);
                      onOpen(n);
                    }}
                  >
                    <span className="news-post-head">
                      {marker ? (
                        <span className="news-avatar is-bot">
                          <img src={marker} alt="" loading="lazy" />
                        </span>
                      ) : (
                        <img className="news-avatar-icon" src={meta.icon} alt="" loading="lazy" />
                      )}
                      <span className="news-handle">{isTeam ? n.team : meta.handle}</span>
                      {isTeam && n.platform && (
                        <img className="news-platform" src={`/icons/${n.platform}.png`} alt={n.platform} />
                      )}
                      <span className="news-item-date">{date}</span>
                      {isTeam && (
                        <span
                          role="button"
                          tabIndex={0}
                          className="news-globe-btn"
                          title={`Find ${n.team} on the globe`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpen(false);
                            onOpen({ ...n, url: null, bot: n.team_id });
                          }}
                          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.click()}
                        >
                          📍
                        </span>
                      )}
                    </span>
                    <span className="news-post-text">
                      {isTeam && n.team && n.text.startsWith(`${n.team}: `)
                        ? n.text.slice(n.team.length + 2)
                        : n.text}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
