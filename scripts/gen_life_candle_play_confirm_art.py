#!/usr/bin/env python3
"""Line A life candles + line B play-confirm chrome.

Replaces #103 PLACEHOLDER color stubs with tavern-style art.
Same filenames / $r ids — #103 can same-name rebind. Zero .ets. Zero audio.

Tokens: docs/04-设计/夜半酒馆-风格板.md
Slots:  docs/04-设计/14-局内生命显示规格.md §4.2
        docs/04-设计/15-局内手牌触摸出牌规格.md §5.3
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

CANDLE_SIZE = 128
BTN_SIZE = (720, 144)

WAX = (0xF3, 0xE6, 0xC8)
WAX_DIM = (0xC4, 0xA4, 0x6A)
EMBER = (0xC2, 0x3A, 0x3A)
CORE = (255, 250, 228)
MUTE = (0x8A, 0x73, 0x5A)


def clamp8(v: float) -> int:
    return int(max(0, min(255, round(v))))


def clear_zero_rgb(arr: np.ndarray) -> np.ndarray:
    empty = arr[..., 3] == 0
    arr[..., :3][empty] = 0
    return arr


def luma(rgb: np.ndarray) -> np.ndarray:
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def paint_flame_field(
    w: int,
    h: int,
    cx: float,
    cy: float,
    rx: float,
    ry: float,
    lean: float,
    tip_pull: float,
) -> tuple[np.ndarray, np.ndarray]:
    """Teardrop flame field. Returns (glow 0..1, core 0..1)."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    nx = (xx - (cx + lean)) / max(rx, 1.0)
    ny = (yy - cy) / max(ry, 1.0)
    tip = np.clip((cy - yy) / max(ry * tip_pull, 1.0), 0.0, 1.0)
    rad = 1.02 + tip * 1.45
    d = (nx / (0.78 + tip * 0.50)) ** 2 + (ny * rad) ** 2
    glow = np.clip(1.18 - d * 1.08, 0.0, 1.0)
    glow = np.power(glow, 1.28)
    core = np.power(np.clip(glow - 0.22, 0.0, 1.0), 1.65)
    return glow, core


