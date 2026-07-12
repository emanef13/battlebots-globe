import { useMemo } from 'react';
import type { GlobePoint } from '../types';

interface TickerProps {
  points: GlobePoint[];
  onSelect: (point: GlobePoint) => void;
}

/** News-style footer: all robots roll by continuously; click one to fly to it. */
export default function Ticker({ points, onSelect }: TickerProps) {
  const items = useMemo(
    () => [...points].sort((a, b) => a.bot.localeCompare(b.bot)),
    [points],
  );
  if (items.length === 0) return null;

  // rendered twice for a seamless loop; speed scales with item count
  const duration = items.length * 2.4;

  return (
    <footer className="ticker" aria-label="All robots">
      <div className="ticker-track" style={{ animationDuration: `${duration}s` }}>
        {[0, 1].map((copy) => (
          <div className="ticker-half" key={copy} aria-hidden={copy === 1}>
            {items.map((p) => (
              <button
                key={`${copy}-${p.id}`}
                className="ticker-item"
                onClick={() => onSelect(p)}
                tabIndex={copy === 1 ? -1 : 0}
              >
                {p.marker && <img src={p.marker} alt="" loading="lazy" />}
                <span className={`ticker-name ${p.active ? 'is-active-text' : ''}`}>{p.bot}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </footer>
  );
}
