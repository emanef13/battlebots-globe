// Live arena news: scrapes Google News and r/battlebots on demand (CDN
// caches responses for an hour, so sources are hit at most hourly) and
// accumulates every story ever seen into a Vercel Blob archive — the
// Gazette is a permanent chronological record, not a snapshot. When
// BRIGHTDATA_API_TOKEN is set, requests route through Bright Data's Web
// Unlocker (datacenter IPs are commonly blocked by Reddit).
import { list, put } from '@vercel/blob';
import teamFeedsFile from '../data/team_feeds.json' with { type: 'json' };

const ARCHIVE_PATH = 'news-archive.json';
const ARCHIVE_CAP = 200;

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const JUNK = /lego|hot wheels|toy|unboxing|giveaway|coupon|promo code|for sale|ebay|etsy/i;
const MAX_AGE_DAYS = 45;

// a real headline mentions battlebots once or twice; keyword-stuffed
// listings repeat it, incidental mentions don't have it in the title
function relevant(title) {
  const hits = (title.toLowerCase().match(/battlebots/g) ?? []).length;
  return (hits >= 1 && hits <= 2) || /robot combat/i.test(title);
}

// same story from different outlets: near-duplicate by word overlap
const tokens = (t) => new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3));
function similar(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  let common = 0;
  for (const w of ta) if (tb.has(w)) common++;
  return common / Math.min(ta.size, tb.size) >= 0.6;
}

async function get(url) {
  const token = process.env.BRIGHTDATA_API_TOKEN;
  if (token) {
    const r = await fetch('https://api.brightdata.com/request', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        zone: process.env.BRIGHTDATA_UNLOCKER_ZONE ?? 'web_unlocker1',
        url,
        format: 'raw',
      }),
    });
    if (!r.ok) throw new Error(`brightdata ${r.status}`);
    return r.text();
  }
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.text();
}

const iso = (d) => new Date(d).toISOString().slice(0, 10);
const fresh = (d) => Date.now() - new Date(d).getTime() < MAX_AGE_DAYS * 86400e3;

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();

async function googleNews() {
  const xml = await get(
    'https://news.google.com/rss/search?q=%22BattleBots%22&hl=en-US&gl=US&ceid=US:en',
  );
  const items = [];
  for (const m of xml.matchAll(/<item>(.*?)<\/item>/gs)) {
    const block = m[1];
    const title = decode(block.match(/<title>(.*?)<\/title>/s)?.[1] ?? '');
    const link = decode(block.match(/<link>(.*?)<\/link>/s)?.[1] ?? '');
    const pub = block.match(/<pubDate>(.*?)<\/pubDate>/s)?.[1];
    if (!title || !link || !pub || !fresh(pub) || JUNK.test(title) || !relevant(title)) continue;
    items.push({ date: iso(pub), text: title.slice(0, 140), url: link, auto: true, source: 'news' });
  }
  return items.slice(0, 6);
}

async function officialNews() {
  const html = await get('https://battlebots.com/news/');
  const items = [];
  for (const block of html.split('cff-item').slice(1)) {
    const ts = block.match(/data-cff-timestamp="(\d+)"/)?.[1];
    const oid = block.match(/data-object-id="(\d+)"/)?.[1];
    const textHtml = block.match(/cff-post-text[^>]*>(.*?)<\/div>/s)?.[1] ?? '';
    const text = decode(textHtml.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!ts || !text || JUNK.test(text)) continue;
    const date = iso(Number(ts) * 1000);
    if (!fresh(date)) continue;
    items.push({
      date,
      text: `BattleBots: ${text}`.slice(0, 140),
      url: oid ? `https://www.facebook.com/battlebots/posts/${oid}` : 'https://battlebots.com/news/',
      auto: true,
      source: 'official',
    });
  }
  return items.slice(0, 4);
}

// ---------- Instagram via Bright Data Scraper API (async discovery) ----------
// A dataset snapshot takes minutes, far beyond a request budget, so it runs
// as a state machine across cached invocations: one request triggers the
// snapshot, a later one downloads it. State lives in the blob archive.
const BD = 'https://api.brightdata.com';
const IG_EVERY_MS = 24 * 3600e3;

