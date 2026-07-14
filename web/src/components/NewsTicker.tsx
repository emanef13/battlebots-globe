import { useEffect, useState } from 'react';

export interface NewsItem {
  date: string;
  text: string;
  bot?: string | null;
  vs?: [string, string] | null;
  url?: string | null;
  /** scraped items carry their origin; curated globe updates have none */
  source?: 'official' | 'instagram' | 'reddit' | 'news' | string;
}

// real brand glyphs (simple-icons paths, 24x24 viewBox)
const ICON_PATHS: Record<string, string> = {
  official: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
  instagram: 'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077',
  reddit: 'M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z',
  news: 'M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z',
};

const SOURCE_META: Record<string, { label: string; handle: string; color: string }> = {
  official: { label: 'Facebook', handle: 'BattleBots', color: '#0866FF' },
  instagram: { label: 'Instagram', handle: 'battlebots', color: '#FF0069' },
  reddit: { label: 'Reddit', handle: 'r/battlebots', color: '#FF4500' },
  news: { label: 'News', handle: 'Google News', color: '#4285F4' },
  globe: { label: 'Globe', handle: 'battlebotsglobe.com', color: '#eda100' },
};
const sourceOf = (n: NewsItem) => (n.source && SOURCE_META[n.source] ? n.source : 'globe');

function SourceIcon({ source, size = 18 }: { source: string; size?: number }) {
  if (source === 'globe') {
    return <img src="/favicon.svg" width={size} height={size} alt="" />;
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d={ICON_PATHS[source]} />
    </svg>
  );
}

interface NewsTickerProps {
  items: NewsItem[];
  onOpen: (item: NewsItem) => void;
}

const ROTATE_MS = 8000;

/** Broadcast-style lower third: red ARENA NEWS badge, rotating headlines,
 * manual prev/next navigation. Clicking a headline jumps to the bot or
 * fight it mentions. */
export default function NewsTicker({ items, onOpen }: NewsTickerProps) {
  // the bar rotates only the freshest stories; the Gazette shows everything
  const ticker = items.slice(0, 8);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [feedFilter, setFeedFilter] = useState('all');

  // capture-phase so Escape closes the paper without also reaching the
  // app-level handler that closes panels / fight mode
  useEffect(() => {
    if (!archiveOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setArchiveOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [archiveOpen]);

  // restarting on index change gives a full interval after manual moves too
  useEffect(() => {
    if (paused || ticker.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % ticker.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [paused, ticker.length, index]);

  if (items.length === 0) return null;
  const item = ticker[index % ticker.length];
  const clickable = Boolean(item.bot || item.vs || item.url);
  const step = (d: number) => setIndex((i) => (i + d + ticker.length) % ticker.length);
  const day = new Date(`${item.date}T00:00:00Z`).toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <>
    <div
      className="news-chyron"
      role="region"
      aria-label="Latest news"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <button
        className="news-badge"
        onClick={() => setArchiveOpen(true)}
        title="Open the Arena Gazette"
      >
        <span className="news-live-dot" aria-hidden="true" />
        Arena News
      </button>
      <button
        key={index}
        className={`news-headline${clickable ? ' is-clickable' : ''}`}
        onClick={() => clickable && onOpen(item)}
        disabled={!clickable}
      >
        <span className="news-date">{day}</span>
        <span className="news-text">{item.text}</span>
      </button>
      {ticker.length > 1 && (
        <span className="news-nav">
          <button className="news-arrow" onClick={() => step(-1)} aria-label="Previous headline">
            ‹
          </button>
          <span className="news-dots">
            {ticker.map((_, i) => (
              <button
                key={i}
                className={i === index % ticker.length ? 'is-on' : ''}
                onClick={() => setIndex(i)}
                aria-label={`Headline ${i + 1}`}
              />
            ))}
          </span>
          <button className="news-arrow" onClick={() => step(1)} aria-label="Next headline">
            ›
          </button>
        </span>
      )}
    </div>
      {archiveOpen && (
        <div
          className="phone-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Arena news feed"
          onClick={() => setArchiveOpen(false)}
        >
          <div className="phone" onClick={(e) => e.stopPropagation()}>
            <div className="phone-notch" aria-hidden="true" />
            <button
              className="phone-close"
              onClick={() => setArchiveOpen(false)}
              aria-label="Close news feed"
            >
              ×
            </button>
            <header className="phone-appbar">
              <span className="news-live-dot" aria-hidden="true" />
              <span className="phone-appname">Arena News</span>
            </header>
            <nav className="phone-tabs" aria-label="Filter by source">
              {['all', ...Object.keys(SOURCE_META).filter((k) => items.some((n) => sourceOf(n) === k))].map(
                (k) => (
                  <button
                    key={k}
                    className={`phone-tab${feedFilter === k ? ' is-on' : ''}`}
                    style={k !== 'all' ? ({ '--tab': SOURCE_META[k].color } as React.CSSProperties) : undefined}
                    onClick={() => setFeedFilter(k)}
                    title={k === 'all' ? 'All sources' : SOURCE_META[k].label}
                  >
                    {k === 'all' ? 'All' : <SourceIcon source={k} />}
                  </button>
                ),
              )}
            </nav>
            <div className="phone-feed">
              {items
                .filter((n) => feedFilter === 'all' || sourceOf(n) === feedFilter)
                .map((n, i) => {
                  const key = sourceOf(n);
                  const meta = SOURCE_META[key];
                  const canOpen = Boolean(n.bot || n.vs || n.url);
                  const date = new Date(`${n.date}T00:00:00Z`).toLocaleDateString('en', {
                    month: 'short',
                    day: 'numeric',
                  });
                  return (
                    <button
                      key={`${n.url ?? n.text}-${i}`}
                      className="phone-post"
                      disabled={!canOpen}
                      onClick={() => {
                        if (!canOpen) return;
                        setArchiveOpen(false);
                        onOpen(n);
                      }}
                    >
                      <span className="phone-post-head">
                        <span className="phone-avatar" style={{ background: meta.color }}>
                          <SourceIcon source={key} size={15} />
                        </span>
                        <span className="phone-handle">{meta.handle}</span>
                        <span className="phone-date">{date}</span>
                      </span>
                      <span className="phone-post-text">{n.text}</span>
                      <span className="phone-post-actions" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="17" height="17"><path d="M12 21s-7.5-4.9-10-9.2C.6 9 2 5.5 5.4 5c2-.3 3.9.6 4.9 2.2h1.4C12.7 5.6 14.6 4.7 16.6 5 20 5.5 21.4 9 20 11.8 17.5 16.1 12 21 12 21z" fill="none" stroke="currentColor" strokeWidth="1.7"/></svg>
                        <svg viewBox="0 0 24 24" width="17" height="17"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3c-1.6 0-3-.4-4.3-1L3 20l1.3-4.9a8 8 0 0 1-1.3-4.4A8.4 8.4 0 0 1 11.5 3 8.4 8.4 0 0 1 21 11.5z" fill="none" stroke="currentColor" strokeWidth="1.7"/></svg>
                        <svg viewBox="0 0 24 24" width="17" height="17"><path d="M21 3 9.7 14.3M21 3l-7 18-3.3-6.7L3 11z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>
                        {n.url && n.url.startsWith('http') && <span className="phone-open">open ↗</span>}
                      </span>
                    </button>
                  );
                })}
            </div>
            <div className="phone-homebar" aria-hidden="true" />
          </div>
        </div>
      )}
    </>
  );
}
