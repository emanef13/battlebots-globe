# BattleBots Globe 🌍🤖

**Live: [battlebotsglobe.com](https://battlebotsglobe.com)**

An interactive 3D globe of the entire BattleBots universe: **135 robots from
12 countries** — the 24-bot Pro League 2026 roster and the historical
competitors — plotted on their hometowns, with **849 recorded 1v1 fights**
drawn as rivalry arcs, **474 embedded fight videos**, and a Street
Fighter-style head-to-head **Fight Mode** for staging any matchup.

Highlights:

- **Robot panels** — team photo, weapon, builder, seasons, arena record, and
  fight highlights per bot; selecting a robot spotlights its rivals on the
  globe and dims everyone it never fought.
- **Fight Mode** — pick a challenger, click an opponent (or search
  `tombstone vs minotaur`): tale of the tape, head-to-head record, and the
  actual fight footage.
- **Team view** — 111 teams; filter the globe to one team's garage from the
  header stat, the search bar, or the team name in any robot panel.
- **Search & navigation** — bots, teams, cities, countries; country and
  team stat popovers; deep links (`/?bot=minotaur`); a static, indexable
  page per robot (+ sitemap) for SEO.
- **Mobile** — full touch experience: bottom-sheet panels with swipe-to-
  minimize, tap-friendly filters, draggable overlay controls.

Built by [Manolis Efthymiou](https://www.linkedin.com/in/manolis-efthymiou-054574157/)
for the **#BattleBotsDev** competition, powered by [Bright Data](https://brightdata.com).

## Architecture

```
pipeline/  Python collection jobs (Bright Data Web Unlocker / Scraper API)
   collect_teams.py     fetch roster & wiki pages via Web Unlocker -> data/raw/pages/
   geocode.py           hometowns -> lat/lng (Nominatim, cached) -> data/teams.json
data/      canonical datasets (teams, fights, videos, curated news)
web/       Vite + React + globe.gl frontend (reads /data/*.json)
   scripts/build-pages.mjs   post-build: static per-robot pages + sitemap.xml
api/       Vercel serverless functions
   news.mjs   arena-news scraper: Google News / Reddit / battlebots.com via
              Bright Data, permanent archive in Vercel Blob, CDN-cached hourly
   chat.mjs   "Pit Boss" arena-guide chat: Claude with tool-calling RAG over
              the same JSON datasets (streaming, rate-limited, origin-checked)
```

Data is **pre-collected** on a schedule rather than scraped per-request: Bright
Data scraper jobs run in the pipeline, results land in `data/`, and the site
serves the generated JSON. Fight records (`data/fights.json`) are curated from
the BattleBots Wiki — 1v1 bouts between rostered bots only.

The news ticker and the Pit Boss chat ship behind feature flags
(`NEWS_ENABLED` / `CHAT_ENABLED` in `web/src/App.tsx`) and are currently off.

## Bright Data usage

- **Web Unlocker** (`POST https://api.brightdata.com/request`) fetches roster and
  wiki pages as LLM-ready markdown — see `pipeline/brightdata_client.py` — and
  fronts the live news sources in `api/news.mjs`.
- **Web Scraper API** (trigger → poll snapshot → download) drives YouTube video
  discovery — per-bot highlights (`collect_videos.py`) and per-matchup fight
  videos (`collect_match_videos.py`); both ship with a `--seed` dev scraper for
  working without an API token. The news function uses the same flow for
  Instagram posts, run as a state machine across cached invocations.

## Running it

Frontend:

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```

Pipeline (needs a Bright Data account — promo code `battlebotsdev`):

```bash
export BRIGHTDATA_API_TOKEN=...          # control panel -> Account settings -> API keys
export BRIGHTDATA_UNLOCKER_ZONE=...      # your Web Unlocker zone name
python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/python pipeline/collect_teams.py     # fetch sources via Bright Data
.venv/bin/python pipeline/geocode.py           # regenerate teams.json for the app
.venv/bin/python pipeline/download_photos.py   # mirror team photos locally
.venv/bin/python pipeline/robot_cutouts.py     # AI-crop each robot -> globe markers
.venv/bin/python pipeline/collect_videos.py    # fight videos per bot (--seed for dev scrape)
.venv/bin/python pipeline/collect_match_videos.py  # one fight video per matchup pair
.venv/bin/python pipeline/add_links.py         # verified team-page links (wiki API)
```

`robot_cutouts.py` isolates the robot from each team photo automatically:
a u2net foreground segmentation minus a dilated u2net_human_seg mask leaves
the robot; the largest bottom-center component (with thin-streak trimming)
becomes a transparent sprite in `web/public/bots/`.

Textures: three-globe example earth maps (NASA-derived Blue Marble / Black Marble).

## Serverless & analytics (optional)

All secrets live in Vercel/local env — never in the repo.

| Env var | Where | Enables |
|---|---|---|
| `BRIGHTDATA_API_TOKEN` | Vercel | live news scraping in `api/news.mjs` |
| `BLOB_READ_WRITE_TOKEN` | Vercel (Blob store) | permanent news archive |
| `ANTHROPIC_API_KEY` (+ optional `CHAT_MODEL`) | Vercel | Pit Boss chat backend |
| `VITE_POSTHOG_KEY` | Vercel | product analytics (PostHog EU) |

## Deployment

The app is fully static plus the two serverless functions — `cd web && npm run
build` produces `web/dist/` (and the per-robot static pages), servable by any
static host. Production runs on Vercel; pushing to `main` redeploys
automatically. To refresh data after new episodes: re-run the pipeline, commit
the updated JSON, push.

## Credits

- Fight data, robot facts and robot images: the amazing
  [BattleBots Wiki](https://battlebots.fandom.com) community (CC BY-SA).
- Team photos and roster: [battlebots.com](https://battlebots.com).
- Fight videos: embedded from the official
  [BattleBots YouTube channel](https://www.youtube.com/@BattleBots) and
  community uploads — nothing is re-hosted.
- Earth textures: three-globe examples (NASA-derived imagery).
  Land/city vector data: [Natural Earth](https://www.naturalearthdata.com) (public domain).
- Geocoding: [Nominatim / OpenStreetMap](https://nominatim.org).
- Data collection powered by [Bright Data](https://brightdata.com);
  Pit Boss chat powered by [Claude](https://www.anthropic.com).

BattleBots is a trademark of BattleBots Inc. This is an unofficial fan
project built for the #BattleBotsDev community competition.