async function bd(path, opts = {}) {
  const r = await fetch(`${BD}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${process.env.BRIGHTDATA_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
  });
  if (!r.ok) throw new Error(`brightdata ${path} ${r.status}`);
  return r.json();
}

async function instagramStep(state = {}) {
  if (!process.env.BRIGHTDATA_API_TOKEN) return { items: [], state, changed: false };
  try {
    // resolve the "instagram posts" dataset id once, then remember it
    if (!state.dataset_id) {
      const sets = await bd('/datasets/list');
      const ds = sets.find((d) => /instagram/i.test(d.name) && /post/i.test(d.name));
      if (!ds) return { items: [], state, changed: false };
      state = { ...state, dataset_id: ds.id };
    }
    // download a finished snapshot and map rows back to their accounts
    if (state.snapshot_id) {
      const prog = await bd(`/datasets/v3/snapshot/${state.snapshot_id}/progress`);
      if (prog.status === 'ready') {
        const rows = await bd(`/datasets/v3/snapshot/${state.snapshot_id}/data?format=json`);
        const byHandle = new Map(teamFeedsFile.instagram.map((a) => [a.handle, a]));
        const items = (Array.isArray(rows) ? rows : [])
          .map((r) => {
            const caption = String(r.caption ?? r.description ?? '').replace(/\s+/g, ' ').trim();
            const url = r.url ?? r.post_url;
            const posted = r.date_posted ?? r.timestamp;
            const handle = String(r.user_posted ?? r.user_username ?? r.profile_username ?? '')
              .toLowerCase();
            const acct = byHandle.get(handle);
            if (!caption || !url || !posted || !acct || !fresh(posted)) return null;
            return acct.official
              ? {
                  date: iso(posted),
                  text: `Instagram: ${caption}`.slice(0, 140),
                  url,
                  auto: true,
                  source: 'instagram',
                }
              : {
                  date: iso(posted),
                  text: `${acct.team ?? acct.bot}: ${caption}`.slice(0, 140),
                  url,
                  auto: true,
                  source: 'team',
                  platform: 'instagram',
                  team_id: acct.id,
                  team: acct.team ?? acct.bot,
                };
          })
          .filter(Boolean)
          .slice(0, 40);
        return { items, state: { ...state, snapshot_id: null, last_done: Date.now() }, changed: true };
      }
      if (prog.status === 'failed') {
        return { items: [], state: { ...state, snapshot_id: null }, changed: true };
      }
      return { items: [], state, changed: false }; // still running
    }
    // trigger one batched snapshot a day: official + every pro-league team
    if (!state.last_done || Date.now() - state.last_done > IG_EVERY_MS) {
      const targets = teamFeedsFile.instagram.map((a) => ({
        url: a.url,
        num_of_posts: a.official ? 3 : 2,
      }));
      const res = await bd(
        `/datasets/v3/trigger?dataset_id=${state.dataset_id}&type=discover_new&discover_by=url&include_errors=true`,
        { method: 'POST', body: JSON.stringify(targets) },
      );
      if (res.snapshot_id) {
        return { items: [], state: { ...state, snapshot_id: res.snapshot_id }, changed: true };
      }
    }
  } catch {
    // any Bright Data hiccup: try again on a later invocation
  }
  return { items: [], state, changed: false };
}

// Team channel updates via YouTube's free RSS feeds — no scraping, no cost.
// data/team_feeds.json is generated from the verified contact links; several
// bots share one channel (Team Whyachi), so fetch each channel once.
async function teamYouTube() {
  const byChannel = new Map();
  for (const f of teamFeedsFile.youtube) {
    const cur = byChannel.get(f.channel_id);
    if (!cur || (f.active && !cur.active)) byChannel.set(f.channel_id, f);
  }
  const results = await Promise.allSettled(
    [...byChannel.values()].map(async (ch) => {
      // plain fetch: RSS is never bot-blocked, don't spend Unlocker requests
      const r = await fetch(
        `https://www.youtube.com/feeds/videos.xml?channel_id=${ch.channel_id}`,
        { headers: { 'User-Agent': UA } },
      );
      if (!r.ok) return [];
      const xml = await r.text();
      const items = [];
      for (const m of xml.matchAll(/<entry>(.*?)<\/entry>/gs)) {
        const block = m[1];
        const title = decode(block.match(/<title>(.*?)<\/title>/s)?.[1] ?? '');
        const link = block.match(/<link rel="alternate" href="([^"]+)"/)?.[1];
        const pub = block.match(/<published>(.*?)<\/published>/s)?.[1];
        if (!title || !link || !pub || !fresh(pub) || JUNK.test(title)) continue;
        items.push({
          date: iso(pub),
          text: `${ch.team ?? ch.bot}: ${title}`.slice(0, 140),
          url: link,
          auto: true,
          source: 'team',
          platform: 'youtube',
          team_id: ch.id,
          team: ch.team ?? ch.bot,
        });
        if (items.length >= 2) break; // per-channel cap keeps the feed varied
      }
      return items;
    }),
  );
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).slice(0, 12);
}

