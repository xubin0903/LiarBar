#!/usr/bin/env python3
"""Revolver Foley: click / shot / spin — procedural noise only.

Call ids:
  lb_sfx_revolver_click — empty chamber click (60–100ms)
  lb_sfx_revolver_shot  — muffled tavern shot (120–200ms, NOT cartoon beep)
  lb_sfx_revolver_spin  — short cylinder spin / redeal cue (150–250ms)

Does not touch flip / launch / land / challenge / reveal wavs.
Ban sine tip / beep / system click. Attack on first samples (lead silence ≈0).
Like scripts/gen_challenge_sfx.py.
"""

from __future__ import annotations

import hashlib
import math
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SFX_DIR = ROOT / "entry/src/main/resources/rawfile/audio/sfx"
OUT_CLICK = SFX_DIR / "sfx_revolver_click.wav"
OUT_SHOT = SFX_DIR / "sfx_revolver_shot.wav"
OUT_SPIN = SFX_DIR / "sfx_revolver_spin.wav"

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

SR = 48000
CLICK_DUR_S = 0.080
SHOT_DUR_S = 0.160
SPIN_DUR_S = 0.200
CLICK_PEAK_DB = -9.5
SHOT_PEAK_DB = -9.0
SPIN_PEAK_DB = -10.0
LEAD_THRESH_DB = -40.0


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


def make_click() -> np.ndarray:
    """Empty chamber click: dry metal pawl + short body. 60–100ms."""
    rng = np.random.default_rng(20260914)
    n = int(round(CLICK_DUR_S * SR))
    # Metal pawl / sear click
    metal = band_noise(n, rng, 1200.0, 3200.0) * exp_from_zero(n, 95.0) * 1.05
    # Short iron body
    body = band_noise(n, rng, 280.0, 900.0) * exp_from_zero(n, 70.0) * 0.55
    # Tiny rim edge
    rim = band_noise(n, rng, 2200.0, 4500.0) * exp_from_zero(n, 160.0) * 0.28
    air = band_noise(n, rng, 60.0, 280.0) * exp_from_zero(n, 28.0) * 0.18
    y = metal + body + rim + air
    y = apply_hp_warm(y, 40.0)
    y = apply_lp_warm(y, 5200.0)
    y *= tail_fade(n, int(0.010 * SR))
    return peak_normalize(y, CLICK_PEAK_DB)


def make_shot() -> np.ndarray:
    """Muffled tavern shot: low boom + felt room, not cartoon beep. 120–200ms."""
    rng = np.random.default_rng(20260915)
    n = int(round(SHOT_DUR_S * SR))
    # Low boom / room thump
    boom = band_noise(n, rng, 35.0, 160.0) * exp_from_zero(n, 18.0) * 1.20
    # Mid body (muffled blast through felt)
    mid = band_noise(n, rng, 140.0, 520.0) * exp_from_zero(n, 26.0) * 0.85
    # Brief crack then die (not bright sine tip)
    crack = band_noise(n, rng, 900.0, 2200.0) * exp_from_zero(n, 55.0) * 0.45
    # Room air / felt bloom
    room = band_noise(n, rng, 70.0, 380.0) * exp_from_zero(n, 12.0) * 0.40
    # Suppress paper-bright highs
    hush = band_noise(n, rng, 400.0, 1100.0) * exp_from_zero(n, 32.0) * 0.22
    y = boom + mid + crack + room + hush
    y = apply_hp_warm(y, 28.0)
    y = apply_lp_warm(y, 2800.0)  # muffled tavern
    y *= tail_fade(n, int(0.024 * SR))
    return peak_normalize(y, SHOT_PEAK_DB)


