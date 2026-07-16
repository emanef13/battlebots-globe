"""Validate and publish the team/owner contact links to the app.

SINGLE SOURCE OF TRUTH: data/contact_links.json — a hand-curated map of
verified links per bot, split into "team" (team/robot accounts, shown under
the team name) and "owner" (builder/owner accounts, shown next to the
builder). Every link in it was verified to belong to the team or its owner
(agent-reviewed 2026-07-16; see git history for the scraping/verification
bootstrap that produced the initial set).

This script only validates that file and writes the app copy. To add or fix
a link: edit data/contact_links.json, run this, commit both files.

Usage:
    python3 pipeline/build_contact_links.py
"""

from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "contact_links.json"
TEAMS = ROOT / "data" / "teams.json"
OUT = ROOT / "web" / "public" / "data" / "contacts.json"

# display order in the panel; the app has favicons for all but "website"
PLATFORMS = [
    "website",
    "facebook",
    "instagram",
    "twitter",
    "youtube",
    "tiktok",
    "twitch",
    "discord",
    "linktree",
    "patreon",
]
GROUPS = ("team", "owner")


def main() -> int:
    links = json.loads(SRC.read_text())["links"]
    known_ids = {t["id"] for t in json.loads(TEAMS.read_text())["teams"]}

    errors: list[str] = []
    out: dict[str, dict[str, dict[str, str]]] = {}
    for bot_id, groups in links.items():
        if bot_id not in known_ids:
            errors.append(f"unknown bot id: {bot_id}")
            continue
        entry: dict[str, dict[str, str]] = {}
        for group, plats in groups.items():
            if group not in GROUPS:
                errors.append(f"{bot_id}: unknown group '{group}' (use team/owner)")
                continue
            clean: dict[str, str] = {}
            for platform, url in plats.items():
                if platform not in PLATFORMS:
                    errors.append(f"{bot_id}: unknown platform '{platform}'")
                elif not isinstance(url, str) or not url.startswith(("http://", "https://")):
                    errors.append(f"{bot_id}: bad url for {platform}: {url!r}")
                else:
                    clean[platform] = url
            if clean:
                # canonical platform order for stable panel display
                entry[group] = {k: clean[k] for k in PLATFORMS if k in clean}
        if entry:
            out[bot_id] = entry

    if errors:
        print("validation errors:", file=sys.stderr)
        for e in errors:
            print(f"   {e}", file=sys.stderr)
        return 1

    OUT.write_text(json.dumps(
        {"note": "Generated from data/contact_links.json — edit THAT file, not this one.",
         "contacts": out},
        indent=2, ensure_ascii=False) + "\n")

    counts: dict[str, int] = {}
    for entry in out.values():
        for group in entry.values():
            for k in group:
                counts[k] = counts.get(k, 0) + 1
    print(f"published {OUT.relative_to(ROOT)}: {len(out)}/{len(known_ids)} bots")
    for k in PLATFORMS:
        if k in counts:
            print(f"   {k:10s} {counts[k]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