async function redditTop() {
  const body = await get('https://www.reddit.com/r/battlebots/top.json?t=week&limit=20');
  const posts = JSON.parse(body).data.children ?? [];
  return posts
    .map((p) => p.data)
    .filter((d) => d.score >= 50 && !d.stickied && !JUNK.test(d.title))
    .slice(0, 4)
    .map((d) => ({
      date: iso(d.created_utc * 1000),
      text: `r/battlebots: ${d.title}`.slice(0, 140),
      url: `https://www.reddit.com${d.permalink}`,
      auto: true,
      source: 'reddit',
    }));
}

export async function collect() {
  const results = await Promise.allSettled([
    googleNews(),
    redditTop(),
    officialNews(),
    teamYouTube(),
  ]);
  const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const seen = new Set();
  const unique = items
    .filter((i) => !seen.has(i.url) && seen.add(i.url))
    .sort((a, b) => b.date.localeCompare(a.date));
  const kept = [];
  for (const item of unique) {
    if (!kept.some((k) => similar(k.text, item.text))) kept.push(item);
  }
  return kept.slice(0, 30);
}

async function readArchive() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { items: [], state: {} };
  try {
    const { blobs } = await list({ prefix: ARCHIVE_PATH });
    const blob = blobs.find((b) => b.pathname === ARCHIVE_PATH);
    if (!blob) return { items: [], state: {} };
    const r = await fetch(`${blob.url}?ts=${Date.now()}`);
    if (!r.ok) return { items: [], state: {} };
    const doc = await r.json();
    return { items: doc.items ?? [], state: doc.state ?? {} };
  } catch {
    return { items: [], state: {} };
  }
}

async function writeArchive(items, state) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  await put(
    ARCHIVE_PATH,
    JSON.stringify({ updated_at: new Date().toISOString(), items, state }),
    {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    },
  );
}

/** Merge freshly scraped stories into the permanent archive. */
export function mergeIntoArchive(archive, scraped) {
  const seen = new Set(archive.map((i) => i.url ?? i.text));
  const fresh = scraped.filter((i) => !seen.has(i.url ?? i.text));
  return {
    merged: [...fresh, ...archive]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, ARCHIVE_CAP),
    added: fresh.length,
  };
}

export default async function handler(req, res) {
  try {
    const [scraped, archive] = await Promise.all([collect(), readArchive()]);
    const ig = await instagramStep(archive.state.ig);
    const { merged, added } = mergeIntoArchive(archive.items, [...scraped, ...ig.items]);
    if (added > 0 || ig.changed) {
      await writeArchive(merged, { ...archive.state, ig: ig.state });
    }
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({ generated_at: new Date().toISOString(), added, items: merged });
  } catch (e) {
    res.setHeader('Cache-Control', 's-maxage=600');
    res.status(200).json({ generated_at: new Date().toISOString(), items: [], error: String(e) });
  }
}
