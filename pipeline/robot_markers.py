"""Build circular robot-badge markers for the globe.

For every team in data/teams.json:
1. Get a robot image — from the fandom wiki API (pageimages), or reuse the
   existing photo when it already came from the wiki (photo_source=fandom).
2. Remove the background (rembg if installed, else a white-threshold fallback).
3. Composite a 256px circular badge: translucent dark disc, robot cutout,
   and a status ring (amber = Pro League, blue = historical).
4. Write web/public/bots/<id>.png and set "marker" on both teams.json copies.

Bots with no wiki image get an initials badge so every marker renders.

Usage:
    python pipeline/robot_markers.py
"""

from __future__ import annotations

import io
import json
import pathlib
import sys

import requests
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEAMS = [ROOT / "data" / "teams.json", ROOT / "web" / "public" / "data" / "teams.json"]
ENRICHED = ROOT / "data" / "raw" / "teams_enriched.json"
RAW_DIR = ROOT / "data" / "raw" / "robot_imgs"
OUT_DIR = ROOT / "web" / "public" / "bots"

WIKI_API = "https://battlebots.fandom.com/api.php"
USER_AGENT = "BattleBotsGlobe/0.1 (battlebotsdev competition project)"

SIZE = 256
RING_ACTIVE = (201, 133, 0, 255)  # #c98500
RING_HISTORICAL = (57, 135, 229, 255)  # #3987e5
DISC = (13, 18, 34, 220)

try:
    from rembg import remove as rembg_remove  # type: ignore

    HAVE_REMBG = True
except ImportError:
    HAVE_REMBG = False


def wiki_thumbnails(titles: list[str], size: int = 512) -> dict[str, str]:
    """Batch-resolve wiki page lead images. Returns {queried_title: url}."""
    out: dict[str, str] = {}
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    for i in range(0, len(titles), 50):
        batch = titles[i : i + 50]
        resp = session.get(
            WIKI_API,
            params={
                "action": "query",
                "format": "json",
                "titles": "|".join(batch),
                "prop": "pageimages",
                "piprop": "thumbnail",
                "pithumbsize": str(size),
                "redirects": "1",
            },
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()["query"]
        # map normalized/redirected titles back to what we asked for
        back = {}
        for m in data.get("normalized", []) + data.get("redirects", []):
            back[m["to"]] = back.get(m["from"], m["from"])
        for page in data.get("pages", {}).values():
            thumb = page.get("thumbnail", {}).get("source")
            if thumb:
                title = page["title"]
                out[back.get(title, title)] = thumb
    return out


def remove_background(img: Image.Image) -> Image.Image:
    if HAVE_REMBG:
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return Image.open(io.BytesIO(rembg_remove(buf.getvalue()))).convert("RGBA")
    # Fallback: treat near-white as transparent (wiki studio shots are white-bg)
    img = img.convert("RGBA")
    px = img.getdata()
    img.putdata([(r, g, b, 0) if r > 235 and g > 235 and b > 235 else (r, g, b, a) for r, g, b, a in px])
    return img


def badge(cutout: Image.Image | None, initials: str, active: bool) -> Image.Image:
    ss = SIZE * 2  # supersample for smooth edges
    im = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    ring = RING_ACTIVE if active else RING_HISTORICAL
    ring_w = 22
    draw.ellipse([0, 0, ss - 1, ss - 1], fill=ring)
    draw.ellipse([ring_w, ring_w, ss - 1 - ring_w, ss - 1 - ring_w], fill=DISC)

    inner = ss - 2 * ring_w - 24
    if cutout is not None:
        bbox = cutout.getbbox()
        if bbox:
            cutout = cutout.crop(bbox)
        cutout.thumbnail((inner, inner), Image.LANCZOS)
        im.alpha_composite(
            cutout, ((ss - cutout.width) // 2, (ss - cutout.height) // 2)
        )
    else:
        try:
            font = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", ss // 3
            )
        except OSError:
            font = ImageFont.load_default()
        draw.text((ss / 2, ss / 2), initials, font=font, fill=(255, 255, 255, 255), anchor="mm")

    # clip everything to the circle
    mask = Image.new("L", (ss, ss), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, ss - 1, ss - 1], fill=255)
    im.putalpha(Image.composite(im.getchannel("A"), Image.new("L", (ss, ss), 0), mask))
    return im.resize((SIZE, SIZE), Image.LANCZOS)


def initials(bot: str) -> str:
    words = [w for w in bot.replace("-", " ").split() if w and w[0].isalnum()]
    return (words[0][0] + (words[1][0] if len(words) > 1 else "")).upper()


def main() -> int:
    doc = json.loads(TEAMS[0].read_text())
    enriched = {t["bot"]: t for t in json.loads(ENRICHED.read_text())["teams"]} if ENRICHED.exists() else {}
    teams = doc["teams"]
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT

    if not HAVE_REMBG:
        print("WARNING: rembg not installed — using white-threshold fallback", file=sys.stderr)

    # resolve robot image URLs
    need_wiki = [t for t in teams if enriched.get(t["bot"], {}).get("photo_source") != "fandom"]
    thumbs = wiki_thumbnails([t["bot"] for t in need_wiki])
    print(f"wiki thumbnails resolved: {len(thumbs)}/{len(need_wiki)} (rest fall back)")

    made, fallback = 0, []
    for t in teams:
        out_path = OUT_DIR / f"{t['id']}.png"
        if out_path.exists():
            t["marker"] = f"/bots/{out_path.name}"
            made += 1
            continue

        src = enriched.get(t["bot"], {})
        url = src.get("photo") if src.get("photo_source") == "fandom" else thumbs.get(t["bot"])

        cutout = None
        if url:
            raw_path = RAW_DIR / f"{t['id']}.img"
            try:
                if not raw_path.exists():
                    resp = session.get(url, timeout=60)
                    resp.raise_for_status()
                    raw_path.write_bytes(resp.content)
                cutout = remove_background(Image.open(raw_path).convert("RGBA"))
            except Exception as exc:  # noqa: BLE001
                print(f"  image failed for {t['bot']}: {str(exc)[:100]}", file=sys.stderr)

        if cutout is None:
            fallback.append(t["bot"])
        badge(cutout, initials(t["bot"]), t["active"]).save(out_path)
        t["marker"] = f"/bots/{out_path.name}"
        made += 1
        if made % 20 == 0:
            print(f"  {made}/{len(teams)} badges")

    for path in TEAMS:
        path.write_text(json.dumps(doc, indent=2))

    print(f"done: {made} badges ({len(fallback)} initials-only: {fallback})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
