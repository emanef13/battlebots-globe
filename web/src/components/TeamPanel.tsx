import { useEffect, useRef, useState } from 'react';
import { flagEmoji } from '../flags';
import type { FightVideo, GlobePoint } from '../types';

/** real platform favicons bundled in web/public/icons/ — actual brand colors */
const CONTACT_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  twitter: 'X (Twitter)',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  twitch: 'Twitch',
  discord: 'Discord',
  linktree: 'Linktree',
  patreon: 'Patreon',
};

export interface ContactGroups {
  /** team/robot accounts — shown under the team name */
  team?: Record<string, string>;
  /** builder/owner accounts — shown next to the builder */
  owner?: Record<string, string>;
}

interface TeamPanelProps {
  team: GlobePoint;
  videos: FightVideo[];
  record: { wins: number; losses: number } | null;
  contacts: ContactGroups | undefined;
  onPlay: (video: FightVideo) => void;
  onClose: () => void;
  onChallenge: () => void;
  /** jump to team view: filter the globe to this bot's team */
  onFocusTeam: (team: string) => void;
}

/** hand-drawn globe glyph for the team website (simple-icons is brands-only) */
function WebsiteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3.6 9h16.8M3.6 15h16.8" />
    </svg>
  );
}

/** a row of round platform-favicon link buttons */
function ContactRow({ links, who, small }: { links: Record<string, string>; who: string; small?: boolean }) {
  return (
    <span className={`panel-contacts-row${small ? ' is-small' : ''}`}>
      {Object.entries(links).map(([platform, url]) => {
        const label = CONTACT_LABELS[platform] ?? 'Website';
        return (
          <a
            key={platform}
            className="contact-btn"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={label}
            aria-label={`${who} on ${label}`}
          >
            {platform in CONTACT_LABELS ? (
              <img src={`/icons/${platform}.png`} alt="" loading="lazy" />
            ) : (
              <WebsiteIcon />
            )}
          </a>
        );
      })}
    </span>
  );
}

export default function TeamPanel({ team, videos, record, contacts, onPlay, onClose, onChallenge, onFocusTeam }: TeamPanelProps) {
  const place = [team.city, team.region, team.country].filter(Boolean).join(', ');
  const flag = flagEmoji(team.country);
  // Mobile-only: collapse the bottom sheet to a slim bar so the globe and
  // arcs stay visible; the buttons only render via the mobile stylesheet.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setCollapsed(false), [team.id]);

  // Bottom-sheet gesture: pull down (with content scrolled to top) to
  // minimize, swipe up on the collapsed bar to expand.
  const touchStart = useRef<{ y: number; atTop: boolean } | null>(null);
  const onTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    touchStart.current = { y: e.touches[0].clientY, atTop: e.currentTarget.scrollTop <= 0 };
  };
  const onTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    if (!touchStart.current) return;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    if (!collapsed && touchStart.current.atTop && dy > 55) setCollapsed(true);
    else if (collapsed && dy < -35) setCollapsed(false);
    touchStart.current = null;
  };

  return (
    <aside
      className={`team-panel ${team.active ? 'is-active' : 'is-historical'}${collapsed ? ' is-collapsed' : ''}`}
      aria-label={`Details for ${team.bot}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <span className="panel-grip" aria-hidden="true" />
      <button
        className="panel-expand"
        onClick={() => setCollapsed(false)}
        aria-label={`Expand details for ${team.bot}`}
      >
        {team.marker && <img src={team.marker} alt="" />}
        <span className="panel-expand-name">{team.bot}</span>
        <span aria-hidden="true">▲</span>
      </button>
      <button
        className="panel-minimize"
        onClick={() => setCollapsed(true)}
        aria-label="Minimize panel"
      >
        ▼
      </button>
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
      {team.team && (
        <button
          className="panel-team panel-team-link"
          onClick={() => onFocusTeam(team.team!)}
          title={`See all of ${team.team}'s robots on the globe`}
        >
          {team.team}
        </button>
      )}
      {contacts?.team && (
        <div className="panel-team-contacts">
          <ContactRow links={contacts.team} who={team.team ?? team.bot} />
        </div>
      )}

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
        {(team.builder || contacts?.owner) && (
          <div className="fact">
            <dt>Builder</dt>
            <dd className="builder-line">
              {team.builder}
              {contacts?.owner && (
                <ContactRow links={contacts.owner} who={team.builder ?? team.team ?? team.bot} small />
              )}
            </dd>
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
