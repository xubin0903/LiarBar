#!/usr/bin/env python3
"""桌槌 P0 assets (PM REJECT after #248): art_fx_mallet + SFX · table-prop scale.

PM REJECT (#248 / 一眼木槌合入后仍失败 终验):
  - Mallet was THUMBNAIL-sized / invisible in-game (缩略不可见)
  - Must enlarge to TABLE-PROP scale (桌面道具级主读) — NOT icon/dot
  - Raise/smash frames still instantly readable wooden mallet:
      cylindrical head + tapered handle + wood grain + brass bands
  - Clear RAISE (_up) and SMASH (_hit) frames
  - REST (_mallet.png) for believe = static only, no animation
  - Keep SFX unless tiny; hit can stay heavy (~−6 dBFS)
      peak ~−5..−7 dBFS, 100–140ms, 48k mono, lead silence 0
  - Soft/near-silent rest optional; believe has NO anim
  - Safe inset ≤8% (was ≥20%); canvas 512² preferred; fill ~85% silhouette
  - S19-7 hammer-on-cards is LAYOUT not art (this ticket = art/SFX only)

Call ids (Aron A / design):
  lb_sfx_hammer_hit  — Challenge raise→smash wood knock
  lb_sfx_hammer_rest — Believe rest settle (soft optional; no anim)

Art slots:
  art_fx_mallet.png      — REST / believe (lying; static)
  art_fx_mallet_up.png   — RAISE (head up)
  art_fx_mallet_hit.png  — SMASH (head down + impact)

Canvas 512²; safe inset ≤8%; mallet silhouette ~85% fill. Zero .ets. Seeds fixed.
"""

from __future__ import annotations

import hashlib
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
    BRASS,
    CANDLE,
    PAPER,
    SHADOW,
    mix,
    rgba,
    save_png,
)

MEDIA = ROOT / "entry/src/main/resources/base/media"
SFX_DIR = ROOT / "entry/src/main/resources/rawfile/audio/sfx"

OUT_REST = MEDIA / "art_fx_mallet.png"
OUT_UP = MEDIA / "art_fx_mallet_up.png"
OUT_HIT = MEDIA / "art_fx_mallet_hit.png"
OUT_HIT_WAV = SFX_DIR / "sfx_hammer_hit.wav"
OUT_REST_WAV = SFX_DIR / "sfx_hammer_rest.wav"

FROZEN = (
    SFX_DIR / "sfx_card_flip.wav",
    SFX_DIR / "sfx_life_extinguish.wav",
    SFX_DIR / "sfx_play_launch.wav",
    SFX_DIR / "sfx_play_land.wav",
    SFX_DIR / "sfx_challenge_enter.wav",
    SFX_DIR / "sfx_challenge_commit.wav",
    SFX_DIR / "sfx_reveal_draw.wav",
    SFX_DIR / "sfx_reveal_flip.wav",
)

SIZE = 512  # table-prop canvas (was 360); fill ~85% silhouette
SAFE_INSET_MAX = 0.08  # ≤8% edges (was ≥20%) — 缩略不可见 → 桌面道具级
SAFE_INSET_MIN = 0.015  # tiny pad so rotate/impact rays do not clip
SR = 48000
# Heavier hit: 100–140ms, peak ~−5..−7 dBFS
HIT_DUR_S = 0.125
REST_DUR_S = 0.048
HIT_PEAK_DB = -6.0
REST_PEAK_DB = -15.0
LEAD_THRESH_DB = -40.0

# Warm tavern wood + brass / iron bands (NOT court-toy spoon palette)
WOOD = (0x8F, 0x58, 0x2E)
WOOD_DK = (0x52, 0x2C, 0x14)
WOOD_LT = (0xC0, 0x86, 0x4E)
WOOD_MID = (0xA0, 0x66, 0x38)
WOOD_CORE = (0x7A, 0x48, 0x26)
BRASS_DK = (0x7A, 0x5E, 0x32)
IRON = (0x6A, 0x5A, 0x48)
HANDLE = (0x6A, 0x3E, 0x22)
HANDLE_LT = (0x98, 0x64, 0x3A)
HANDLE_TIP = (0x5A, 0x34, 0x1C)
GRAIN = (0x42, 0x22, 0x10)

# New seeds so rebuild differs from rejected #248 thumbnail bytes
SEED_ART = 202609211
SEED_HIT = 202609192  # keep hit Foley character (~−6 dBFS) unless tiny
SEED_REST = 202609193


def db(x: float) -> float:
    return 10 ** (x / 20.0)


