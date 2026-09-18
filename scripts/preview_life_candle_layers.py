#!/usr/bin/env python3
"""Composite strip of #108 real body + flame + extinguish_0..3."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "entry/src/main/resources/base/media"
OUT = Path("/opt/cursor/artifacts")
CELL_W = 148
CELL_H = 210
PLATE = (128, 160)


def load(name: str) -> Image.Image:
    return Image.open(MEDIA / name).convert("RGBA")


def cell(body: Image.Image, flame: Image.Image | None, label: str) -> Image.Image:
    plate = Image.new("RGBA", (CELL_W, CELL_H), (28, 22, 18, 255))
    stack = Image.new("RGBA", PLATE, (0, 0, 0, 0))
    b = body.resize(PLATE, Image.Resampling.NEAREST) if body.size != PLATE else body
    stack = Image.alpha_composite(stack, b)
    if flame is not None:
        f = flame.resize(PLATE, Image.Resampling.NEAREST) if flame.size != PLATE else flame
        stack = Image.alpha_composite(stack, f)
    ox = (CELL_W - PLATE[0]) // 2
    plate.paste(stack, (ox, 8), stack)
    d = ImageDraw.Draw(plate)
    d.text((6, 176), label, fill=(232, 214, 180, 255))
    return plate


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    body = load("art_life_candle_body.png")
    cols = [
        cell(body, load("art_life_candle_flame_full.png"), "full #108"),
        cell(body, load("art_life_candle_flame_hurt.png"), "hurt"),
        cell(body, load("art_life_candle_flame_dying.png"), "dying"),
        cell(body, load("art_life_candle_extinguish_0.png"), "ext0 flame"),
        cell(body, load("art_life_candle_extinguish_1.png"), "ext1 stub"),
        cell(body, load("art_life_candle_extinguish_2.png"), "ext2 ember"),
        cell(body, load("art_life_candle_extinguish_3.png"), "ext3 smoke"),
    ]
    strip = Image.new("RGBA", (CELL_W * len(cols), CELL_H), (18, 14, 12, 255))
    for i, c in enumerate(cols):
        strip.paste(c, (i * CELL_W, 0))
    dest = OUT / "r_life_108_real_media_strip.png"
    strip.save(dest)
    print(f"wrote {dest} body={body.size}")


if __name__ == "__main__":
    main()
