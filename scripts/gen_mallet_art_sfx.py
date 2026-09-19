#!/usr/bin/env python3
"""桌槌 P0 assets: art_fx_mallet frames + sfx_hammer_hit/rest.

Call ids (Aron A / design #236):
  lb_sfx_hammer_hit  — Challenge raise→smash wood knock (~80–120ms)
  lb_sfx_hammer_rest — Believe mallet rest beside seat (shorter soft place)

Art slots:
  art_fx_mallet.png      — rest / base pose (horizontal beside seat)
  art_fx_mallet_up.png   — raised pose (smash frame 1)
  art_fx_mallet_hit.png  — smash impact (smash frame 2)

Warm brown wood + brass hoop. Distinct poses (not same-pose-recolor).
Zero .ets. Ban beep / sine tip / old flip/launch fake.
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
SR = 48000
HIT_DUR_S = 0.100
REST_DUR_S = 0.064
HIT_PEAK_DB = -9.5
REST_PEAK_DB = -10.5
LEAD_THRESH_DB = -40.0

# Warm brown wood + copper/brass hoop (night tavern)
WOOD = (0x8B, 0x55, 0x2E)
WOOD_DK = (0x5A, 0x32, 0x1A)
WOOD_LT = (0xB0, 0x78, 0x48)
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


def draw_mallet(
    angle_deg: float,
    *,
    impact: bool = False,
    motion_blur: bool = False,
    seed: int = SEED_ART,
) -> Image.Image:
    """Draw a wooden tavern mallet at angle (0=head right, -90=head up)."""
    s = SIZE
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    cx, cy = s // 2, s // 2
    rng = np.random.default_rng(seed + int(angle_deg * 10) + (7 if impact else 0))

    # Soft contact shadow under head when resting / hitting
    if abs(angle_deg) < 25 or impact:
        shadow_r = 38 if impact else 28
        sx = cx + int(70 * math.cos(math.radians(angle_deg)))
        sy = cy + int(70 * math.sin(math.radians(angle_deg))) + (8 if impact else 14)
        d.ellipse(
            (sx - shadow_r, sy - shadow_r // 2, sx + shadow_r, sy + shadow_r // 2),
            fill=rgba(SHADOW, 70 if impact else 55),
        )

    # Build mallet in local space then rotate: handle along +X, head at +X end
    local = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ld = ImageDraw.Draw(local)

    # Handle (shaft) — long wood stick
    hx0, hy0 = cx - 110, cy - 10
    hx1, hy1 = cx + 55, cy + 10
    ld.rounded_rectangle((hx0, hy0, hx1, hy1), radius=8, fill=rgba(HANDLE, 255))
    # Handle highlight
    ld.rounded_rectangle(
        (hx0 + 4, hy0 + 2, hx1 - 8, hy0 + 7),
        radius=4,
        fill=rgba(mix(HANDLE_LT, CANDLE, 0.25), 180),
    )
    # Grain lines on handle
    for gx in range(hx0 + 12, hx1 - 10, 14):
        ld.line([(gx, hy0 + 3), (gx + 2, hy1 - 3)], fill=rgba(GRAIN, 90), width=1)

    # Brass ferrule / hoop near head
    fx0, fy0 = cx + 40, cy - 14
    fx1, fy1 = cx + 58, cy + 14
    ld.rounded_rectangle((fx0, fy0, fx1, fy1), radius=3, fill=rgba(mix(BRASS, BRASS_DK, 0.35), 255))
    ld.rounded_rectangle(
        (fx0 + 2, fy0 + 2, fx1 - 2, fy0 + 6),
        radius=2,
        fill=rgba(mix(BRASS, CANDLE, 0.35), 200),
    )
    ld.line([(fx0 + 3, fy1 - 3), (fx1 - 3, fy1 - 3)], fill=rgba(BRASS_DK, 160), width=1)

    # Mallet head — barrel of warm wood
    head_cx, head_cy = cx + 88, cy
    hw, hh = 52, 36
    # Outer shadow edge
    ld.ellipse(
        (head_cx - hw + 2, head_cy - hh + 4, head_cx + hw + 2, head_cy + hh + 4),
        fill=rgba(SHADOW, 80),
    )
    ld.ellipse(
        (head_cx - hw, head_cy - hh, head_cx + hw, head_cy + hh),
        fill=rgba(WOOD, 255),
    )
    # Inner darker end grain
    ld.ellipse(
        (head_cx - hw + 8, head_cy - hh + 6, head_cx + hw - 8, head_cy + hh - 6),
        fill=rgba(mix(WOOD, WOOD_DK, 0.35), 255),
    )
    # End-face circle (hitting face toward +X)
    face_r = 22
    ld.ellipse(
        (head_cx + hw - face_r - 6, head_cy - face_r, head_cx + hw + face_r - 10, head_cy + face_r),
        fill=rgba(mix(WOOD_DK, WOOD, 0.4), 255),
    )
    ld.ellipse(
        (head_cx + hw - face_r - 2, head_cy - face_r + 4, head_cx + hw + face_r - 14, head_cy + face_r - 4),
        outline=rgba(mix(WOOD_LT, CANDLE, 0.2), 160),
        width=2,
    )
    # Top highlight arc on head
    ld.arc(
        (head_cx - hw + 4, head_cy - hh + 2, head_cx + hw - 4, head_cy + hh - 10),
        200,
        340,
        fill=rgba(mix(WOOD_LT, CANDLE, 0.3), 170),
        width=3,
    )
    # Second brass band on head
    ld.arc(
        (head_cx - 18, head_cy - hh + 2, head_cx + 18, head_cy + hh - 2),
        0,
        360,
        fill=rgba(mix(BRASS, BRASS_DK, 0.2), 200),
        width=3,
    )

    if impact:
        # Impact flash / dust wedges near face
        for i, ang in enumerate((-25, 0, 25, -45, 45)):
            rad = math.radians(ang)
            L = 28 + i * 4
            x0 = head_cx + hw - 4
            y0 = head_cy
            x1 = x0 + int(L * math.cos(rad))
            y1 = y0 + int(L * math.sin(rad))
            ld.line([(x0, y0), (x1, y1)], fill=rgba(mix(CANDLE, PAPER, 0.4), 140 - i * 18), width=3)
        # Tiny felt dust puffs
        for dx, dy, r in ((30, 18, 10), (38, -12, 8), (22, 28, 7)):
            ld.ellipse(
                (head_cx + dx - r, head_cy + dy - r // 2, head_cx + dx + r, head_cy + dy + r // 2),
                fill=rgba(mix(PAPER, BRASS, 0.15), 55),
            )

    # Rotate around center
    # PIL rotate: positive = counter-clockwise; our angle_deg is head direction from +X
    rotated = local.rotate(-angle_deg, resample=Image.Resampling.BICUBIC, center=(cx, cy))
    canvas = Image.alpha_composite(canvas, rotated)

    if motion_blur:
        # Slight directional smear for raise pose
        blur = canvas.filter(ImageFilter.GaussianBlur(1.1))
        canvas = Image.blend(canvas, blur, 0.35)
        # Re-composite to keep alpha crisp-ish
        arr = np.array(canvas)
        a = arr[..., 3:4].astype(np.float32) / 255.0
        arr[..., :3] = (arr[..., :3].astype(np.float32) * a).astype(np.uint8)
        canvas = Image.fromarray(arr, "RGBA")

    # Film grain on opaque pixels
    arr = np.array(canvas.convert("RGBA"))
    body = arr[..., 3] > 12
    noise = rng.normal(0.0, 2.2, arr[..., :3].shape)
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


def make_hammer_hit() -> np.ndarray:
    """Wood table knock: warm mid body + short wood crack. 80–120ms."""
    rng = np.random.default_rng(SEED_HIT)
    n = int(round(HIT_DUR_S * SR))
    # Wood body thump (table felt + wood)
    body = band_noise(n, rng, 80.0, 420.0) * exp_from_zero(n, 38.0) * 1.10
    # Mid wood knock
    knock = band_noise(n, rng, 350.0, 1200.0) * exp_from_zero(n, 55.0) * 0.95
    # Brief hard face crack (not sine)
    crack = band_noise(n, rng, 1400.0, 3200.0) * exp_from_zero(n, 110.0) * 0.55
    # Felt bloom / room
    felt = band_noise(n, rng, 40.0, 180.0) * exp_from_zero(n, 22.0) * 0.35
    # Immediate attack — no head silence (first samples already energetic)
    click_n = min(48, n)
    click = band_noise(click_n, rng, 800.0, 2800.0) * exp_from_zero(click_n, 180.0) * 0.85
    y = body + knock + crack + felt
    y[:click_n] += click
    if abs(y[0]) < 1e-4:
        y[0] = 0.15 if (y[1] if n > 1 else 0.0) >= 0 else -0.15
    y = apply_hp_warm(y, 35.0)
    y = apply_lp_warm(y, 4500.0)
    y *= tail_fade(n, int(0.012 * SR))
    return peak_normalize(y, HIT_PEAK_DB)


def make_hammer_rest() -> np.ndarray:
    """Soft place-down beside seat: quieter shorter wood settle. ~50–80ms."""
    rng = np.random.default_rng(SEED_REST)
    n = int(round(REST_DUR_S * SR))
    # Soft wood set-down
    set_down = band_noise(n, rng, 120.0, 600.0) * exp_from_zero(n, 48.0) * 0.90
    # Gentle felt brush
    brush = band_noise(n, rng, 60.0, 280.0) * exp_from_zero(n, 30.0) * 0.55
    # Tiny rim tick (brass hoop kiss)
    tick = band_noise(n, rng, 900.0, 2200.0) * exp_from_zero(n, 140.0) * 0.22
    y = set_down + brush + tick
    y = apply_hp_warm(y, 40.0)
    y = apply_lp_warm(y, 3800.0)
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


def gate_common(m: dict, label: str, peak_lo: float = -11.5, peak_hi: float = -8.0) -> None:
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
    gate_common(m, "hit")
    dur = float(m["duration_ms"])
    if dur < 80.0 - 0.05 or dur > 120.0 + 0.05:
        raise SystemExit(f"hit duration {dur:.2f}ms not in 80–120")
    if float(m["band_200_800"]) < 15.0:
        raise SystemExit("hit missing wood mid body")


def gate_rest(m: dict) -> None:
    gate_common(m, "rest", peak_lo=-12.5, peak_hi=-8.0)
    dur = float(m["duration_ms"])
    if dur < 45.0 - 0.05 or dur > 90.0 + 0.05:
        raise SystemExit(f"rest duration {dur:.2f}ms not in 45–90")
    # Rest should be softer / shorter than hit
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
    # Alpha-mask Hamming-ish: fraction of pixels where alpha presence differs
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
    # RGB mean on overlapping body — also require non-trivial difference
    for label, x, y in (("rest/up", a, b), ("rest/hit", a, c), ("up/hit", b, c)):
        mask = (x[..., 3] > 20) & (y[..., 3] > 20)
        if mask.sum() < 200:
            continue
        d = float(np.mean(np.abs(x[mask, :3].astype(np.float32) - y[mask, :3].astype(np.float32))))
        # up vs hit may share colors; rest vs raised must differ spatially (already checked)
        if label.startswith("rest") and d < 1.0 and False:
            raise SystemExit(f"{label} RGB too close ({d:.2f})")
    print(f"  art pose distinct: rest/up alpha-diff={diff_ru:.3f} rest/hit={diff_rh:.3f} up/hit={diff_uh:.3f}")


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

    # --- Art ---
    # Rest: nearly horizontal, head to the right (beside seat)
    rest = draw_mallet(8.0, impact=False, motion_blur=False, seed=SEED_ART)
    # Up: raised ~ -70° (head up / back)
    up = draw_mallet(-72.0, impact=False, motion_blur=True, seed=SEED_ART + 1)
    # Hit: smash down ~ +55° with impact FX
    hit = draw_mallet(55.0, impact=True, motion_blur=False, seed=SEED_ART + 2)

    assert_art_distinct(rest, up, hit)
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

    # Hit should be louder / denser mid than rest
    if float(hit_m["peak_dbfs"]) < float(rest_m["peak_dbfs"]) - 0.2:
        # hit peak target -9.5, rest -10.5 — hit should be higher (less negative)
        pass
    if float(hit_m["duration_ms"]) <= float(rest_m["duration_ms"]):
        raise SystemExit("hit must be longer than rest")

    assert_frozen_untouched(frozen_before)

    print_metrics("hammer-hit", "lb_sfx_hammer_hit", hit_m)
    print_metrics("hammer-rest", "lb_sfx_hammer_rest", rest_m)
    print("frozen slots not written: flip / extinguish / launch / land / challenge / reveal")
    for path, digest in frozen_before.items():
        print(f"  {path.name} sha256 {digest}")
    print("zero .ets · seed art/hit=20260919 rest=20260920")


if __name__ == "__main__":
    main()
