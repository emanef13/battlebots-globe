import { useMemo } from 'react';
import { flagEmoji } from '../flags';
import {
  commonOpponents,
  headToHead,
  maxFightCount,
  powerStats,
  type PowerStats,
} from '../fightStats';
import type { Fight, FightVideo, GlobePoint } from '../types';

interface FightModeProps {
  a: GlobePoint;
  b: GlobePoint;
  points: GlobePoint[];
  fights: Fight[];
  matchVideos: Record<string, FightVideo>;
  onPlayVideo: (video: FightVideo) => void;
  onClose: () => void;
}

const METHOD_LABEL: Record<string, string> = {
  KO: 'KO',
  JD: 'Judges',
  'Split JD': 'Split decision',
  Crowd: 'Crowd vote',
};

function FighterCard({
  fighter,
  corner,
  stats,
}: {
  fighter: GlobePoint;
  corner: 'red' | 'amber';
  stats: PowerStats;
}) {
  const place = [fighter.city, fighter.country].filter(Boolean).join(', ');
  const flag = flagEmoji(fighter.country);
  const years =
    fighter.seasons.length > 0
      ? `${fighter.seasons.length} season${fighter.seasons.length > 1 ? 's' : ''}`
      : null;

  const bars: [string, number, string][] = [
    ['Win rate', stats.winRate, `${Math.round(stats.winRate * 100)}%`],
    ['KO power', stats.koRate, `${Math.round(stats.koRate * 100)}%`],
    ['Experience', stats.experience, `${stats.fights} fights`],
  ];

  return (
    <div className={`fight-card corner-${corner}`}>
      <div className="fight-card-sprite">
        {fighter.marker || fighter.photo ? (
          <img src={fighter.marker ?? fighter.photo!} alt={fighter.bot} />
        ) : (
          <span className="fight-card-initial">{fighter.bot[0]}</span>
        )}
      </div>
      <div className="fight-card-name">{fighter.bot}</div>
      {fighter.team && <div className="fight-card-team">{fighter.team}</div>}
      <div className={`panel-status ${fighter.active ? 'is-active' : 'is-historical'}`}>
        <span className="status-dot" aria-hidden="true" />
        {fighter.active ? 'Pro League 2026' : 'Historical'}
      </div>

      <dl className="fight-tape">
        {place && (
          <div>
            <dt>Home</dt>
            <dd>
              {flag && `${flag} `}
              {place}
            </dd>
          </div>
        )}
        {fighter.weapon && (
          <div>
            <dt>Weapon</dt>
            <dd>{fighter.weapon}</dd>
          </div>
        )}
        {fighter.builder && (
          <div>
            <dt>Builder</dt>
            <dd>{fighter.builder}</dd>
          </div>
        )}
        {years && (
          <div>
            <dt>Career</dt>
            <dd>{years}</dd>
          </div>
        )}
        {stats.fights > 0 && (
          <div>
            <dt>Record</dt>
            <dd>
              <span className="record-wins">{stats.wins}W</span> –{' '}
              <span className="record-losses">{stats.fights - stats.wins}L</span>
            </dd>
          </div>
        )}
      </dl>

      <div className="fight-bars">
        {bars.map(([label, value, note]) => (
          <div key={label} className="fight-bar">
            <span className="fight-bar-label">{label}</span>
            <span className="fight-bar-track">
              <span className="fight-bar-fill" style={{ width: `${Math.max(4, value * 100)}%` }} />
            </span>
            <span className="fight-bar-note">{note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Street-fighter style head-to-head overlay for two selected bots. */
export default function FightMode({
  a,
  b,
  points,
  fights,
  matchVideos,
  onPlayVideo,
  onClose,
}: FightModeProps) {
  const maxFights = useMemo(() => maxFightCount(fights), [fights]);
  const statsA = useMemo(() => powerStats(fights, a.id, maxFights), [fights, a, maxFights]);
  const statsB = useMemo(() => powerStats(fights, b.id, maxFights), [fights, b, maxFights]);
  const h2h = useMemo(() => headToHead(fights, a.id, b.id), [fights, a, b]);
  const shared = useMemo(
    () => (h2h.fights.length === 0 ? commonOpponents(fights, points, a.id, b.id) : []),
    [h2h, fights, points, a, b],
  );
  const video = matchVideos[[a.id, b.id].sort().join('|')] ?? null;

  return (
    <div className="fight-mode" role="dialog" aria-label={`${a.bot} versus ${b.bot}`}>
      <button className="fight-close" onClick={onClose} aria-label="Exit fight mode">
        ×
      </button>
      <div className="fight-vs" aria-hidden="true">
        VS
      </div>

      <FighterCard fighter={a} corner="red" stats={statsA} />
      <FighterCard fighter={b} corner="amber" stats={statsB} />

      <div className="fight-center">
        {h2h.fights.length > 0 ? (
          <>
            <div className="fight-score">
              <span className="fight-score-name corner-red-text">{a.bot}</span>
              <span className="fight-score-nums">
                <span className={h2h.aWins >= h2h.bWins ? 'corner-red-text' : ''}>{h2h.aWins}</span>
                <span className="fight-score-dash">–</span>
                <span className={h2h.bWins >= h2h.aWins ? 'corner-amber-text' : ''}>{h2h.bWins}</span>
              </span>
              <span className="fight-score-name corner-amber-text">{b.bot}</span>
            </div>
            <ul className="fight-history">
              {h2h.fights.map((f, i) => (
                <li key={i}>
                  <span className="fight-history-season">{f.season ?? 'Unknown season'}</span>
                  <span className="fight-history-result">
                    {f.winner ? (
                      <>
                        <b className={f.winner === a.id ? 'corner-red-text' : 'corner-amber-text'}>
                          {f.winner === a.id ? a.bot : b.bot}
                        </b>{' '}
                        {f.method ? `by ${METHOD_LABEL[f.method] ?? f.method}` : 'wins'}
                      </>
                    ) : (
                      'No decision'
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {video && (
              <button className="fight-watch" onClick={() => onPlayVideo(video)}>
                ▶ WATCH THE FIGHT
              </button>
            )}
          </>
        ) : (
          <>
            <div className="fight-never">Never met in the arena</div>
            {shared.length > 0 && (
              <ul className="fight-history">
                {shared.map(({ opponent, a: ra, b: rb }) => (
                  <li key={opponent.id}>
                    <span className="fight-history-season">vs {opponent.bot}</span>
                    <span className="fight-history-result">
                      <b className="corner-red-text">
                        {ra.wins}–{ra.losses}
                      </b>
                      <span className="fight-score-dash"> · </span>
                      <b className="corner-amber-text">
                        {rb.wins}–{rb.losses}
                      </b>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
