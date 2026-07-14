// Pit Boss — the arena guide. A tool-calling agent: the model retrieves
// roster/fight data on demand through the tools in pitboss-tools.mjs (RAG
// via tool use — nothing is baked into the prompt), streams its persona
// replies, and can drive the globe with action tags the client executes.
// Requires ANTHROPIC_API_KEY (Vercel env); CHAT_MODEL overrides the model.
import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { getBot, headToHead, listBots, leaderboard, TOTALS } from './pitboss-tools.mjs';

export const config = { supportsResponseStreaming: true };

const MODEL = process.env.CHAT_MODEL ?? 'claude-opus-4-8';
const MAX_TURNS = 12;
const MAX_CHARS = 600;

const SYSTEM = `You are PIT BOSS — a grizzled, retired heavyweight combat robot who now runs the pits, built into battlebotsglobe.com (an interactive 3D globe of every BattleBots competitor: ${TOTALS.bots} bots from ${TOTALS.countries} countries, ${TOTALS.fights} recorded 1v1 fights, ${TOTALS.matchup_videos} matchup videos, fight-history arcs, and a head-to-head "fight mode").

CHARACTER: Old warhorse. Gruff but warm. Calls the visitor "rookie" (sparingly). War stories, workshop metaphors, dry one-liners. More KOs than them. Never breaks character, never mentions being an AI or a language model — you're a robot who's seen things. Keep replies SHORT: 1-3 sentences for simple questions, a short paragraph at most.

DATA: Before quoting any stat, record, matchup, or roster fact, look it up with your tools — never invent numbers. If the tools don't have it, say so in character ("that one's before my time"). Records are 1v1 fights between rostered bots; wiki totals may differ slightly.

YOU CAN DRIVE THE GLOBE. When the visitor wants to see something (or when showing beats telling), end your reply with EXACTLY ONE action tag on its own final line:
[[bot:<id>]] — fly to a robot and open its panel (use the id returned by your tools)
[[vs:<id>|<id>]] — open head-to-head fight mode for two bots
[[country:<Name>]] — fly to a country
Use a tag whenever you name a specific bot, matchup, or country the visitor could look at, and say what you're doing naturally ("lemme spin the globe...").

RULES: Only combat robotics, this globe, and its data. Deflect anything else in character ("I fix robots, rookie, not taxes"). Never give harmful real-world weapon instructions. The site is an unofficial fan project.`;

const tools = [
  betaTool({
    name: 'get_bot',
    description:
      'Look up one robot: team, hometown, weapon, builder, status, seasons, win/loss/KO record, and per-opponent history. Call before stating any fact about a bot.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Bot name or id' } },
      required: ['name'],
    },
    run: (input) => JSON.stringify(getBot(input)),
  }),
  betaTool({
    name: 'head_to_head',
    description:
      'Full head-to-head between two robots: every meeting with season/winner/method, the score, and whether a fight video exists.',
    inputSchema: {
      type: 'object',
      properties: {
        bot_a: { type: 'string' },
        bot_b: { type: 'string' },
      },
      required: ['bot_a', 'bot_b'],
    },
    run: (input) => JSON.stringify(headToHead(input)),
  }),
  betaTool({
    name: 'list_bots',
    description:
      'List robots filtered by country, status (pro_league | historical) and/or weapon keyword. Use for "who is from X" / "which bots use Y".',
    inputSchema: {
      type: 'object',
      properties: {
        country: { type: 'string' },
        status: { type: 'string', enum: ['pro_league', 'historical'] },
        weapon: { type: 'string' },
      },
    },
    run: (input) => JSON.stringify(listBots(input)),
  }),
  betaTool({
    name: 'leaderboard',
    description:
      'Top-10 leaderboards over the real fight data: most_kos, most_wins, best_win_rate, most_fights, biggest_rivalries, countries.',
    inputSchema: {
      type: 'object',
      properties: {
        metric: {
          type: 'string',
          enum: ['most_kos', 'most_wins', 'best_win_rate', 'most_fights', 'biggest_rivalries', 'countries'],
        },
      },
      required: ['metric'],
    },
    run: (input) => JSON.stringify(leaderboard(input)),
  }),
];

// best-effort per-instance rate limiting (resets on cold start)
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const rec = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  rec.push(now);
  hits.set(ip, rec);
  if (hits.size > 5000) hits.clear();
  return rec.length > 10;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  // browsers always send Origin on POST fetch; only our own site may call
  const origin = req.headers.origin ?? '';
  const originOk =
    origin === 'https://battlebotsglobe.com' ||
    origin === 'https://www.battlebotsglobe.com' ||
    origin.endsWith('.vercel.app'); // preview deployments
  if (!originOk) {
    res.status(403).json({ error: 'wrong pit, pal' });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'off-duty' });
    return;
  }
  const ip = (req.headers['x-forwarded-for'] ?? 'unknown').split(',')[0].trim();
  if (limited(ip)) {
    res.status(429).json({ error: 'slow down, rookie' });
    return;
  }

  let turns;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    turns = (body.messages ?? [])
      .slice(-MAX_TURNS)
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  } catch {
    res.status(400).json({ error: 'bad request' });
    return;
  }
  if (turns.length === 0 || turns[turns.length - 1].role !== 'user') {
    res.status(400).json({ error: 'bad request' });
    return;
  }

  const client = new Anthropic();
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no',
  });

  try {
    const runner = client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 700,
      max_iterations: 5,
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools,
      messages: turns,
      stream: true,
    });
    for await (const messageStream of runner) {
      for await (const event of messageStream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          res.write(event.delta.text);
        }
      }
    }
    res.end();
  } catch (e) {
    try {
      res.write('\n[[error]]');
    } catch {}
    res.end();
  }
}
