---
name: add-robot
description: Add a new or missing robot/team to BattleBots Globe — wiki research, data entries, fights, marker cutout, videos, verification, and deploy. Use when someone reports a missing bot or asks to add one.
---

# Adding a robot to BattleBots Globe

Adds one bot end-to-end: team entry, fights, photo, globe marker, videos.
Reference run: commit `9d1fca0` (Railgun MAX). Budget ~15 minutes.

Work on `main` unless told otherwise (push = production deploy via Vercel).
`data/` and `web/public/data/` hold **duplicate copies** of every JSON file —
always write both. Python: use `.venv/bin/python` from the repo root.

## 1. Research the bot (BattleBots Wiki API)

Regular page fetches to battlebots.fandom.com are Cloudflare-blocked; the
**MediaWiki API works** (send a User-Agent):

```bash
curl -s "https://battlebots.fandom.com/api.php?action=query&titles=<Bot%20Name>&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2" \
  -H "User-Agent: BattleBotsGlobe/1.0 (emanef13@gmail.com)"
```

From the `{{Bot ...}}` infobox take: `robot_name`, `image`, `team`, `from`
(hometown), `weapons`, captain (bolded/Gold name in `team_members`), and
seasons. From the `==Results==` section take every battle: opponent, outcome,
method. Cross-check the prose for rumbles (encode pairwise vs the actual
winner only) and exhibition matches (include them — the dataset does).

## 2. Geocode the hometown (Nominatim)

```bash
curl -s "https://nominatim.openstreetmap.org/search?q=<City>%2C%20<Country>&format=json&limit=1" \
  -H "User-Agent: BattleBotsGlobe/1.0 (emanef13@gmail.com)"
```

## 3. Team entry — `data/teams.json` + `web/public/data/teams.json`

**Append** the new entry to `teams` (never sort — reordering churns the whole
file). Rewrite with `json.dumps(doc, indent=2, ensure_ascii=False) + "\n"`.

Schema and conventions (copy an existing entry as reference):

- `id`: lowercase, spaces→hyphens (`Railgun MAX` → `railgun-max`)
- `region`: US state or `null`
- `seasons`: strings matching existing style, e.g. `"2019 (WC IV)"`,
  `"Pro League (2026)"` — grep existing entries for the exact label
- `active`: `true` only for Pro League 2026 roster bots
- `photo`: `/photos/<id>.jpg`, `marker`: `/bots/<id>.png` (set after step 5)
- `url`: `https://battlebots.fandom.com/wiki/<Page_Name>`

## 4. Fights — `data/fights.json` + `web/public/data/fights.json`

⚠️ This file uses **indent=1** (the other JSONs use indent=2).

Append one object per fight: `{"a", "b", "winner", "season", "method"}`.

- **Only include fights where both bots are in teams.json** — the dataset
  never references unmapped ids (verify: fight ids ⊆ team ids).
- `season` is the long name: `"World Championship IV"`.
- `method` vocabulary: `KO`, `JD`, `Split JD`, `Crowd`, `null` (unknown).
- Rumbles: one pairwise entry, new bot vs the rumble winner only.
- a/b order doesn't matter (records are aggregated per unordered pair).

## 5. Photo and globe marker

1. Resolve the infobox image URL:
   `api.php?action=query&titles=File:<image>&prop=imageinfo&iiprop=url`
2. Download (browser User-Agent) to **both**:
   - `data/raw/robot_imgs/<id>.img` — cutout input (any format is fine)
   - `web/public/photos/<id>.jpg` — panel photo. Wiki files are often WebP
     with a .jpg name: re-save via PIL (`convert('RGB').save(..., quality=85)`).
3. Generate the marker sprite (rembg segmentation, prefers the wiki image):
   ```bash
   .venv/bin/python pipeline/robot_cutouts.py --only <id> --force
   ```
   Then **Read the output PNG** (`web/public/bots/<id>.png`) to eyeball the
   cutout, and set `"marker": "/bots/<id>.png"` in both teams.json copies.

## 6. Videos (incremental — do NOT re-run the full collectors)

`collect_videos.py`/`collect_match_videos.py` rebuild ALL bots/pairs; for one
bot, import their helpers instead and merge:

```python
import sys; sys.path.insert(0, 'pipeline')
from collect_videos import seed_search, pick_best      # bot highlights
from collect_match_videos import pick_match             # one video per pair
# session: requests.Session() with browser UA + cookie CONSENT=YES+cb on .youtube.com
# highlights: pick_best(seed_search(s, f"BattleBots {bot} full fight"), bot, 3)
# per pair:  pick_match(seed_search(s, f"BattleBots {a} vs {b}"), a, b); sleep ~1.2s between
```

Merge results into all four files (indent=2):
- `videos.json` → `doc["videos"][id] = highlights`
- `match_videos.json` → key `"a|b"` with ids sorted (`"|".join(sorted([a, b]))`)

Misses are normal — the pickers reject junk (LEGO, low views); leave gaps.

## 7. Verify locally (headless)

```bash
cd web && npm run dev -- --port 5199 &
```

Drive with puppeteer-core + `/usr/bin/google-chrome`
(`--no-sandbox --use-angle=swiftshader`), and check:

- search finds the bot → panel shows photo/flag/weapon/record; header count +1
- pin on the globe at the right city, arcs fan out to its opponents
- fight mode via search `"<bot> vs <opponent>"` shows the h2h and methods

Note: the panel record counts only fights in fights.json, so it can be lower
than the wiki total (unmapped opponents excluded) — that's correct; the label
says "vs bots on the globe". globe.gl gotcha for scripted clicks: hover the
target, wait ~400ms, then click without moving (clicks dispatch off the last
hover raycast).

## 8. Ship

```bash
git add data web/public
git commit  # message: what was added + sources; Co-Authored-By trailer
git push origin main   # deploys battlebotsglobe.com
```

`git diff --stat` before committing: expect only tens of changed lines per
JSON file. Thousands = you reordered or reformatted — fix before shipping
(the only acceptable noise is `\uXXXX` escapes becoming literal characters).
Kill the dev server. Do not touch the `mobile-view` branch.
