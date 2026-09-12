#!/usr/bin/env python3
"""14b layered life-candle slots: body + flame_* + extinguish_0/1/2.

Old art_life_candle_full/_hurt/_dying stay as fallback.
Column (body) must read taller than the flame crown (R-LIFE-2).
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from gen_life_candle_play_confirm_art import (  # noqa: E402
    ACCENT,
    BRASS,
    CANDLE,
    CORE,
    EMBER,
    MUTE,
    CANDLE_SIZE,
    clear_zero_rgb,
    luma,
    mix,
    paint_smoke,
    paint_wax_and_cup,
    rgba,
)
from gen_lobby_v2_art import corner_alpha_zero, save_png, unique_colors  # noqa: E402

MEDIA = ROOT / "entry/src/main/resources/base/media"


def empty(s: int = CANDLE_SIZE) -> Image.Image:
    return Image.new("RGBA", (s, s), (0, 0, 0, 0))


def paint_body(s: int = CANDLE_SIZE) -> Image.Image:
    """Shared wax column + cup. No flame. Taller than any flame_* crown."""
    canvas = empty(s)
    overlay = empty(s)
    paint_wax_and_cup(ImageDraw.Draw(overlay), "full", s)
    overlay = overlay.filter(ImageFilter.GaussianBlur(0.28))
    canvas = Image.alpha_composite(canvas, overlay)
    arr = np.array(canvas.convert("RGBA"))
    arr = clear_zero_rgb(arr)
    body = arr[..., 3] > 12
    rng = np.random.default_rng(14)
    noise = rng.normal(0.0, 3.2, arr[..., :3].shape)
    arr[..., :3] = np.clip(
        arr[..., :3].astype(np.float32) + noise * body[..., None], 0, 255
    ).astype(np.uint8)
    pad = 4
    arr[:pad, :pad, 3] = 0
    arr[:pad, -pad:, 3] = 0
    arr[-pad:, :pad, 3] = 0
    arr[-pad:, -pad:, 3] = 0
    arr[..., :3][arr[..., 3] == 0] = 0
    return Image.fromarray(arr, "RGBA")


def paint_flame_only(kind: str, s: int = CANDLE_SIZE) -> Image.Image:
    """Flame / ember / smoke in the upper plate. No wax."""
    canvas = empty(s)
    d = ImageDraw.Draw(canvas)
    cx = s // 2
    if kind == "full":
        # Short crown: ≤40% of plate, sits on the wick (~y=0.52).
        d.ellipse((cx - 16, int(s * 0.28), cx + 16, int(s * 0.56)), fill=rgba(mix(CANDLE, ACCENT, 0.18), 48))
        d.polygon(
            [(cx - 11, int(s * 0.54)), (cx + 11, int(s * 0.54)), (cx + 2, int(s * 0.30)), (cx - 2, int(s * 0.30))],
            fill=rgba(CANDLE, 240),
        )
        d.ellipse((cx - 12, int(s * 0.42), cx + 12, int(s * 0.58)), fill=rgba(CANDLE, 245))
        d.ellipse((cx - 7, int(s * 0.40), cx + 7, int(s * 0.54)), fill=rgba(ACCENT, 230))
        d.ellipse((cx - 4, int(s * 0.44), cx + 4, int(s * 0.52)), fill=rgba(CORE, 250))
    elif kind == "hurt":
        d.ellipse((cx - 11, int(s * 0.40), cx + 10, int(s * 0.56)), fill=rgba(mix(CANDLE, MUTE, 0.28), 44))
        d.polygon(
            [(cx - 8, int(s * 0.54)), (cx + 7, int(s * 0.53)), (cx - 2, int(s * 0.40))],
            fill=rgba(mix(CANDLE, MUTE, 0.16), 230),
        )
        d.ellipse((cx - 8, int(s * 0.46), cx + 7, int(s * 0.56)), fill=rgba(mix(CANDLE, BRASS, 0.28), 235))
        d.ellipse((cx - 3, int(s * 0.48), cx + 3, int(s * 0.54)), fill=rgba(mix(CORE, CANDLE, 0.40), 230))
    elif kind == "dying":
        paint_smoke(d, s)
        ex, ey = cx, int(s * 0.52)
        d.ellipse((ex - 7, ey - 5, ex + 7, ey + 5), fill=rgba(mix(EMBER, CANDLE, 0.15), 220))
        d.ellipse((ex - 3, ey - 2, ex + 3, ey + 2), fill=rgba(CANDLE, 210))
    elif kind == "ext0":
        # 焰收 / 摇 — leaned, shorter than full.
        d.polygon(
            [(cx - 6, int(s * 0.54)), (cx + 10, int(s * 0.50)), (cx + 4, int(s * 0.36)), (cx - 4, int(s * 0.42))],
            fill=rgba(mix(CANDLE, MUTE, 0.10), 230),
        )
        d.ellipse((cx - 7, int(s * 0.46), cx + 8, int(s * 0.56)), fill=rgba(mix(CANDLE, ACCENT, 0.12), 220))
        d.ellipse((cx - 3, int(s * 0.48), cx + 3, int(s * 0.54)), fill=rgba(CORE, 210))
    elif kind == "ext1":
        ex, ey = cx, int(s * 0.52)
        d.ellipse((ex - 6, ey - 4, ex + 6, ey + 4), fill=rgba(mix(EMBER, CANDLE, 0.20), 230))
        d.ellipse((ex - 2, ey - 2, ex + 2, ey + 2), fill=rgba(CORE, 200))
    else:
        # ext2: smoke / empty wick — no teardrop.
        paint_smoke(d, s)
    canvas = canvas.filter(ImageFilter.GaussianBlur(0.45))
    arr = np.array(canvas.convert("RGBA"))
    arr = clear_zero_rgb(arr)
    return Image.fromarray(arr, "RGBA")


def opaque_bbox(im: Image.Image) -> tuple[int, int, int, int]:
    a = np.array(im.convert("RGBA"))[..., 3]
    ys, xs = np.where(a > 12)
    if xs.size == 0:
        return (0, 0, 0, 0)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def flame_bbox(im: Image.Image) -> tuple[int, int, int, int]:
    arr = np.array(im.convert("RGBA"))
    rgb, a = arr[..., :3].astype(np.float32), arr[..., 3]
    L = luma(rgb)
    warm = rgb[..., 0] - rgb[..., 2]
    fire = (a > 40) & (warm > 12) & (L > 90)
    ys, xs = np.where(fire)
    if xs.size == 0:
        return opaque_bbox(im)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def h_of(box: tuple[int, int, int, int]) -> int:
    return max(0, box[3] - box[1])


def assert_body_taller(body: Path, flame: Path) -> None:
    bh = h_of(opaque_bbox(Image.open(body).convert("RGBA")))
    fh = h_of(flame_bbox(Image.open(flame).convert("RGBA")))
    if bh < 1 or fh < 1:
        raise SystemExit(f"empty layer body={bh} flame={fh}")
    if bh < fh * 1.2:
        raise SystemExit(f"R-LIFE-2 fail: body {bh}px < flame {fh}px × 1.2")
    plate = CANDLE_SIZE
    if fh > plate * 0.40 + 1:
        raise SystemExit(f"R-LIFE-2 fail: flame {fh}px > 40% of {plate}")


def main() -> None:
    MEDIA.mkdir(parents=True, exist_ok=True)
    jobs = {
        "art_life_candle_body.png": paint_body(),
        "art_life_candle_flame_full.png": paint_flame_only("full"),
        "art_life_candle_flame_hurt.png": paint_flame_only("hurt"),
        "art_life_candle_flame_dying.png": paint_flame_only("dying"),
        "art_life_candle_extinguish_0.png": paint_flame_only("ext0"),
        "art_life_candle_extinguish_1.png": paint_flame_only("ext1"),
        "art_life_candle_extinguish_2.png": paint_flame_only("ext2"),
    }
    paths: dict[str, Path] = {}
    for name, im in jobs.items():
        path = MEDIA / name
        save_png(im, path)
        paths[name] = path
        if im.size != (CANDLE_SIZE, CANDLE_SIZE) or im.mode != "RGBA":
            raise SystemExit(f"{name} bad size/mode {im.size} {im.mode}")
        n = unique_colors(path)
        if not corner_alpha_zero(path):
            raise SystemExit(f"{name} corners are not transparent")
        if n < 24:
            raise SystemExit(f"{name} still looks like a stub ({n} colors)")
        print(f"{name:36} {im.size[0]}x{im.size[1]} colors~{n} bytes={path.stat().st_size}")

    assert_body_taller(paths["art_life_candle_body.png"], paths["art_life_candle_flame_full.png"])
    assert_body_taller(paths["art_life_candle_body.png"], paths["art_life_candle_flame_hurt.png"])
    print("R-LIFE-2: body taller than full/hurt flame; flame ≤40% plate")
    print("layered life-candle slots written")


if __name__ == "__main__":
    main()
