// Pit Boss retrieval tools — each one answers a model tool call by querying
// the same JSON datasets the app serves. Imported (and bundled) directly so
// the function needs no filesystem or network access.
import teamsFile from '../web/public/data/teams.json' with { type: 'json' };
import fightsFile from '../web/public/data/fights.json' with { type: 'json' };
import matchVideosFile from '../web/public/data/match_videos.json' with { type: 'json' };

const teams = teamsFile.teams;
const fights = fightsFile.fights;
const matchVideos = matchVideosFile.videos;

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function findBot(nameOrId) {
  const q = norm(nameOrId);
  return (
    teams.find((t) => t.id === q) ??
    teams.find((t) => norm(t.bot) === q) ??
    teams.find((t) => norm(t.bot).includes(q) || q.includes(norm(t.bot)))
  );
}

function record(id) {
  let w = 0, l = 0, ko = 0;
  for (const f of fights) {
    if (f.a !== id && f.b !== id) continue;
    if (f.winner === id) {
      w++;
      if (f.method?.includes('KO')) ko++;
    } else if (f.winner) l++;
  }
  return { wins: w, losses: l, ko_wins: ko };
}

export function getBot({ name }) {
  const t = findBot(name);
  if (!t) return { error: `No bot matching "${name}" on the globe.` };
  const opponents = {};
  for (const f of fights) {
    if (f.a !== t.id && f.b !== t.id) continue;
    const opp = f.a === t.id ? f.b : f.a;
    opponents[opp] = opponents[opp] ?? { fights: 0, wins: 0 };
    opponents[opp].fights++;
    if (f.winner === t.id) opponents[opp].wins++;
  }
  return {
    id: t.id,
    bot: t.bot,
    team: t.team,
    hometown: [t.city, t.region, t.country].filter(Boolean).join(', '),
    weapon: t.weapon,
    builder: t.builder,
    status: t.active ? 'Pro League 2026' : 'historical',
    seasons: t.seasons,
    record: record(t.id),
    opponents,
  };
}

export function headToHead({ bot_a, bot_b }) {
  const a = findBot(bot_a);
  const b = findBot(bot_b);
  if (!a || !b) return { error: `Couldn't find ${!a ? bot_a : bot_b} on the globe.` };
  const met = fights.filter(
    (f) => (f.a === a.id && f.b === b.id) || (f.a === b.id && f.b === a.id),
  );
  return {
    a: { id: a.id, bot: a.bot, hometown: `${a.city ?? '?'}, ${a.country ?? '?'}` },
    b: { id: b.id, bot: b.bot, hometown: `${b.city ?? '?'}, ${b.country ?? '?'}` },
    fights: met.map((f) => ({
      season: f.season,
      winner: f.winner ? (f.winner === a.id ? a.bot : b.bot) : null,
      method: f.method,
    })),
    a_wins: met.filter((f) => f.winner === a.id).length,
    b_wins: met.filter((f) => f.winner === b.id).length,
    video_available: Boolean(matchVideos[[a.id, b.id].sort().join('|')]),
  };
}

export function listBots({ country, status, weapon }) {
  let out = teams;
  if (country) out = out.filter((t) => norm(t.country) === norm(country));
  if (status === 'pro_league') out = out.filter((t) => t.active);
  if (status === 'historical') out = out.filter((t) => !t.active);
  if (weapon) out = out.filter((t) => (t.weapon ?? '').toLowerCase().includes(String(weapon).toLowerCase()));
  return {
    count: out.length,
    bots: out.slice(0, 60).map((t) => `${t.bot} (${t.city ?? '?'}, ${t.country ?? '?'}${t.active ? ', Pro League' : ''})`),
  };
}

export function leaderboard({ metric }) {
  const stats = teams.map((t) => ({ bot: t.bot, id: t.id, ...record(t.id) }));
  const played = stats.filter((s) => s.wins + s.losses >= 5);
  switch (metric) {
    case 'most_kos':
      return stats.sort((x, y) => y.ko_wins - x.ko_wins).slice(0, 10);
    case 'most_wins':
      return stats.sort((x, y) => y.wins - x.wins).slice(0, 10);
    case 'best_win_rate':
      return played
        .map((s) => ({ ...s, win_rate: +(s.wins / (s.wins + s.losses)).toFixed(2) }))
        .sort((x, y) => y.win_rate - x.win_rate)
        .slice(0, 10);
    case 'most_fights':
      return stats.sort((x, y) => y.wins + y.losses - (x.wins + x.losses)).slice(0, 10);
    case 'biggest_rivalries': {
      const pairs = {};
      for (const f of fights) {
        const k = [f.a, f.b].sort().join('|');
        pairs[k] = (pairs[k] ?? 0) + 1;
      }
      return Object.entries(pairs)
        .sort((x, y) => y[1] - x[1])
        .slice(0, 10)
        .map(([k, n]) => {
          const [a, b] = k.split('|');
          return { matchup: `${findBot(a)?.bot} vs ${findBot(b)?.bot}`, fights: n, ids: [a, b] };
        });
    }
    case 'countries': {
      const c = {};
      for (const t of teams) c[t.country ?? '?'] = (c[t.country ?? '?'] ?? 0) + 1;
      return Object.entries(c).sort((x, y) => y[1] - x[1]).map(([country, bots]) => ({ country, bots }));
    }
    default:
      return { error: `Unknown metric "${metric}".` };
  }
}

export const TOTALS = {
  bots: teams.length,
  pro_league: teams.filter((t) => t.active).length,
  countries: new Set(teams.map((t) => t.country).filter(Boolean)).size,
  fights: fights.length,
  matchup_videos: Object.keys(matchVideos).length,
};
