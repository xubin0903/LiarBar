#!/usr/bin/env python3
"""Same-slot punchy card-flip Foley. Writes ONLY sfx_card_flip.wav.

Call-site stays lb_sfx_card_flip. Does not touch sfx_life_extinguish.wav.
Not a beep / sine tip / chiptune. Attack on the first samples (no head silence).
"""

from __future__ import annotations

import math
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "entry/src/main/resources/rawfile/audio/sfx/sfx_card_flip.wav"
SR = 48000
DUR_S = 0.092
PEAK_DB = -10.0
LEAD_THRESH_DB = -40.0


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
    """Filter with warmup so t=0 of the returned block already has energy."""
    warm = 2048
    x = rng.normal(0.0, 1.0, n + warm)
    x = one_pole_lp(one_pole_hp(x, lo), hi)
    return x[warm:]


def exp_from_zero(n: int, decay: float) -> np.ndarray:
    """Full-scale at sample 0, then decay. No attack fade."""
    t = np.arange(n, dtype=np.float64) / SR
    return np.exp(-t * decay)


def tail_fade(n: int, release: int) -> np.ndarray:
    env = np.ones(n, dtype=np.float64)
    if release > 0:
        env[-release:] = np.linspace(1.0, 0.0, release)
    return env


def make_card_flip() -> np.ndarray:
    """Dry paper/card slap: crisp transient, short felt kiss, short decay.

    Tavern/bluff Foley — not a whoosh, not a keypad beep.
    """
    rng = np.random.default_rng(20260913)
    n = int(round(DUR_S * SR))

    # Instant paper snap — card-edge transient, already ringing at sample 0.
    snap = band_noise(n, rng, 1400.0, 8200.0) * exp_from_zero(n, 190.0) * 0.78

    # Card body / page slap (mid paper, the punch).
    body = band_noise(n, rng, 480.0, 3600.0) * exp_from_zero(n, 58.0) * 0.88

    # Short table-felt kiss (dry slap, not a wood knock, not a sine).
    felt = band_noise(n, rng, 110.0, 1300.0) * exp_from_zero(n, 88.0) * 0.40

    # Quiet paper-edge rustle that dies inside the 80–100ms window.
    rustle = band_noise(n, rng, 1500.0, 7000.0) * exp_from_zero(n, 42.0) * 0.14

    y = snap + body + felt + rustle
    # Reflect-pad so the mix HP is already moving at sample 0 (no head duck).
    pad = 256
    warm = np.concatenate([y[:pad][::-1], y])
    y = one_pole_hp(warm, 70.0)[pad:]
    y *= tail_fade(n, int(0.012 * SR))
    return peak_normalize(y, PEAK_DB)


def write_wav(path: Path, samples: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    samples = np.clip(samples, -1.0, 1.0)
    pcm = (samples * 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())


def measure(path: Path) -> dict[str, float | int | str]:
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
    return {
        "path": str(path),
        "duration_ms": 1000.0 * n / sr,
        "nframes": n,
        "sample_rate": sr,
        "channels": ch,
        "sample_fmt": f"pcm{sw * 8}",
        "comptype": comptype,
        "peak_dbfs": pk,
        "leading_silence_m40_ms": 1000.0 * lead / sr,
        "leading_silence_m40_samples": lead,
        "zero_lead_ms": 1000.0 * zlead / sr,
        "zero_lead_samples": zlead,
        "bytes": path.stat().st_size,
    }


def gate(m: dict[str, float | int | str]) -> None:
    dur = float(m["duration_ms"])
    pk = float(m["peak_dbfs"])
    lead = float(m["leading_silence_m40_ms"])
    if m["sample_rate"] != 48000 or m["channels"] != 1 or m["sample_fmt"] != "pcm16":
        raise SystemExit(f"format {m['sample_rate']}/{m['channels']}/{m['sample_fmt']}")
    if dur < 80.0 - 0.05 or dur > 100.0 + 0.05:
        raise SystemExit(f"duration {dur:.2f}ms not in 80–100")
    if not (-11.05 <= pk <= -8.0):
        raise SystemExit(f"peak {pk:.2f} dBFS outside −11..−8")
    if lead >= 5.0:
        raise SystemExit(f"leading silence {lead:.3f}ms >= 5ms")
    if float(m["zero_lead_ms"]) >= 1.0:
        raise SystemExit(f"zero-sample head {m['zero_lead_ms']}ms too long")


def main() -> None:
    y = make_card_flip()
    write_wav(OUT, y)
    m = measure(OUT)
    gate(m)
    print("same-slot replace:", OUT.relative_to(ROOT))
    print(f"  duration_ms              {m['duration_ms']:.2f}")
    print(f"  sample_rate / channels   {m['sample_rate']} / {m['channels']}")
    print(f"  sample_fmt               {m['sample_fmt']} ({m['comptype']})")
    print(f"  leading silence <-40dB   {m['leading_silence_m40_ms']:.3f} ms "
          f"({m['leading_silence_m40_samples']} samples)")
    print(f"  zero-sample head         {m['zero_lead_ms']:.3f} ms "
          f"({m['zero_lead_samples']} samples)")
    print(f"  peak dBFS                {m['peak_dbfs']:.2f}")
    print(f"  bytes                    {m['bytes']}")
    print("extinguish slot not written")


if __name__ == "__main__":
    main()