def peak_normalize(x: np.ndarray, peak_db: float) -> np.ndarray:
    peak = float(np.max(np.abs(x))) if x.size else 0.0
    if peak < 1e-8:
        return x
    return x * (db(peak_db) / peak)


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


def band_noise(n: int, rng: np.random.Generator, lo: float, hi: float) -> np.ndarray:
    warm = 2048
    x = rng.normal(0.0, 1.0, n + warm)
    x = one_pole_lp(one_pole_hp(x, lo), hi)
    return x[warm:]


def exp_from_zero(n: int, decay: float) -> np.ndarray:
    t = np.arange(n, dtype=np.float64) / SR
    return np.exp(-t * decay)


def tail_fade(n: int, release: int) -> np.ndarray:
    env = np.ones(n, dtype=np.float64)
    if release > 0:
        env[-release:] = np.linspace(1.0, 0.0, release)
    return env


def apply_hp_warm(y: np.ndarray, cutoff: float) -> np.ndarray:
    pad = 256
    warm = np.concatenate([y[:pad][::-1], y])
    return one_pole_hp(warm, cutoff)[pad:]


def apply_lp_warm(y: np.ndarray, cutoff: float) -> np.ndarray:
    pad = 256
    warm = np.concatenate([y[:pad][::-1], y])
    return one_pole_lp(warm, cutoff)[pad:]


def clear_zero_rgb(arr: np.ndarray) -> np.ndarray:
    empty = arr[..., 3] == 0
    arr[..., :3][empty] = 0
    return arr


