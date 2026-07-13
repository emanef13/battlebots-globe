import { flagEmoji } from '../flags';
import type { GlobePoint } from '../types';

interface HoverCardProps {
  point: GlobePoint;
  x: number;
  y: number;
}

const CARD_W = 200;
const CARD_H = 210;
const OFFSET = 14;

export default function HoverCard({ point, x, y }: HoverCardProps) {
  const place = [point.city, point.region, point.country].filter(Boolean).join(', ');
  const left = x + OFFSET + CARD_W > window.innerWidth ? x - OFFSET - CARD_W : x + OFFSET;
  const top = y + OFFSET + CARD_H > window.innerHeight ? y - OFFSET - CARD_H : y + OFFSET;

  return (
    <div className="globe-tip" style={{ left, top }}>
      {point.photo ? (
        <img className="globe-tip-photo" src={point.photo} alt="" />
      ) : (
        point.marker && (
          <img className="globe-tip-photo globe-tip-photo-robot" src={point.marker} alt="" />
        )
      )}
      <div className="globe-tip-text">
        <div className="globe-tip-bot">{point.bot}</div>
        {point.team && <div className="globe-tip-team">{point.team}</div>}
        {place && (
          <div className="globe-tip-place">
            {flagEmoji(point.country)} {place}
          </div>
        )}
      </div>
    </div>
  );
}
