#!/usr/bin/env python3
"""Lobby v3 dealer idle states + FX plates.

Pose frames are derived from the shipped develop idle bust
(`art_dealer_bust_idle.png`) — same character pixels, pose deltas only.
Do not regenerate a new dealer. Candle / dust are overlay plates.

Sizes: docs/04-设计/04-开场声场与大厅氛围-v3.md §3.8.1
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter, map_coordinates, rotate

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "entry/src/main/resources/base/media"
CANDLE_SRC = Path("/opt/cursor/artifacts/assets/art_fx_candle_src.png")
DUST_SRC = Path("/opt/cursor/artifacts/assets/art_fx_dust_src.png")

CANDLE = (0xE8, 0xB8, 0x6D)
BRASS = (0xC4, 0xA4, 0x6A)
PAPER = (0xF3, 0xE6, 0xC8)
ACCENT = (0xF0, 0xC1, 0x4B)
WINE = (0x6B, 0x12, 0x18)
SHADOW = (0x0E, 0x1A, 0x22)

# Eye slits on the shipped 324×432 idle (gold mask). Viewer's-left eye is the readable one.
EYES = ((144, 150, 15, 8), (186, 162, 12, 7))
HEAD_PIVOT = (162.0, 148.0)


def clamp8(v: float) -> int:
    return int(max(0, min(255, round(v))))


def luma(rgb: np.ndarray) -> np.ndarray:
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def load_idle() -> Image.Image:
    path = MEDIA / "art_dealer_bust_idle.png"
    im = Image.open(path).convert("RGBA")
    if im.size != (324, 432):
        raise SystemExit(f"idle bust is {im.size}, expected 324x432")
    return im


def clear_zero_rgb(arr: np.ndarray) -> np.ndarray:
    empty = arr[..., 3] == 0
    arr[..., :3][empty] = 0
    return arr


def clear_corners(im: Image.Image, pad: int = 8) -> Image.Image:
    arr = np.array(im.convert("RGBA"))
    arr[:pad, :pad, 3] = 0
    arr[:pad, -pad:, 3] = 0
    arr[-pad:, :pad, 3] = 0
    arr[-pad:, -pad:, 3] = 0
    return Image.fromarray(clear_zero_rgb(arr), "RGBA")


def save_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    arr = clear_zero_rgb(np.array(im.convert("RGBA")))
    Image.fromarray(arr, "RGBA").save(path, "PNG", optimize=True)


def warp(arr: np.ndarray, map_x: np.ndarray, map_y: np.ndarray) -> np.ndarray:
    out = np.zeros_like(arr)
    for c in range(4):
        out[..., c] = map_coordinates(arr[..., c].astype(np.float32), [map_y, map_x], order=1, mode="constant", cval=0.0)
    return np.clip(out, 0, 255).astype(np.uint8)


def make_blink(idle: Image.Image) -> Image.Image:
    """Close mask eye-slits. Head / cards / coat stay put."""
    im = idle.copy()
    arr = np.array(im)
    overlay = Image.new("RGBA", im.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for cx, cy, rx, ry in EYES:
        # Sample nearby mask gold so the lid belongs to this bust.
        x0, x1 = max(0, cx - 16), min(im.size[0], cx + 16)
        y0, y1 = max(0, cy - 10), min(im.size[1], cy + 10)
        patch = arr[y0:y1, x0:x1]
        gold = patch[patch[..., 3] > 80]
        if len(gold):
            base = tuple(int(v) for v in np.median(gold[:, :3], axis=0))
        else:
            base = BRASS
        lid = tuple(clamp8(c * 0.42) for c in base)
        crease = tuple(clamp8(c * 0.22) for c in base)
        highlight = tuple(clamp8(c * 0.70 + p * 0.18) for c, p in zip(base, PAPER))
        # Closed slit: upper lid drops, lower lid meets — head stays put.
        od.ellipse((cx - rx, cy - ry, cx + rx, cy + ry + 1), fill=(*lid, 245))
        od.ellipse((cx - rx + 2, cy - 2, cx + rx - 2, cy + 3), fill=(*crease, 250))
        od.line((cx - rx + 2, cy + 1, cx + rx - 2, cy + 1), fill=(*crease, 255), width=2)
        od.arc((cx - rx + 1, cy - ry + 1, cx + rx - 1, cy + 2), 200, 340, fill=(*highlight, 140), width=1)
    overlay = overlay.filter(ImageFilter.GaussianBlur(0.55))
    return Image.alpha_composite(im, overlay)


def make_nod(idle: Image.Image) -> Image.Image:
    """Chin dips ~4vp. Body / cards stay."""
    arr = np.array(idle)
    h, w = arr.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    # 4vp @3x ≈ 12px; keep under the 4vp bust-box cap.
    fall = np.clip(1.0 - (yy - 36.0) / 210.0, 0.0, 1.0)
    fall = np.power(fall, 1.35)
    map_y = yy - 12.0 * fall
    # Tiny inward squash so the nod reads as a jaw drop, not a slide.
    map_x = xx + (xx - HEAD_PIVOT[0]) * (-0.012) * fall
    out = warp(arr, map_x, map_y)
    return Image.fromarray(clear_zero_rgb(out), "RGBA")


def rotate_head(idle: Image.Image, degrees: float) -> Image.Image:
    arr = np.array(idle)
    h, w = arr.shape[:2]
    rot = rotate(arr, degrees, reshape=False, order=1, mode="constant", cval=0)
    rot = np.clip(rot, 0, 255).astype(np.uint8)
    yy = np.arange(h, dtype=np.float32)[:, None]
    # Blend rotated head onto original shoulders.
    t = np.clip((210.0 - yy) / 36.0, 0.0, 1.0)
    t = np.repeat(t, w, axis=1)[..., None]
    mixed = rot.astype(np.float32) * t + arr.astype(np.float32) * (1.0 - t)
    return Image.fromarray(clear_zero_rgb(np.clip(mixed, 0, 255).astype(np.uint8)), "RGBA")


def make_mask(idle: Image.Image) -> Image.Image:
    return rotate_head(idle, 3.2)


def paint_cup(im: Image.Image) -> Image.Image:
    """Brass goblet at chin height — painted on this same bust, not a new figure."""
    overlay = Image.new("RGBA", im.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    # Raised to jaw / chin on the viewer's right — same bust, new prop.
    cx, cy = 222, 196
    dark_brass = tuple(clamp8(c * 0.55) for c in BRASS)
    lit_brass = tuple(clamp8(c * 0.72 + p * 0.28) for c, p in zip(BRASS, CANDLE))
    # Contact shadow
    od.ellipse((cx - 22, cy + 38, cx + 26, cy + 56), fill=(*SHADOW, 110))
    # Gloved fingers on the stem (this bust already wears black gloves).
    od.ellipse((cx - 16, cy + 20, cx + 18, cy + 44), fill=(18, 14, 12, 235))
    od.ellipse((cx - 14, cy + 18, cx - 2, cy + 36), fill=(28, 22, 18, 230))
    od.ellipse((cx + 2, cy + 20, cx + 16, cy + 38), fill=(24, 18, 16, 230))
    # Stem + foot
    od.rectangle((cx - 3, cy + 8, cx + 4, cy + 34), fill=(*BRASS, 245))
    od.rectangle((cx - 2, cy + 8, cx + 2, cy + 34), fill=(*lit_brass, 180))
    od.ellipse((cx - 16, cy + 30, cx + 17, cy + 42), fill=(*BRASS, 245))
    od.ellipse((cx - 12, cy + 32, cx + 13, cy + 40), fill=(*dark_brass, 230))
    # Bowl
    od.ellipse((cx - 22, cy - 10, cx + 23, cy + 20), fill=(*BRASS, 250))
    od.polygon([(cx - 20, cy + 4), (cx + 21, cy + 4), (cx + 14, cy + 22), (cx - 13, cy + 22)], fill=(*dark_brass, 240))
    od.ellipse((cx - 18, cy - 16, cx + 19, cy + 6), fill=(*lit_brass, 250))
    # Wine
    od.ellipse((cx - 15, cy - 12, cx + 16, cy + 2), fill=(*WINE, 235))
    od.ellipse((cx - 10, cy - 12, cx + 4, cy - 5), fill=(0xC4, 0x4A, 0x4A, 100))
    # Rim + candle kiss
    od.arc((cx - 20, cy - 16, cx + 21, cy + 4), 200, 340, fill=(*CANDLE, 220), width=3)
    od.ellipse((cx - 12, cy - 8, cx - 5, cy - 1), fill=(*PAPER, 80))
    overlay = overlay.filter(ImageFilter.GaussianBlur(0.45))
    return Image.alpha_composite(im, overlay)


def make_cup(idle: Image.Image) -> Image.Image:
    tilted = rotate_head(idle, 1.6)
    return paint_cup(tilted)


def key_warm_glow(src: Path, size: tuple[int, int]) -> Image.Image:
    im = Image.open(src).convert("RGBA")
    arr = np.array(im).astype(np.float32)
    rgb, a = arr[..., :3], arr[..., 3]
    L = luma(rgb)
    C = rgb.max(axis=2) - rgb.min(axis=2)
    warm = np.clip((rgb[..., 0] - rgb[..., 2]) / 40.0, 0, 1)
    # Keep flame / motes; drop studio gray / checker / black field.
    keep = np.clip((L - 18.0) / 36.0, 0, 1) * np.clip((C + warm * 80.0) / 28.0, 0, 1)
    if a.max() > 8:
        keep = np.maximum(keep, a / 255.0 * 0.85)
    alpha = np.clip(keep * 255.0, 0, 255)
    # Soften the plate edge so it can flicker / drift.
    alpha = gaussian_filter(alpha, 0.6)
    out = np.zeros_like(arr, dtype=np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = np.clip(alpha, 0, 255).astype(np.uint8)
    empty = out[..., 3] < 6
    out[..., 3][empty] = 0
    out[..., :3][empty] = 0
    # Import-safe: plates must have true-clear corners.
    pad = 8
    out[:pad, :pad, 3] = 0
    out[:pad, -pad:, 3] = 0
    out[-pad:, :pad, 3] = 0
    out[-pad:, -pad:, 3] = 0
    out[..., :3][out[..., 3] == 0] = 0
    plate = Image.fromarray(out, "RGBA")
    if plate.size != size:
        plate = plate.resize(size, Image.Resampling.LANCZOS)
    return clear_corners(plate, pad=10)


def paint_candle(size: tuple[int, int] = (256, 256)) -> Image.Image:
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = w * 0.50, h * 0.62
    nx = (xx - cx) / (w * 0.16)
    ny = (yy - cy) / (h * 0.34)
    # Teardrop: wider at bottom, tip above.
    tip = np.clip((cy - 18 - yy) / (h * 0.42), 0, 1)
    rad = 1.05 + tip * 1.55
    d = (nx / (0.72 + tip * 0.55)) ** 2 + (ny * rad) ** 2
    core = np.clip(1.15 - d * 1.05, 0, 1)
    core = np.power(core, 1.35)
    # Slight lean.
    lean = np.exp(-(((xx - (cx + 6)) / (w * 0.08)) ** 2) - (((yy - (cy - 70)) / (h * 0.16)) ** 2))
    glow = np.clip(core + lean * 0.35, 0, 1)
    rgb = np.zeros((h, w, 3), dtype=np.float32)
    rgb += glow[..., None] * np.array(CANDLE, dtype=np.float32)
    rgb += np.power(glow, 2.2)[..., None] * np.array(PAPER, dtype=np.float32) * 0.65
    rgb += np.power(glow, 4.0)[..., None] * np.array((255, 255, 236), dtype=np.float32) * 0.55
    rgb += np.clip(glow * 0.45, 0, 1)[..., None] * np.array(ACCENT, dtype=np.float32) * 0.25
    alpha = np.clip(glow * 255.0, 0, 255)
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = alpha.astype(np.uint8)
    empty = out[..., 3] < 8
    out[..., 3][empty] = 0
    out[..., :3][empty] = 0
    pad = 6
    out[:pad, :pad, 3] = 0
    out[:pad, -pad:, 3] = 0
    out[-pad:, :pad, 3] = 0
    out[-pad:, -pad:, 3] = 0
    out[..., :3][out[..., 3] == 0] = 0
    return Image.fromarray(out, "RGBA")


def paint_dust(size: tuple[int, int] = (1080, 600)) -> Image.Image:
    w, h = size
    rng = np.random.default_rng(20260909)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    band = np.exp(-(((yy - h * 0.48) / (h * 0.22)) ** 2))
    haze = gaussian_filter(rng.normal(0.35, 0.18, (h, w)), 14.0)
    haze = np.clip(haze, 0, 1) * band
    spec = np.zeros((h, w), dtype=np.float32)
    n = 220
    xs = rng.integers(0, w, n)
    ys = rng.integers(int(h * 0.18), int(h * 0.82), n)
    amps = rng.uniform(0.25, 1.0, n)
    rads = rng.uniform(0.6, 2.4, n)
    for x, y, amp, r in zip(xs, ys, amps, rads):
        spec[y, x] = max(spec[y, x], amp)
    spec = gaussian_filter(spec, 0.55)
    glow = gaussian_filter(spec, 2.4)
    field = np.clip(haze * 0.55 + spec * 1.4 + glow * 0.8, 0, 1)
    rgb = np.zeros((h, w, 3), dtype=np.float32)
    rgb += (haze * 0.55)[..., None] * np.array(SHADOW, dtype=np.float32)
    rgb += (field)[..., None] * np.array(CANDLE, dtype=np.float32) * 0.85
    rgb += (glow)[..., None] * np.array(PAPER, dtype=np.float32) * 0.35
    alpha = np.clip(field * 140.0, 0, 160)
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = alpha.astype(np.uint8)
    empty = out[..., 3] < 4
    out[..., 3][empty] = 0
    out[..., :3][empty] = 0
    return Image.fromarray(out, "RGBA")


def unique_colors(path: Path) -> int:
    arr = np.array(Image.open(path))
    flat = arr.reshape(-1, arr.shape[-1])
    if flat.shape[0] > 400_000:
        flat = flat[::8]
    return int(np.unique(flat, axis=0).shape[0])


def corner_alpha_zero(path: Path) -> bool:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    samples = [im.getpixel((0, 0)), im.getpixel((w - 1, 0)), im.getpixel((0, h - 1)), im.getpixel((w - 1, h - 1))]
    return all(p[3] == 0 for p in samples)


def pixel_overlap(a: Path, b: Path) -> float:
    aa = np.array(Image.open(a).convert("RGBA"))
    bb = np.array(Image.open(b).convert("RGBA"))
    if aa.shape != bb.shape:
        return 0.0
    mask = (aa[..., 3] > 20) | (bb[..., 3] > 20)
    if not mask.any():
        return 0.0
    same = np.all(aa[mask] == bb[mask], axis=1).mean()
    return float(same)


def main() -> None:
    MEDIA.mkdir(parents=True, exist_ok=True)
    idle = load_idle()
    idle_path = MEDIA / "art_dealer_bust_idle.png"

    jobs = [
        ("art_dealer_idle_blink.png", make_blink(idle), (324, 432), True),
        ("art_dealer_idle_nod.png", make_nod(idle), (324, 432), True),
        ("art_dealer_idle_cup.png", make_cup(idle), (324, 432), True),
        ("art_dealer_idle_mask.png", make_mask(idle), (324, 432), True),
    ]

    if CANDLE_SRC.exists():
        candle = key_warm_glow(CANDLE_SRC, (256, 256))
    else:
        candle = paint_candle()
    jobs.append(("art_fx_candle.png", candle, (256, 256), True))

    if DUST_SRC.exists():
        dust = key_warm_glow(DUST_SRC, (1080, 600))
    else:
        dust = paint_dust()
    jobs.append(("art_fx_dust.png", dust, (1080, 600), True))

    for name, im, size, trans in jobs:
        dest = MEDIA / name
        if im.size != size:
            im = im.resize(size, Image.Resampling.LANCZOS)
        if trans:
            im = clear_corners(im, pad=6)
        save_png(im, dest)
        got = Image.open(dest)
        if got.size != size:
            raise SystemExit(f"{name} size {got.size} != {size}")
        n = unique_colors(dest)
        extra = ""
        if trans:
            if not corner_alpha_zero(dest):
                raise SystemExit(f"{name} corners are not transparent")
            extra = " corners=clear"
        print(f"{name:32} {got.size[0]}x{got.size[1]} colors~{n} mode={got.mode} bytes={dest.stat().st_size}{extra}")
        if n < 80:
            raise SystemExit(f"{name} still looks like a color-block placeholder ({n} colors)")

    for name in (
        "art_dealer_idle_blink.png",
        "art_dealer_idle_nod.png",
        "art_dealer_idle_cup.png",
        "art_dealer_idle_mask.png",
    ):
        ov = pixel_overlap(idle_path, MEDIA / name)
        print(f"  overlap vs idle  {name:28} {ov:.3f}")
        if ov < 0.55:
            raise SystemExit(f"{name} drifted off the idle bust (overlap {ov:.3f})")

    print("lobby v3 art written from art_dealer_bust_idle")


if __name__ == "__main__":
    main()
