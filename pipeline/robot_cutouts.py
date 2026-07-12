"""Extract the robot alone from each team photo and emit globe marker sprites.

Method, per team:
1. photo_source == battlebots.com (team photo containing people + robot):
   - u2net foreground alpha  -> everything (people + robot)
   - u2net_human_seg alpha   -> the people, dilated a little
   - robot mask = foreground minus humans -> largest bottom-center component
2. photo_source == fandom (image is already the robot): plain rembg cutout.
3. Guard: if the extracted component is tiny (<2% of the image), fall back to
   the wiki robot image (data/raw/robot_imgs/), else to an unmodified rembg
   cutout of the team photo.

Output: web/public/bots/<id>.png (transparent, max side 256) — same paths the
app already uses as markers. A report of fallbacks is printed at the end.

Usage:
    .venv/bin/python pipeline/robot_cutouts.py [--only id1,id2] [--force]
"""

from __future__ import annotations

import argparse
import io
import json
import pathlib
import sys

import numpy as np
from PIL import Image
from rembg import new_session, remove
from scipy import ndimage

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEAMS = ROOT / "data" / "teams.json"
ENRICHED = ROOT / "data" / "raw" / "teams_enriched.json"
PHOTOS = ROOT / "web" / "public" / "photos"
WIKI_IMGS = ROOT / "data" / "raw" / "robot_imgs"
OUT_DIR = ROOT / "web" / "public" / "bots"

MAX_SIDE = 256
MIN_AREA_FRAC = 0.02

session_fg = new_session("u2net")
session_human = new_session("u2net_human_seg")


def alpha_of(img: Image.Image, session) -> np.ndarray:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    cut = Image.open(io.BytesIO(remove(buf.getvalue(), session=session))).convert("RGBA")
    return np.array(cut.getchannel("A"))


def best_component(mask: np.ndarray) -> np.ndarray | None:
    """Largest component, biased toward the bottom-center of the frame."""
    labels, n = ndimage.label(mask)
    if n == 0:
        return None
    h, w = mask.shape
    best, best_score = None, 0.0
    for i in range(1, n + 1):
        comp = labels == i
        area = int(comp.sum())
        if area < 500:
            continue
        cy, cx = ndimage.center_of_mass(comp)
        score = area * (0.5 + 0.5 * (cy / h)) * (1.0 - 0.3 * abs(cx / w - 0.5))
        if score > best_score:
            best, best_score = comp, score
    return best


def trim_streaks(comp: np.ndarray) -> np.ndarray:
    """Cut narrow vertical remnants (occluded legs the human model missed)
    rising above the robot body: keep only rows from slightly above the
    topmost 'wide' row downward, unless that would eat the component."""
    widths = comp.sum(axis=1)
    wide_rows = np.nonzero(widths > 0.3 * widths.max())[0]
    if len(wide_rows) == 0:
        return comp
    top = max(0, int(wide_rows.min()) - 8)
    trimmed = comp.copy()
    trimmed[:top] = False
    return trimmed if trimmed.sum() > 0.6 * comp.sum() else comp


def extract_robot(img: Image.Image) -> Image.Image | None:
    """Team photo -> robot-only RGBA cutout, or None if nothing convincing."""
    rgba = np.array(img.convert("RGBA"))
    fg = alpha_of(img, session_fg)
    humans = alpha_of(img, session_human)
    humans_dilated = ndimage.binary_dilation(humans > 100, iterations=12)
    robot_mask = (fg > 100) & ~humans_dilated
    comp = best_component(robot_mask)
    if comp is None or comp.sum() < MIN_AREA_FRAC * fg.size:
        return None
    comp = trim_streaks(comp)
    alpha = np.where(comp, fg, 0).astype(np.uint8)
    rgba[..., 3] = alpha
    ys, xs = np.nonzero(alpha)
    pad = 6
    y0, y1 = max(0, ys.min() - pad), min(rgba.shape[0], ys.max() + pad)
    x0, x1 = max(0, xs.min() - pad), min(rgba.shape[1], xs.max() + pad)
    return Image.fromarray(rgba[y0:y1, x0:x1])


def plain_cutout(img: Image.Image) -> Image.Image | None:
    rgba = np.array(img.convert("RGBA"))
    fg = alpha_of(img, session_fg)
    comp = best_component(fg > 100)
    if comp is None:
        return None
    alpha = np.where(comp, fg, 0).astype(np.uint8)
    rgba[..., 3] = alpha
    ys, xs = np.nonzero(alpha)
    if len(ys) == 0:
        return None
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    return Image.fromarray(rgba[y0 : y1 + 1, x0 : x1 + 1])


def find_photo(team_id: str) -> pathlib.Path | None:
    hits = list(PHOTOS.glob(f"{team_id}.*"))
    return hits[0] if hits else None


def find_wiki_img(team_id: str) -> pathlib.Path | None:
    p = WIKI_IMGS / f"{team_id}.img"
    return p if p.exists() else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="comma-separated team ids")
    parser.add_argument("--force", action="store_true", help="regenerate existing")
    parser.add_argument(
        "--prefer-wiki",
        default="",
        help="comma-separated ids whose wiki robot image should be used first "
        "(for teams whose team-photo extraction produced people/fragments)",
    )
    args = parser.parse_args()
    wiki_first = set(args.prefer_wiki.split(",")) if args.prefer_wiki else set()

    doc = json.loads(TEAMS.read_text())
    enriched = {t["bot"]: t for t in json.loads(ENRICHED.read_text())["teams"]}
    teams = doc["teams"]
    if args.only:
        wanted = set(args.only.split(","))
        teams = [t for t in teams if t["id"] in wanted]
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    stats = {"team_photo": 0, "wiki": 0, "plain": 0, "failed": []}
    for i, t in enumerate(teams, 1):
        out = OUT_DIR / f"{t['id']}.png"
        if out.exists() and not args.force and not args.only:
            continue

        source = enriched.get(t["bot"], {}).get("photo_source")
        photo = find_photo(t["id"])
        cutout, how = None, None

        if t["id"] in wiki_first:
            wiki = find_wiki_img(t["id"])
            if wiki:
                cutout = plain_cutout(Image.open(wiki))
                how = "wiki"
        if cutout is None and source == "battlebots.com" and photo:
            cutout = extract_robot(Image.open(photo))
            how = "team_photo"
        if cutout is None:
            wiki = find_wiki_img(t["id"])
            if wiki:
                try:
                    cutout = plain_cutout(Image.open(wiki))
                    how = "wiki"
                except Exception:  # noqa: BLE001
                    cutout = None
        if cutout is None and photo:
            cutout = plain_cutout(Image.open(photo))
            how = "plain"

        if cutout is None:
            stats["failed"].append(t["bot"])
            print(f"[{i}/{len(teams)}] {t['bot']}: FAILED", file=sys.stderr)
            continue

        cutout.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
        cutout.save(out)
        stats[how] += 1
        print(f"[{i}/{len(teams)}] {t['bot']}: {how} {cutout.size}")

    print(
        f"\ndone: team_photo={stats['team_photo']} wiki={stats['wiki']} "
        f"plain={stats['plain']} failed={stats['failed']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
