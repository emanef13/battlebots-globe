"""Collect YouTube fight videos for every robot.

Two modes:
- default: Bright Data Web Scraper API (YouTube videos, discover-by-search) —
  the production path; requires BRIGHTDATA_API_TOKEN and the YouTube search
  dataset id from the control panel (set BRIGHTDATA_YT_DATASET_ID).
- --seed: direct YouTube search scrape (ytInitialData JSON), good enough for
  development while the Bright Data zone isn't configured yet.

Output (both modes): data/videos.json + web/public/data/videos.json:
    { "generated_at": ..., "videos": { "<team-id>": [
        {"id": "...", "title": "...", "channel": "...", "views": 123, "duration": "3:12"},
    ... ] } }

The app renders these as YouTube EMBEDS (no downloading/re-editing of
copyrighted footage — official fight videos already are the highlights).

Usage:
    .venv/bin/python pipeline/collect_videos.py --seed [--limit 3]
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import re
import sys
import time

import requests

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEAMS = ROOT / "data" / "teams.json"
OUTPUTS = [ROOT / "data" / "videos.json", ROOT / "web" / "public" / "data" / "videos.json"]

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


def parse_views(text: str) -> int:
    m = re.sub(r"[^\d]", "", text or "")
    return int(m) if m else 0


def seed_search(session: requests.Session, query: str) -> list[dict]:
    """Scrape YouTube search results from the embedded ytInitialData JSON."""
    resp = session.get(
        "https://www.youtube.com/results",
        params={"search_query": query},
        timeout=30,
    )
    resp.raise_for_status()
    m = re.search(r"var ytInitialData = (\{.*?\});</script>", resp.text, re.DOTALL)
    if not m:
        return []
    data = json.loads(m.group(1))

    videos = []

    def walk(node):
        if isinstance(node, dict):
            if "videoRenderer" in node:
                v = node["videoRenderer"]
                try:
                    videos.append(
                        {
                            "id": v["videoId"],
                            "title": "".join(r["text"] for r in v["title"]["runs"]),
                            "channel": v.get("ownerText", {}).get("runs", [{}])[0].get("text", ""),
                            "views": parse_views(
                                v.get("viewCountText", {}).get("simpleText", "")
                            ),
                            "duration": v.get("lengthText", {}).get("simpleText", ""),
                        }
                    )
                except (KeyError, IndexError):
                    pass
            for val in node.values():
                walk(val)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(data)
    return videos


def pick_best(videos: list[dict], bot: str, limit: int) -> list[dict]:
    """Prefer official uploads that actually name the bot, ranked by views."""
    bot_lower = bot.lower()

    def relevant(v: dict) -> bool:
        return bot_lower in v["title"].lower()

    def score(v: dict) -> float:
        s = float(v["views"])
        if v["channel"].strip().lower() == "battlebots":
            s *= 3
        return s

    pool = [v for v in videos if relevant(v)] or videos
    seen, out = set(), []
    for v in sorted(pool, key=score, reverse=True):
        if v["id"] in seen:
            continue
        seen.add(v["id"])
        out.append(v)
        if len(out) == limit:
            break
    return out


def brightdata_search(teams: list[dict], limit: int) -> dict[str, list[dict]]:
    from brightdata_client import BrightData  # noqa: PLC0415

    dataset_id = os.environ.get("BRIGHTDATA_YT_DATASET_ID")
    if not dataset_id:
        print(
            "BRIGHTDATA_YT_DATASET_ID not set (YouTube discover-by-search dataset id "
            "from the control panel). Use --seed for the dev scraper.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    client = BrightData()
    inputs = [
        {"keyword": f"BattleBots {t['bot']} full fight", "num_of_posts": limit * 3}
        for t in teams
    ]
    snapshot = client.trigger(dataset_id, inputs, type="discover_new", discover_by="keyword")
    print(f"snapshot {snapshot} triggered; polling…")
    rows = client.wait_and_download(snapshot, timeout_s=1800)
    by_keyword: dict[str, list[dict]] = {}
    for row in rows:
        kw = (row.get("discovery_input") or {}).get("keyword", "")
        by_keyword.setdefault(kw, []).append(
            {
                "id": row.get("video_id") or row.get("id", ""),
                "title": row.get("title", ""),
                "channel": row.get("youtuber") or row.get("channel_name", ""),
                "views": int(row.get("views") or 0),
                "duration": str(row.get("video_length") or ""),
            }
        )
    return {
        t["id"]: pick_best(by_keyword.get(f"BattleBots {t['bot']} full fight", []), t["bot"], limit)
        for t in teams
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", action="store_true", help="direct scrape (dev) instead of Bright Data")
    parser.add_argument("--limit", type=int, default=3, help="videos per bot")
    args = parser.parse_args()

    teams = json.loads(TEAMS.read_text())["teams"]

    if args.seed:
        session = requests.Session()
        session.headers["User-Agent"] = UA
        session.cookies.set("CONSENT", "YES+cb", domain=".youtube.com")
        result = {}
        for i, t in enumerate(teams, 1):
            try:
                found = seed_search(session, f"BattleBots {t['bot']} full fight")
                result[t["id"]] = pick_best(found, t["bot"], args.limit)
            except Exception as exc:  # noqa: BLE001
                print(f"  {t['bot']}: {str(exc)[:80]}", file=sys.stderr)
                result[t["id"]] = []
            if i % 10 == 0:
                print(f"{i}/{len(teams)}")
            time.sleep(1.0)
    else:
        result = brightdata_search(teams, args.limit)

    doc = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": "youtube-seed-scrape" if args.seed else "brightdata-youtube-discovery",
        "videos": result,
    }
    for path in OUTPUTS:
        path.write_text(json.dumps(doc, indent=2))
    covered = sum(1 for v in result.values() if v)
    print(f"done: {covered}/{len(teams)} bots have videos")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
