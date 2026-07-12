"""Find the YouTube video for each head-to-head matchup in fights.json.

For every distinct fight pair, searches YouTube for "BattleBots <A> vs <B>"
and keeps the best hit whose title mentions BOTH bots (official channel and
view count break ties). Same seed-scrape approach as collect_videos.py; the
production path is Bright Data's YouTube discovery scraper.

Output: data/match_videos.json + web/public/data/match_videos.json:
    { "generated_at": ..., "videos": { "<a>|<b>": {"id","title","channel","views","duration"} } }

Usage:
    .venv/bin/python pipeline/collect_match_videos.py [--limit-pairs N]
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import time

import requests

from collect_videos import UA, seed_search

ROOT = pathlib.Path(__file__).resolve().parent.parent
FIGHTS = ROOT / "data" / "fights.json"
TEAMS = ROOT / "data" / "teams.json"
OUTPUTS = [
    ROOT / "data" / "match_videos.json",
    ROOT / "web" / "public" / "data" / "match_videos.json",
]


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", s.lower())


JUNK = ("lego", "hot wheels", "hexbug", "minecraft", "simulator", "roblox", "toy", "plush", "diy", "stop motion")


def pick_match(videos: list[dict], a: str, b: str) -> dict | None:
    na, nb = norm(a), norm(b)

    def relevant(v: dict) -> bool:
        t = norm(v["title"])
        raw = v["title"].lower()
        if any(j in raw for j in JUNK):
            return False
        return na in t and nb in t

    pool = [v for v in videos if relevant(v)]
    if not pool:
        return None

    def score(v: dict) -> float:
        s = float(v["views"] + 1)
        if v["channel"].strip().lower() == "battlebots":
            s *= 50
        if "battlebots" in v["title"].lower():
            s *= 2
        return s

    best = max(pool, key=score)
    # a real fight video should have some traction; junk re-uploads often don't
    return best if best["views"] >= 500 or best["channel"].strip().lower() == "battlebots" else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit-pairs", type=int, default=0, help="debug: only first N pairs")
    args = parser.parse_args()

    fights = json.loads(FIGHTS.read_text())["fights"]
    teams = {t["id"]: t["bot"] for t in json.loads(TEAMS.read_text())["teams"]}
    pairs = sorted({(f["a"], f["b"]) for f in fights})
    if args.limit_pairs:
        pairs = pairs[: args.limit_pairs]

    session = requests.Session()
    session.headers["User-Agent"] = UA
    session.cookies.set("CONSENT", "YES+cb", domain=".youtube.com")

    result: dict[str, dict] = {}
    misses = 0
    for i, (a, b) in enumerate(pairs, 1):
        bot_a, bot_b = teams[a], teams[b]
        try:
            found = seed_search(session, f"BattleBots {bot_a} vs {bot_b}")
            best = pick_match(found, bot_a, bot_b)
        except Exception as exc:  # noqa: BLE001
            print(f"  {bot_a} vs {bot_b}: {str(exc)[:80]}", file=sys.stderr)
            best = None
        if best:
            result[f"{a}|{b}"] = best
        else:
            misses += 1
        if i % 25 == 0:
            print(f"{i}/{len(pairs)} pairs ({len(result)} found)")
        time.sleep(1.0)

    doc = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": "youtube-seed-scrape per matchup",
        "videos": result,
    }
    for path in OUTPUTS:
        path.write_text(json.dumps(doc, indent=2))
    print(f"done: {len(result)}/{len(pairs)} pairs have a match video ({misses} misses)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
