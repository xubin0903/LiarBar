#!/usr/bin/env python3
"""Table-open / deal Foley for LiarBar — layered material, not beep.

Outputs under entry/src/main/resources/rawfile/audio/sfx/
Specs: docs/04-设计/牌面与发牌-资产交件.md
"""

from __future__ import annotations

import math
import wave
from pathlib import Path

import numpy as np
from scipy.signal import lfilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "entry/src/main/resources/rawfile/audio/sfx"
SR = 48000


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
    return lfilter([1.0 - a], [1.0, -a], x)


def one_pole_hp(x: np.ndarray, cutoff: float) -> np.ndarray:
    return x - one_pole_lp(x, cutoff)


def fade(n: int, attack: int, release: int) -> np.ndarray:
    env = np.ones(n, dtype=np.float64)
    if attack > 0:
        env[:attack] = np.linspace(0.0, 1.0, attack)
    if release > 0:
        env[-release:] = np.linspace(1.0, 0.0, release)
    return env


def karplus(freq: float, n: int, decay: float, rng: np.random.Generator) -> np.ndarray:
    period = max(2, int(round(SR / freq)))
    buf = rng.uniform(-1.0, 1.0, period)
    y = np.empty(n, dtype=np.float64)
    idx = 0
    for i in range(n):
        s = buf[idx]
        nxt = buf[(idx + 1) % period]
        buf[idx] = decay * 0.5 * (s + nxt)
        y[i] = s
        idx = (idx + 1) % period
    return y


def comb_delay(x: np.ndarray, delay_s: float, fb: float, mix: float) -> np.ndarray:
    d = max(1, int(delay_s * SR))
    b = np.zeros(d + 1, dtype=np.float64)
    a = np.zeros(d + 1, dtype=np.float64)
    b[0] = 1.0
    a[0] = 1.0
    a[d] = -fb
    y = lfilter(b, a, x)
    return x * (1.0 - mix) + y * mix


def band_noise(n: int, rng: np.random.Generator, lo: float, hi: float) -> np.ndarray:
    x = rng.normal(0.0, 1.0, n)
    x = one_pole_hp(x, lo)
    x = one_pole_lp(x, hi)
    return x


def make_match_open() -> np.ndarray:
    """Wooden cloth + brass nail + short hall. One-shot, ≤0.8s, peak −12..−8 dBFS."""
    rng = np.random.default_rng(20260909)
    n = int(0.72 * SR)
    t = np.arange(n) / SR

    cloth = band_noise(n, rng, 180.0, 1400.0)
    cloth *= np.exp(-np.clip(t - 0.018, 0, None) * 9.5)
    cloth *= fade(n, int(0.012 * SR), int(0.22 * SR))
    # Felt scrape: slow AM so it is not a static hiss.
    cloth *= 0.55 + 0.45 * np.sin(2 * math.pi * 7.5 * t + 0.4)

    wood = karplus(92.0, n, 0.972, rng) * np.exp(-t * 6.2) * 0.42
    wood += karplus(138.0, n, 0.964, rng) * np.exp(-t * 7.4) * 0.22
    wood *= fade(n, int(0.006 * SR), int(0.28 * SR))

    brass = np.zeros(n, dtype=np.float64)
    for f, decay, amp, ph in (
        (196.0, 8.5, 0.28, 0.2),
        (312.0, 11.0, 0.18, 1.1),
        (494.0, 14.5, 0.11, 0.6),
        (784.0, 20.0, 0.06, 2.0),
        (1174.0, 26.0, 0.035, 0.3),
    ):
        brass += np.sin(2 * math.pi * f * t + ph) * np.exp(-t * decay) * amp
    nail_n = int(0.11 * SR)
    nail = band_noise(nail_n, rng, 2200.0, 7000.0) * np.exp(-np.arange(nail_n) / SR * 70.0)
    brass[:nail_n] += nail * 0.16

    air = band_noise(n, rng, 80.0, 900.0) * np.exp(-t * 5.5) * 0.10

    hit = cloth * 0.55 + wood + brass + air
    hit *= fade(n, int(0.008 * SR), int(0.20 * SR))
    hit = comb_delay(hit, 0.021, 0.46, 0.32)
    hit = comb_delay(hit, 0.037, 0.40, 0.24)
    hit = comb_delay(hit, 0.053, 0.34, 0.18)
    hit = comb_delay(hit, 0.079, 0.28, 0.12)
    # Late hall wash so the 0.72s file is not a click + silence.
    hall = band_noise(n, rng, 120.0, 1600.0) * (0.07 * np.exp(-t * 3.2))
    hit = hit + hall
    hit = one_pole_hp(hit, 45.0)
    # Mid of the −12..−8 window.
    return peak_normalize(hit, -10.0)


