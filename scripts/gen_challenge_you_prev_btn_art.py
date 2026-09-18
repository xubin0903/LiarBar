#!/usr/bin/env python3
"""EmptySafe3 「你 / 上家」 dual buttons — colorblind-safe dual channel.

After #164 revolver lock: hand-empty ≥3 offers challenge-you vs continue-prev.
Slots sit as a pair (same 360×144 family as challenge true/false).

YOU  = warmer/closer self-point silhouette + soft inward arrow motif
PREV = cooler/angled point-back silhouette + sharper corners + back-chevron
ON   = pressed/lit of each

Shape + chroma channels differ — not hue-only twins. Zero .ets. Zero audio.

Tokens: docs/04-设计/夜半酒馆-风格板.md
Slots:  docs/04-设计/左轮与你上家键-资产交件.md
Mirror: scripts/gen_challenge_true_false_btn_art.py / gen_life_candle_play_confirm_art.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from gen_lobby_v2_art import (  # noqa: E402
    ACCENT,
    BRASS,
    CANDLE,
    FELT,
    PAPER,
    SHADOW,
    corner_alpha_zero,
    fit_chrome,
    mix,
    open_src,
    rgba,
    save_png,
    unique_colors,
)

MEDIA = ROOT / "entry/src/main/resources/base/media"

BTN_SIZE = (360, 144)

# Cool prev chrome — steel / teal-copper, not system blue.
STEEL = (0x6A, 0x8A, 0x96)
TEAL = (0x3A, 0x7A, 0x7E)
COPPER = (0xB0, 0x78, 0x58)
COOL_INK = (0x1A, 0x2E, 0x36)
WARM_INK = (0x2A, 0x1A, 0x12)


def clear_zero_rgb(arr: np.ndarray) -> np.ndarray:
    empty = arr[..., 3] == 0
    arr[..., :3][empty] = 0
    return arr


def grade_you(im: Image.Image, pressed: bool) -> Image.Image:
    """Warm self-point chrome: felt + brass / candle-gold. Rounder pill + inward arrow."""
    arr = np.array(im.convert("RGBA")).astype(np.float32)
    rgb, a = arr[..., :3], arr[..., 3]
    felt = np.array(FELT, dtype=np.float32)
    brass = np.array(BRASS, dtype=np.float32)
    candle = np.array(CANDLE, dtype=np.float32)
    accent = np.array(ACCENT, dtype=np.float32)
    if pressed:
        rgb = rgb * 0.56 + accent * 0.32 + candle * 0.12
        rgb[..., 0] = np.clip(rgb[..., 0] * 1.10, 0, 255)
        rgb[..., 2] = np.clip(rgb[..., 2] * 0.76, 0, 255)
    else:
        rgb = rgb * 0.66 + felt * 0.20 + brass * 0.14
        rgb[..., 0] = np.clip(rgb[..., 0] * 1.06, 0, 255)
        rgb[..., 2] = np.clip(rgb[..., 2] * 0.84, 0, 255)
    out = arr.copy()
    out[..., :3] = np.clip(rgb, 0, 255)
    empty = a < 6
    out[..., 3][empty] = 0
    out[..., :3][empty] = 0
    plate = Image.fromarray(out.astype(np.uint8), "RGBA")

    w, h = plate.size
    # Pill — distinctly rounder than prev (closer/warmer silhouette).
    radius = h // 2 - 2
    overlay = Image.new("RGBA", plate.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    border = ACCENT if pressed else BRASS
    inner = mix(CANDLE, PAPER, 0.22) if pressed else mix(BRASS, CANDLE, 0.48)
    od.rounded_rectangle((2, 2, w - 3, h - 3), radius=radius, outline=rgba(border, 235), width=4)
    od.rounded_rectangle((8, 8, w - 9, h - 9), radius=max(radius - 8, 12), outline=rgba(inner, 170), width=2)

    # Self-point motif (left): small figure + inward arrow toward center label area.
    fig = mix(CANDLE, PAPER, 0.30) if pressed else mix(BRASS, CANDLE, 0.30)
    cx, cy = int(w * 0.17), h // 2
    # Head
    od.ellipse((cx - 8, cy - 22, cx + 8, cy - 6), fill=rgba(fig, 200 if pressed else 165))
    # Torso (closer/warmer blob)
    od.rounded_rectangle((cx - 12, cy - 4, cx + 12, cy + 20), radius=8, fill=rgba(fig, 190 if pressed else 155))
    # Inward arrow (point toward self / center)
    arrow = mix(ACCENT, PAPER, 0.25) if pressed else mix(CANDLE, BRASS, 0.35)
    ax = cx + 28
    od.polygon(
        [(ax + 18, cy - 10), (ax, cy), (ax + 18, cy + 10), (ax + 10, cy)],
        fill=rgba(arrow, 210 if pressed else 175),
    )

    plate = Image.alpha_composite(plate, overlay)
    final = np.array(plate)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((1, 1, w - 2, h - 2), radius=radius, fill=255)
    m = np.array(mask)
    final[..., 3] = np.minimum(final[..., 3], m)
    final = clear_zero_rgb(final)
    return Image.fromarray(final, "RGBA")


def grade_prev(im: Image.Image, pressed: bool) -> Image.Image:
    """Cool point-back chrome: steel/teal + copper. Sharper angled corners + back-chevron."""
    arr = np.array(im.convert("RGBA")).astype(np.float32)
    rgb, a = arr[..., :3], arr[..., 3]
    felt = np.array(FELT, dtype=np.float32)
    steel = np.array(STEEL, dtype=np.float32)
    teal = np.array(TEAL, dtype=np.float32)
    cool_ink = np.array(COOL_INK, dtype=np.float32)
    if pressed:
        rgb = rgb * 0.40 + teal * 0.38 + steel * 0.16 + cool_ink * 0.06
        rgb[..., 0] = np.clip(rgb[..., 0] * 0.76, 0, 255)
        rgb[..., 1] = np.clip(rgb[..., 1] * 1.02, 0, 255)
        rgb[..., 2] = np.clip(rgb[..., 2] * 1.20, 0, 255)
    else:
        rgb = rgb * 0.48 + felt * 0.12 + steel * 0.24 + cool_ink * 0.12 + teal * 0.04
        rgb[..., 0] = np.clip(rgb[..., 0] * 0.80, 0, 255)
        rgb[..., 2] = np.clip(rgb[..., 2] * 1.14, 0, 255)
    out = arr.copy()
    out[..., :3] = np.clip(rgb, 0, 255)
    empty = a < 6
    out[..., 3][empty] = 0
    out[..., :3][empty] = 0
    plate = Image.fromarray(out.astype(np.uint8), "RGBA")

    w, h = plate.size
    # Sharper / angled corners — shape channel vs you's pill.
    radius = 12
    overlay = Image.new("RGBA", plate.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    border = mix(TEAL, COPPER, 0.35) if pressed else mix(STEEL, COOL_INK, 0.42)
    inner = mix(STEEL, PAPER, 0.15) if pressed else mix(STEEL, TEAL, 0.35)
    od.rounded_rectangle((2, 2, w - 3, h - 3), radius=radius, outline=rgba(border, 245), width=6)
    od.rounded_rectangle((10, 10, w - 11, h - 11), radius=max(radius - 4, 6), outline=rgba(inner, 150), width=2)
    for xy in ((6, 6), (w - 18, 6), (6, h - 18), (w - 18, h - 18)):
        od.rectangle(
            [xy, (xy[0] + 10, xy[1] + 10)],
            outline=rgba(COPPER if pressed else mix(COPPER, STEEL, 0.3), 180),
            width=2,
        )

    # Point-back motif (left): angled figure + back-chevron (cooler / away).
    fig = mix(TEAL, PAPER, 0.20) if pressed else mix(STEEL, COPPER, 0.35)
    cx, cy = int(w * 0.17), h // 2
    # Angled lean: head offset left
    od.ellipse((cx - 14, cy - 20, cx + 2, cy - 4), fill=rgba(fig, 200 if pressed else 165))
    od.polygon(
        [(cx - 16, cy - 2), (cx + 6, cy + 2), (cx + 2, cy + 22), (cx - 14, cy + 18)],
        fill=rgba(fig, 185 if pressed else 150),
    )
    # Back-chevron (point toward previous / left)
    chev = mix(STEEL, PAPER, 0.25) if pressed else mix(STEEL, TEAL, 0.40)
    ax = cx + 26
    od.polygon(
        [(ax + 4, cy - 12), (ax - 14, cy), (ax + 4, cy + 12), (ax - 2, cy)],
        fill=rgba(chev, 215 if pressed else 180),
    )

    plate = Image.alpha_composite(plate, overlay)
    final = np.array(plate)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((1, 1, w - 2, h - 2), radius=radius, fill=255)
    m = np.array(mask)
    final[..., 3] = np.minimum(final[..., 3], m)
    final = clear_zero_rgb(final)
    return Image.fromarray(final, "RGBA")


def make_btn(kind: str, pressed: bool) -> Image.Image:
    src_name = "src_btn_primary_on.png" if pressed else "src_btn_primary.png"
    chrome = fit_chrome(open_src(src_name), *BTN_SIZE)
    if kind == "you":
        return grade_you(chrome, pressed)
    if kind == "prev":
        return grade_prev(chrome, pressed)
    raise ValueError(kind)


def mean_body_rgb(path: Path) -> np.ndarray:
    arr = np.array(Image.open(path).convert("RGBA"))
    rgb, a = arr[..., :3].astype(np.float32), arr[..., 3]
    body = a > 40
    if body.sum() < 200:
        raise SystemExit(f"{path.name} has almost no body")
    return rgb[body].mean(axis=0)


def assert_not_system_gray(path: Path) -> None:
    mean = mean_body_rgb(path)
    chroma = float(mean.max() - mean.min())
    if chroma < 18 and 70 < float(mean.mean()) < 190:
        raise SystemExit(f"{path.name} reads as system gray (mean={mean})")
    if mean[2] > mean[0] + 18 and mean[2] > mean[1] + 10 and mean[0] < 90:
        raise SystemExit(f"{path.name} reads as system blue (mean={mean})")


def assert_shape_differs(you_path: Path, prev_path: Path) -> None:
    def corner_fill(path: Path) -> float:
        arr = np.array(Image.open(path).convert("RGBA"))
        patch = arr[2:18, 2:18, 3]
        return float(patch.mean())

    y = corner_fill(you_path)
    p = corner_fill(prev_path)
    if y >= p - 5:
        ya = np.array(Image.open(you_path).convert("RGBA"))[..., 3]
        pa = np.array(Image.open(prev_path).convert("RGBA"))[..., 3]
        y_top = int((ya[3, :] > 40).sum())
        p_top = int((pa[3, :] > 40).sum())
        if abs(y_top - p_top) < 8 and y >= p:
            raise SystemExit(
                f"you/prev corner masks too similar (y={y:.1f} p={p:.1f} top={y_top}/{p_top})"
            )
    ym = mean_body_rgb(you_path)
    pm = mean_body_rgb(prev_path)
    you_warm = float(ym[0] - ym[2])
    if you_warm < 12:
        raise SystemExit(f"you not warm enough (R-B={you_warm:.1f}, mean={ym})")
    if float(pm[0] - pm[2]) > you_warm - 4:
        raise SystemExit(
            f"prev warmer than you (you R-B={you_warm:.1f} prev R-B={pm[0]-pm[2]:.1f})"
        )
    print(
        f"shape/chroma: you_corner={y:.1f} prev_corner={p:.1f} "
        f"you_warm={you_warm:.1f} prev_RB={pm[0]-pm[2]:.1f}"
    )


def main() -> None:
    MEDIA.mkdir(parents=True, exist_ok=True)
    outs = {
        "you_off": MEDIA / "art_btn_challenge_you.png",
        "you_on": MEDIA / "art_btn_challenge_you_on.png",
        "prev_off": MEDIA / "art_btn_challenge_prev.png",
        "prev_on": MEDIA / "art_btn_challenge_prev_on.png",
    }
    save_png(make_btn("you", False), outs["you_off"])
    save_png(make_btn("you", True), outs["you_on"])
    save_png(make_btn("prev", False), outs["prev_off"])
    save_png(make_btn("prev", True), outs["prev_on"])

    for path in outs.values():
        im = Image.open(path)
        if im.size != BTN_SIZE:
            raise SystemExit(f"{path.name} size {im.size} != {BTN_SIZE}")
        if im.mode != "RGBA":
            raise SystemExit(f"{path.name} mode {im.mode} != RGBA")
        n = unique_colors(path)
        if not corner_alpha_zero(path):
            raise SystemExit(f"{path.name} corners are not transparent")
        if n < 80:
            raise SystemExit(f"{path.name} still looks like a stub ({n} colors)")
        if path.stat().st_size < 2_000:
            raise SystemExit(f"{path.name} is still a tiny stub ({path.stat().st_size} bytes)")
        assert_not_system_gray(path)
        print(
            f"{path.name:36} {im.size[0]}x{im.size[1]} colors~{n} "
            f"bytes={path.stat().st_size} corners=clear"
        )

    assert_shape_differs(outs["you_off"], outs["prev_off"])
    assert_shape_differs(outs["you_on"], outs["prev_on"])
    print("challenge you/prev dual-channel chrome written (not system gray/blue; shape differs)")


if __name__ == "__main__":
    main()
