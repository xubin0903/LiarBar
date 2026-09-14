#!/usr/bin/env python3
"""Challenge true/false button chrome — colorblind-safe dual channel.

Two side-by-side slots in front of the challenger (17 AwaitChallenge entry).
Smaller than play_confirm 720×144 because they sit as a pair.

TRUE  = warm candle/brass/gold pill + soft check motif
FALSE = cool steel/teal-copper + sharper corners + slash motif
ON    = pressed/lit of each

Shape + chroma channels differ — not hue-only twins. Zero .ets. Zero audio.

Tokens: docs/04-设计/夜半酒馆-风格板.md
Slots:  docs/04-设计/17-局内质疑入口规格.md §3
        docs/04-设计/质疑真假键-视觉差-资产交件.md
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

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

# Pair sits side-by-side in front of challenger — half-ish of play_confirm width.
BTN_SIZE = (360, 144)

# Cool challenge chrome (false) — steel / teal-copper, not system blue.
STEEL = (0x6A, 0x8A, 0x96)
TEAL = (0x3A, 0x7A, 0x7E)
COPPER = (0xB0, 0x78, 0x58)
COOL_INK = (0x1A, 0x2E, 0x36)


def clamp8(v: float) -> int:
    return int(max(0, min(255, round(v))))


def clear_zero_rgb(arr: np.ndarray) -> np.ndarray:
    empty = arr[..., 3] == 0
    arr[..., :3][empty] = 0
    return arr


def grade_true(im: Image.Image, pressed: bool) -> Image.Image:
    """Warm confirm chrome: felt + brass / candle-gold. Rounded pill."""
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
    # Pill radius — distinctly rounder than false.
    radius = h // 2 - 2  # ~70 for 144h → full pill
    overlay = Image.new("RGBA", plate.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    border = ACCENT if pressed else BRASS
    inner = mix(CANDLE, PAPER, 0.20) if pressed else mix(BRASS, CANDLE, 0.45)
    od.rounded_rectangle((2, 2, w - 3, h - 3), radius=radius, outline=rgba(border, 235), width=4)
    od.rounded_rectangle((8, 8, w - 9, h - 9), radius=max(radius - 8, 12), outline=rgba(inner, 170), width=2)

    # Subtle checkmark on the left — dual-channel shape cue; label area center-right clear for Text overlay.
    check_col = mix(CANDLE, PAPER, 0.35) if pressed else mix(BRASS, CANDLE, 0.25)
    cx, cy = int(w * 0.18), h // 2
    od.line([(cx - 14, cy), (cx - 4, cy + 12), (cx + 16, cy - 14)], fill=rgba(check_col, 200 if pressed else 160), width=5)

    plate = Image.alpha_composite(plate, overlay)
    final = np.array(plate)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((1, 1, w - 2, h - 2), radius=radius, fill=255)
    m = np.array(mask)
    final[..., 3] = np.minimum(final[..., 3], m)
    final = clear_zero_rgb(final)
    return Image.fromarray(final, "RGBA")


def grade_false(im: Image.Image, pressed: bool) -> Image.Image:
    """Cool challenge chrome: steel/teal + copper edge. Sharper corners + slash."""
    arr = np.array(im.convert("RGBA")).astype(np.float32)
    rgb, a = arr[..., :3], arr[..., 3]
    felt = np.array(FELT, dtype=np.float32)
    steel = np.array(STEEL, dtype=np.float32)
    teal = np.array(TEAL, dtype=np.float32)
    copper = np.array(COPPER, dtype=np.float32)
    cool_ink = np.array(COOL_INK, dtype=np.float32)
    if pressed:
        # Cool lit: teal wash + steel, kill warm wood / lime cast.
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
    # Sharper / angled corners — shape channel vs true's pill.
    radius = 14
    overlay = Image.new("RGBA", plate.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    # Thicker dark outline
    border = mix(TEAL, COPPER, 0.35) if pressed else mix(STEEL, COOL_INK, 0.40)
    inner = mix(STEEL, PAPER, 0.15) if pressed else mix(STEEL, TEAL, 0.35)
    od.rounded_rectangle((2, 2, w - 3, h - 3), radius=radius, outline=rgba(border, 245), width=6)
    od.rounded_rectangle((10, 10, w - 11, h - 11), radius=max(radius - 4, 6), outline=rgba(inner, 150), width=2)
    # Copper accent tick at corners (not a hue twin of true)
    for xy in ((6, 6), (w - 18, 6), (6, h - 18), (w - 18, h - 18)):
        od.rectangle([xy, (xy[0] + 10, xy[1] + 10)], outline=rgba(COPPER if pressed else mix(COPPER, STEEL, 0.3), 180), width=2)

    # Slash motif on the left — shape cue distinct from checkmark.
    slash = mix(TEAL, PAPER, 0.25) if pressed else mix(STEEL, COPPER, 0.40)
    sx, sy = int(w * 0.18), h // 2
    od.line([(sx - 12, sy + 16), (sx + 14, sy - 16)], fill=rgba(slash, 210 if pressed else 175), width=6)
    # Thin crossbar to reinforce "deny" without relying on red.
    od.line([(sx - 14, sy - 2), (sx + 16, sy - 2)], fill=rgba(mix(COOL_INK, STEEL, 0.3), 140 if pressed else 110), width=3)

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
    if kind == "true":
        return grade_true(chrome, pressed)
    if kind == "false":
        return grade_false(chrome, pressed)
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
    # System blue: strong B dominance without warm copper/brass balance.
    if mean[2] > mean[0] + 18 and mean[2] > mean[1] + 10 and mean[0] < 90:
        raise SystemExit(f"{path.name} reads as system blue (mean={mean})")


def assert_shape_differs(true_path: Path, false_path: Path) -> None:
    """Corners / mask: true is pillier; false has sharper radius — not hue twins."""
    def corner_fill(path: Path) -> float:
        arr = np.array(Image.open(path).convert("RGBA"))
        h, w = arr.shape[:2]
        # Sample near top-left outside a tight pill but inside a sharp rect.
        # True pill should be more transparent in far corners of the plate.
        patch = arr[2:18, 2:18, 3]
        return float(patch.mean())

    t = corner_fill(true_path)
    f = corner_fill(false_path)
    # True pill clears more corner alpha than false's sharper rect.
    if t >= f - 5:
        # Also check radius via opaque bbox aspect at mid-height edge.
        ta = np.array(Image.open(true_path).convert("RGBA"))[..., 3]
        fa = np.array(Image.open(false_path).convert("RGBA"))[..., 3]
        # At y=4, count opaque pixels — pill should have fewer at the very top corners.
        t_top = int((ta[3, :] > 40).sum())
        f_top = int((fa[3, :] > 40).sum())
        if abs(t_top - f_top) < 8 and t >= f:
            raise SystemExit(f"true/false corner masks too similar (t={t:.1f} f={f:.1f} top={t_top}/{f_top})")
    # Warm vs cool mean: true warmer (R>B), false cooler (B closer to R or higher G/B).
    tm = mean_body_rgb(true_path)
    fm = mean_body_rgb(false_path)
    true_warm = float(tm[0] - tm[2])
    false_cool_delta = float(fm[2] - fm[0])  # may be mild; steel is desaturated
    if true_warm < 12:
        raise SystemExit(f"true not warm enough (R-B={true_warm:.1f}, mean={tm})")
    if float(fm[0] - fm[2]) > true_warm - 4:
        # false should not be warmer than true
        raise SystemExit(f"false warmer than true (true R-B={true_warm:.1f} false R-B={fm[0]-fm[2]:.1f})")
    print(f"shape/chroma: true_corner={t:.1f} false_corner={f:.1f} true_warm={true_warm:.1f} false_RB={fm[0]-fm[2]:.1f}")


def main() -> None:
    MEDIA.mkdir(parents=True, exist_ok=True)
    outs = {
        "true_off": MEDIA / "art_btn_challenge_true.png",
        "true_on": MEDIA / "art_btn_challenge_true_on.png",
        "false_off": MEDIA / "art_btn_challenge_false.png",
        "false_on": MEDIA / "art_btn_challenge_false_on.png",
    }
    save_png(make_btn("true", False), outs["true_off"])
    save_png(make_btn("true", True), outs["true_on"])
    save_png(make_btn("false", False), outs["false_off"])
    save_png(make_btn("false", True), outs["false_on"])

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
        print(f"{path.name:36} {im.size[0]}x{im.size[1]} colors~{n} bytes={path.stat().st_size} corners=clear")

    assert_shape_differs(outs["true_off"], outs["false_off"])
    assert_shape_differs(outs["true_on"], outs["false_on"])
    print("challenge true/false dual-channel chrome written (not system gray/blue; shape differs)")


if __name__ == "__main__":
    main()
