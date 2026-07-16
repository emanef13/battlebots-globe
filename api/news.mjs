// Live arena news: scrapes Google News and r/battlebots on demand (CDN
// caches responses for an hour, so sources are hit at most hourly) and
// accumulates every story ever seen into a Vercel Blob archive — the
// Gazette is a permanent chronological record, not a snapshot. When
// BRIGHTDATA_API_TOKEN is set, requests route through Bright Data's Web
// Unlocker (datacenter IPs are commonly blocked by Reddit).
import { get as blobGet, put } from '@vercel/blob';
import teamFeedsFile from '../data/team_feeds.json' with { type: 'json' };

// Vercel injects the store token as BLOB_READ_WRITE_TOKEN — unless the
// store was connected with a prefix, which yields e.g.
// MYSTORE_BLOB_READ_WRITE_TOKEN. Accept any spelling.
const BLOB_TOKEN =
  process.env.BLOB_READ_WRITE_TOKEN ??
  Object.entries(process.env).find(([k]) => k.endsWith('_READ_WRITE_TOKEN'))?.[1];

const ARCHIVE_PATH = 'news-archive.json';
const ARCHIVE_CAP = 300;

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
    // Unlocker first (Reddit blocks datacenter IPs), but a bad zone name or
    // account hiccup must not silence sources that are plainly fetchable
    try {
      const r = await fetch('https://api.brightdata.com/request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zone: process.env.BRIGHTDATA_UNLOCKER_ZONE ?? 'web_unlocker1',
          url,
          format: 'raw',
        }),
      });
      if (r.ok) return r.text();
    } catch {
      // fall through to direct fetch
    }
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

// One dataset batch per platform per day. Each step is a state machine
// across cached invocations: trigger a snapshot, poll it later, ingest when
// ready. Per-platform state lives in the blob archive.
const SOCIAL_PLATFORMS = {
  ig: {
    platform: 'instagram',
    // "Instagram - Posts - discover by url" (id from the control panel)
    datasetId: 'gd_lk5ns7kz1pck8jpis',
    dataset: (name) => /instagram/i.test(name) && /post/i.test(name),
    targets: () => teamFeedsFile.instagram,
  },
  fb: {
    platform: 'facebook',
    dataset: (name) => /facebook/i.test(name) && /post/i.test(name),
    targets: () => teamFeedsFile.facebook,
  },
};

