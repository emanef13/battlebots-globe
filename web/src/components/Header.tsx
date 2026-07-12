import { useMemo, useRef, useState } from 'react';
import { flagEmoji } from '../flags';
import type { GlobePoint } from '../types';

interface HeaderProps {
  points: GlobePoint[];
  onSelect: (point: GlobePoint) => void;
  onFocusCountry: (country: string) => void;
}

export default function Header({ points, onSelect, onFocusCountry }: HeaderProps) {
  const [query, setQuery] = useState('');
  const [hoverStat, setHoverStat] = useState<null | 'bots' | 'league' | 'countries'>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const countries = new Set(points.map((p) => p.country).filter(Boolean));
    return {
      bots: points.length,
      active: points.filter((p) => p.active).length,
      countries: countries.size,
    };
  }, [points]);

  const countryBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of points) {
      if (p.country) counts.set(p.country, (counts.get(p.country) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [points]);

  const pickFromStat = (p: GlobePoint) => {
    setHoverStat(null);
    onSelect(p);
  };

  const botGrid = (list: GlobePoint[]) => (
    <div className="stat-pop">
      <div className="stat-pop-card stat-pop-grid">
        {list.map((p) => (
          <button key={p.id} title={p.bot} onClick={() => pickFromStat(p)}>
            {p.marker ? <img src={p.marker} alt={p.bot} loading="lazy" /> : <span>{p.bot[0]}</span>}
          </button>
        ))}
      </div>
    </div>
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return points
      .filter(
        (p) =>
          p.bot.toLowerCase().includes(q) ||
          (p.team ?? '').toLowerCase().includes(q) ||
          (p.city ?? '').toLowerCase().includes(q) ||
          (p.region ?? '').toLowerCase().includes(q) ||
          (p.country ?? '').toLowerCase().includes(q),
      );
  }, [query, points]);

  const pick = (p: GlobePoint) => {
    onSelect(p);
    setQuery('');
    inputRef.current?.blur();
  };

  return (
    <header className="app-header">
      <div className="brand">
        <img className="brand-logo" src="/brand.svg" alt="BBG" />
        <div>
          <h1>
            BattleBots <span className="brand-accent">Globe</span>
          </h1>
          <p className="tagline">The BattleBots world, live on one globe</p>
        </div>
      </div>

      <div className="search-box">
        <input
          ref={inputRef}
          type="search"
          placeholder="Search bots, teams, cities, countries…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results.length > 0) pick(results[0]);
            if (e.key === 'Escape') setQuery('');
          }}
          aria-label="Search bots, teams or cities"
        />
        {results.length > 0 && (
          <ul className="search-results">
            {results.map((p) => (
              <li key={p.id}>
                <button onClick={() => pick(p)}>
                  {p.marker ? (
                    <img className="result-icon" src={p.marker} alt="" />
                  ) : (
                    <span className={`result-dot ${p.active ? 'is-active' : 'is-historical'}`} aria-hidden="true" />
                  )}
                  <span className="result-bot">{p.bot}</span>
                  <span className="result-place">
                    {flagEmoji(p.country)} {[p.city, p.country].filter(Boolean).join(', ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="header-stats">
        <div
          className="stat"
          onMouseEnter={() => setHoverStat('bots')}
          onMouseLeave={() => setHoverStat(null)}
        >
          <span className="stat-value">{stats.bots}</span>
          <span className="stat-label">bots</span>
          {hoverStat === 'bots' && botGrid(points)}
        </div>
        <div
          className="stat"
          onMouseEnter={() => setHoverStat('league')}
          onMouseLeave={() => setHoverStat(null)}
        >
          <span className="stat-value stat-amber">{stats.active}</span>
          <span className="stat-label">in Pro League</span>
          {hoverStat === 'league' && botGrid(points.filter((p) => p.active))}
        </div>
        <div
          className="stat"
          onMouseEnter={() => setHoverStat('countries')}
          onMouseLeave={() => setHoverStat(null)}
        >
          <span className="stat-value">{stats.countries}</span>
          <span className="stat-label">countries</span>
          {hoverStat === 'countries' && (
            <div className="stat-pop">
              <div className="stat-pop-card">
                {countryBreakdown.map(([country, count]) => (
                  <button
                    className="stat-pop-row"
                    key={country}
                    onClick={() => {
                      setHoverStat(null);
                      onFocusCountry(country);
                    }}
                  >
                    <span className="stat-pop-flag">{flagEmoji(country)}</span>
                    <span>{country}</span>
                    <span className="stat-pop-count">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
