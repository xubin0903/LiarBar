#!/usr/bin/env python3
"""Life-candle polish: body + per-state flame + optional full loop + extinguish + two SFX.

Supersedes still-only candles (#104) for the animation path.
Keeps art_life_candle_{full,hurt,dying} as 128×128 fallback composites.

Tokens: docs/04-设计/夜半酒馆-风格板.md
Slots:  docs/04-设计/生命烛精致化-资产交件.md
        docs/04-设计/14-局内生命显示规格.md
        docs/04-设计/15-局内手牌触摸出牌规格.md §7 (lb_sfx_card_flip)

Zero .ets. Does not touch BGM or gen_table_audio.py.
"""

from __future__ import annotations

import math
import sys
import wave
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
    mix,
    rgba,
    save_png,
    unique_colors,
)
from gen_life_candle_play_confirm_art import (  # noqa: E402
    CORE,
    MUTE,
    WAX,
    WAX_DIM,
    clear_zero_rgb,
    compose_flame,
    luma,
    paint_flame_field,
)

MEDIA = ROOT / "entry/src/main/resources/base/media"
SFX = ROOT / "entry/src/main/resources/rawfile/audio/sfx"

# Tall plate so the wax pillar can own the mass. Flame overlays share the canvas.
PLATE = (128, 160)
STILL = 128
SR = 48000

WOOD = (0x3A, 0x24, 0x18)
WOOD_LIT = (0x5A, 0x38, 0x22)
WOOD_DARK = (0x24, 0x16, 0x10)
DRIP = (0xE6, 0xD2, 0xA8)
SMOKE = mix(MUTE, SHADOW, 0.18)


def clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def opaque_bbox(im: Image.Image, alpha_min: int = 16) -> tuple[int, int, int, int]:
    a = np.array(im.convert("RGBA"))[..., 3]
    ys, xs = np.where(a > alpha_min)
    if xs.size == 0:
        return (0, 0, 0, 0)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def bbox_area(box: tuple[int, int, int, int]) -> int:
    x0, y0, x1, y1 = box
    if x1 <= x0 or y1 <= y0:
        return 0
    return (x1 - x0 + 1) * (y1 - y0 + 1)


def alpha_mask(im: Image.Image, thresh: int = 20) -> np.ndarray:
    return np.array(im.convert("RGBA"))[..., 3] > thresh


def mask_iou(a: np.ndarray, b: np.ndarray) -> float:
    inter = np.logical_and(a, b).sum()
    union = np.logical_or(a, b).sum()
    if union == 0:
        return 0.0
    return float(inter) / float(union)


def downsample_mask(mask: np.ndarray, tw: int = 16, th: int = 20) -> np.ndarray:
    im = Image.fromarray(mask.astype(np.uint8) * 255, "L")
    return np.array(im.resize((tw, th), Image.Resampling.BILINEAR)) > 80


def true_clear_corners(arr: np.ndarray, pad: int = 5) -> np.ndarray:
    arr[:pad, :pad, 3] = 0
    arr[:pad, -pad:, 3] = 0
    arr[-pad:, :pad, 3] = 0
    arr[-pad:, -pad:, 3] = 0
    arr[..., :3][arr[..., 3] == 0] = 0
    return arr


def grain(arr: np.ndarray, seed: int, sigma: float = 2.8) -> np.ndarray:
    body = arr[..., 3] > 10
    rng = np.random.default_rng(seed)
    noise = rng.normal(0.0, sigma, arr[..., :3].shape)
    out = arr.astype(np.float32)
    out[..., :3] = np.clip(out[..., :3] + noise * body[..., None], 0, 255)
    out[..., :3][out[..., 3] == 0] = 0
    return out.astype(np.uint8)


# ---------------------------------------------------------------------------
# Body — wax pillar + wood cup. This is the visual mass.
# ---------------------------------------------------------------------------

