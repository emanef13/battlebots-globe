import { useMemo, useRef, useState } from 'react';
import { flagEmoji } from '../flags';
import type { GlobePoint } from '../types';

interface HeaderProps {
  points: GlobePoint[];
  onSelect: (point: GlobePoint) => void;
}

export default function Header({ points, onSelect }: HeaderProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const countries = new Set(points.map((p) => p.country).filter(Boolean));
    return {
      bots: points.length,
      active: points.filter((p) => p.active).length,
      countries: countries.size,
    };
  }, [points]);

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
      )
      .slice(0, 8);
  }, [query, points]);

  const pick = (p: GlobePoint) => {
    onSelect(p);
    setQuery('');
    inputRef.current?.blur();
  };

  return (
    <header className="app-header">
      <div className="brand">
        <h1>
          BattleBots <span className="brand-accent">Globe</span>
        </h1>
        <p className="tagline">The BattleBots world, live on one globe</p>
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
        <div className="stat">
          <span className="stat-value">{stats.bots}</span>
          <span className="stat-label">bots</span>
        </div>
        <div className="stat">
          <span className="stat-value stat-amber">{stats.active}</span>
          <span className="stat-label">in Pro League</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats.countries}</span>
          <span className="stat-label">countries</span>
        </div>
      </div>
    </header>
  );
}
