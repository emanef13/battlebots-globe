import { flagEmoji } from '../flags';
import type { GlobePoint } from '../types';

interface ClusterPopoverProps {
  members: GlobePoint[];
  x: number;
  y: number;
  onPick: (point: GlobePoint) => void;
  onClose: () => void;
}

const WIDTH = 280;

export default function ClusterPopover({ members, x, y, onPick, onClose }: ClusterPopoverProps) {
  const left = Math.min(x + 12, window.innerWidth - WIDTH - 12);
  const top = Math.min(y + 12, window.innerHeight - 320);

  return (
    <div className="cluster-popover" style={{ left, top }}>
      <div className="cluster-popover-head">
        {members.length} robots here
        <button className="panel-close" onClick={onClose} aria-label="Close list">
          ×
        </button>
      </div>
      <ul>
        {members.map((p) => (
          <li key={p.id}>
            <button onClick={() => onPick(p)}>
              {p.marker && <img className="result-icon" src={p.marker} alt="" />}
              <span className="result-bot">{p.bot}</span>
              <span className="result-place">
                {flagEmoji(p.country)} {p.city ?? p.country}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
