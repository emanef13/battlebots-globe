"""Bake visible coastline strokes into the night texture.

Draws the Natural Earth land outlines (web/public/data/world-land.geojson)
onto the equirectangular night map so continents read clearly on the dark
globe. Two passes: a wide dim halo plus a narrow brighter core line.

Usage:
    .venv/bin/python pipeline/bake_coastlines.py
"""

from __future__ import annotations

import json
import pathlib

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
GEO = ROOT / "web" / "public" / "data" / "world-land.geojson"
SRC = ROOT / "web" / "public" / "textures" / "earth-night.jpg"
OUT = ROOT / "web" / "public" / "textures" / "earth-night-coast.jpg"

HALO = (86, 126, 168, 90)  # wide, dim
CORE = (150, 186, 220, 160)  # narrow, brighter


def rings_from_geojson(path: pathlib.Path):
    geo = json.loads(path.read_text())
    for feature in geo["features"]:
        g = feature["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            for ring in poly:
                yield ring


def project(ring, w, h):
    return [((lng + 180.0) / 360.0 * w, (90.0 - lat) / 180.0 * h) for lng, lat in ring]


def draw_ring(draw, pts, w, color, width):
    """Draw a ring, splitting segments that wrap the antimeridian."""
    run = [pts[0]]
    for prev, cur in zip(pts, pts[1:]):
        if abs(cur[0] - prev[0]) > w / 2:  # wrapped
            if len(run) > 1:
                draw.line(run, fill=color, width=width, joint="curve")
            run = [cur]
        else:
            run.append(cur)
    if len(run) > 1:
        draw.line(run, fill=color, width=width, joint="curve")


def main() -> int:
    img = Image.open(SRC).convert("RGB")
    w, h = img.size
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    rings = [project(r, w, h) for r in rings_from_geojson(GEO)]
    print(f"{len(rings)} rings on {w}x{h}")
    scale = w / 2048  # keep visual weight constant across texture sizes
    for pts in rings:
        draw_ring(draw, pts, w, HALO, max(1, round(5 * scale)))
    for pts in rings:
        draw_ring(draw, pts, w, CORE, max(1, round(2 * scale)))

    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    img.save(OUT, quality=88)
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