// dataset row schemas differ per platform — read every known field name
function mapSocialRow(r, cfg) {
  const caption = String(
    r.caption ?? r.description ?? r.content ?? r.post_text ?? r.message ?? '',
  ).replace(/\s+/g, ' ').trim();
  const url = r.url ?? r.post_url ?? r.permalink ?? r.post_link;
  const posted = r.date_posted ?? r.timestamp ?? r.created_time ?? r.date;
  if (!caption || !url || !posted || !fresh(posted)) return null;
  // map the row back to its account: any handle appearing in the row's
  // user/page/url fields (longest handles first so substrings can't steal)
  const hay = norm(
    [r.user_posted, r.user_username, r.profile_username, r.page_name, r.user_url,
     r.page_url, r.profile_url, r.use_url, r.input?.url, url].filter(Boolean).join(' '),
  );
  const targets = [...cfg.targets()].sort((a, b) => b.handle.length - a.handle.length);
  const acct = targets.find((a) => hay.includes(norm(a.handle)));
  if (!acct) return null;
  if (acct.official) {
    return {
      date: iso(posted),
      text: `Instagram: ${caption}`.slice(0, 140),
      url,
      auto: true,
      source: 'instagram',
    };
  }
  return {
    date: iso(posted),
    text: `${acct.team ?? acct.bot}: ${caption}`.slice(0, 140),
    url,
    auto: true,
    source: 'team',
    platform: cfg.platform,
    team_id: acct.id,
    team: acct.team ?? acct.bot,
  };
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

async function socialStep(key, state = {}) {
  const cfg = SOCIAL_PLATFORMS[key];
  if (!process.env.BRIGHTDATA_API_TOKEN) return { items: [], state, changed: false };
  // No blob persistence means snapshot ids can't be remembered: every
  // invocation would trigger (and pay for) a brand-new crawl and never
  // collect any. Refuse to spend until the archive can be written.
  if (!BLOB_TOKEN) return { items: [], state, changed: false };
  try {
    // known dataset ids are pinned; otherwise resolve by name once
    if (!state.dataset_id && cfg.datasetId) {
      state = { ...state, dataset_id: cfg.datasetId };
    }
    if (!state.dataset_id) {
      const sets = await bd('/datasets/list');
      const ds = sets.find((d) => cfg.dataset(d.name));
      if (!ds) return { items: [], state, changed: false };
      state = { ...state, dataset_id: ds.id };
    }
    // download a finished snapshot and map rows back to their accounts
    if (state.snapshot_id) {
      const prog = await bd(`/datasets/v3/snapshot/${state.snapshot_id}/progress`);
      if (prog.status === 'ready') {
        const rows = await bd(`/datasets/v3/snapshot/${state.snapshot_id}/data?format=json`);
        const items = (Array.isArray(rows) ? rows : [])
          .map((r) => mapSocialRow(r, cfg))
          .filter(Boolean)
          .slice(0, 80);
        return { items, state: { ...state, snapshot_id: null, last_done: Date.now() }, changed: true };
      }
      if (prog.status === 'failed') {
        return { items: [], state: { ...state, snapshot_id: null }, changed: true };
      }
      return { items: [], state, changed: false }; // still running
    }
    // trigger one batched snapshot a day covering every account
    if (!state.last_done || Date.now() - state.last_done > IG_EVERY_MS) {
      const targets = cfg.targets().map((a) => ({
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
          // the official channel is news, not a team: no team_id means the
          // feed shows no robot link and the globe wears no icon for it
          ...(ch.official ? {} : { team_id: ch.id }),
          team: ch.team ?? ch.bot,
        });
        if (items.length >= (ch.official ? 3 : 2)) break; // per-channel cap
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
  if (!BLOB_TOKEN) return { items: [], state: {} };
  try {
    const res = await blobGet(ARCHIVE_PATH, { access: 'private', token: BLOB_TOKEN, useCache: false });
    if (!res || res.statusCode !== 200) return { items: [], state: {} };
    const doc = JSON.parse(await new Response(res.stream).text());
    const items = (doc.items ?? []).filter(
      (i) => !(i.team_id === 'monsoon' && i.platform === 'youtube'),
    );
    return { items, state: doc.state ?? {} };
  } catch {
    return { items: [], state: {} };
  }
}

async function writeArchive(items, state) {
  if (!BLOB_TOKEN) return;
  await put(
    ARCHIVE_PATH,
    JSON.stringify({ updated_at: new Date().toISOString(), items, state }),
    {
      access: 'private', // the store is private-type; reads go through get()
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token: BLOB_TOKEN,
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
    const [ig, fb] = await Promise.all([
      socialStep('ig', archive.state.ig),
      socialStep('fb', archive.state.fb),
    ]);
    const { merged, added } = mergeIntoArchive(archive.items, [
      ...scraped,
      ...ig.items,
      ...fb.items,
    ]);
    if (added > 0 || ig.changed || fb.changed) {
      await writeArchive(merged, { ...archive.state, ig: ig.state, fb: fb.state });
    }
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({
      generated_at: new Date().toISOString(),
      added,
      // diagnosability: false = archive is NOT persisting (check the
      // BLOB_READ_WRITE_TOKEN env var / store-project connection)
      persistence: Boolean(BLOB_TOKEN),
      items: merged,
    });
  } catch (e) {
    res.setHeader('Cache-Control', 's-maxage=600');
    res.status(200).json({ generated_at: new Date().toISOString(), items: [], error: String(e) });
  }
}
