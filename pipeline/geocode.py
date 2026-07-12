"""Geocode team hometowns and emit the app's teams.json.

Reads data/raw/teams_enriched.json (falling back to teams_seed.json),
geocodes each hometown with Nominatim
(1 req/s, results cached in data/raw/geocode_cache.json), and writes:
  - data/teams.json                 (canonical)
  - web/public/data/teams.json     (served by the app)

Usage:
    python pipeline/geocode.py
"""

from __future__ import annotations

import datetime as dt
import json
import pathlib
import re
import sys
import time

import requests

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENRICHED = ROOT / "data" / "raw" / "teams_enriched.json"
SEED = ENRICHED if ENRICHED.exists() else ROOT / "data" / "raw" / "teams_seed.json"
CACHE = ROOT / "data" / "raw" / "geocode_cache.json"
OUTPUTS = [ROOT / "data" / "teams.json", ROOT / "web" / "public" / "data" / "teams.json"]

NOMINATIM = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "BattleBotsGlobe/0.1 (battlebotsdev competition project)"


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def load_cache() -> dict:
    if CACHE.exists():
        return json.loads(CACHE.read_text())
    return {}


def geocode(query: str, cache: dict) -> tuple[float, float] | None:
    if query in cache:
        hit = cache[query]
        return (hit["lat"], hit["lng"]) if hit else None

    resp = requests.get(
        NOMINATIM,
        params={"q": query, "format": "json", "limit": 1},
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    time.sleep(1.1)  # Nominatim usage policy: max 1 req/s
    resp.raise_for_status()
    results = resp.json()
    if not results:
        cache[query] = None
        return None
    lat, lng = float(results[0]["lat"]), float(results[0]["lon"])
    cache[query] = {"lat": lat, "lng": lng}
    return lat, lng


def main() -> int:
    if not SEED.exists():
        print(f"seed file missing: {SEED}", file=sys.stderr)
        return 1

    seed = json.loads(SEED.read_text())
    cache = load_cache()
    teams_out, skipped = [], []
    seen_ids: set[str] = set()

    for team in seed["teams"]:
        place_parts = [team.get("city"), team.get("region"), team.get("country")]
        query = ", ".join(p for p in place_parts if p)
        if not query:
            skipped.append((team["bot"], "no hometown"))
            continue

        coords = geocode(query, cache)
        if coords is None:
            skipped.append((team["bot"], f"geocode miss: {query}"))
            continue

        team_id = slugify(team["bot"])
        while team_id in seen_ids:
            team_id += "-x"
        seen_ids.add(team_id)

        teams_out.append(
            {
                "id": team_id,
                "bot": team["bot"],
                "team": team.get("team"),
                "city": team.get("city"),
                "region": team.get("region"),
                "country": team.get("country"),
                "lat": coords[0],
                "lng": coords[1],
                "weapon": team.get("weapon"),
                "seasons": team.get("seasons", []),
                "active": bool(team.get("active")),
                "builder": team.get("builder"),
                "photo": team.get("photo"),
            }
        )

    CACHE.write_text(json.dumps(cache, indent=2))

    out_doc = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": f"pipeline/geocode.py <- {SEED.name} (sources: {', '.join(seed.get('sources', []))[:400]})",
        "teams": teams_out,
    }
    for path in OUTPUTS:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(out_doc, indent=2))
        print(f"wrote {len(teams_out)} teams -> {path.relative_to(ROOT)}")

    if skipped:
        print(f"\nskipped {len(skipped)}:")
        for bot, reason in skipped:
            print(f"  - {bot}: {reason}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