def make_deal_card() -> np.ndarray:
    """Paper rub + short table tick. Body ≤120ms; stackable; 48k mono."""
    rng = np.random.default_rng(20260910)
    n = int(0.155 * SR)
    t = np.arange(n) / SR
    body_n = int(0.118 * SR)

    paper = band_noise(n, rng, 900.0, 6500.0)
    # Two-finger slip: rise then cut, not a beep.
    slip = np.zeros(n, dtype=np.float64)
    slip[:body_n] = np.hanning(body_n)
    slip[: int(0.018 * SR)] *= np.linspace(0.35, 1.0, int(0.018 * SR))
    paper *= slip * 0.55
    paper += one_pole_lp(band_noise(n, rng, 400.0, 1800.0), 1600.0) * slip * 0.18

    tick_at = int(0.062 * SR)
    tick_n = int(0.028 * SR)
    tick = np.zeros(n, dtype=np.float64)
    tw = karplus(210.0, tick_n, 0.948, rng) * np.exp(-np.arange(tick_n) / SR * 48.0)
    felt = band_noise(tick_n, rng, 200.0, 2400.0) * np.exp(-np.arange(tick_n) / SR * 90.0)
    tick[tick_at : tick_at + tick_n] = tw * 0.38 + felt * 0.16

    card = paper + tick
    card *= fade(n, 6, int(0.034 * SR))
    card = one_pole_hp(card, 90.0)
    # Leave a little headroom so stacked deals do not clip in the mixer.
    return peak_normalize(card, -11.0)


def make_deal_whoosh() -> np.ndarray:
    """Optional short air whoosh for travel; keep it thin so deals can layer."""
    rng = np.random.default_rng(20260911)
    n = int(0.14 * SR)
    t = np.arange(n) / SR
    sweep = 420.0 + 980.0 * np.clip(t / 0.07, 0, 1)
    noise = rng.normal(0.0, 1.0, n)
    # Crude time-varying LP via piecewise cutoff.
    whoosh = np.zeros(n, dtype=np.float64)
    chunk = 64
    for i in range(0, n, chunk):
        sl = noise[i : i + chunk]
        cut = float(sweep[i])
        whoosh[i : i + chunk] = one_pole_lp(one_pole_hp(sl, cut * 0.35), cut * 1.8)
    env = np.sin(np.pi * np.clip(t / (n / SR), 0, 1)) ** 1.15
    whoosh *= env * 0.9
    whoosh = one_pole_hp(whoosh, 120.0)
    return peak_normalize(whoosh, -14.0)


def body_ms(x: np.ndarray, floor_db: float = -28.0) -> float:
    """Duration until the envelope stays below floor (ms)."""
    env = one_pole_lp(np.abs(x), 80.0)
    thr = db(floor_db)
    above = np.where(env >= thr)[0]
    if len(above) == 0:
        return 0.0
    return (above[-1] + 1) / SR * 1000.0


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = (
        ("sfx_match_open.wav", make_match_open, 0.80, (-12.5, -7.5), None),
        ("sfx_deal_card.wav", make_deal_card, 0.22, (-16.0, -8.0), 120.0),
        ("sfx_deal_whoosh.wav", make_deal_whoosh, 0.20, (-18.0, -8.0), None),
    )
    for name, fn, max_s, peak_win, max_body_ms in jobs:
        y = fn()
        path = OUT / name
        write_wav(path, y)
        dur = len(y) / SR
        pk = peak_dbfs(y)
        bm = body_ms(y)
        print(f"{name}: {dur:.3f}s  peak {pk:.2f} dBFS  body≈{bm:.1f}ms  48k mono")
        if dur > max_s + 1e-3:
            raise SystemExit(f"{name} too long: {dur:.3f}s > {max_s}s")
        if not (peak_win[0] <= pk <= peak_win[1]):
            raise SystemExit(f"{name} peak {pk:.2f} outside {peak_win}")
        if max_body_ms is not None and bm > max_body_ms + 8:
            raise SystemExit(f"{name} body {bm:.1f}ms > {max_body_ms}ms")


if __name__ == "__main__":
    main()
