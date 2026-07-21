// Admin analytics: server-side PostHog (EU) queries for the /admin page.
// Requires two Vercel env vars: POSTHOG_API_KEY (personal key, Query Read
// scope — NEVER the VITE_ public token) and ADMIN_KEY (the passphrase the
// admin page sends). Nothing here is cached: the page is a live view.

const HOST = 'https://eu.posthog.com';

async function hogql(query) {
  const r = await fetch(`${HOST}/api/projects/@current/query/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.POSTHOG_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  if (!r.ok) throw new Error(`posthog ${r.status}`);
  return (await r.json()).results ?? [];
}

// windowed queries take the range from ?days=N (whitelisted below);
// "now", "today" and the live stream are inherently fixed windows
const queries = (days) => ({
  now_active: `SELECT count(DISTINCT person_id) FROM events
               WHERE timestamp > now() - INTERVAL 15 MINUTE`,
  today: `SELECT count(DISTINCT person_id), countIf(event = '$pageview') FROM events
          WHERE toDate(timestamp) = toDate(now())`,
  daily: `SELECT toDate(timestamp) AS day, count(DISTINCT person_id),
                 countIf(event = '$pageview')
          FROM events WHERE timestamp > now() - INTERVAL ${days} DAY
          GROUP BY day ORDER BY day`,
  top_bots: `SELECT properties.bot, count() FROM events
             WHERE event = 'bot_selected' AND timestamp > now() - INTERVAL ${days} DAY
               AND properties.bot IS NOT NULL
             GROUP BY properties.bot ORDER BY count() DESC LIMIT 12`,
  fights: `SELECT count(), count(DISTINCT person_id) FROM events
           WHERE event = 'fight_mode' AND timestamp > now() - INTERVAL ${days} DAY`,
  searches: `SELECT properties.query, count() FROM events
             WHERE event = 'search_select' AND timestamp > now() - INTERVAL ${days} DAY
               AND properties.query IS NOT NULL
             GROUP BY properties.query ORDER BY count() DESC LIMIT 10`,
  countries: `SELECT properties.$geoip_country_name, count(DISTINCT person_id)
              FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL ${days} DAY
              GROUP BY properties.$geoip_country_name ORDER BY 2 DESC LIMIT 12`,
  devices: `SELECT properties.$device_type, count(DISTINCT person_id)
            FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL ${days} DAY
            GROUP BY properties.$device_type ORDER BY 2 DESC`,
  referrers: `SELECT properties.$referring_domain, count(DISTINCT person_id)
              FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL ${days} DAY
                AND properties.$referring_domain != '$direct'
              GROUP BY properties.$referring_domain ORDER BY 2 DESC LIMIT 10`,
  live: `SELECT timestamp, event,
                coalesce(properties.bot, properties.team, properties.query,
                         properties.country, properties.$geoip_country_name, '')
         FROM events
         WHERE event NOT IN ('$autocapture', '$web_vitals', '$pageleave', '$rageclick')
           AND timestamp > now() - INTERVAL 2 HOUR
         ORDER BY timestamp DESC LIMIT 25`,
});

const ALLOWED_DAYS = [1, 7, 14, 30, 90, 365];

export default async function handler(req, res) {
  if ((req.headers['x-admin-key'] ?? '') !== (process.env.ADMIN_KEY ?? '')
      || !process.env.ADMIN_KEY) {
    res.status(401).json({ error: 'wrong key' });
    return;
  }
  if (!process.env.POSTHOG_API_KEY) {
    res.status(503).json({ error: 'POSTHOG_API_KEY not configured' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    const url = new URL(req.url, 'http://x');
    const requested = Number(url.searchParams.get('days'));
    const days = ALLOWED_DAYS.includes(requested) ? requested : 7;
    const QUERIES = queries(days);
    const names = Object.keys(QUERIES);
    const results = await Promise.all(names.map((n) => hogql(QUERIES[n])));
    const data = Object.fromEntries(names.map((n, i) => [n, results[i]]));
    res.status(200).json({ generated_at: new Date().toISOString(), days, ...data });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}