def paint_body(size: tuple[int, int] = PLATE) -> Image.Image:
    w, h = size
    cx = w // 2
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)

    # Ground shadow (soft, stays inside plate).
    d.ellipse((cx - 38, h - 22, cx + 40, h - 4), fill=rgba(SHADOW, 95))

    # Wood saucer / cup — darker tavern wood, brass lip.
    cup_top, cup_bot = h - 44, h - 12
    d.ellipse((cx - 34, cup_bot - 10, cx + 34, cup_bot + 6), fill=rgba(WOOD_DARK, 250))
    d.polygon(
        [
            (cx - 30, cup_top + 10),
            (cx + 30, cup_top + 10),
            (cx + 26, cup_bot - 4),
            (cx - 26, cup_bot - 4),
        ],
        fill=rgba(WOOD, 252),
    )
    d.ellipse((cx - 32, cup_top, cx + 32, cup_top + 20), fill=rgba(WOOD_LIT, 250))
    # Brass rim + inner well.
    d.ellipse((cx - 28, cup_top + 2, cx + 28, cup_top + 18), fill=rgba(mix(BRASS, CANDLE, 0.22), 250))
    d.ellipse((cx - 22, cup_top + 6, cx + 22, cup_top + 16), fill=rgba(mix(WOOD, SHADOW, 0.20), 250))
    d.arc((cx - 28, cup_top + 2, cx + 28, cup_top + 18), 200, 340, fill=rgba(CANDLE, 210), width=2)
    # Wood grain ticks on the cup wall.
    for i, xoff in enumerate((-18, -8, 4, 14)):
        shade = mix(WOOD, SHADOW, 0.18 + 0.08 * (i % 2))
        d.line(
            (cx + xoff, cup_top + 16, cx + xoff + 2, cup_bot - 6),
            fill=rgba(shade, 110),
            width=1,
        )

    # Wax pillar — tall, wider than the flame will ever be. Warm ivory, not paper-white.
    wax_top, wax_bot = 52, h - 36
    wax_rx = 22
    wax_fill = mix(WAX, CANDLE, 0.34)
    wax_shade = mix(wax_fill, mix(SHADOW, WOOD, 0.40), 0.38)
    wax_lit = mix(wax_fill, mix(PAPER, CANDLE, 0.40), 0.28)
    d.rounded_rectangle(
        (cx - wax_rx, wax_top, cx + wax_rx, wax_bot),
        radius=10,
        fill=rgba(wax_fill, 254),
    )
    # Right shade + left catchlight so it reads as a cylinder, not a sticker.
    d.rectangle(
        (cx + wax_rx - 8, wax_top + 10, cx + wax_rx - 1, wax_bot - 8),
        fill=rgba(wax_shade, 100),
    )
    d.rectangle(
        (cx - wax_rx + 2, wax_top + 12, cx - wax_rx + 7, wax_bot - 10),
        fill=rgba(wax_lit, 70),
    )
    # Melted crown.
    d.ellipse((cx - wax_rx, wax_top - 8, cx + wax_rx, wax_top + 14), fill=rgba(wax_lit, 254))
    d.ellipse((cx - wax_rx + 5, wax_top - 2, cx + wax_rx - 7, wax_top + 10), fill=rgba(wax_shade, 80))
    # Pool of melt around the wick seat.
    d.ellipse((cx - 10, wax_top - 2, cx + 11, wax_top + 10), fill=rgba(mix(WAX, CANDLE, 0.28), 240))

    # Drips — extra wax mass, night-tavern melt.
    d.ellipse((cx + 10, wax_top + 8, cx + 20, wax_top + 36), fill=rgba(DRIP, 230))
    d.ellipse((cx + 12, wax_top + 28, cx + 19, wax_top + 48), fill=rgba(mix(DRIP, WAX_DIM, 0.25), 220))
    d.ellipse((cx - 20, wax_top + 14, cx - 12, wax_top + 32), fill=rgba(mix(DRIP, WAX, 0.20), 200))

    # Specular chip on the upper-right wax.
    d.ellipse((cx + 6, wax_top + 16, cx + 14, wax_top + 34), fill=rgba(wax_lit, 190))

    # Wick (no flame — overlays sit on this).
    wick_col = mix(SHADOW, MUTE, 0.18)
    d.rectangle((cx - 1, wax_top - 12, cx + 2, wax_top + 8), fill=rgba(wick_col, 255))
    d.rectangle((cx - 1, wax_top - 14, cx + 2, wax_top - 8), fill=rgba(mix(MUTE, CANDLE, 0.15), 230))

    canvas = canvas.filter(ImageFilter.GaussianBlur(0.22))
    arr = np.array(canvas.convert("RGBA"))
    # Cylinder light: left catch + warm crown, so the pillar is not a flat chip.
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    wax_band = (arr[..., 3] > 40) & (yy > wax_top - 6) & (yy < wax_bot)
    nx = (xx - cx) / max(wax_rx, 1)
    ny = (yy - wax_top) / max(wax_bot - wax_top, 1)
    side = np.clip(0.55 - nx * 0.55, 0.0, 1.0)
    crown = np.clip(1.0 - ny * 0.85, 0.0, 1.0)
    warm = np.array(CANDLE, dtype=np.float32)
    shade = np.array(mix(WOOD, SHADOW, 0.25), dtype=np.float32)
    rgb = arr[..., :3].astype(np.float32)
    lift = (side * 0.22 + crown * 0.16) * wax_band
    drop = np.clip(nx * 0.28, 0, 1) * wax_band * 0.20
    rgb = rgb * (1.0 - lift[..., None] * 0.35) + warm * (lift[..., None] * 0.35)
    rgb = rgb * (1.0 - drop[..., None]) + shade * drop[..., None]
    arr[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    arr = true_clear_corners(grain(arr, seed=41, sigma=2.6))
    return Image.fromarray(clear_zero_rgb(arr), "RGBA")


# ---------------------------------------------------------------------------
# Flame overlays — small, on the wick, loopable.
# ---------------------------------------------------------------------------

def paint_flame_overlay(
    size: tuple[int, int],
    *,
    lean: float,
    rx: float,
    ry: float,
    intensity: float,
    tip_pull: float,
    cy_off: float = 0.0,
) -> Image.Image:
    w, h = size
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    # Wick sits near y=40 on the 160 plate; flame sits ON that seat.
    cx = w * 0.50
    cy = h * 0.22 + cy_off
    glow, core = paint_flame_field(w, h, cx, cy, rx, ry, lean, tip_pull)
    canvas = compose_flame(canvas, glow, core, intensity, CANDLE, ACCENT)
    # Halo scales with the flame so a stub is not padded out to a full teardrop bbox.
    halo = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    hx, hy = int(cx + lean * 0.15), int(cy + ry * 0.35)
    hr = max(5, int(rx * 1.15))
    hv = max(6, int(ry * 0.85))
    hd.ellipse((hx - hr, hy - hv, hx + hr, hy + int(hv * 1.15)), fill=rgba(mix(CANDLE, ACCENT, 0.25), 22))
    canvas = Image.alpha_composite(halo, canvas)
    arr = true_clear_corners(np.array(canvas.convert("RGBA")), pad=3)
    return Image.fromarray(clear_zero_rgb(arr), "RGBA")


def flame_loop_params() -> list[dict[str, float]]:
    """Optional full-state extras: lean L → tall → lean R → squat. 3→0 not a clone."""
    return [
        {"lean": -8.5, "rx": 10.8, "ry": 19.0, "intensity": 0.98, "tip_pull": 1.06, "cy_off": 0.4},
        {"lean": 0.6, "rx": 9.6, "ry": 23.5, "intensity": 1.06, "tip_pull": 1.32, "cy_off": -3.2},
        {"lean": 8.8, "rx": 11.2, "ry": 18.2, "intensity": 0.94, "tip_pull": 0.96, "cy_off": 0.8},
        {"lean": -2.2, "rx": 12.6, "ry": 15.4, "intensity": 0.90, "tip_pull": 0.80, "cy_off": 2.8},
    ]


def flame_state_params() -> dict[str, dict[str, float]]:
    """Primary bind targets (14b): full / hurt / dying — shape, not hue."""
    return {
        "full": {"lean": 0.6, "rx": 9.6, "ry": 23.5, "intensity": 1.06, "tip_pull": 1.32, "cy_off": -3.2},
        "hurt": {"lean": 3.4, "rx": 7.2, "ry": 11.2, "intensity": 0.74, "tip_pull": 0.76, "cy_off": 4.2},
        "dying": {"lean": 1.2, "rx": 4.8, "ry": 5.4, "intensity": 0.48, "tip_pull": 0.48, "cy_off": 10.0},
    }


def paint_extinguish_frame(index: int, size: tuple[int, int] = PLATE) -> Image.Image:
    """0 shrink flame → 1 stub → 2 ember → 3 smoke/out. Shape must progress."""
    w, h = size
    if index == 0:
        return paint_flame_overlay(
            size, lean=-2.0, rx=10.0, ry=16.0, intensity=0.88, tip_pull=0.94, cy_off=1.2
        )
    if index == 1:
        # Stub: clearly shorter than frame 0, still a flame (not yet an ember).
        return paint_flame_overlay(
            size, lean=4.6, rx=6.4, ry=7.2, intensity=0.62, tip_pull=0.52, cy_off=8.8
        )

    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    cx = w // 2
    wick_y = int(h * 0.26)

    if index == 2:
        # Ember: small warm bead on the wick, no teardrop. Shorter than the stub flame.
        d.ellipse((cx - 6, wick_y + 7, cx + 7, wick_y + 15), fill=rgba(mix(CANDLE, (0xC2, 0x3A, 0x3A), 0.22), 55))
        d.ellipse((cx - 4, wick_y + 8, cx + 5, wick_y + 14), fill=rgba(mix(CANDLE, ACCENT, 0.20), 230))
        d.ellipse((cx - 2, wick_y + 9, cx + 3, wick_y + 13), fill=rgba(CORE, 240))
        d.point((cx, wick_y + 10), fill=rgba(PAPER, 220))
        canvas = canvas.filter(ImageFilter.GaussianBlur(0.45))
    else:
        # Smoke / out: two rising wisps, cool mute, no gold core.
        d.arc((cx - 16, wick_y - 38, cx + 2, wick_y + 6), 200, 345, fill=rgba(SMOKE, 170), width=3)
        d.arc((cx - 2, wick_y - 58, cx + 18, wick_y - 18), 15, 165, fill=rgba(SMOKE, 125), width=2)
        d.arc((cx - 10, wick_y - 22, cx + 8, wick_y + 2), 190, 350, fill=rgba(mix(SMOKE, MUTE, 0.3), 90), width=2)
        d.ellipse((cx - 3, wick_y + 8, cx + 3, wick_y + 13), fill=rgba(MUTE, 140))
        canvas = canvas.filter(ImageFilter.GaussianBlur(0.40))

    arr = true_clear_corners(grain(np.array(canvas.convert("RGBA")), seed=70 + index, sigma=3.4), pad=3)
    return Image.fromarray(clear_zero_rgb(arr), "RGBA")


def composite_still(kind: str) -> Image.Image:
    """128×128 fallback: body + one overlay, letterboxed from the tall plate."""
    body = paint_body(PLATE)
    if kind == "full":
        overlay = paint_flame_overlay(PLATE, **flame_state_params()["full"])
    elif kind == "hurt":
        overlay = paint_flame_overlay(PLATE, **flame_state_params()["hurt"])
    else:
        overlay = paint_extinguish_frame(2, PLATE)
        smoke = paint_extinguish_frame(3, PLATE)
        overlay = Image.alpha_composite(overlay, smoke)
    plate = Image.alpha_composite(body, overlay)
    # Fit tall plate into the locked 128×128 still slot.
    fitted = plate.resize((STILL, STILL), Image.Resampling.LANCZOS)
    arr = true_clear_corners(grain(np.array(fitted.convert("RGBA")), seed=14 if kind == "full" else 22 if kind == "hurt" else 36, sigma=2.2), pad=4)
    return Image.fromarray(clear_zero_rgb(arr), "RGBA")


# ---------------------------------------------------------------------------
# Foley — original procedural. Not beep, not system click, not scream.
# ---------------------------------------------------------------------------

def db(x: float) -> float:
    return 10 ** (x / 20.0)


def peak_dbfs(x: np.ndarray) -> float:
    peak = float(np.max(np.abs(x))) if x.size else 0.0
    if peak < 1e-12:
        return -120.0
    return 20.0 * math.log10(peak)


def peak_normalize(x: np.ndarray, peak_db: float) -> np.ndarray:
    peak = float(np.max(np.abs(x))) if x.size else 0.0
    if peak < 1e-8:
        return x
    return x * (db(peak_db) / peak)


def write_wav(path: Path, samples: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    samples = np.clip(samples, -1.0, 1.0)
    pcm = (samples * 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())


def one_pole_lp(x: np.ndarray, cutoff: float) -> np.ndarray:
    a = math.exp(-2.0 * math.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    coef = 1.0 - a
    for i, s in enumerate(x):
        acc = coef * s + a * acc
        y[i] = acc
    return y


def one_pole_hp(x: np.ndarray, cutoff: float) -> np.ndarray:
    return x - one_pole_lp(x, cutoff)


def fade(n: int, attack: int, release: int) -> np.ndarray:
    env = np.ones(n, dtype=np.float64)
    if attack > 0:
        env[:attack] = np.linspace(0.0, 1.0, attack)
    if release > 0:
        env[-release:] = np.linspace(1.0, 0.0, release)
    return env


def band_noise(n: int, rng: np.random.Generator, lo: float, hi: float) -> np.ndarray:
    x = rng.normal(0.0, 1.0, n)
    return one_pole_lp(one_pole_hp(x, lo), hi)


def make_card_flip() -> np.ndarray:
    """Short paper flap: two-finger slip + page edge. Not a UI click."""
    rng = np.random.default_rng(20260912)
    n = int(round(0.20 * SR))
    t = np.arange(n) / SR

    rustle = band_noise(n, rng, 1200.0, 7800.0)
    # Rising scrape then a quick cut — paper turning, not a beep.
    slip = np.zeros(n, dtype=np.float64)
    body = int(0.072 * SR)
    slip[:body] = np.hanning(body)
    slip[: int(0.016 * SR)] *= np.linspace(0.25, 1.0, int(0.016 * SR))
    rustle *= slip * 0.62
    rustle += one_pole_lp(band_noise(n, rng, 500.0, 2200.0), 2000.0) * slip * 0.22

    # Second flap a few milliseconds later (the card finishing the flip).
    flap_at = int(0.078 * SR)
    flap_n = int(0.055 * SR)
    flap = band_noise(flap_n, rng, 1800.0, 9000.0) * np.hanning(flap_n)
    rustle[flap_at : flap_at + flap_n] += flap * 0.38

    # Soft felt kiss, not a wood knock.
    kiss_at = int(0.118 * SR)
    kiss_n = int(0.036 * SR)
    kiss = band_noise(kiss_n, rng, 180.0, 1400.0) * np.exp(-np.arange(kiss_n) / SR * 70.0)
    rustle[kiss_at : kiss_at + kiss_n] += kiss * 0.20

    rustle *= fade(n, 8, int(0.028 * SR))
    rustle *= 0.70 + 0.30 * np.sin(2 * math.pi * 9.0 * t)
    rustle = one_pole_hp(rustle, 80.0)
    return peak_normalize(rustle, -11.0)


def make_life_extinguish() -> np.ndarray:
    """Soft snuff: air hush + dying wick, no voice, no scream."""
    rng = np.random.default_rng(20260913)
    n = int(round(0.42 * SR))
    t = np.arange(n) / SR

    # Air hush: band-limited noise that opens then falls away.
    hush = band_noise(n, rng, 220.0, 2400.0)
    env = np.exp(-np.clip(t - 0.018, 0, None) * 7.2)
    env *= fade(n, int(0.012 * SR), int(0.16 * SR))
    env *= 0.55 + 0.45 * np.sin(2 * math.pi * 5.5 * t + 0.3)
    hush *= env * 0.70

    # Brief wick sip (high, tiny, dies immediately).
    sip_n = int(0.055 * SR)
    sip = band_noise(sip_n, rng, 2600.0, 7200.0) * np.exp(-np.arange(sip_n) / SR * 55.0)
    hush[:sip_n] += sip * 0.22

    # Soft low air puff — the snuff, not a hit.
    puff = band_noise(n, rng, 60.0, 420.0) * np.exp(-t * 5.0) * 0.28
    puff *= fade(n, int(0.008 * SR), int(0.18 * SR))

    # Residual thin smoke hiss, late and quiet.
    late = band_noise(n, rng, 400.0, 1600.0) * (0.08 * np.exp(-np.clip(t - 0.12, 0, None) * 4.4))

    y = hush + puff + late
    y = one_pole_hp(y, 40.0)
    y *= fade(n, 10, int(0.10 * SR))
    return peak_normalize(y, -11.0)


def wav_report(path: Path) -> tuple[float, float, int]:
    with wave.open(str(path), "rb") as wf:
        ch = wf.getnchannels()
        rate = wf.getframerate()
        n = wf.getnframes()
        sw = wf.getsampwidth()
        raw = wf.readframes(n)
    if sw != 2:
        raise SystemExit(f"{path.name} sampwidth {sw} != 2")
    pcm = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32767.0
    if ch != 1:
        raise SystemExit(f"{path.name} channels {ch} != 1")
    if rate != SR:
        raise SystemExit(f"{path.name} rate {rate} != {SR}")
    dur = n / rate
    return dur, peak_dbfs(pcm), ch


# ---------------------------------------------------------------------------
# Asserts
# ---------------------------------------------------------------------------

def assert_body_owns_mass(body: Image.Image, flames: list[Image.Image]) -> None:
    body_box = opaque_bbox(body)
    body_a = bbox_area(body_box)
    if body_a < 2200:
        raise SystemExit(f"body bbox too small ({body_box} area={body_a})")
    for i, flame in enumerate(flames):
        fbox = opaque_bbox(flame)
        fa = bbox_area(fbox)
        if fa < 80:
            raise SystemExit(f"flame_{i} bbox empty ({fbox})")
        if fa >= body_a:
            raise SystemExit(f"flame_{i} area {fa} >= body area {body_a}")
        # Flame must sit on the upper plate, not swallow the pillar.
        if fbox[3] > int(body.size[1] * 0.48):
            raise SystemExit(f"flame_{i} hangs too low ({fbox}) — not sitting ON the body")
        print(f"  mass: body {body_a}px > flame_{i} {fa}px  boxes {body_box} / {fbox}")


def assert_extinguish_sequence(frames: list[Image.Image]) -> None:
    if len(frames) < 4:
        raise SystemExit("need ≥4 extinguish frames")
    # Core alpha (skip the faint halo) so shrink / ember / smoke read as shapes.
    boxes = [opaque_bbox(im, alpha_min=48) for im in frames]
    areas = [bbox_area(b) for b in boxes]
    heights = [max(0, b[3] - b[1]) for b in boxes]
    # Shrink → ember must lose height; smoke may rise but cannot match the first flame.
    if heights[1] >= heights[0] * 0.72:
        raise SystemExit(f"extinguish 1 not a shrink of 0 ({heights})")
    if heights[2] >= heights[0] * 0.55:
        raise SystemExit(f"extinguish 2 (ember) not shorter than the starting flame ({heights})")
    # Ember is a bead (wider relative to height); smoke is a tall thin rise.
    w2 = max(1, boxes[2][2] - boxes[2][0])
    w0 = max(1, boxes[0][2] - boxes[0][0])
    if heights[2] > 0 and (w2 / heights[2]) < 0.70:
        raise SystemExit(f"extinguish 2 still reads as a teardrop (box={boxes[2]})")
    if heights[3] <= heights[0]:
        raise SystemExit(f"extinguish 3 (smoke) must rise taller than the snuffed flame ({heights})")
    if w0 > 0 and (boxes[3][2] - boxes[3][0]) >= w0 * 1.8 and heights[3] < 20:
        raise SystemExit(f"extinguish 3 is a blob, not rising smoke ({boxes[3]})")
    masks = [alpha_mask(im) for im in frames]
    for i in range(len(frames)):
        for j in range(i + 1, len(frames)):
            iou = mask_iou(masks[i], masks[j])
            if iou > 0.72:
                raise SystemExit(f"extinguish {i} vs {j} too similar (IoU={iou:.3f})")
            ha = downsample_mask(masks[i])
            hb = downsample_mask(masks[j])
            if np.array_equal(ha, hb):
                raise SystemExit(f"extinguish {i} vs {j} identical 16×20 silhouettes")
    print(f"  extinguish areas {areas}  heights {heights}  pairwise IoU ok")


def assert_state_flames(full: Image.Image, hurt: Image.Image, dying: Image.Image) -> None:
    boxes = {k: opaque_bbox(im, alpha_min=48) for k, im in (("full", full), ("hurt", hurt), ("dying", dying))}
    heights = {k: max(0, b[3] - b[1]) for k, b in boxes.items()}
    if heights["full"] < 20:
        raise SystemExit(f"flame_full too short ({heights})")
    if heights["hurt"] >= heights["full"] * 0.78:
        raise SystemExit(f"flame_hurt not shorter than full ({heights})")
    if heights["dying"] >= heights["hurt"] * 0.78:
        raise SystemExit(f"flame_dying not shorter than hurt ({heights})")
    print(f"  state flames heights full>hurt>dying {heights}")


def assert_loop_alive(frames: list[Image.Image]) -> None:
    masks = [alpha_mask(im) for im in frames]
    # Adjacent frames must move; first and last must not be clones (loop still breathes).
    for i in range(len(frames)):
        j = (i + 1) % len(frames)
        iou = mask_iou(masks[i], masks[j])
        if iou > 0.92:
            raise SystemExit(f"flame loop {i}→{j} frozen (IoU={iou:.3f})")
        if iou < 0.18:
            raise SystemExit(f"flame loop {i}→{j} unrelated stills (IoU={iou:.3f})")
    print("  flame loop: adjacent frames related but not frozen")


def assert_png(path: Path, size: tuple[int, int], min_colors: int, min_bytes: int) -> None:
    im = Image.open(path)
    if im.size != size:
        raise SystemExit(f"{path.name} size {im.size} != {size}")
    if im.mode != "RGBA":
        raise SystemExit(f"{path.name} mode {im.mode} != RGBA")
    if not corner_alpha_zero(path):
        raise SystemExit(f"{path.name} corners are not transparent")
    n = unique_colors(path)
    if n < min_colors:
        raise SystemExit(f"{path.name} still looks like a stub ({n} colors)")
    if path.stat().st_size < min_bytes:
        raise SystemExit(f"{path.name} is still a tiny stub ({path.stat().st_size} bytes)")
    print(f"{path.name:36} {im.size[0]}x{im.size[1]} colors~{n} bytes={path.stat().st_size} corners=clear")


def main() -> None:
    MEDIA.mkdir(parents=True, exist_ok=True)
    SFX.mkdir(parents=True, exist_ok=True)

    body = paint_body(PLATE)
    body_path = MEDIA / "art_life_candle_body.png"
    save_png(body, body_path)

    # Drop the interrupted 14b-pre names so the tree only has locked slots.
    for stale in (
        "art_life_candle_flame_0.png",
        "art_life_candle_flame_1.png",
        "art_life_candle_flame_2.png",
        "art_life_candle_flame_3.png",
    ):
        old = MEDIA / stale
        if old.exists():
            old.unlink()

    state_paths: dict[str, Path] = {}
    for kind, params in flame_state_params().items():
        im = paint_flame_overlay(PLATE, **params)
        path = MEDIA / f"art_life_candle_flame_{kind}.png"
        save_png(im, path)
        state_paths[kind] = path

    loop_paths: list[Path] = []
    for i, params in enumerate(flame_loop_params()):
        im = paint_flame_overlay(PLATE, **params)
        path = MEDIA / f"art_life_candle_flame_full_{i}.png"
        save_png(im, path)
        loop_paths.append(path)

    ext_ims: list[Image.Image] = []
    ext_paths: list[Path] = []
    for i in range(4):
        im = paint_extinguish_frame(i, PLATE)
        path = MEDIA / f"art_life_candle_extinguish_{i}.png"
        save_png(im, path)
        ext_ims.append(im)
        ext_paths.append(path)

    stills = {
        "full": MEDIA / "art_life_candle_full.png",
        "hurt": MEDIA / "art_life_candle_hurt.png",
        "dying": MEDIA / "art_life_candle_dying.png",
    }
    for kind, path in stills.items():
        save_png(composite_still(kind), path)

    print("— png —")
    assert_png(body_path, PLATE, 80, 2_000)
    for path in list(state_paths.values()) + loop_paths + ext_paths:
        assert_png(path, PLATE, 40, 400)
    for path in stills.values():
        assert_png(path, (STILL, STILL), 80, 2_000)

    print("— shape —")
    state_ims = {k: Image.open(p).convert("RGBA") for k, p in state_paths.items()}
    assert_body_owns_mass(Image.open(body_path).convert("RGBA"), list(state_ims.values()) + [Image.open(p).convert("RGBA") for p in loop_paths])
    assert_state_flames(state_ims["full"], state_ims["hurt"], state_ims["dying"])
    assert_loop_alive([Image.open(p).convert("RGBA") for p in loop_paths])
    assert_extinguish_sequence([Image.open(p).convert("RGBA") for p in ext_paths])

    print("— sfx —")
    jobs = (
        (SFX / "sfx_card_flip.wav", make_card_flip, 0.25, 0.12, 0.25, (-12.4, -9.6)),
        (SFX / "sfx_life_extinguish.wav", make_life_extinguish, 0.60, 0.25, 0.60, (-12.4, -9.6)),
    )
    for path, fn, max_s, min_s, _hi, peak_win in jobs:
        write_wav(path, fn())
        dur, pk, ch = wav_report(path)
        print(f"{path.name:36} {ch}ch {dur:.3f}s  peak {pk:.2f} dBFS  48k mono")
        if dur > max_s + 1e-3 or dur < min_s - 1e-3:
            raise SystemExit(f"{path.name} duration {dur:.3f}s not in [{min_s},{max_s}]")
        if not (peak_win[0] <= pk <= peak_win[1]):
            raise SystemExit(f"{path.name} peak {pk:.2f} outside {peak_win}")

    print("life-candle polish written (body > flame; flame_full/hurt/dying bind; optional full_0..3; extinguish; two Foley wavs)")


if __name__ == "__main__":
    main()
