// Build-time static pages for SEO: /robots/<id>/, /robots/, /countries/<slug>/,
// /countries/ and sitemap.xml — plain crawlable HTML generated from the same
// JSON the app serves. Runs as npm postbuild, writing into dist/.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://battlebotsglobe.com';

const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const teams = read('teams.json').teams;
const fights = read('fights.json').fights;
const matchVideos = read('match_videos.json').videos;

const byId = new Map(teams.map((t) => [t.id, t]));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const ISO = {
  USA: 'US', 'United States': 'US', UK: 'GB', 'United Kingdom': 'GB', Canada: 'CA',
  Brazil: 'BR', India: 'IN', China: 'CN', Netherlands: 'NL', Australia: 'AU',
  'New Zealand': 'NZ', 'South Korea': 'KR', France: 'FR', Russia: 'RU',
};
const flag = (c) =>
  ISO[c] ? String.fromCodePoint(...[...ISO[c]].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : '';

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `
  :root { color-scheme: dark; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0e1a; color: #fff; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
         line-height: 1.55; padding: 28px 20px 60px; }
  main { max-width: 760px; margin: 0 auto; }
  a { color: #eda100; }
  nav.crumbs { font-size: 13px; margin-bottom: 22px; color: #898781; }
  nav.crumbs a { color: #c3c2b7; text-decoration: none; }
  h1 { font-size: 34px; margin: 8px 0 2px; }
  h2 { font-size: 19px; margin: 30px 0 10px; color: #eda100; }
  .sub { color: #c3c2b7; }
  .hero { max-width: 100%; max-height: 340px; object-fit: contain; border-radius: 12px;
          background: #fff; margin: 18px 0; display: block; }
  table { width: 100%; border-collapse: collapse; font-size: 14.5px; }
  td, th { padding: 7px 10px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.09); }
  th { color: #898781; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.6px; }
  ul.plain { list-style: none; } ul.plain li { padding: 3px 0; }
  .cta { display: inline-block; margin: 20px 0 4px; padding: 12px 22px; background: linear-gradient(135deg,#eda100,#ffd070);
         color: #14090b; font-weight: 700; border-radius: 10px; text-decoration: none; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 6px 18px; }
  footer { margin-top: 44px; font-size: 12.5px; color: #898781; }
  .win { color: #48cd73; } .loss { color: #e66767; }
`;

function page({ url, title, description, image, body, jsonLd }) {
  const img = image ? `${SITE}${image}` : `${SITE}/og.jpg`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${SITE}${url}" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="BattleBots Globe" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${SITE}${url}" />
<meta property="og:image" content="${img}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${img}" />
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
<style>${CSS}</style>
</head>
<body>
<main>
${body}
<footer>
  <a href="/">BattleBots Globe</a> — an interactive 3D globe of every BattleBots competitor.
  Data: <a href="https://battlebots.fandom.com" rel="noopener">BattleBots Wiki</a> community (CC BY-SA).
  Unofficial fan project for the #BattleBotsDev competition.
</footer>
</main>
</body>
</html>`;
}

const write = (rel, html) => {
  const dir = path.join(DIST, rel);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
};

const recordFor = (id) => {
  let w = 0, l = 0;
  for (const f of fights) {
    if (f.a !== id && f.b !== id) continue;
    if (f.winner === id) w++;
    else if (f.winner) l++;
  }
  return { w, l };
};

const METHOD = { KO: 'KO', JD: "judges' decision", 'Split JD': 'split decision', Crowd: 'crowd vote' };
const urls = [];

// ---------- robot pages ----------
for (const t of teams) {
  const place = [t.city, t.region, t.country].filter(Boolean).join(', ');
  const { w, l } = recordFor(t.id);
  const myFights = fights.filter((f) => f.a === t.id || f.b === t.id);
  const neighbors = teams.filter((x) => x.country === t.country && x.id !== t.id);

  const fightRows = myFights
    .map((f) => {
      const oppId = f.a === t.id ? f.b : f.a;
      const opp = byId.get(oppId);
      const won = f.winner === t.id;
      const result = f.winner
        ? `<span class="${won ? 'win' : 'loss'}">${won ? 'Won' : 'Lost'}</span>${f.method ? ` by ${METHOD[f.method] ?? esc(f.method)}` : ''}`
        : 'No decision';
      const video = matchVideos[[t.id, oppId].sort().join('|')];
      return `<tr><td><a href="/robots/${oppId}/">${esc(opp?.bot ?? oppId)}</a></td>
<td>${esc(f.season ?? '')}</td><td>${result}</td>
<td>${video ? `<a href="https://www.youtube.com/watch?v=${video.id}" rel="noopener">watch</a>` : ''}</td></tr>`;
    })
    .join('\n');

  const desc =
    `${t.bot} is a BattleBots competitor from ${place || 'an unknown hometown'}` +
    (t.team ? `, built by ${t.team}` : '') +
    (t.weapon ? `. Weapon: ${t.weapon}` : '') +
    (w + l > 0 ? `. Arena record ${w}W–${l}L against bots on the globe.` : '.');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsTeam',
    name: t.bot,
    sport: 'Robot combat',
    ...(t.team ? { memberOf: { '@type': 'Organization', name: t.team } } : {}),
    ...(place ? { location: { '@type': 'Place', name: place } } : {}),
    ...(t.photo || t.marker ? { image: `${SITE}${t.photo ?? t.marker}` } : {}),
    url: `${SITE}/robots/${t.id}/`,
  };

  const body = `
<nav class="crumbs"><a href="/">Globe</a> › <a href="/robots/">Robots</a> › ${esc(t.bot)}</nav>
<h1>${esc(t.bot)}</h1>
<p class="sub">${t.team ? esc(t.team) + ' · ' : ''}${t.active ? 'Pro League 2026' : 'Historical competitor'}</p>
${t.photo || t.marker ? `<img class="hero" src="${t.photo ?? t.marker}" alt="${esc(t.bot)}" />` : ''}
<table>
${place ? `<tr><th>Hometown</th><td>${flag(t.country)} ${esc(place)}</td></tr>` : ''}
${t.weapon ? `<tr><th>Weapon</th><td>${esc(t.weapon)}</td></tr>` : ''}
${t.builder ? `<tr><th>Builder</th><td>${esc(t.builder)}</td></tr>` : ''}
${t.seasons.length ? `<tr><th>Seasons</th><td>${t.seasons.map(esc).join(' · ')}</td></tr>` : ''}
${w + l > 0 ? `<tr><th>Record</th><td><span class="win">${w}W</span> – <span class="loss">${l}L</span> vs bots on the globe</td></tr>` : ''}
</table>
<a class="cta" href="/?bot=${t.id}">⚔ View ${esc(t.bot)} on the 3D globe</a>
${myFights.length ? `<h2>Fight history</h2>
<table><tr><th>Opponent</th><th>Season</th><th>Result</th><th>Video</th></tr>
${fightRows}</table>` : ''}
${neighbors.length ? `<h2>More robots from ${esc(t.country)}</h2>
<ul class="plain grid">${neighbors.map((n) => `<li>${flag(n.country)} <a href="/robots/${n.id}/">${esc(n.bot)}</a></li>`).join('')}</ul>
<p><a href="/countries/${slug(t.country)}/">All ${esc(t.country)} robots →</a></p>` : ''}
`;
  write(`robots/${t.id}`, page({
    url: `/robots/${t.id}/`,
    title: `${t.bot} — BattleBots fights, team, hometown | BattleBots Globe`,
    description: desc,
    image: t.photo ?? t.marker,
    body,
    jsonLd,
  }));
  urls.push(`/robots/${t.id}/`);
}

// ---------- robots index ----------
const byCountry = new Map();
for (const t of teams) {
  const c = t.country ?? 'Unknown';
  if (!byCountry.has(c)) byCountry.set(c, []);
  byCountry.get(c).push(t);
}
const countries = [...byCountry.entries()].sort((a, b) => b[1].length - a[1].length);

write('robots', page({
  url: '/robots/',
  title: `All ${teams.length} BattleBots competitors — every robot ever | BattleBots Globe`,
  description: `Browse all ${teams.length} BattleBots competitors from ${countries.length} countries — Pro League 2026 roster and historical robots, each with fights, videos and hometowns.`,
  body: `
<nav class="crumbs"><a href="/">Globe</a> › Robots</nav>
<h1>All BattleBots competitors</h1>
<p class="sub">${teams.length} robots from ${countries.length} countries — <a href="/">explore them on the 3D globe</a> or <a href="/countries/">browse by country</a>.</p>
${countries.map(([c, list]) => `<h2>${flag(c)} ${esc(c)} (${list.length})</h2>
<ul class="plain grid">${list.sort((a, b) => a.bot.localeCompare(b.bot)).map((t) =>
  `<li><a href="/robots/${t.id}/">${esc(t.bot)}</a>${t.active ? ' ⭐' : ''}</li>`).join('')}</ul>`).join('\n')}
<p style="margin-top:18px">⭐ = Pro League 2026</p>`,
  jsonLd: {
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    name: 'All BattleBots competitors', url: `${SITE}/robots/`,
  },
}));
urls.push('/robots/');

// ---------- country pages + index ----------
for (const [c, list] of countries) {
  const s = slug(c);
  write(`countries/${s}`, page({
    url: `/countries/${s}/`,
    title: `BattleBots teams from ${c} — ${list.length} robot${list.length > 1 ? 's' : ''} | BattleBots Globe`,
    description: `${c} has ${list.length} BattleBots competitor${list.length > 1 ? 's' : ''}: ${list.slice(0, 6).map((t) => t.bot).join(', ')}${list.length > 6 ? ' and more' : ''}. See their hometowns, fights and videos.`,
    body: `
<nav class="crumbs"><a href="/">Globe</a> › <a href="/countries/">Countries</a> › ${esc(c)}</nav>
<h1>${flag(c)} BattleBots from ${esc(c)}</h1>
<p class="sub">${list.length} robot${list.length > 1 ? 's' : ''} — <a href="/">see them on the 3D globe</a></p>
<table><tr><th>Robot</th><th>Team</th><th>Hometown</th><th>Status</th></tr>
${list.map((t) => `<tr><td><a href="/robots/${t.id}/">${esc(t.bot)}</a></td><td>${esc(t.team ?? '')}</td>
<td>${esc([t.city, t.region].filter(Boolean).join(', '))}</td><td>${t.active ? 'Pro League 2026' : 'Historical'}</td></tr>`).join('\n')}
</table>`,
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: `BattleBots teams from ${c}`, url: `${SITE}/countries/${s}/`,
    },
  }));
  urls.push(`/countries/${s}/`);
}

write('countries', page({
  url: '/countries/',
  title: 'BattleBots teams by country — 12 countries mapped | BattleBots Globe',
  description: `BattleBots competitors come from ${countries.length} countries. Browse every country's robots, hometowns and fight histories.`,
  body: `
<nav class="crumbs"><a href="/">Globe</a> › Countries</nav>
<h1>BattleBots by country</h1>
<p class="sub"><a href="/">Explore the 3D globe</a> or <a href="/robots/">browse all robots</a></p>
<table><tr><th>Country</th><th>Robots</th></tr>
${countries.map(([c, list]) => `<tr><td>${flag(c)} <a href="/countries/${slug(c)}/">${esc(c)}</a></td><td>${list.length}</td></tr>`).join('\n')}
</table>`,
  jsonLd: {
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    name: 'BattleBots teams by country', url: `${SITE}/countries/`,
  },
}));
urls.push('/countries/');

// ---------- sitemap ----------
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${SITE}/</loc><lastmod>${today}</lastmod><priority>1.0</priority></url>
${urls.map((u) => `<url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);

console.log(`static pages: ${urls.length} + sitemap.xml`);
