#!/usr/bin/env python3
"""Minimal revolver seat-HUD icons — night tavern brass/iron, not toy cartoon.

Slots (seat HUD, not full 3D):
  art_revolver_cylinder.png       — 6-chamber top-down ~128×128 clear corners
  art_revolver_chamber_live.png   — live round marker (small)
  art_revolver_chamber_spent.png  — spent/empty marker (small)

No blood/gore. Zero .ets. Zero audio.

Tokens: docs/04-设计/夜半酒馆-风格板.md
Slots:  docs/04-设计/左轮与你上家键-资产交件.md
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from gen_lobby_v2_art import (  # noqa: E402
    BRASS,
    CANDLE,
    PAPER,
    SHADOW,
    corner_alpha_zero,
    mix,
    rgba,
    save_png,
    unique_colors,
)

MEDIA = ROOT / "entry/src/main/resources/base/media"

CYL_SIZE = 128
MARK_SIZE = 48

IRON = (0x4A, 0x52, 0x58)
IRON_DK = (0x2A, 0x30, 0x36)
BRASS_DK = (0x8A, 0x6E, 0x3E)
STEEL = (0x6A, 0x8A, 0x96)


def clear_zero_rgb(arr: np.ndarray) -> np.ndarray:
    empty = arr[..., 3] == 0
    arr[..., :3][empty] = 0
    return arr


def paint_cylinder(size: int = CYL_SIZE) -> Image.Image:
    s = size
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    cx, cy = s // 2, s // 2
    outer_r = int(s * 0.46)
    inner_r = int(s * 0.14)
    chamber_r = int(s * 0.10)
    ring_r = int(s * 0.30)

    d.ellipse((cx - outer_r + 2, cy - outer_r + 4, cx + outer_r + 2, cy + outer_r + 4), fill=rgba(SHADOW, 90))
    d.ellipse((cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r), fill=rgba(mix(BRASS, CANDLE, 0.25), 252))
    d.ellipse((cx - outer_r + 4, cy - outer_r + 4, cx + outer_r - 4, cy + outer_r - 4), fill=rgba(mix(IRON, SHADOW, 0.15), 252))
    d.ellipse((cx - ring_r - 8, cy - ring_r - 8, cx + ring_r + 8, cy + ring_r + 8), outline=rgba(mix(BRASS, BRASS_DK, 0.4), 220), width=3)

    for i in range(6):
        ang = math.radians(-90 + i * 60)
        hx = cx + int(math.cos(ang) * ring_r)
        hy = cy + int(math.sin(ang) * ring_r)
        d.ellipse((hx - chamber_r, hy - chamber_r, hx + chamber_r, hy + chamber_r), fill=rgba(IRON_DK, 255))
        d.ellipse((hx - chamber_r + 2, hy - chamber_r + 2, hx + chamber_r - 2, hy + chamber_r - 2), outline=rgba(mix(BRASS, IRON, 0.35), 180), width=2)
        d.arc((hx - chamber_r + 1, hy - chamber_r + 1, hx + chamber_r - 1, hy + chamber_r - 1), 200, 340, fill=rgba(mix(CANDLE, BRASS, 0.3), 140), width=1)

    d.ellipse((cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r), fill=rgba(mix(BRASS, CANDLE, 0.15), 252))
    d.ellipse((cx - inner_r + 3, cy - inner_r + 3, cx + inner_r - 3, cy + inner_r - 3), fill=rgba(IRON_DK, 255))
    d.ellipse((cx - 3, cy - 3, cx + 3, cy + 3), fill=rgba(mix(BRASS, PAPER, 0.2), 230))
    d.arc((cx - outer_r + 1, cy - outer_r + 1, cx + outer_r - 1, cy + outer_r - 1), 210, 330, fill=rgba(mix(CANDLE, PAPER, 0.2), 160), width=2)

    canvas = canvas.filter(ImageFilter.GaussianBlur(0.35))
    sharp = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sharp)
    for i in range(6):
        ang = math.radians(-90 + i * 60)
        hx = cx + int(math.cos(ang) * ring_r)
        hy = cy + int(math.sin(ang) * ring_r)
        sd.ellipse((hx - chamber_r + 3, hy - chamber_r + 3, hx + chamber_r - 3, hy + chamber_r - 3), fill=rgba(IRON_DK, 200))
    canvas = Image.alpha_composite(canvas, sharp)

    arr = np.array(canvas.convert("RGBA"))
    rng = np.random.default_rng(164)
    body = arr[..., 3] > 12
    noise = rng.normal(0.0, 2.4, arr[..., :3].shape)
    arr[..., :3] = np.clip(arr[..., :3].astype(np.float32) + noise * body[..., None], 0, 255).astype(np.uint8)
    pad = 4
    arr[:pad, :pad, 3] = 0
    arr[:pad, -pad:, 3] = 0
    arr[-pad:, :pad, 3] = 0
    arr[-pad:, -pad:, 3] = 0
    return Image.fromarray(clear_zero_rgb(arr), "RGBA")


def paint_chamber_live(size: int = MARK_SIZE) -> Image.Image:
    s = size
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    cx, cy = s // 2, s // 2
    r = int(s * 0.36)
    d.ellipse((cx - r + 1, cy - r + 2, cx + r + 1, cy + r + 2), fill=rgba(SHADOW, 70))
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=rgba(mix(BRASS, CANDLE, 0.20), 252))
    # Radial brass rings for chroma richness (not flat stub)
    for i, t in enumerate((0.12, 0.28, 0.45, 0.62, 0.78)):
        rr = max(3, int(r * (1.0 - t * 0.55)))
        col = mix(mix(BRASS, CANDLE, 0.15 + 0.12 * i), BRASS_DK, 0.18 * (i % 3))
        d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=rgba(col, 200 - 18 * i), width=2)
    d.ellipse((cx - r + 3, cy - r + 3, cx + r - 3, cy + r - 3), fill=rgba(mix(BRASS, BRASS_DK, 0.35), 220))
    d.ellipse((cx - 7, cy - 7, cx + 7, cy + 7), fill=rgba(mix(IRON, SHADOW, 0.15), 245))
    d.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=rgba(mix(BRASS, CANDLE, 0.25), 240))
    d.ellipse((cx - 2, cy - 2, cx + 2, cy + 2), fill=rgba(mix(CANDLE, PAPER, 0.20), 210))
    d.arc((cx - r, cy - r, cx + r, cy + r), 200, 340, fill=rgba(CANDLE, 190), width=2)
    d.arc((cx - r + 2, cy - r + 2, cx + r - 2, cy + r - 2), 20, 140, fill=rgba(mix(IRON, SHADOW, 0.3), 120), width=1)
    canvas = canvas.filter(ImageFilter.GaussianBlur(0.25))
    arr = np.array(canvas.convert("RGBA"))
    rng = np.random.default_rng(167)
    body = arr[..., 3] > 12
    noise = rng.normal(0.0, 3.2, arr[..., :3].shape)
    # Soft radial highlight
    yy, xx = np.mgrid[0:s, 0:s]
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy - 2) ** 2) / max(r, 1)
    lift = np.clip(1.0 - dist, 0, 1)[..., None] * np.array([18.0, 12.0, 4.0])
    rgb = arr[..., :3].astype(np.float32) + noise * body[..., None] + lift * body[..., None]
    arr[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    pad = 2
    arr[:pad, :pad, 3] = 0
    arr[:pad, -pad:, 3] = 0
    arr[-pad:, :pad, 3] = 0
    arr[-pad:, -pad:, 3] = 0
    return Image.fromarray(clear_zero_rgb(arr), "RGBA")


def paint_chamber_spent(size: int = MARK_SIZE) -> Image.Image:
    s = size
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    cx, cy = s // 2, s // 2
    r = int(s * 0.36)
    hr = int(s * 0.16)
    d.ellipse((cx - r + 1, cy - r + 2, cx + r + 1, cy + r + 2), fill=rgba(SHADOW, 50))
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=rgba(mix(STEEL, IRON, 0.45), 230))
    for i, t in enumerate((0.15, 0.35, 0.55, 0.75)):
        rr = max(4, int(r * (1.0 - t * 0.5)))
        col = mix(mix(STEEL, IRON, 0.2 * i), IRON_DK, 0.25)
        d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=rgba(col, 180 - 20 * i), width=2)
    d.ellipse((cx - r + 4, cy - r + 4, cx + r - 4, cy + r - 4), fill=rgba(IRON_DK, 235))
    arr = np.array(canvas.convert("RGBA"))
    yy, xx = np.mgrid[0:s, 0:s]
    hole = (xx - cx) ** 2 + (yy - cy) ** 2 <= hr ** 2
    arr[hole, 3] = 0
    arr[hole, :3] = 0
    overlay = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse((cx - r, cy - r, cx + r, cy + r), outline=rgba(mix(STEEL, PAPER, 0.2), 200), width=3)
    od.arc((cx - r, cy - r, cx + r, cy + r), 30, 150, fill=rgba(mix(STEEL, PAPER, 0.15), 130), width=2)
    od.arc((cx - r + 1, cy - r + 1, cx + r - 1, cy + r - 1), 200, 320, fill=rgba(mix(IRON, SHADOW, 0.2), 110), width=1)
    canvas = Image.alpha_composite(Image.fromarray(clear_zero_rgb(arr), "RGBA"), overlay)
    arr = np.array(canvas.convert("RGBA"))
    arr[hole, 3] = 0
    arr[hole, :3] = 0
    rng = np.random.default_rng(168)
    body = arr[..., 3] > 12
    noise = rng.normal(0.0, 2.8, arr[..., :3].shape)
    arr[..., :3] = np.clip(arr[..., :3].astype(np.float32) + noise * body[..., None], 0, 255).astype(np.uint8)
    pad = 2
    arr[:pad, :pad, 3] = 0
    arr[:pad, -pad:, 3] = 0
    arr[-pad:, :pad, 3] = 0
    arr[-pad:, -pad:, 3] = 0
    if (arr[..., 3] > 40).sum() < 80:
        raise SystemExit("spent marker has almost no body")
    return Image.fromarray(clear_zero_rgb(arr), "RGBA")


def main() -> None:
    MEDIA.mkdir(parents=True, exist_ok=True)
    jobs = [
        (MEDIA / "art_revolver_cylinder.png", paint_cylinder(), (CYL_SIZE, CYL_SIZE), 60),
        (MEDIA / "art_revolver_chamber_live.png", paint_chamber_live(), (MARK_SIZE, MARK_SIZE), 30),
        (MEDIA / "art_revolver_chamber_spent.png", paint_chamber_spent(), (MARK_SIZE, MARK_SIZE), 20),
    ]
    for path, im, size, min_colors in jobs:
        save_png(im, path)
        got = Image.open(path)
        if got.size != size:
            raise SystemExit(f"{path.name} size {got.size} != {size}")
        if got.mode != "RGBA":
            raise SystemExit(f"{path.name} mode {got.mode} != RGBA")
        if not corner_alpha_zero(path):
            raise SystemExit(f"{path.name} corners are not transparent")
        n = unique_colors(path)
        if n < min_colors:
            raise SystemExit(f"{path.name} still looks like a stub ({n} colors)")
        if path.stat().st_size < 800:
            raise SystemExit(f"{path.name} is still a tiny stub ({path.stat().st_size} bytes)")
        print(f"{path.name:36} {got.size[0]}x{got.size[1]} colors~{n} bytes={path.stat().st_size} corners=clear")
    print("revolver HUD icons written (brass/iron; no gore)")


if __name__ == "__main__":
    main()
