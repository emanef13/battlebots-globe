"""Resolve a verified team page URL for every robot (fandom wiki canonical
pages) and store it as "url" in both teams.json copies.

Titles are resolved through the MediaWiki API with redirects, so each stored
link is confirmed to exist rather than guessed from the bot name.

Usage:
    .venv/bin/python pipeline/add_links.py
"""

from __future__ import annotations

import json
import pathlib
import urllib.parse

import requests

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEAMS = [ROOT / "data" / "teams.json", ROOT / "web" / "public" / "data" / "teams.json"]

WIKI_API = "https://battlebots.fandom.com/api.php"
WIKI_BASE = "https://battlebots.fandom.com/wiki/"
USER_AGENT = "BattleBotsGlobe/0.1 (battlebotsdev competition project)"

# bot name -> wiki title, where they differ
TITLE_OVERRIDES = {
    "ATOM 94": "ATOM94",
    "Nemesis": "Nemesis (2026)",
    "SMEE": "SMEEEEEEEEEEEEEEEEEE",
}


def resolve_titles(titles: list[str]) -> dict[str, str]:
    """Query title -> canonical existing title (missing pages omitted)."""
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    out: dict[str, str] = {}
    for i in range(0, len(titles), 50):
        batch = titles[i : i + 50]
        resp = session.get(
            WIKI_API,
            params={
                "action": "query",
                "format": "json",
                "titles": "|".join(batch),
                "redirects": "1",
            },
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()["query"]
        back: dict[str, str] = {}
        for m in data.get("normalized", []) + data.get("redirects", []):
            back[m["to"]] = back.get(m["from"], m["from"])
        for page in data.get("pages", {}).values():
            if "missing" in page:
                continue
            title = page["title"]
            out[back.get(title, title)] = title
    return out


def main() -> int:
    doc = json.loads(TEAMS[0].read_text())
    teams = doc["teams"]

    queries = {t["bot"]: TITLE_OVERRIDES.get(t["bot"], t["bot"]) for t in teams}
    resolved = resolve_titles(list(queries.values()))

    linked, missing = 0, []
    for t in teams:
        canonical = resolved.get(queries[t["bot"]])
        if canonical:
            t["url"] = WIKI_BASE + urllib.parse.quote(canonical.replace(" ", "_"))
            linked += 1
        else:
            t["url"] = None
            missing.append(t["bot"])

    for path in TEAMS:
        path.write_text(json.dumps(doc, indent=2))

    print(f"linked {linked}/{len(teams)}; missing: {missing}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
