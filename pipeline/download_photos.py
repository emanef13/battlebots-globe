"""Download team photos locally and point teams.json at them.

Reads data/teams.json (photo = external URL), downloads each image into
web/public/photos/<team-id>.<ext>, and rewrites the photo field to the local
path (/photos/<file>) in both teams.json outputs. Skips files already
downloaded, so re-runs are cheap.

Usage:
    python pipeline/download_photos.py
"""

from __future__ import annotations

import json
import pathlib
import sys

import requests

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEAMS = [ROOT / "data" / "teams.json", ROOT / "web" / "public" / "data" / "teams.json"]
PHOTOS_DIR = ROOT / "web" / "public" / "photos"

USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


def ext_for(url: str, content_type: str) -> str:
    path = url.split("?", 1)[0].lower()
    for known in (".jpg", ".jpeg", ".png", ".webp"):
        if path.endswith(known):
            return ".jpg" if known == ".jpeg" else known
    if "png" in content_type:
        return ".png"
    if "webp" in content_type:
        return ".webp"
    return ".jpg"


def main() -> int:
    doc = json.loads(TEAMS[0].read_text())
    PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT

    downloaded, cached, failed = 0, 0, []
    for team in doc["teams"]:
        url = team.get("photo")
        if not url or not url.startswith("http"):
            continue

        existing = list(PHOTOS_DIR.glob(f"{team['id']}.*"))
        if existing:
            team["photo"] = f"/photos/{existing[0].name}"
            cached += 1
            continue

        try:
            resp = session.get(url, timeout=60)
            resp.raise_for_status()
        except Exception as exc:  # noqa: BLE001 — tolerate individual photo failures
            failed.append((team["bot"], str(exc)[:120]))
            team["photo"] = None
            continue

        filename = f"{team['id']}{ext_for(url, resp.headers.get('content-type', ''))}"
        (PHOTOS_DIR / filename).write_bytes(resp.content)
        team["photo"] = f"/photos/{filename}"
        downloaded += 1

    for path in TEAMS:
        path.write_text(json.dumps(doc, indent=2))

    print(f"downloaded {downloaded}, reused {cached}, failed {len(failed)}")
    for bot, err in failed:
        print(f"  FAILED {bot}: {err}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
