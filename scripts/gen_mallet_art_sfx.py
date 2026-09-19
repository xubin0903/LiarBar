#!/usr/bin/env python3
"""桌槌 P0 assets (PM reject redo): art_fx_mallet frames + sfx_hammer_hit/rest.

PM REJECT (#238 on develop):
  - Mallet overlaps hand cards / silhouette unreadable as a mallet
  - Must redo: instantly recognizable wooden mallet; clear RAISE + SMASH frames
  - Heavier wood-knock SFX
  - Believe = rest pose ONLY (no animation)

Call ids (Aron A / design #236):
  lb_sfx_hammer_hit  — Challenge raise→smash wood knock (~100–140ms, heavier)
  lb_sfx_hammer_rest — Believe rest settle (soft optional place; no anim)

Art slots:
  art_fx_mallet.png      — REST / believe (hammer lying on side; safe inset ≥20%)
  art_fx_mallet_up.png   — RAISE (head up, about to strike)
  art_fx_mallet_hit.png  — SMASH (head down + small impact marks)

Canvas ~360²; draw mallet SMALLER in frame with ≥20% edge safe margin
so UI can sit above hand cards. Warm tavern wood + brass. T-silhouette
(carpenter mallet / wooden gavel) — NOT abstract blob. Zero .ets.
Seeds fixed for reproducibility.
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

SIZE = 360
SAFE_INSET = 0.20  # ≥20% edges — UI above hand cards
SR = 48000
# Heavier hit: longer body, louder peak (−6..−8 dBFS)
HIT_DUR_S = 0.120
REST_DUR_S = 0.052
HIT_PEAK_DB = -7.0
REST_PEAK_DB = -14.0
LEAD_THRESH_DB = -40.0

# Warm brown wood + copper/brass hoop (night tavern)
WOOD = (0x8B, 0x55, 0x2E)
WOOD_DK = (0x5A, 0x32, 0x1A)
WOOD_LT = (0xB0, 0x78, 0x48)
WOOD_MID = (0x9A, 0x62, 0x38)
BRASS_DK = (0x8A, 0x6E, 0x3E)
HANDLE = (0x6E, 0x42, 0x28)
HANDLE_LT = (0x9A, 0x68, 0x40)
GRAIN = (0x4A, 0x28, 0x14)

SEED_ART = 20260919
SEED_HIT = 20260919
SEED_REST = 20260920


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


def _draw_local_mallet(ld: ImageDraw.ImageDraw, cx: int, cy: int, sc: float, impact: bool) -> tuple[int, int, int, int]:
    """Draw carpenter-mallet T in local space: handle +X, head = fat block at +X end.

    Returns approximate local AABB of opaque paint (before rotation) for docs.
    Head is a short thick barrel with flat striking faces — clear T at thumbnail.
    """
    # Handle shaft (slight taper toward free end) — keep thinner than head for T-read
    hl = int(122 * sc)
    hw0 = int(8 * sc)   # free end
    hw1 = int(11 * sc)  # near head
    hx0 = cx - int(62 * sc)
    hx1 = hx0 + hl
    # Tapered rounded shaft via stacked rects
    for i in range(hl):
        t = i / max(1, hl - 1)
        hw = int(hw0 + (hw1 - hw0) * t)
        x = hx0 + i
        ld.line([(x, cy - hw), (x, cy + hw)], fill=rgba(HANDLE, 255), width=1)
    # Soften shaft edges with rounded caps
    ld.ellipse((hx0 - hw0, cy - hw0, hx0 + hw0, cy + hw0), fill=rgba(HANDLE, 255))
    # Highlight stripe along top of handle
    ld.line(
        [(hx0 + 6, cy - max(2, hw0 - 3)), (hx1 - 10, cy - max(3, hw1 - 4))],
        fill=rgba(mix(HANDLE_LT, CANDLE, 0.3), 190),
        width=2,
    )
    # Grain ticks on handle
    for gx in range(hx0 + 14, hx1 - 16, 11):
        ld.line([(gx, cy - 5), (gx + 1, cy + 5)], fill=rgba(GRAIN, 100), width=1)

    # Brass ferrule at neck
    fx0 = hx1 - int(14 * sc)
    fy0 = cy - int(13 * sc)
    fx1 = hx1 + int(3 * sc)
    fy1 = cy + int(13 * sc)
    ld.rounded_rectangle((fx0, fy0, fx1, fy1), radius=3, fill=rgba(mix(BRASS, BRASS_DK, 0.3), 255))
    ld.line([(fx0 + 2, fy0 + 3), (fx1 - 2, fy0 + 3)], fill=rgba(mix(BRASS, CANDLE, 0.4), 200), width=1)
    ld.line([(fx0 + 2, fy1 - 3), (fx1 - 2, fy1 - 3)], fill=rgba(BRASS_DK, 160), width=1)

    # --- Head: fat rectangular barrel perpendicular to handle (classic T) ---
    # Along handle (X): short; perpendicular (Y): tall → unmistakable mallet head
    head_len = int(48 * sc)   # along handle (short barrel)
    head_thk = int(72 * sc)   # perpendicular — clearly taller than handle → T read
    hcx = hx1 + head_len // 2 - int(4 * sc)
    hcy = cy
    x0 = hcx - head_len // 2
    y0 = hcy - head_thk // 2
    x1 = hcx + head_len // 2
    y1 = hcy + head_thk // 2

    # Soft under-shadow of head
    ld.ellipse(
        (x0 + 4, y1 - 8, x1 + 6, y1 + int(10 * sc)),
        fill=rgba(SHADOW, 70),
    )
    # Main barrel body
    ld.rounded_rectangle((x0, y0, x1, y1), radius=max(6, int(8 * sc)), fill=rgba(WOOD, 255))
    # Inner mid wood
    inset = max(3, int(5 * sc))
    ld.rounded_rectangle(
        (x0 + inset, y0 + inset, x1 - inset, y1 - inset),
        radius=max(4, int(6 * sc)),
        fill=rgba(mix(WOOD, WOOD_MID, 0.45), 255),
    )
    # Top highlight
    ld.arc(
        (x0 + 4, y0 + 2, x1 - 4, y0 + head_thk // 2),
        200,
        340,
        fill=rgba(mix(WOOD_LT, CANDLE, 0.35), 180),
        width=3,
    )
    # Wood grain arcs on face of head
    for gy in range(y0 + 12, y1 - 10, 9):
        ld.arc(
            (x0 + 6, gy - 14, x1 - 6, gy + 14),
            200,
            340,
            fill=rgba(GRAIN, 70),
            width=1,
        )
    # Brass bands near both striking faces
    bw = max(3, int(4 * sc))
    for ox in (x0 + 5, x1 - 5 - bw):
        ld.rectangle((ox, y0 + 3, ox + bw, y1 - 3), fill=rgba(mix(BRASS, BRASS_DK, 0.25), 255))
        ld.line([(ox, y0 + 4), (ox + bw, y0 + 4)], fill=rgba(mix(BRASS, CANDLE, 0.35), 180), width=1)

    # Flat striking faces (darker end-caps) — left = heel, right = face
    face_w = max(5, int(7 * sc))
    for ex0, ex1 in ((x0 - 1, x0 + face_w), (x1 - face_w, x1 + 1)):
        ld.rounded_rectangle(
            (ex0, y0 + 4, ex1, y1 - 4),
            radius=3,
            fill=rgba(mix(WOOD_DK, WOOD, 0.25), 255),
        )
    # End-face ring highlight on striking face (+X)
    er = max(6, int(9 * sc))
    ld.ellipse(
        (x1 - er // 2 - 1, hcy - er, x1 + er // 2 - 3, hcy + er),
        outline=rgba(mix(WOOD_LT, CANDLE, 0.2), 150),
        width=2,
    )

    if impact:
        # Impact marks / dust at striking face (+X end, toward strike)
        face_x = x1
        for i, ang in enumerate((-35, -15, 0, 15, 35, -50, 50)):
            rad = math.radians(ang)
            L = 22 + (i % 3) * 6
            x_a = face_x
            y_a = hcy
            x_b = x_a + int(L * math.cos(rad))
            y_b = y_a + int(L * math.sin(rad))
            ld.line(
                [(x_a, y_a), (x_b, y_b)],
                fill=rgba(mix(CANDLE, PAPER, 0.35), 150 - i * 12),
                width=2 + (1 if i < 3 else 0),
            )
        for dx, dy, r in ((18, 14, 8), (26, -10, 7), (14, 22, 6), (30, 4, 5)):
            ld.ellipse(
                (face_x + dx - r, hcy + dy - r // 2, face_x + dx + r, hcy + dy + r // 2),
                fill=rgba(mix(PAPER, BRASS, 0.12), 50),
            )

    # Local AABB (generous)
    pad = 8
    return (hx0 - hw0 - pad, min(y0, cy - hw1) - pad, x1 + face_w + pad + (36 if impact else 0), max(y1, cy + hw1) + pad)


def draw_mallet(
    angle_deg: float,
    *,
    impact: bool = False,
    motion_blur: bool = False,
    seed: int = SEED_ART,
    scale: float = 0.78,
) -> Image.Image:
    """Draw wooden tavern carpenter-mallet at angle (0=head right, -90=head up).

    Mallet is drawn SMALLER than canvas with ≥20% safe edge inset so UI can
    sit above hand cards without silhouette clash.
    """
    s = SIZE
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    cx, cy = s // 2, s // 2
    rng = np.random.default_rng(seed + int(angle_deg * 10) + (7 if impact else 0))

    # Soft ground shadow when resting / hitting (under head region after rotate)
    if abs(angle_deg) < 30 or impact:
        shadow_r = int(34 if impact else 26)
        sx = cx + int(48 * math.cos(math.radians(angle_deg)) * scale)
        sy = cy + int(48 * math.sin(math.radians(angle_deg)) * scale) + (6 if impact else 12)
        d.ellipse(
            (sx - shadow_r, sy - shadow_r // 2, sx + shadow_r, sy + shadow_r // 2),
            fill=rgba(SHADOW, 65 if impact else 50),
        )

    local = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ld = ImageDraw.Draw(local)
    _draw_local_mallet(ld, cx, cy, scale, impact)

    rotated = local.rotate(-angle_deg, resample=Image.Resampling.BICUBIC, center=(cx, cy))
    canvas = Image.alpha_composite(canvas, rotated)

    if motion_blur:
        blur = canvas.filter(ImageFilter.GaussianBlur(0.9))
        canvas = Image.blend(canvas, blur, 0.28)
        arr = np.array(canvas)
        a = arr[..., 3:4].astype(np.float32) / 255.0
        arr[..., :3] = (arr[..., :3].astype(np.float32) * a).astype(np.uint8)
        canvas = Image.fromarray(arr, "RGBA")

    # Film grain on opaque pixels
    arr = np.array(canvas.convert("RGBA"))
    body = arr[..., 3] > 12
    noise = rng.normal(0.0, 2.0, arr[..., :3].shape)
    arr[..., :3] = np.clip(
        arr[..., :3].astype(np.float32) + noise * body[..., None], 0, 255
    ).astype(np.uint8)
    arr = clear_zero_rgb(arr)
    # Clear corner alphas
    pad = 4
    arr[:pad, :, 3] = 0
    arr[-pad:, :, 3] = 0
    arr[:, :pad, 3] = 0
    arr[:, -pad:, 3] = 0
    arr = clear_zero_rgb(arr)
    return Image.fromarray(arr, "RGBA")


def assert_safe_inset(im: Image.Image, label: str, min_frac: float = SAFE_INSET) -> tuple[float, float, float, float]:
    """Opaque bbox must keep ≥ min_frac margin from each edge."""
    a = np.array(im.convert("RGBA"))[..., 3]
    ys, xs = np.where(a > 20)
    if ys.size == 0:
        raise SystemExit(f"{label}: empty art")
    l, t, r, b = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    s = SIZE
    insets = (l / s, t / s, (s - r) / s, (s - b) / s)
    if min(insets) < min_frac - 1e-6:
        raise SystemExit(
            f"{label}: safe inset fail LTRB={[round(x, 3) for x in insets]} need ≥{min_frac}"
        )
    return insets


def make_hammer_hit() -> np.ndarray:
    """Heavier wood table knock: strong mid body + hard face crack. 100–140ms."""
    rng = np.random.default_rng(SEED_HIT)
    n = int(round(HIT_DUR_S * SR))
    # Deep wood / table body (heavier than v1)
    body = band_noise(n, rng, 60.0, 380.0) * exp_from_zero(n, 28.0) * 1.35
    # Mid wood knock
    knock = band_noise(n, rng, 280.0, 1100.0) * exp_from_zero(n, 48.0) * 1.15
    # Hard face crack (not sine)
    crack = band_noise(n, rng, 1200.0, 3400.0) * exp_from_zero(n, 95.0) * 0.75
    # Felt / room bloom
    felt = band_noise(n, rng, 35.0, 160.0) * exp_from_zero(n, 18.0) * 0.45
    # Immediate attack — no head silence
    click_n = min(64, n)
    click = band_noise(click_n, rng, 700.0, 3000.0) * exp_from_zero(click_n, 160.0) * 1.05
    y = body + knock + crack + felt
    y[:click_n] += click
    if abs(y[0]) < 1e-4:
        y[0] = 0.18 if (y[1] if n > 1 else 0.0) >= 0 else -0.18
    y = apply_hp_warm(y, 30.0)
    y = apply_lp_warm(y, 4800.0)
    y *= tail_fade(n, int(0.014 * SR))
    return peak_normalize(y, HIT_PEAK_DB)


def make_hammer_rest() -> np.ndarray:
    """Soft place-down / near-silent settle for rest (believe = no anim). ~45–70ms."""
    rng = np.random.default_rng(SEED_REST)
    n = int(round(REST_DUR_S * SR))
    # Broadband soft wood settle — keep peak-bin low (no tonal tip)
    set_down = band_noise(n, rng, 90.0, 650.0) * exp_from_zero(n, 52.0) * 0.85
    brush = band_noise(n, rng, 40.0, 280.0) * exp_from_zero(n, 32.0) * 0.55
    air = band_noise(n, rng, 400.0, 2400.0) * exp_from_zero(n, 90.0) * 0.28
    y = set_down + brush + air
    # Tiny attack so zero-lead stays 0
    click_n = min(32, n)
    y[:click_n] += band_noise(click_n, rng, 500.0, 2200.0) * exp_from_zero(click_n, 200.0) * 0.35
    if abs(y[0]) < 1e-4:
        y[0] = 0.08 if (y[1] if n > 1 else 0.0) >= 0 else -0.08
    y = apply_hp_warm(y, 45.0)
    y = apply_lp_warm(y, 3600.0)
    y *= tail_fade(n, int(0.010 * SR))
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


def gate_common(m: dict, label: str, peak_lo: float = -8.5, peak_hi: float = -5.5) -> None:
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
    # Heavier: −8..−6 dBFS, 100–140ms
    gate_common(m, "hit", peak_lo=-8.5, peak_hi=-5.5)
    dur = float(m["duration_ms"])
    if dur < 100.0 - 0.05 or dur > 140.0 + 0.05:
        raise SystemExit(f"hit duration {dur:.2f}ms not in 100–140")
    if float(m["band_200_800"]) < 15.0:
        raise SystemExit("hit missing wood mid body")


def gate_rest(m: dict) -> None:
    # Soft settle — quieter than hit
    gate_common(m, "rest", peak_lo=-16.5, peak_hi=-11.0)
    dur = float(m["duration_ms"])
    if dur < 40.0 - 0.05 or dur > 80.0 + 0.05:
        raise SystemExit(f"rest duration {dur:.2f}ms not in 40–80")
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

    # Scale chosen so all poses keep ≥20% edge safe inset
    SC = 0.70

    # REST / believe: lying on side, head right — NO animation
    rest = draw_mallet(5.0, impact=False, motion_blur=False, seed=SEED_ART, scale=SC)
    # RAISE: head up, about to strike
    up = draw_mallet(-78.0, impact=False, motion_blur=True, seed=SEED_ART + 1, scale=SC)
    # SMASH: head down + impact marks
    hit = draw_mallet(68.0, impact=True, motion_blur=False, seed=SEED_ART + 2, scale=SC)

    assert_art_distinct(rest, up, hit)
    rest_in = assert_safe_inset(rest, "rest")
    up_in = assert_safe_inset(up, "up")
    hit_in = assert_safe_inset(hit, "hit")
    print(
        f"  safe inset ≥{SAFE_INSET:.0%}: rest LTRB={[round(x, 3) for x in rest_in]} "
        f"up={[round(x, 3) for x in up_in]} hit={[round(x, 3) for x in hit_in]}"
    )

    MEDIA.mkdir(parents=True, exist_ok=True)
    save_png(rest, OUT_REST)
    save_png(up, OUT_UP)
    save_png(hit, OUT_HIT)

    for p, im in ((OUT_REST, rest), (OUT_UP, up), (OUT_HIT, hit)):
        print(f"art: {p.relative_to(ROOT)} size={im.size} sha256={sha256_file(p)}")

    # --- SFX ---
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
    print("zero .ets · PM reject redo · seed art/hit=20260919 rest=20260920")
    print(f"SAFE_INSET={SAFE_INSET} SC={SC} HIT_PEAK_DB={HIT_PEAK_DB} HIT_DUR_S={HIT_DUR_S}")


if __name__ == "__main__":
    main()