def make_spin() -> np.ndarray:
    """Short cylinder spin / redeal cue: ratchet ticks + soft whir. 150–250ms."""
    rng = np.random.default_rng(20260916)
    n = int(round(SPIN_DUR_S * SR))
    y = np.zeros(n, dtype=np.float64)
    # Soft continuous whir (filtered noise, not sine)
    whir = band_noise(n, rng, 180.0, 780.0) * 0.35
    whir *= np.linspace(0.55, 1.0, n) * np.linspace(1.0, 0.35, n)
    y += whir
    # Ratchet ticks at irregular-ish spacings
    tick_times = [0.000, 0.028, 0.055, 0.086, 0.118, 0.152]
    for ti, t0 in enumerate(tick_times):
        i0 = int(t0 * SR)
        if i0 >= n:
            continue
        ln = min(int(0.018 * SR), n - i0)
        tick = band_noise(ln, rng, 1400.0 + ti * 40, 3600.0) * exp_from_zero(ln, 110.0)
        tick *= 0.55 + 0.08 * (ti % 3)
        y[i0 : i0 + ln] += tick
    # Low cylinder mass
    mass = band_noise(n, rng, 50.0, 220.0) * exp_from_zero(n, 10.0) * 0.30
    y += mass
    y = apply_hp_warm(y, 35.0)
    y = apply_lp_warm(y, 4800.0)
    y *= tail_fade(n, int(0.018 * SR))
    return peak_normalize(y, SPIN_PEAK_DB)


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
        "zero_lead_ms": 1000.0 * zlead / sr,
        "spectral_centroid_hz": centroid,
        "peak_bin_pct": peak_bin_pct(energy),
        "band_lt200": band_pct(freqs, energy, 0.0, 200.0),
        "band_200_800": band_pct(freqs, energy, 200.0, 800.0),
        "band_800_2500": band_pct(freqs, energy, 800.0, 2500.0),
        "band_2500_8000": band_pct(freqs, energy, 2500.0, 8000.0),
        "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def gate_common(m: dict, label: str) -> None:
    if m["sample_rate"] != 48000 or m["channels"] != 1 or m["sample_fmt"] != "pcm16":
        raise SystemExit(f"format {m['sample_rate']}/{m['channels']}/{m['sample_fmt']}")
    pk = float(m["peak_dbfs"])
    lead = float(m["leading_silence_m40_ms"])
    if not (-11.05 <= pk <= -8.0):
        raise SystemExit(f"{label} peak {pk:.2f} dBFS outside −11..−8")
    if lead >= 5.0:
        raise SystemExit(f"{label} leading silence {lead:.3f}ms >= 5ms")
    if float(m["zero_lead_ms"]) >= 1.0:
        raise SystemExit(f"{label} zero-sample head {m['zero_lead_ms']}ms too long")
    if float(m["peak_bin_pct"]) > 6.0:
        raise SystemExit(f"{label} peak bin {m['peak_bin_pct']:.2f}% too tonal (sine/beep)")


def gate_click(m: dict) -> None:
    gate_common(m, "click")
    dur = float(m["duration_ms"])
    if dur < 60.0 - 0.05 or dur > 100.0 + 0.05:
        raise SystemExit(f"click duration {dur:.2f}ms not in 60–100")
    if float(m["band_800_2500"]) < 15.0:
        raise SystemExit("click missing metal mid band")


def gate_shot(m: dict) -> None:
    gate_common(m, "shot")
    dur = float(m["duration_ms"])
    if dur < 120.0 - 0.05 or dur > 200.0 + 0.05:
        raise SystemExit(f"shot duration {dur:.2f}ms not in 120–200")
    if float(m["band_lt200"]) < 12.0:
        raise SystemExit("shot missing low boom")
    if float(m["band_2500_8000"]) > 25.0:
        raise SystemExit("shot too bright (cartoon/beep risk)")
    if float(m["spectral_centroid_hz"]) >= 4500.0:
        raise SystemExit("shot centroid too bright")


def gate_spin(m: dict) -> None:
    gate_common(m, "spin")
    dur = float(m["duration_ms"])
    if dur < 150.0 - 0.05 or dur > 250.0 + 0.05:
        raise SystemExit(f"spin duration {dur:.2f}ms not in 150–250")


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def assert_frozen_untouched(before: dict[Path, str]) -> None:
    for path, old in before.items():
        now = sha256_file(path)
        if now != old:
            raise SystemExit(f"refusing: {path.name} changed ({old[:8]} → {now[:8]})")


def print_metrics(label: str, call_id: str, m: dict) -> None:
    print(f"{label}: {Path(str(m['path'])).relative_to(ROOT)}")
    print(f"  call id                  {call_id}")
    print(f"  duration_ms              {m['duration_ms']:.2f}")
    print(f"  sample_rate / channels   {m['sample_rate']} / {m['channels']}")
    print(f"  sample_fmt               {m['sample_fmt']} ({m['comptype']})")
    print(f"  leading silence <-40dB   {m['leading_silence_m40_ms']:.3f} ms")
    print(f"  zero-sample head         {m['zero_lead_ms']:.3f} ms")
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

    write_wav(OUT_CLICK, make_click())
    write_wav(OUT_SHOT, make_shot())
    write_wav(OUT_SPIN, make_spin())

    click = measure(OUT_CLICK)
    shot = measure(OUT_SHOT)
    spin = measure(OUT_SPIN)
    gate_click(click)
    gate_shot(shot)
    gate_spin(spin)

    assert_frozen_untouched(frozen_before)

    print_metrics("revolver-click", "lb_sfx_revolver_click", click)
    print_metrics("revolver-shot", "lb_sfx_revolver_shot", shot)
    print_metrics("revolver-spin", "lb_sfx_revolver_spin", spin)
    print("frozen slots not written: flip / extinguish / launch / land / challenge / reveal")
    for path, digest in frozen_before.items():
        print(f"  {path.name} sha256 {digest}")


if __name__ == "__main__":
    main()