def _draw_cylinder_head(
    ld: ImageDraw.ImageDraw,
    hcx: int,
    hcy: int,
    head_len: int,
    head_rad: int,
    impact: bool,
) -> tuple[int, int, int, int]:
    """Side-view wooden cylinder head (axis ⊥ handle, along Y).

    Barrel / drum mallet head — warm tavern wood + metal bands.
    Instantly readable as MALLET, not spoon bowl or court toy.
    """
    x0 = hcx - head_len // 2
    x1 = hcx + head_len // 2
    y0 = hcy - head_rad
    y1 = hcy + head_rad
    r_edge = max(12, head_rad // 2)  # rounded barrel silhouette

    # Soft under-shadow
    ld.ellipse(
        (x0 + 2, y1 - 4, x1 + 6, y1 + max(10, head_rad // 4)),
        fill=rgba(SHADOW, 80),
    )

    # Main barrel body — solid rounded rect first (smooth silhouette)
    ld.rounded_rectangle(
        (x0, y0, x1, y1),
        radius=r_edge,
        fill=rgba(WOOD, 255),
    )
    # Mid lighter band (cylinder equator lit)
    mid_h = max(8, head_rad // 2)
    ld.rounded_rectangle(
        (x0 + 3, hcy - mid_h, x1 - 3, hcy + mid_h),
        radius=max(6, mid_h // 2),
        fill=rgba(mix(WOOD, WOOD_LT, 0.4), 255),
    )
    # Top highlight arc strip
    ld.arc(
        (x0 + 6, y0 + 2, x1 - 6, hcy + 6),
        200,
        340,
        fill=rgba(mix(WOOD_LT, CANDLE, 0.45), 200),
        width=3,
    )
    # Bottom shade
    ld.arc(
        (x0 + 6, hcy - 6, x1 - 6, y1 - 2),
        20,
        160,
        fill=rgba(WOOD_DK, 140),
        width=3,
    )

    # Elliptical end-caps (cylinder faces)
    cap_rx = max(8, head_len // 6)
    # Left heel
    ld.ellipse(
        (x0 - cap_rx // 2, y0 + 3, x0 + cap_rx, y1 - 3),
        fill=rgba(mix(WOOD_DK, WOOD, 0.35), 255),
    )
    # Right striking face with tree-ring grain (classic mallet end)
    ld.ellipse(
        (x1 - cap_rx, y0 + 3, x1 + cap_rx // 2, y1 - 3),
        fill=rgba(mix(WOOD_CORE, WOOD_DK, 0.3), 255),
    )
    for rr in (0.35, 0.55, 0.75):
        rx = max(3, int(cap_rx * rr * 0.85))
        ry = max(4, int(head_rad * rr * 0.9))
        ld.ellipse(
            (x1 - rx - 1, hcy - ry, x1 + int(rx * 0.4), hcy + ry),
            outline=rgba(GRAIN, 130),
            width=1,
        )
    # Face lit glint
    ld.ellipse(
        (x1 - 5, hcy - head_rad // 4, x1 + 1, hcy + 1),
        fill=rgba(mix(WOOD_LT, CANDLE, 0.3), 110),
    )

    # Wood grain arcs wrapping barrel (curved = cylinder, not flat board)
    for gy_off in (-head_rad * 2 // 5, -head_rad // 8, head_rad // 5, head_rad * 2 // 5):
        gy = hcy + int(gy_off)
        if gy <= y0 + 6 or gy >= y1 - 6:
            continue
        ld.arc(
            (x0 + 8, gy - 16, x1 - 8, gy + 16),
            205,
            335,
            fill=rgba(GRAIN, 95),
            width=1,
        )

    # Metal bands — bright brass, near both ends (readable at thumbnail)
    bw = max(5, head_len // 10)
    for ox in (x0 + 5, x1 - 5 - bw):
        ld.rectangle((ox, y0 + 2, ox + bw, y1 - 2), fill=rgba(mix(BRASS, CANDLE, 0.15), 255))
        ld.line(
            [(ox, y0 + 3), (ox + bw, y0 + 3)],
            fill=rgba(mix(BRASS, CANDLE, 0.55), 230),
            width=1,
        )
        ld.line(
            [(ox, y1 - 3), (ox + bw, y1 - 3)],
            fill=rgba(mix(IRON, BRASS_DK, 0.4), 200),
            width=1,
        )
        # rivets
        for ry in (hcy - head_rad // 3, hcy, hcy + head_rad // 3):
            ld.ellipse(
                (ox + bw // 2 - 2, ry - 2, ox + bw // 2 + 2, ry + 2),
                fill=rgba(mix(BRASS, CANDLE, 0.3), 220),
            )

    # Dark outline to lock silhouette (thicker at table-prop scale)
    ld.rounded_rectangle(
        (x0, y0, x1, y1),
        radius=r_edge,
        outline=rgba(mix(WOOD_DK, GRAIN, 0.4), 220),
        width=3,
    )

    face_x = x1 + cap_rx // 2
    if impact:
        for i, ang in enumerate((-42, -20, 0, 20, 42, -58, 58)):
            rad = math.radians(ang)
            L = 14 + (i % 3) * 4
            x_b = face_x + int(L * math.cos(rad))
            y_b = hcy + int(L * math.sin(rad))
            ld.line(
                [(face_x - 2, hcy), (x_b, y_b)],
                fill=rgba(mix(CANDLE, PAPER, 0.3), 155 - i * 12),
                width=2 + (1 if i < 3 else 0),
            )
        for dx, dy, rr in ((12, 10, 5), (18, -6, 4), (10, 14, 4), (20, 2, 3)):
            ld.ellipse(
                (face_x + dx - rr, hcy + dy - rr // 2, face_x + dx + rr, hcy + dy + rr // 2),
                fill=rgba(mix(PAPER, BRASS, 0.1), 45),
            )

    pad = 6
    return (
        x0 - cap_rx // 2 - pad,
        y0 - pad,
        face_x + (22 if impact else cap_rx // 2) + pad,
        y1 + pad,
    )


def _draw_tapered_handle(
    ld: ImageDraw.ImageDraw,
    hx0: int,
    hx1: int,
    cy: int,
    hw0: int,
    hw1: int,
) -> None:
    """Smooth tapered wooden shaft: thin free end → thicker at neck. No stepped toy look."""
    # Trapezoid body (smooth edges) + slight mid bulge for round-shaft read
    top = [(hx0, cy - hw0), (hx1, cy - hw1)]
    bot = [(hx1, cy + hw1), (hx0, cy + hw0)]
    ld.polygon(top + bot, fill=rgba(HANDLE, 255))
    # Soft mid-tone inset for round shaft shading
    inset_t = max(2, hw0 // 3)
    inset_b = max(2, hw1 // 3)
    ld.polygon(
        [
            (hx0 + 2, cy - hw0 + inset_t),
            (hx1 - 2, cy - hw1 + inset_b),
            (hx1 - 2, cy + hw1 - inset_b),
            (hx0 + 2, cy + hw0 - inset_t),
        ],
        fill=rgba(mix(HANDLE, HANDLE_LT, 0.35), 255),
    )
    # Top highlight ribbon (smooth, not stepped)
    ld.line(
        [(hx0 + 3, cy - max(2, hw0 - 2)), (hx1 - 3, cy - max(3, hw1 - 3))],
        fill=rgba(mix(HANDLE_LT, CANDLE, 0.4), 200),
        width=2,
    )
    # Bottom shadow ribbon
    ld.line(
        [(hx0 + 3, cy + max(2, hw0 - 2)), (hx1 - 3, cy + max(3, hw1 - 3))],
        fill=rgba(HANDLE_TIP, 180),
        width=2,
    )
    # Sparse wood grain (diagonal ticks, not rings that look toy-segmented)
    hl = hx1 - hx0
    for gx in range(hx0 + 14, hx1 - 12, 14):
        t = (gx - hx0) / max(1, hl)
        hw = int(hw0 + (hw1 - hw0) * t)
        ld.line(
            [(gx, cy - hw + 3), (gx + 2, cy + hw - 3)],
            fill=rgba(GRAIN, 80),
            width=1,
        )

    # Rounded free-end pommel
    pom = max(hw0 + 2, 6)
    ld.ellipse(
        (hx0 - pom, cy - pom, hx0 + pom, cy + pom),
        fill=rgba(mix(HANDLE_TIP, HANDLE, 0.25), 255),
    )
    ld.ellipse(
        (hx0 - pom + 2, cy - pom + 1, hx0 + 1, cy - 1),
        fill=rgba(mix(HANDLE_LT, CANDLE, 0.25), 120),
    )

    # Brass ferrule at neck
    fx0 = hx1 - max(12, hw1 + 2)
    fy0 = cy - hw1 - 4
    fx1 = hx1 + 3
    fy1 = cy + hw1 + 4
    ld.rounded_rectangle(
        (fx0, fy0, fx1, fy1),
        radius=3,
        fill=rgba(mix(BRASS, BRASS_DK, 0.2), 255),
    )
    ld.line(
        [(fx0 + 2, fy0 + 2), (fx1 - 2, fy0 + 2)],
        fill=rgba(mix(BRASS, CANDLE, 0.5), 220),
        width=1,
    )
    ld.line(
        [(fx0 + 2, fy1 - 2), (fx1 - 2, fy1 - 2)],
        fill=rgba(BRASS_DK, 180),
        width=1,
    )


def _draw_local_mallet(
    ld: ImageDraw.ImageDraw, cx: int, cy: int, sc: float, impact: bool
) -> tuple[int, int, int, int]:
    """Draw tavern wooden MALLET in local space: handle +X, cylindrical head at +X.

    Instantly readable: cylindrical barrel head + tapered handle + metal bands.
    NOT toy/court spoon, NOT abstract blob.
    """
    # --- Handle (tapered) ---
    hl = int(118 * sc)
    hw0 = int(8 * sc)   # free end (thin)
    hw1 = int(14 * sc)  # near head (thicker — sturdy mallet, not spoon stem)
    hx0 = cx - int(64 * sc)
    hx1 = hx0 + hl

    # --- Cylindrical head ---
    # Along handle (X): short barrel length; perpendicular (Y): cylinder radius*2
    head_len = int(62 * sc)   # barrel length along handle
    head_rad = int(42 * sc)   # cylinder radius → tall round head (instant T read)
    hcx = hx1 + head_len // 2 - int(5 * sc)
    hcy = cy

    _draw_tapered_handle(ld, hx0, hx1, cy, hw0, hw1)
    aabb = _draw_cylinder_head(ld, hcx, hcy, head_len, head_rad, impact)

    # Expand AABB to include handle tip
    pad = 6
    return (
        min(aabb[0], hx0 - hw0 - pad),
        min(aabb[1], cy - hw1 - pad),
        aabb[2],
        max(aabb[3], cy + hw1 + pad),
    )


def draw_mallet(
    angle_deg: float,
    *,
    impact: bool = False,
    motion_blur: bool = False,
    seed: int = SEED_ART,
    scale: float = 2.0,
) -> Image.Image:
    """Draw wooden tavern mallet at angle (0=head right, -90=head up).

    Table-prop scale: silhouette fills ~85% of canvas; safe inset ≤8%.
    """
    s = SIZE
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    cx, cy = s // 2, s // 2
    rng = np.random.default_rng(seed + int(angle_deg * 10) + (7 if impact else 0))

    if abs(angle_deg) < 30 or impact:
        shadow_r = int(36 if impact else 28)
        sx = cx + int(52 * math.cos(math.radians(angle_deg)) * scale)
        sy = cy + int(52 * math.sin(math.radians(angle_deg)) * scale) + (6 if impact else 14)
        d.ellipse(
            (sx - shadow_r, sy - shadow_r // 2, sx + shadow_r, sy + shadow_r // 2),
            fill=rgba(SHADOW, 70 if impact else 55),
        )

    local = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ld = ImageDraw.Draw(local)
    _draw_local_mallet(ld, cx, cy, scale, impact)

    # Center opaque silhouette on canvas before rotate (table-prop fill, not off-side icon)
    la = np.array(local)
    ys, xs = np.where(la[..., 3] > 12)
    if ys.size:
        bc = ((int(xs.min()) + int(xs.max())) // 2, (int(ys.min()) + int(ys.max())) // 2)
        dx, dy = cx - bc[0], cy - bc[1]
        if dx or dy:
            shifted = Image.new("RGBA", (s, s), (0, 0, 0, 0))
            shifted.paste(local, (dx, dy), local)
            local = shifted

    rotated = local.rotate(-angle_deg, resample=Image.Resampling.BICUBIC, center=(cx, cy))
    canvas = Image.alpha_composite(canvas, rotated)

    if motion_blur:
        blur = canvas.filter(ImageFilter.GaussianBlur(0.85))
        canvas = Image.blend(canvas, blur, 0.26)
        arr = np.array(canvas)
        a = arr[..., 3:4].astype(np.float32) / 255.0
        arr[..., :3] = (arr[..., :3].astype(np.float32) * a).astype(np.uint8)
        canvas = Image.fromarray(arr, "RGBA")

    arr = np.array(canvas.convert("RGBA"))
    body = arr[..., 3] > 12
    noise = rng.normal(0.0, 2.2, arr[..., :3].shape)
    arr[..., :3] = np.clip(
        arr[..., :3].astype(np.float32) + noise * body[..., None], 0, 255
    ).astype(np.uint8)
    arr = clear_zero_rgb(arr)
    pad = max(4, int(SIZE * 0.01))  # ~1% hard clear pad
    arr[:pad, :, 3] = 0
    arr[-pad:, :, 3] = 0
    arr[:, :pad, 3] = 0
    arr[:, -pad:, 3] = 0
    arr = clear_zero_rgb(arr)
    return Image.fromarray(arr, "RGBA")


def assert_table_prop_scale(
    im: Image.Image, label: str
) -> tuple[float, float, float, float, float]:
    """Opaque bbox: long-axis fill ~85%; tight insets ≤ SAFE_INSET_MAX; no clip.

    PM REJECT: 缩略不可见 → 桌面道具级主读 (not icon/dot).
    Returns (L, T, R, B insets, long_axis_fill_frac).
    """
    a = np.array(im.convert("RGBA"))[..., 3]
    ys, xs = np.where(a > 20)
    if ys.size == 0:
        raise SystemExit(f"{label}: empty art")
    l, t, r, b = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    s = SIZE
    insets = (l / s, t / s, (s - r) / s, (s - b) / s)
    bw, bh = (r - l) / s, (b - t) / s
    long_fill = max(bw, bh)
    tight = min(insets)
    # Must not clip past min pad
    if tight < SAFE_INSET_MIN - 1e-6:
        raise SystemExit(
            f"{label}: clipped LTRB={[round(x, 3) for x in insets]} need ≥{SAFE_INSET_MIN}"
        )
    # Long axis must reach table-prop: fill ≥ 1 - 2*SAFE_INSET_MAX (=84%)
    min_long = 1.0 - 2.0 * SAFE_INSET_MAX
    if long_fill + 1e-4 < min_long:
        raise SystemExit(
            f"{label}: too small (thumbnail) long_fill={long_fill:.3f} need ≥{min_long:.3f} "
            f"LTRB={[round(x, 3) for x in insets]}"
        )
    # At least one pair of opposite margins must be ≤ SAFE_INSET_MAX (prop fills canvas)
    pair_ok = (insets[0] + insets[2] <= 2 * SAFE_INSET_MAX + 1e-3) or (
        insets[1] + insets[3] <= 2 * SAFE_INSET_MAX + 1e-3
    )
    if not pair_ok:
        raise SystemExit(
            f"{label}: inset pair too large (still icon-scale) LTRB="
            f"{[round(x, 3) for x in insets]} need opposite sum ≤{2*SAFE_INSET_MAX}"
        )
    return (*insets, long_fill)


def make_hammer_hit() -> np.ndarray:
    """Heavier wood table knock: deep body + hard face. 100–140ms, ~−5..−7 dBFS."""
    rng = np.random.default_rng(SEED_HIT)
    n = int(round(HIT_DUR_S * SR))
    # Deep wood / table body (heavier)
    body = band_noise(n, rng, 45.0, 320.0) * exp_from_zero(n, 24.0) * 1.55
    # Mid wood knock
    knock = band_noise(n, rng, 220.0, 1000.0) * exp_from_zero(n, 42.0) * 1.25
    # Hard face crack
    crack = band_noise(n, rng, 1100.0, 3200.0) * exp_from_zero(n, 88.0) * 0.85
    # Felt / room bloom
    felt = band_noise(n, rng, 30.0, 140.0) * exp_from_zero(n, 16.0) * 0.55
    # Immediate attack — no head silence
    click_n = min(72, n)
    click = band_noise(click_n, rng, 600.0, 2800.0) * exp_from_zero(click_n, 150.0) * 1.15
    y = body + knock + crack + felt
    y[:click_n] += click
    if abs(y[0]) < 1e-4:
        y[0] = 0.22 if (y[1] if n > 1 else 0.0) >= 0 else -0.22
    y = apply_hp_warm(y, 28.0)
    y = apply_lp_warm(y, 4600.0)
    y *= tail_fade(n, int(0.016 * SR))
    return peak_normalize(y, HIT_PEAK_DB)


def make_hammer_rest() -> np.ndarray:
    """Soft / near-silent settle for rest (believe = no anim). ~40–60ms."""
    rng = np.random.default_rng(SEED_REST)
    n = int(round(REST_DUR_S * SR))
    # Broadband soft wood settle — keep peak-bin low (no tonal tip)
    set_down = band_noise(n, rng, 70.0, 900.0) * exp_from_zero(n, 58.0) * 0.90
    brush = band_noise(n, rng, 30.0, 320.0) * exp_from_zero(n, 36.0) * 0.60
    air = band_noise(n, rng, 500.0, 2800.0) * exp_from_zero(n, 100.0) * 0.35
    grit = band_noise(n, rng, 200.0, 1600.0) * exp_from_zero(n, 72.0) * 0.40
    y = set_down + brush + air + grit
    click_n = min(36, n)
    y[:click_n] += band_noise(click_n, rng, 400.0, 2600.0) * exp_from_zero(click_n, 180.0) * 0.40
    if abs(y[0]) < 1e-4:
        y[0] = 0.07 if (y[1] if n > 1 else 0.0) >= 0 else -0.07
    y = apply_hp_warm(y, 48.0)
    y = apply_lp_warm(y, 3800.0)
    y *= tail_fade(n, int(0.009 * SR))
    return peak_normalize(y, REST_PEAK_DB)


def write_wav(path: Path, samples: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    samples = np.clip(samples, -1.0, 1.0)
    pcm = (samples * 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())


def band_pct(freqs: np.ndarray, energy: np.ndarray, lo: float, hi: float) -> float:
    tot = float(energy.sum())
    if tot <= 0:
        return 0.0
    mask = (freqs >= lo) & (freqs < hi)
    return 100.0 * float(energy[mask].sum()) / tot


def peak_bin_pct(energy: np.ndarray) -> float:
    tot = float(energy.sum())
    if tot <= 0:
        return 0.0
    return 100.0 * float(np.max(energy)) / tot


def measure(path: Path) -> dict:
    with wave.open(str(path), "rb") as wf:
        ch = wf.getnchannels()
        sw = wf.getsampwidth()
        sr = wf.getframerate()
        n = wf.getnframes()
        raw = wf.readframes(n)
        comptype = wf.getcomptype()
    pcm = np.frombuffer(raw, dtype="<i2").astype(np.float64)
    if ch != 1:
        raise SystemExit(f"{path.name} must be mono, got {ch}ch")
    peak = float(np.max(np.abs(pcm))) if pcm.size else 0.0
    pk = -120.0 if peak < 1e-12 else 20.0 * math.log10(peak / 32767.0)
    thresh = 32767.0 * db(LEAD_THRESH_DB)
    lead = 0
    for s in pcm:
        if abs(s) > thresh:
            break
        lead += 1
    zlead = 0
    for s in pcm:
        if s != 0:
            break
        zlead += 1
    first = float(pcm[0]) if pcm.size else 0.0
    first_db = -120.0 if abs(first) < 1e-12 else 20.0 * math.log10(abs(first) / 32767.0)
    mag = np.abs(np.fft.rfft(pcm))
    freqs = np.fft.rfftfreq(pcm.size, 1.0 / sr)
    energy = mag ** 2
    centroid = float(np.sum(freqs * mag) / np.sum(mag)) if mag.sum() > 0 else 0.0
    return {
        "path": str(path),
        "name": path.name,
        "duration_ms": 1000.0 * n / sr,
        "sample_rate": sr,
        "channels": ch,
        "sample_fmt": f"pcm{sw * 8}",
        "comptype": comptype,
        "peak_dbfs": pk,
        "leading_silence_m40_ms": 1000.0 * lead / sr,
        "leading_silence_m40_samples": lead,
        "zero_lead_ms": 1000.0 * zlead / sr,
        "zero_lead_samples": zlead,
        "first_sample_dbfs": first_db,
        "spectral_centroid_hz": centroid,
        "peak_bin_pct": peak_bin_pct(energy),
        "band_lt200": band_pct(freqs, energy, 0.0, 200.0),
        "band_200_800": band_pct(freqs, energy, 200.0, 800.0),
        "band_800_2500": band_pct(freqs, energy, 800.0, 2500.0),
        "band_2500_8000": band_pct(freqs, energy, 2500.0, 8000.0),
        "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def gate_common(m: dict, label: str, peak_lo: float = -7.5, peak_hi: float = -4.5) -> None:
    if m["sample_rate"] != 48000 or m["channels"] != 1 or m["sample_fmt"] != "pcm16":
        raise SystemExit(f"format {m['sample_rate']}/{m['channels']}/{m['sample_fmt']}")
    pk = float(m["peak_dbfs"])
    lead = float(m["leading_silence_m40_ms"])
    if not (peak_lo <= pk <= peak_hi):
        raise SystemExit(f"{label} peak {pk:.2f} dBFS outside {peak_lo}..{peak_hi}")
    if lead >= 5.0:
        raise SystemExit(f"{label} leading silence {lead:.3f}ms >= 5ms")
    if float(m["zero_lead_ms"]) >= 1.0:
        raise SystemExit(f"{label} zero-sample head {m['zero_lead_ms']}ms too long")
    if float(m["peak_bin_pct"]) > 6.0:
        raise SystemExit(f"{label} peak bin {m['peak_bin_pct']:.2f}% too tonal (sine/beep)")


def gate_hit(m: dict) -> None:
    # Heavier: −7.5..−4.5 dBFS (target ~−5..−7), 100–140ms
    gate_common(m, "hit", peak_lo=-7.5, peak_hi=-4.5)
    dur = float(m["duration_ms"])
    if dur < 100.0 - 0.05 or dur > 140.0 + 0.05:
        raise SystemExit(f"hit duration {dur:.2f}ms not in 100–140")
    if float(m["band_200_800"]) < 15.0:
        raise SystemExit("hit missing wood mid body")


def gate_rest(m: dict) -> None:
    gate_common(m, "rest", peak_lo=-18.0, peak_hi=-12.0)
    dur = float(m["duration_ms"])
    if dur < 35.0 - 0.05 or dur > 75.0 + 0.05:
        raise SystemExit(f"rest duration {dur:.2f}ms not in 35–75")
    if dur >= HIT_DUR_S * 1000.0:
        raise SystemExit("rest must be shorter than hit")


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def assert_frozen_untouched(before: dict[Path, str]) -> None:
    for path, old in before.items():
        now = sha256_file(path)
        if now != old:
            raise SystemExit(f"refusing: {path.name} changed ({old[:8]} → {now[:8]})")


def assert_art_distinct(rest: Image.Image, up: Image.Image, hit: Image.Image) -> None:
    """Ban same-pose-recolor: poses must differ in pixel layout, not just hue."""
    a = np.array(rest.convert("RGBA"))
    b = np.array(up.convert("RGBA"))
    c = np.array(hit.convert("RGBA"))
    am = (a[..., 3] > 20).astype(np.float32)
    bm = (b[..., 3] > 20).astype(np.float32)
    cm = (c[..., 3] > 20).astype(np.float32)
    diff_ru = float(np.mean(np.abs(am - bm)))
    diff_rh = float(np.mean(np.abs(am - cm)))
    diff_uh = float(np.mean(np.abs(bm - cm)))
    if diff_ru < 0.04 or diff_rh < 0.04:
        raise SystemExit(
            f"art poses too similar (alpha mask): rest/up={diff_ru:.4f} rest/hit={diff_rh:.4f}"
        )
    print(
        f"  art pose distinct: rest/up alpha-diff={diff_ru:.3f} "
        f"rest/hit={diff_rh:.3f} up/hit={diff_uh:.3f}"
    )


def print_metrics(label: str, call_id: str, m: dict) -> None:
    print(f"{label}: {Path(str(m['path'])).relative_to(ROOT)}")
    print(f"  call id                  {call_id}")
    print(f"  duration_ms              {m['duration_ms']:.2f}")
    print(f"  sample_rate / channels   {m['sample_rate']} / {m['channels']}")
    print(f"  sample_fmt               {m['sample_fmt']} ({m['comptype']})")
    print(
        f"  leading silence <-40dB   {m['leading_silence_m40_ms']:.3f} ms "
        f"({m['leading_silence_m40_samples']} samples)"
    )
    print(
        f"  zero-sample head         {m['zero_lead_ms']:.3f} ms "
        f"({m['zero_lead_samples']} samples)"
    )
    print(f"  first sample             {m['first_sample_dbfs']:.1f} dBFS")
    print(f"  peak dBFS                {m['peak_dbfs']:.2f}")
    print(f"  spectral centroid        {m['spectral_centroid_hz']:.0f} Hz")
    print(f"  peak-bin energy          {float(m['peak_bin_pct']):.2f}%")
    print(
        f"  bands % <200/200-800/0.8-2.5k/2.5-8k  "
        f"{m['band_lt200']:.1f} / {m['band_200_800']:.1f} / "
        f"{m['band_800_2500']:.1f} / {m['band_2500_8000']:.1f}"
    )
    print(f"  bytes                    {m['bytes']}")
    print(f"  sha256                   {m['sha256']}")


def main() -> None:
    frozen_before = {p: sha256_file(p) for p in FROZEN if p.exists()}

    # Scale so all poses fill ~85% (safe inset ≤8%) — table-prop, not thumbnail
    SC = 2.36

    # REST / believe: lying on side, head right — NO animation
    rest = draw_mallet(4.0, impact=False, motion_blur=False, seed=SEED_ART, scale=SC)
    # RAISE: head up, about to strike
    up = draw_mallet(-80.0, impact=False, motion_blur=True, seed=SEED_ART + 1, scale=SC)
    # SMASH: head down + impact marks
    hit = draw_mallet(70.0, impact=True, motion_blur=False, seed=SEED_ART + 2, scale=SC)

    assert_art_distinct(rest, up, hit)
    rest_tp = assert_table_prop_scale(rest, "rest")
    up_tp = assert_table_prop_scale(up, "up")
    hit_tp = assert_table_prop_scale(hit, "hit")
    print(
        f"  table-prop inset≤{SAFE_INSET_MAX:.0%} fill≥{1-2*SAFE_INSET_MAX:.0%}: "
        f"rest LTRB={[round(x, 3) for x in rest_tp[:4]]} long={rest_tp[4]:.1%} "
        f"up LTRB={[round(x, 3) for x in up_tp[:4]]} long={up_tp[4]:.1%} "
        f"hit LTRB={[round(x, 3) for x in hit_tp[:4]]} long={hit_tp[4]:.1%}"
    )

    MEDIA.mkdir(parents=True, exist_ok=True)
    save_png(rest, OUT_REST)
    save_png(up, OUT_UP)
    save_png(hit, OUT_HIT)

    for p, im in ((OUT_REST, rest), (OUT_UP, up), (OUT_HIT, hit)):
        print(f"art: {p.relative_to(ROOT)} size={im.size} sha256={sha256_file(p)}")

    write_wav(OUT_HIT_WAV, make_hammer_hit())
    write_wav(OUT_REST_WAV, make_hammer_rest())

    hit_m = measure(OUT_HIT_WAV)
    rest_m = measure(OUT_REST_WAV)
    gate_hit(hit_m)
    gate_rest(rest_m)

    if float(hit_m["duration_ms"]) <= float(rest_m["duration_ms"]):
        raise SystemExit("hit must be longer than rest")
    if float(hit_m["peak_dbfs"]) <= float(rest_m["peak_dbfs"]):
        raise SystemExit("hit must be louder (higher peak) than rest")

    assert_frozen_untouched(frozen_before)

    print_metrics("hammer-hit", "lb_sfx_hammer_hit", hit_m)
    print_metrics("hammer-rest", "lb_sfx_hammer_rest", rest_m)
    print("frozen slots not written: flip / extinguish / launch / land / challenge / reveal")
    for path, digest in frozen_before.items():
        print(f"  {path.name} sha256 {digest}")
    print("zero .ets · PM REJECT 缩略不可见→桌面道具级 · seed art=202609211 hit/rest Foley kept")
    print(f"SIZE={SIZE} SAFE_INSET_MAX={SAFE_INSET_MAX} SC={SC} HIT_PEAK_DB={HIT_PEAK_DB} HIT_DUR_S={HIT_DUR_S}")


if __name__ == "__main__":
    main()
