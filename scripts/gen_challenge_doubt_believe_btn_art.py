#!/usr/bin/env python3
"""Challenge 「质疑 / 相信」 entry button chrome — colorblind-safe dual channel.

PM lock 2026-09-14: AwaitChallenge entry is 质疑|相信 (not 真|假).
TRUE/FALSE chrome stays on disk for possible reveal judgment; ENTRY uses this pair.

DOUBT   (质疑) = cooler/sharper like prior false chrome + slash motif
BELIEVE (相信) = warmer/rounder like prior true chrome + soft check motif
ON        = pressed/lit of each

WORDLESS: zero Chinese glyphs baked — client overlays 「质疑」/「相信」 Text.
Shape + chroma channels differ — not hue-only twins. Zero .ets. Zero audio.

Tokens: docs/04-设计/夜半酒馆-风格板.md
Slots:  docs/04-设计/质疑相信键-无字铬-资产交件.md
Lock names: art_btn_challenge_doubt / art_btn_challenge_believe (±_on).
FORBIDDEN resource names: challenge_challenge, trust.
Mirror: scripts/gen_challenge_true_false_btn_art.py / gen_challenge_you_prev_btn_art.py
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
    corner_alpha_zero,
    fit_chrome,
    mix,
    open_src,
    rgba,
    save_png,
    unique_colors,
)

MEDIA = ROOT / "entry/src/main/resources/base/media"

# Pair sits side-by-side in front of challenger — same family as true/false / you/prev.
BTN_SIZE = (360, 144)

# Cool challenge chrome (质疑) — steel / teal-copper, not system blue.
STEEL = (0x6A, 0x8A, 0x96)
TEAL = (0x3A, 0x7A, 0x7E)
COPPER = (0xB0, 0x78, 0x58)
COOL_INK = (0x1A, 0x2E, 0x36)


def clear_zero_rgb(arr: np.ndarray) -> np.ndarray:
    empty = arr[..., 3] == 0
    arr[..., :3][empty] = 0
    return arr


def grade_believe(im: Image.Image, pressed: bool) -> Image.Image:
    """Warm believe chrome (相信): felt + brass / candle-gold. Rounded pill + check.

    Mirrors prior TRUE chrome — warmer/rounder channel for client overlay 「相信」.
    """
    arr = np.array(im.convert("RGBA")).astype(np.float32)
    rgb, a = arr[..., :3], arr[..., 3]
    felt = np.array(FELT, dtype=np.float32)
    brass = np.array(BRASS, dtype=np.float32)
    candle = np.array(CANDLE, dtype=np.float32)
    accent = np.array(ACCENT, dtype=np.float32)
    if pressed:
        rgb = rgb * 0.58 + accent * 0.30 + candle * 0.12
        rgb[..., 0] = np.clip(rgb[..., 0] * 1.08, 0, 255)
        rgb[..., 2] = np.clip(rgb[..., 2] * 0.78, 0, 255)
    else:
        rgb = rgb * 0.68 + felt * 0.20 + brass * 0.12
        rgb[..., 0] = np.clip(rgb[..., 0] * 1.04, 0, 255)
        rgb[..., 2] = np.clip(rgb[..., 2] * 0.86, 0, 255)
    out = arr.copy()
    out[..., :3] = np.clip(rgb, 0, 255)
    empty = a < 6
    out[..., 3][empty] = 0
    out[..., :3][empty] = 0
    plate = Image.fromarray(out.astype(np.uint8), "RGBA")

    w, h = plate.size
    # Pill radius — distinctly rounder than doubt (质疑).
    radius = h // 2 - 2
    overlay = Image.new("RGBA", plate.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    border = ACCENT if pressed else BRASS
    inner = mix(CANDLE, PAPER, 0.20) if pressed else mix(BRASS, CANDLE, 0.45)
    od.rounded_rectangle((2, 2, w - 3, h - 3), radius=radius, outline=rgba(border, 235), width=4)
    od.rounded_rectangle(
        (8, 8, w - 9, h - 9), radius=max(radius - 8, 12), outline=rgba(inner, 170), width=2
    )

    # Subtle checkmark on the left — dual-channel shape cue; label area center-right
    # clear for client Text overlay 「相信」 (NO glyphs baked).
    check_col = mix(CANDLE, PAPER, 0.35) if pressed else mix(BRASS, CANDLE, 0.25)
    cx, cy = int(w * 0.18), h // 2
    od.line(
        [(cx - 14, cy), (cx - 4, cy + 12), (cx + 16, cy - 14)],
        fill=rgba(check_col, 200 if pressed else 160),
        width=5,
    )

    plate = Image.alpha_composite(plate, overlay)
    final = np.array(plate)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((1, 1, w - 2, h - 2), radius=radius, fill=255)
    m = np.array(mask)
    final[..., 3] = np.minimum(final[..., 3], m)
    final = clear_zero_rgb(final)
    return Image.fromarray(final, "RGBA")


def grade_doubt(im: Image.Image, pressed: bool) -> Image.Image:
    """Cool doubt chrome (质疑): steel/teal + copper edge. Sharper + slash.

    Mirrors prior FALSE chrome — cooler/sharper channel for client overlay 「质疑」.
    """
    arr = np.array(im.convert("RGBA")).astype(np.float32)
    rgb, a = arr[..., :3], arr[..., 3]
    felt = np.array(FELT, dtype=np.float32)
    steel = np.array(STEEL, dtype=np.float32)
    teal = np.array(TEAL, dtype=np.float32)
    cool_ink = np.array(COOL_INK, dtype=np.float32)
    if pressed:
        rgb = rgb * 0.42 + teal * 0.36 + steel * 0.16 + cool_ink * 0.06
        rgb[..., 0] = np.clip(rgb[..., 0] * 0.78, 0, 255)
        rgb[..., 1] = np.clip(rgb[..., 1] * 1.02, 0, 255)
        rgb[..., 2] = np.clip(rgb[..., 2] * 1.18, 0, 255)
    else:
        rgb = rgb * 0.50 + felt * 0.12 + steel * 0.22 + cool_ink * 0.12 + teal * 0.04
        rgb[..., 0] = np.clip(rgb[..., 0] * 0.82, 0, 255)
        rgb[..., 2] = np.clip(rgb[..., 2] * 1.12, 0, 255)
    out = arr.copy()
    out[..., :3] = np.clip(rgb, 0, 255)
    empty = a < 6
    out[..., 3][empty] = 0
    out[..., :3][empty] = 0
    plate = Image.fromarray(out.astype(np.uint8), "RGBA")

    w, h = plate.size
    # Sharper / angled corners — shape channel vs believe's pill.
    radius = 14
    overlay = Image.new("RGBA", plate.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    border = mix(TEAL, COPPER, 0.35) if pressed else mix(STEEL, COOL_INK, 0.40)
    inner = mix(STEEL, PAPER, 0.15) if pressed else mix(STEEL, TEAL, 0.35)
    od.rounded_rectangle((2, 2, w - 3, h - 3), radius=radius, outline=rgba(border, 245), width=6)
    od.rounded_rectangle(
        (10, 10, w - 11, h - 11), radius=max(radius - 4, 6), outline=rgba(inner, 150), width=2
    )
    for xy in ((6, 6), (w - 18, 6), (6, h - 18), (w - 18, h - 18)):
        od.rectangle(
            [xy, (xy[0] + 10, xy[1] + 10)],
            outline=rgba(COPPER if pressed else mix(COPPER, STEEL, 0.3), 180),
            width=2,
        )

    # Slash motif on the left — shape cue; center-right clear for 「质疑」 Text.
    slash = mix(TEAL, PAPER, 0.25) if pressed else mix(STEEL, COPPER, 0.40)
    sx, sy = int(w * 0.18), h // 2
    od.line(
        [(sx - 12, sy + 16), (sx + 14, sy - 16)],
        fill=rgba(slash, 210 if pressed else 175),
        width=6,
    )
    od.line(
        [(sx - 14, sy - 2), (sx + 16, sy - 2)],
        fill=rgba(mix(COOL_INK, STEEL, 0.3), 140 if pressed else 110),
        width=3,
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
    if kind == "believe":
        return grade_believe(chrome, pressed)
    if kind == "doubt":
        return grade_doubt(chrome, pressed)
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


def assert_no_chinese_glyphs_baked(path: Path) -> None:
    """Sanity: wordless chrome — no opaque near-black glyph plate in label band.

    Generator draws only left motif + border (no ImageFont / text()). Client overlays
    「质疑」/「相信」. Reject a solid dark ink slab (baked glyph silhouette), not wood grain.
    """
    arr = np.array(Image.open(path).convert("RGBA"))
    h, w = arr.shape[:2]
    y0, y1 = int(h * 0.28), int(h * 0.72)
    x0, x1 = int(w * 0.38), int(w * 0.88)
    band = arr[y0:y1, x0:x1]
    alpha = band[..., 3]
    body = alpha > 40
    if body.sum() < 200:
        raise SystemExit(f"{path.name} label band nearly empty — unexpected")
    rgb = band[..., :3].astype(np.float32)[body]
    mean_luma = float(rgb.mean())
    # Baked dark glyph plate ≈ very dark solid; tavern chrome body stays mid/warm.
    dark_frac = float((rgb.mean(axis=1) < 40).mean())
    if mean_luma < 35 and dark_frac > 0.55:
        raise SystemExit(
            f"{path.name} label band looks like baked dark glyphs "
            f"(luma={mean_luma:.1f} dark_frac={dark_frac:.2f})"
        )


def assert_shape_differs(believe_path: Path, doubt_path: Path) -> None:
    """Corners / mask: believe is pillier; doubt sharper — not hue twins."""

    def corner_fill(path: Path) -> float:
        arr = np.array(Image.open(path).convert("RGBA"))
        patch = arr[2:18, 2:18, 3]
        return float(patch.mean())

    t = corner_fill(believe_path)
    c = corner_fill(doubt_path)
    if t >= c - 5:
        ta = np.array(Image.open(believe_path).convert("RGBA"))[..., 3]
        ca = np.array(Image.open(doubt_path).convert("RGBA"))[..., 3]
        t_top = int((ta[3, :] > 40).sum())
        c_top = int((ca[3, :] > 40).sum())
        if abs(t_top - c_top) < 8 and t >= c:
            raise SystemExit(
                f"believe/doubt corner masks too similar "
                f"(t={t:.1f} c={c:.1f} top={t_top}/{c_top})"
            )
    tm = mean_body_rgb(believe_path)
    cm = mean_body_rgb(doubt_path)
    believe_warm = float(tm[0] - tm[2])
    if believe_warm < 12:
        raise SystemExit(f"believe not warm enough (R-B={believe_warm:.1f}, mean={tm})")
    if float(cm[0] - cm[2]) > believe_warm - 4:
        raise SystemExit(
            f"doubt warmer than believe "
            f"(believe R-B={believe_warm:.1f} doubt R-B={cm[0]-cm[2]:.1f})"
        )
    print(
        f"shape/chroma: believe_corner={t:.1f} doubt_corner={c:.1f} "
        f"believe_warm={believe_warm:.1f} doubt_RB={cm[0]-cm[2]:.1f}"
    )


def main() -> None:
    MEDIA.mkdir(parents=True, exist_ok=True)
    outs = {
        "doubt_off": MEDIA / "art_btn_challenge_doubt.png",
        "doubt_on": MEDIA / "art_btn_challenge_doubt_on.png",
        "believe_off": MEDIA / "art_btn_challenge_believe.png",
        "believe_on": MEDIA / "art_btn_challenge_believe_on.png",
    }
    # Keep prior true/false on disk — superseded for ENTRY only; may serve reveal judgment.
    for legacy in (
        "art_btn_challenge_true.png",
        "art_btn_challenge_true_on.png",
        "art_btn_challenge_false.png",
        "art_btn_challenge_false_on.png",
    ):
        legacy_path = MEDIA / legacy
        if not legacy_path.is_file():
            raise SystemExit(
                f"missing legacy {legacy} — must remain for possible reveal judgment "
                "(do NOT delete; ENTRY superseded by doubt/believe)"
            )

    save_png(make_btn("doubt", False), outs["doubt_off"])
    save_png(make_btn("doubt", True), outs["doubt_on"])
    save_png(make_btn("believe", False), outs["believe_off"])
    save_png(make_btn("believe", True), outs["believe_on"])

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
        assert_no_chinese_glyphs_baked(path)
        print(
            f"{path.name:40} {im.size[0]}x{im.size[1]} colors~{n} "
            f"bytes={path.stat().st_size} corners=clear wordless=ok"
        )

    assert_shape_differs(outs["believe_off"], outs["doubt_off"])
    assert_shape_differs(outs["believe_on"], outs["doubt_on"])
    print(
        "challenge doubt/believe dual-channel chrome written "
        "(质疑 cooler/sharper · 相信 warmer/rounder; "
        "wordless; not system gray/blue; true/false kept; "
        "FORBIDDEN names challenge_challenge/trust unused)"
    )


if __name__ == "__main__":
    main()
