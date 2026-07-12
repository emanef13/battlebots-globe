"""Collect BattleBots team pages via Bright Data Web Unlocker.

Fetches the source pages (battlebots.com roster + fan-wiki competitor pages)
as LLM-ready markdown and stores them under data/raw/pages/ for parsing.

Usage:
    export BRIGHTDATA_API_TOKEN=...
    python pipeline/collect_teams.py
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

from brightdata_client import BrightData

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES_DIR = ROOT / "data" / "raw" / "pages"

# Source pages for team rosters/hometowns. Verified sources are recorded in
# data/raw/teams_seed.json ("sources") — extend this list from there.
SOURCES = [
    "https://battlebots.com/teams/",
    "https://battlebots.fandom.com/wiki/Category:Competitors",
]


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def main() -> int:
    client = BrightData()
    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    manifest = []

    for url in SOURCES:
        name = slugify(url.split("//", 1)[1])
        out = PAGES_DIR / f"{name}.md"
        print(f"fetching {url} -> {out.relative_to(ROOT)}")
        try:
            content = client.fetch(url, data_format="markdown")
        except Exception as exc:  # noqa: BLE001 — record failures per-source, keep going
            print(f"  FAILED: {exc}", file=sys.stderr)
            manifest.append({"url": url, "ok": False, "error": str(exc)})
            continue
        out.write_text(content)
        manifest.append({"url": url, "ok": True, "file": str(out.relative_to(ROOT))})

    (PAGES_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2))
    ok = sum(1 for m in manifest if m["ok"])
    print(f"done: {ok}/{len(manifest)} sources fetched")
    # TODO(next iteration): parse fetched pages into data/raw/teams_scraped.json
    # with the same shape as teams_seed.json, then run geocode.py on it.
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
