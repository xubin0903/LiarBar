#!/usr/bin/env python3
"""Composite strip: body + flame states + extinguish_0/1/2 on one plate."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "entry/src/main/resources/base/media"
OUT = Path("/opt/cursor/artifacts")


def load(name: str) -> Image.Image:
    return Image.open(MEDIA / name).convert("RGBA")


def cell(body: Image.Image, flame: Image.Image | None, label: str) -> Image.Image:
    plate = Image.new("RGBA", (160, 180), (28, 22, 18, 255))
    stack = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    stack = Image.alpha_composite(stack, body)
    if flame is not None:
        stack = Image.alpha_composite(stack, flame)
    plate.paste(stack, (16, 12), stack)
    d = ImageDraw.Draw(plate)
    d.text((8, 150), label, fill=(232, 214, 180, 255))
    return plate


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    body = load("art_life_candle_body.png")
    cols = [
        cell(body, load("art_life_candle_flame_full.png"), "full  body>flame"),
        cell(body, load("art_life_candle_flame_hurt.png"), "hurt  loop slot"),
        cell(body, load("art_life_candle_flame_dying.png"), "dying  ember"),
        cell(body, load("art_life_candle_extinguish_0.png"), "ext_0  80ms"),
        cell(body, load("art_life_candle_extinguish_1.png"), "ext_1  80ms"),
        cell(body, load("art_life_candle_extinguish_2.png"), "ext_2  80ms"),
    ]
    strip = Image.new("RGBA", (160 * len(cols), 180), (18, 14, 12, 255))
    for i, c in enumerate(cols):
        strip.paste(c, (i * 160, 0))
    dest = OUT / "r_life_layered_candle_strip.png"
    strip.save(dest)
    print(f"wrote {dest}")


if __name__ == "__main__":
    main()
