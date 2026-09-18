#!/usr/bin/env python3
"""Short paper flip + wick-out puff. Call-sites: lb_sfx_card_flip / lb_sfx_life_extinguish.

Not a system click. Silent match still skips the player.
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


def band_noise(n: int, rng: np.random.Generator, lo: float, hi: float) -> np.ndarray:
    x = rng.normal(0.0, 1.0, n)
    x = one_pole_hp(x, lo)
    x = one_pole_lp(x, hi)
    return x


def make_card_flip() -> np.ndarray:
    """Lighter than deal: short paper turn, not a keypad click."""
    rng = np.random.default_rng(20260912)
    n = int(round(0.118 * SR))
    t = np.arange(n) / SR
    body_n = int(0.092 * SR)
    paper = band_noise(n, rng, 1100.0, 7200.0)
    slip = np.zeros(n, dtype=np.float64)
    slip[:body_n] = np.hanning(body_n)
    paper *= slip * 0.62
    paper += one_pole_lp(band_noise(n, rng, 500.0, 2000.0), 1800.0) * slip * 0.14
    tick_n = int(0.022 * SR)
    tick_at = int(0.048 * SR)
    tick = np.zeros(n, dtype=np.float64)
    tw = karplus(240.0, tick_n, 0.942, rng) * np.exp(-np.arange(tick_n) / SR * 52.0)
    tick[tick_at : tick_at + tick_n] = tw * 0.28
    y = paper + tick
    y *= fade(n, 5, int(0.016 * SR))
    y = one_pole_hp(y, 100.0)
    return peak_normalize(y, -11.0)


def make_life_extinguish() -> np.ndarray:
    """Soft wick-out: air puff + dying hiss. Not a beep, not slam."""
    rng = np.random.default_rng(20260913)
    n = int(round(0.22 * SR))
    t = np.arange(n) / SR
    puff = band_noise(n, rng, 180.0, 1600.0)
    puff *= np.exp(-np.clip(t - 0.008, 0, None) * 14.0)
    puff *= fade(n, int(0.006 * SR), int(0.08 * SR))
    hiss = band_noise(n, rng, 2200.0, 7000.0)
    hiss *= np.exp(-t * 18.0) * 0.22
    wick = karplus(118.0, n, 0.955, rng) * np.exp(-t * 10.5) * 0.16
    y = puff * 0.70 + hiss + wick
    y = one_pole_hp(y, 70.0)
    return peak_normalize(y, -12.0)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = (
        ("sfx_card_flip.wav", make_card_flip, 0.10, 0.14, (-11.6, -10.4)),
        ("sfx_life_extinguish.wav", make_life_extinguish, 0.18, 0.26, (-12.6, -11.4)),
    )
    for name, fn, lo, hi, peak_win in jobs:
        y = fn()
        path = OUT / name
        write_wav(path, y)
        dur = len(y) / SR
        pk = peak_dbfs(y)
        print(f"{name}: 1ch {dur:.3f}s peak {pk:.2f} dBFS 48k")
        if dur < lo - 1e-3 or dur > hi + 1e-3:
            raise SystemExit(f"{name} duration {dur:.3f}s not in [{lo},{hi}]")
        if not (peak_win[0] <= pk <= peak_win[1]):
            raise SystemExit(f"{name} peak {pk:.2f} outside {peak_win}")
    print("flip + extinguish sfx written")


if __name__ == "__main__":
    main()