def compose_flame(
    canvas: Image.Image,
    glow: np.ndarray,
    core: np.ndarray,
    intensity: float,
    warm: tuple[int, int, int],
    accent: tuple[int, int, int],
) -> Image.Image:
    h, w = glow.shape
    rgb = np.zeros((h, w, 3), dtype=np.float32)
    rgb += glow[..., None] * np.array(warm, dtype=np.float32) * intensity
    rgb += np.power(glow, 2.1)[..., None] * np.array(PAPER, dtype=np.float32) * (0.55 * intensity)
    rgb += core[..., None] * np.array(CORE, dtype=np.float32) * (0.85 * intensity)
    rgb += np.clip(glow * 0.40, 0, 1)[..., None] * np.array(accent, dtype=np.float32) * (0.22 * intensity)
    alpha = np.clip(glow * 255.0 * intensity + core * 40.0, 0, 255)
    plate = np.zeros((h, w, 4), dtype=np.uint8)
    plate[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    plate[..., 3] = alpha.astype(np.uint8)
    empty = plate[..., 3] < 8
    plate[..., 3][empty] = 0
    plate[..., :3][empty] = 0
    flame = Image.fromarray(clear_zero_rgb(plate), "RGBA")
    flame = flame.filter(ImageFilter.GaussianBlur(0.55))
    return Image.alpha_composite(canvas, flame)


def load_fx_flame() -> Image.Image | None:
    path = MEDIA / "art_fx_candle.png"
    if not path.exists():
        return None
    return Image.open(path).convert("RGBA")


def stamp_fx_flame(canvas: Image.Image, kind: str) -> Image.Image:
    """Reuse the keyed tavern teardrop from art_fx_candle; scale by state."""
    src = load_fx_flame()
    if src is None:
        return canvas
    s = canvas.size[0]
    if kind == "full":
        fit, oy, alpha = int(s * 0.92), int(s * -0.06), 0.92
    elif kind == "hurt":
        fit, oy, alpha = int(s * 0.58), int(s * 0.10), 0.78
    else:
        return canvas
    flame = src.resize((fit, fit), Image.Resampling.LANCZOS)
    if kind == "hurt":
        arr = np.array(flame).astype(np.float32)
        mute = np.array(MUTE, dtype=np.float32)
        arr[..., :3] = arr[..., :3] * 0.62 + mute * 0.38
        arr[..., 3] *= 0.85
        flame = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")
    if alpha < 1.0:
        a = flame.split()[3].point(lambda v: int(v * alpha))
        flame.putalpha(a)
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ox = (s - fit) // 2
    layer.paste(flame, (ox, oy), flame)
    return Image.alpha_composite(canvas, layer)


def paint_wax_and_cup(draw: ImageDraw.ImageDraw, kind: str, s: int) -> None:
    """Brass cup + wax pillar. Dying wax is shorter/stumpier so silhouettes differ."""
    cx = s // 2
    if kind == "dying":
        wax_top, wax_bot = int(s * 0.62), int(s * 0.90)
        wax_rx = int(s * 0.17)
    elif kind == "hurt":
        wax_top, wax_bot = int(s * 0.60), int(s * 0.91)
        wax_rx = int(s * 0.145)
    else:
        wax_top, wax_bot = int(s * 0.58), int(s * 0.91)
        wax_rx = int(s * 0.15)

    cup_y0, cup_y1 = int(s * 0.80), int(s * 0.96)
    draw.ellipse((cx - 26, cup_y1 - 6, cx + 26, cup_y1 + 8), fill=rgba(SHADOW, 110))
    dark_brass = mix(BRASS, SHADOW, 0.42)
    lit_brass = mix(BRASS, CANDLE, 0.40)
    draw.ellipse((cx - 22, cup_y0, cx + 22, cup_y0 + 18), fill=rgba(lit_brass, 250))
    draw.polygon(
        [(cx - 20, cup_y0 + 9), (cx + 20, cup_y0 + 9), (cx + 15, cup_y1 - 4), (cx - 15, cup_y1 - 4)],
        fill=rgba(BRASS, 250),
    )
    draw.ellipse((cx - 17, cup_y1 - 12, cx + 17, cup_y1 + 2), fill=rgba(dark_brass, 250))
    draw.arc((cx - 22, cup_y0, cx + 22, cup_y0 + 18), 200, 340, fill=rgba(CANDLE, 220), width=3)

    if kind == "full":
        wax_fill = mix(WAX, CANDLE, 0.18)
    elif kind == "hurt":
        wax_fill = mix(WAX, MUTE, 0.32)
    else:
        wax_fill = mix(WAX_DIM, SHADOW, 0.22)
    wax_shade = mix(wax_fill, SHADOW, 0.28)
    wax_lit = mix(wax_fill, PAPER, 0.30)
    draw.rounded_rectangle(
        (cx - wax_rx, wax_top, cx + wax_rx, wax_bot),
        radius=max(wax_rx - 2, 5),
        fill=rgba(wax_fill, 252),
    )
    draw.rectangle((cx + wax_rx - 6, wax_top + 8, cx + wax_rx - 1, wax_bot - 6), fill=rgba(wax_shade, 90))
    draw.ellipse((cx - wax_rx, wax_top - 6, cx + wax_rx, wax_top + 10), fill=rgba(wax_lit, 252))
    draw.ellipse((cx - wax_rx + 4, wax_top - 1, cx + wax_rx - 6, wax_top + 8), fill=rgba(wax_shade, 70))
    if kind == "full":
        draw.ellipse((cx + 5, wax_top + 12, cx + 12, wax_top + 28), fill=rgba(wax_lit, 200))
    elif kind == "hurt":
        draw.ellipse((cx + 4, wax_top + 10, cx + 10, wax_top + 22), fill=rgba(wax_lit, 160))
        draw.line((cx - wax_rx + 3, wax_top + 18, cx - wax_rx + 6, wax_bot - 8), fill=rgba(EMBER, 90), width=2)

    wick_top = wax_top - (10 if kind == "full" else 6 if kind == "hurt" else 3)
    wick_col = mix(SHADOW, MUTE, 0.20)
    draw.rectangle((cx - 1, wick_top, cx + 2, wax_top + 8), fill=rgba(wick_col, 255))
    if kind == "dying":
        draw.rectangle((cx - 1, wick_top - 3, cx + 2, wick_top + 6), fill=rgba(MUTE, 230))


def paint_smoke(draw: ImageDraw.ImageDraw, s: int) -> None:
    """Thin rising wisp — dying silhouette, not a flame teardrop."""
    cx = s // 2
    y0 = int(s * 0.52)
    smoke = mix(MUTE, SHADOW, 0.10)
    draw.arc((cx - 14, y0 - 36, cx + 2, y0 + 4), 200, 340, fill=rgba(smoke, 160), width=3)
    draw.arc((cx - 4, y0 - 56, cx + 16, y0 - 20), 20, 160, fill=rgba(smoke, 110), width=2)


def paint_drawn_flame(kind: str, s: int) -> Image.Image:
    """Bold teardrop / stub / ember. Shape, not hue, carries 满/残/濒."""
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx = s // 2
    if kind == "full":
        # Tall teardrop: halo + body + white core. Readable at ~20vp.
        d.ellipse((cx - 34, 2, cx + 36, 86), fill=rgba(mix(CANDLE, ACCENT, 0.20), 55))
        d.polygon([(cx - 20, 70), (cx + 21, 70), (cx + 4, 6), (cx - 3, 6)], fill=rgba(CANDLE, 240))
        d.ellipse((cx - 22, 42, cx + 23, 86), fill=rgba(CANDLE, 245))
        d.ellipse((cx - 14, 36, cx + 15, 76), fill=rgba(ACCENT, 235))
        d.ellipse((cx - 8, 44, cx + 9, 72), fill=rgba(CORE, 250))
        d.ellipse((cx - 4, 50, cx + 5, 66), fill=rgba((255, 255, 246), 255))
    elif kind == "hurt":
        # Short squat flame, slightly leaned. Clearly shorter than full.
        d.ellipse((cx - 20, 40, cx + 18, 78), fill=rgba(mix(CANDLE, MUTE, 0.30), 50))
        d.polygon([(cx - 13, 72), (cx + 10, 70), (cx - 4, 42)], fill=rgba(mix(CANDLE, MUTE, 0.18), 235))
        d.ellipse((cx - 14, 56, cx + 11, 78), fill=rgba(mix(CANDLE, BRASS, 0.28), 240))
        d.ellipse((cx - 7, 60, cx + 6, 74), fill=rgba(mix(ACCENT, MUTE, 0.28), 225))
        d.ellipse((cx - 3, 64, cx + 3, 72), fill=rgba(mix(CORE, CANDLE, 0.45), 235))
    else:
        paint_smoke(d, s)
        ex, ey = cx, int(s * 0.54)
        d.ellipse((ex - 9, ey - 7, ex + 9, ey + 7), fill=rgba(mix(EMBER, CANDLE, 0.15), 230))
        d.ellipse((ex - 4, ey - 3, ex + 4, ey + 3), fill=rgba(CANDLE, 220))
        d.ellipse((ex - 2, ey - 2, ex + 2, ey + 1), fill=rgba(CORE, 180))
    return layer.filter(ImageFilter.GaussianBlur(0.45))


def paint_life_candle(kind: str, size: int = CANDLE_SIZE) -> Image.Image:
    s = size
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    if kind in ("full", "hurt"):
        canvas = stamp_fx_flame(canvas, kind)
    canvas = Image.alpha_composite(canvas, paint_drawn_flame(kind, s))

    overlay = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    paint_wax_and_cup(ImageDraw.Draw(overlay), kind, s)
    overlay = overlay.filter(ImageFilter.GaussianBlur(0.28))
    canvas = Image.alpha_composite(canvas, overlay)

    arr = np.array(canvas.convert("RGBA"))
    arr = clear_zero_rgb(arr)
    # Light grain so it is not a flat emoji chip.
    body = arr[..., 3] > 12
    rng = np.random.default_rng(14 if kind == "full" else 22 if kind == "hurt" else 36)
    noise = rng.normal(0.0, 3.2, arr[..., :3].shape)
    arr[..., :3] = np.clip(arr[..., :3].astype(np.float32) + noise * body[..., None], 0, 255).astype(np.uint8)
    # True-clear corners so Harmony src-over is not a boxed stamp.
    pad = 4
    arr[:pad, :pad, 3] = 0
    arr[:pad, -pad:, 3] = 0
    arr[-pad:, :pad, 3] = 0
    arr[-pad:, -pad:, 3] = 0
    arr[..., :3][arr[..., 3] == 0] = 0
    return Image.fromarray(arr, "RGBA")


def grade_confirm(im: Image.Image, pressed: bool) -> Image.Image:
    """Keep wood/gold chrome; pull toward felt + copper / candle-gold. Not system gray/blue."""
    arr = np.array(im.convert("RGBA")).astype(np.float32)
    rgb, a = arr[..., :3], arr[..., 3]
    felt = np.array(FELT, dtype=np.float32)
    brass = np.array(BRASS, dtype=np.float32)
    candle = np.array(CANDLE, dtype=np.float32)
    accent = np.array(ACCENT, dtype=np.float32)
    if pressed:
        rgb = rgb * 0.62 + accent * 0.28 + candle * 0.10
        rgb[..., 0] = np.clip(rgb[..., 0] * 1.06, 0, 255)
        rgb[..., 2] = np.clip(rgb[..., 2] * 0.82, 0, 255)
    else:
        rgb = rgb * 0.70 + felt * 0.22 + brass * 0.08
        rgb[..., 2] = np.clip(rgb[..., 2] * 0.88, 0, 255)
    out = arr.copy()
    out[..., :3] = np.clip(rgb, 0, 255)
    empty = a < 6
    out[..., 3][empty] = 0
    out[..., :3][empty] = 0
    plate = Image.fromarray(out.astype(np.uint8), "RGBA")
    overlay = Image.new("RGBA", plate.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    w, h = plate.size
    border = ACCENT if pressed else BRASS
    inner = mix(CANDLE, PAPER, 0.15) if pressed else mix(BRASS, CANDLE, 0.40)
    od.rounded_rectangle((2, 2, w - 3, h - 3), radius=24, outline=rgba(border, 230), width=4)
    od.rounded_rectangle((8, 8, w - 9, h - 9), radius=18, outline=rgba(inner, 160), width=2)
    plate = Image.alpha_composite(plate, overlay)
    final = np.array(plate)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((1, 1, w - 2, h - 2), radius=24, fill=255)
    m = np.array(mask)
    final[..., 3] = np.minimum(final[..., 3], m)
    final[..., :3][final[..., 3] == 0] = 0
    return Image.fromarray(final, "RGBA")


def make_confirm(pressed: bool) -> Image.Image:
    src_name = "src_btn_primary_on.png" if pressed else "src_btn_primary.png"
    chrome = fit_chrome(open_src(src_name), *BTN_SIZE)
    return grade_confirm(chrome, pressed)


def flame_bbox(im: Image.Image) -> tuple[int, int, int, int]:
    arr = np.array(im.convert("RGBA"))
    rgb, a = arr[..., :3].astype(np.float32), arr[..., 3]
    L = luma(rgb)
    warm = rgb[..., 0] - rgb[..., 2]
    # Bright / warm pixels in the upper plate = flame or ember, not the wax pillar.
    fire = (a > 40) & (warm > 22) & (L > 155) & (np.arange(arr.shape[0])[:, None] < int(arr.shape[0] * 0.58))
    ys, xs = np.where(fire)
    if xs.size < 8:
        fire = (a > 40) & (warm > 12) & (L > 90)
        ys, xs = np.where(fire)
    if xs.size == 0:
        return (0, 0, 0, 0)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def opaque_bbox(im: Image.Image) -> tuple[int, int, int, int]:
    a = np.array(im.convert("RGBA"))[..., 3]
    ys, xs = np.where(a > 12)
    if xs.size == 0:
        return (0, 0, 0, 0)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def assert_candle_shapes(full: Path, hurt: Path, dying: Path) -> None:
    ims = {k: Image.open(p).convert("RGBA") for k, p in (("full", full), ("hurt", hurt), ("dying", dying))}
    boxes = {k: flame_bbox(im) for k, im in ims.items()}
    heights = {k: max(0, b[3] - b[1]) for k, b in boxes.items()}
    if heights["full"] < 36:
        raise SystemExit(f"full flame too short ({heights['full']}px)")
    if heights["hurt"] >= heights["full"] * 0.78:
        raise SystemExit(f"hurt flame not shorter than full ({heights})")
    if heights["dying"] >= heights["hurt"] * 0.72:
        raise SystemExit(f"dying ember not shorter than hurt ({heights})")
    # Silhouette: dying must be shorter overall (smoke is thin; wax is shorter).
    sil = {k: opaque_bbox(im) for k, im in ims.items()}
    sil_h = {k: max(0, b[3] - b[1]) for k, b in sil.items()}
    if sil_h["dying"] >= sil_h["full"] * 0.92:
        raise SystemExit(f"dying silhouette not shorter than full ({sil_h})")


def assert_not_system_gray(path: Path) -> None:
    arr = np.array(Image.open(path).convert("RGBA"))
    rgb, a = arr[..., :3].astype(np.float32), arr[..., 3]
    body = a > 40
    if body.sum() < 200:
        raise SystemExit(f"{path.name} has almost no body")
    mean = rgb[body].mean(axis=0)
    # HarmonyOS default chrome is mid gray or system blue. Reject both.
    chroma = float(mean.max() - mean.min())
    if chroma < 18 and 70 < float(mean.mean()) < 190:
        raise SystemExit(f"{path.name} reads as system gray (mean={mean})")
    if mean[2] > mean[0] + 12 and mean[2] > mean[1] + 8:
        raise SystemExit(f"{path.name} reads as system blue (mean={mean})")


def main() -> None:
    MEDIA.mkdir(parents=True, exist_ok=True)
    candles = {
        "full": MEDIA / "art_life_candle_full.png",
        "hurt": MEDIA / "art_life_candle_hurt.png",
        "dying": MEDIA / "art_life_candle_dying.png",
    }
    for kind, path in candles.items():
        save_png(paint_life_candle(kind), path)

    buttons = {
        "off": MEDIA / "art_btn_play_confirm.png",
        "on": MEDIA / "art_btn_play_confirm_on.png",
    }
    save_png(make_confirm(False), buttons["off"])
    save_png(make_confirm(True), buttons["on"])

    jobs = [
        (candles["full"], (CANDLE_SIZE, CANDLE_SIZE), True, 80),
        (candles["hurt"], (CANDLE_SIZE, CANDLE_SIZE), True, 80),
        (candles["dying"], (CANDLE_SIZE, CANDLE_SIZE), True, 80),
        (buttons["off"], BTN_SIZE, True, 80),
        (buttons["on"], BTN_SIZE, True, 80),
    ]
    for path, size, trans, min_colors in jobs:
        im = Image.open(path)
        if im.size != size:
            raise SystemExit(f"{path.name} size {im.size} != {size}")
        if im.mode != "RGBA":
            raise SystemExit(f"{path.name} mode {im.mode} != RGBA")
        n = unique_colors(path)
        extra = ""
        if trans:
            if not corner_alpha_zero(path):
                raise SystemExit(f"{path.name} corners are not transparent")
            extra = " corners=clear"
        if n < min_colors:
            raise SystemExit(f"{path.name} still looks like a stub ({n} colors)")
        if path.stat().st_size < 2_000:
            raise SystemExit(f"{path.name} is still a tiny stub ({path.stat().st_size} bytes)")
        print(f"{path.name:32} {im.size[0]}x{im.size[1]} colors~{n} bytes={path.stat().st_size}{extra}")

    assert_candle_shapes(candles["full"], candles["hurt"], candles["dying"])
    assert_not_system_gray(buttons["off"])
    assert_not_system_gray(buttons["on"])
    print("shape: full > hurt > dying flame height; confirm chrome is not system gray/blue")
    print("life candle + play-confirm delivery art written")


if __name__ == "__main__":
    main()
