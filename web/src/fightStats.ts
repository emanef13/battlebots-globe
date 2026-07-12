import type { Fight, GlobePoint } from './types';

/** Win–loss record for a bot across the mapped fight history. */
export function recordFor(fights: Fight[], id: string): { wins: number; losses: number } | null {
  let wins = 0;
  let losses = 0;
  for (const f of fights) {
    if (f.a !== id && f.b !== id) continue;
    if (f.winner === id) wins += 1;
    else if (f.winner) losses += 1;
  }
  return wins + losses > 0 ? { wins, losses } : null;
}

export interface HeadToHead {
  aWins: number;
  bWins: number;
  fights: Fight[];
}

/** Every meeting between two bots, plus the score from a's perspective. */
export function headToHead(fights: Fight[], aId: string, bId: string): HeadToHead {
  const met = fights.filter(
    (f) => (f.a === aId && f.b === bId) || (f.a === bId && f.b === aId),
  );
  return {
    aWins: met.filter((f) => f.winner === aId).length,
    bWins: met.filter((f) => f.winner === bId).length,
    fights: met,
  };
}

export interface PowerStats {
  fights: number;
  wins: number;
  koWins: number;
  /** 0–1 bars for the fighter card */
  winRate: number;
  koRate: number;
  experience: number;
}

/** Fighter-card bars, computed from real fight history. `experience` is
 * normalized against the busiest bot in the dataset. */
export function powerStats(fights: Fight[], id: string, maxFights: number): PowerStats {
  let total = 0;
  let wins = 0;
  let koWins = 0;
  for (const f of fights) {
    if (f.a !== id && f.b !== id) continue;
    total += 1;
    if (f.winner === id) {
      wins += 1;
      if (f.method?.includes('KO')) koWins += 1;
    }
  }
  return {
    fights: total,
    wins,
    koWins,
    winRate: total > 0 ? wins / total : 0,
    koRate: wins > 0 ? koWins / wins : 0,
    experience: maxFights > 0 ? total / maxFights : 0,
  };
}

/** The most fights any single bot has — the "experience" bar's 100%. */
export function maxFightCount(fights: Fight[]): number {
  const counts = new Map<string, number>();
  for (const f of fights) {
    counts.set(f.a, (counts.get(f.a) ?? 0) + 1);
    counts.set(f.b, (counts.get(f.b) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

export interface CommonOpponent {
  opponent: GlobePoint;
  a: { wins: number; losses: number };
  b: { wins: number; losses: number };
}

/** Opponents both bots have faced — the tale of the tape when the two
 * never met in the arena themselves. */
export function commonOpponents(
  fights: Fight[],
  points: GlobePoint[],
  aId: string,
  bId: string,
  limit = 3,
): CommonOpponent[] {
  const byId = new Map(points.map((p) => [p.id, p]));
  const vs = new Map<string, { a: { wins: number; losses: number }; b: { wins: number; losses: number } }>();
  for (const f of fights) {
    for (const [me, key] of [[aId, 'a'], [bId, 'b']] as const) {
      if (f.a !== me && f.b !== me) continue;
      const opp = f.a === me ? f.b : f.a;
      if (opp === aId || opp === bId) continue;
      let rec = vs.get(opp);
      if (!rec) {
        rec = { a: { wins: 0, losses: 0 }, b: { wins: 0, losses: 0 } };
        vs.set(opp, rec);
      }
      if (f.winner === me) rec[key].wins += 1;
      else if (f.winner) rec[key].losses += 1;
    }
  }
  return [...vs.entries()]
    .filter(([opp, r]) => {
      const aTotal = r.a.wins + r.a.losses;
      const bTotal = r.b.wins + r.b.losses;
      return aTotal > 0 && bTotal > 0 && byId.has(opp);
    })
    .sort((x, y) => {
      const total = (r: (typeof x)[1]) => r.a.wins + r.a.losses + r.b.wins + r.b.losses;
      return total(y[1]) - total(x[1]);
    })
    .slice(0, limit)
    .map(([opp, r]) => ({ opponent: byId.get(opp)!, a: r.a, b: r.b }));
}
