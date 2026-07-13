import { flagEmoji } from '../flags';
import type { FightVideo, GlobePoint } from '../types';

interface TeamPanelProps {
  team: GlobePoint;
  videos: FightVideo[];
  record: { wins: number; losses: number } | null;
  onPlay: (video: FightVideo) => void;
  onClose: () => void;
  onChallenge: () => void;
}

export default function TeamPanel({ team, videos, record, onPlay, onClose, onChallenge }: TeamPanelProps) {
  const place = [team.city, team.region, team.country].filter(Boolean).join(', ');
  const flag = flagEmoji(team.country);

  return (
    <aside
      className={`team-panel ${team.active ? 'is-active' : 'is-historical'}`}
      aria-label={`Details for ${team.bot}`}
    >
      <button className="panel-close" onClick={onClose} aria-label="Close panel">
        ×
      </button>
      {team.photo ? (
        <img className="panel-photo" src={team.photo} alt={`Team photo for ${team.bot}`} />
      ) : (
        team.marker && (
          <img className="panel-photo panel-photo-robot" src={team.marker} alt={team.bot} />
        )
      )}
      <div className={`panel-status ${team.active ? 'is-active' : 'is-historical'}`}>
        <span className="status-dot" aria-hidden="true" />
        {team.active ? 'Pro League 2026' : 'Historical'}
      </div>
      <h2 className="panel-bot">{team.bot}</h2>
      {team.team && <div className="panel-team">{team.team}</div>}

      <dl className="panel-facts">
        {place && (
          <div className="fact">
            <dt>Hometown</dt>
            <dd>
              {flag && <span className="flag">{flag} </span>}
              {place}
            </dd>
          </div>
        )}
        {team.weapon && (
          <div className="fact">
            <dt>Weapon</dt>
            <dd>{team.weapon}</dd>
          </div>
        )}
        {team.builder && (
          <div className="fact">
            <dt>Builder</dt>
            <dd>{team.builder}</dd>
          </div>
        )}
        {record && (
          <div className="fact">
            <dt>Arena record</dt>
            <dd>
              <span className="record-wins">{record.wins}W</span> –{' '}
              <span className="record-losses">{record.losses}L</span>
              <span className="record-note"> vs bots on the globe</span>
            </dd>
          </div>
        )}
        {team.seasons.length > 0 && (
          <div className="fact">
            <dt>Seasons</dt>
            <dd className="season-chips">
              {team.seasons.map((s) => (
                <span key={s} className="chip">
                  {s}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>

      <button className="panel-challenge" onClick={onChallenge}>
        ⚔ CHALLENGE
      </button>

      {team.url && (
        <a className="panel-link" href={team.url} target="_blank" rel="noopener noreferrer">
          View team page ↗
        </a>
      )}

      {videos.length > 0 && (
        <div className="panel-videos">
          <div className="panel-videos-title">Fight highlights</div>
          {videos.map((v) => (
            <button key={v.id} className="video-row" onClick={() => onPlay(v)}>
              <span className="video-thumb">
                <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" loading="lazy" />
                <span className="video-play" aria-hidden="true">
                  ▶
                </span>
                {v.duration && <span className="video-duration">{v.duration}</span>}
              </span>
              <span className="video-meta">
                <span className="video-row-title">{v.title}</span>
                <span className="video-row-sub">
                  {v.channel}
                  {v.views > 0 && ` · ${Intl.NumberFormat('en', { notation: 'compact' }).format(v.views)} views`}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="panel-footnote">Live stats &amp; fan pulse coming soon</div>
    </aside>
  );
}
