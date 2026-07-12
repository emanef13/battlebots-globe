# BattleBots Globe 🌍🤖

An interactive 3D globe of the entire BattleBots universe: every Pro League 2026
team and historical competitor, plotted on their hometown, with live stats and
fan-pulse layers on the way.

Built for the **#BattleBotsDev** competition, powered by [Bright Data](https://brightdata.com).

## Architecture

```
pipeline/  Python collection jobs (Bright Data Web Unlocker / Scraper API)
   collect_teams.py     fetch roster & wiki pages via Web Unlocker -> data/raw/pages/
   geocode.py           hometowns -> lat/lng (Nominatim, cached) -> data/teams.json
data/      canonical datasets (raw inputs + generated teams.json)
web/       Vite + React + globe.gl frontend (reads /data/teams.json)
```

Data is **pre-collected** on a schedule rather than scraped per-request: Bright
Data scraper jobs run in the pipeline, results land in `data/`, and the site
serves the generated JSON.

## Bright Data usage

- **Web Unlocker** (`POST https://api.brightdata.com/request`) fetches roster and
  wiki pages as LLM-ready markdown — see `pipeline/brightdata_client.py`.
- **Web Scraper API** (trigger → poll snapshot → download) will drive the
  Reddit / YouTube fan-pulse layers next.

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
.venv/bin/python pipeline/add_links.py         # verified team-page links (wiki API)
```

`robot_cutouts.py` isolates the robot from each team photo automatically:
a u2net foreground segmentation minus a dilated u2net_human_seg mask leaves
the robot; the largest bottom-center component (with thin-streak trimming)
becomes a transparent sprite in `web/public/bots/`.

Textures: three-globe example earth maps (NASA-derived Blue Marble / Black Marble).

## Deployment

The app is fully static — `cd web && npm run build` produces `web/dist/`,
servable by any static host. Production runs on Vercel (root `web/`, build
`npm run build`, output `dist`); pushing to `main` redeploys automatically.
To refresh data after new episodes: re-run the pipeline, commit the updated
JSON, push.

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
- Data collection powered by [Bright Data](https://brightdata.com).

BattleBots is a trademark of BattleBots Inc. This is an unofficial fan
project built for the #BattleBotsDev community competition.

## Roadmap

- [x] Interactive globe: zoom-aware cluster pins, hover cards with team photos, click-to-fly, search, side panel
- [x] Roster cross-verified against battlebots.com (WC VII + Pro League); 130 bots, photos + AI-cropped robot cutouts for all
- [x] Fight highlights per bot — official YouTube videos, embedded (no re-hosting of footage); discovery via Bright Data YouTube scraper (dev seed scraper included)
- [ ] Fan Pulse: live Reddit/YouTube chatter per bot (Bright Data Scraper API)
- [ ] Meta lenses: color the globe by weapon class / win rate / sentiment
- [ ] Head-to-head compare mode
- [ ] MCP-powered analyst chat
