#!/usr/bin/env python3
"""Play-fly Foley: writes ONLY sfx_play_launch.wav + sfx_play_land.wav.

Call ids: lb_sfx_play_launch (PlayLaunch) / lb_sfx_play_land (PlayLanded).
Does not touch sfx_card_flip.wav or sfx_life_extinguish.wav.
Does not rewrite §5.2 play_soft / slam / hesitate.

Not a beep / system click / sine tip / chiptune.
Attack on the first samples (no head silence).
"""

from __future__ import annotations

import hashlib
import math
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SFX_DIR = ROOT / "entry/src/main/resources/rawfile/audio/sfx"
OUT_LAUNCH = SFX_DIR / "sfx_play_launch.wav"
OUT_LAND = SFX_DIR / "sfx_play_land.wav"
FROZEN = (
    SFX_DIR / "sfx_card_flip.wav",
    SFX_DIR / "sfx_life_extinguish.wav",
)
SR = 48000
LAUNCH_DUR_S = 0.076
LAND_DUR_S = 0.104
LAUNCH_PEAK_DB = -10.0
LAND_PEAK_DB = -9.5
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


def apply_hp_warm(y: np.ndarray, cutoff: float) -> np.ndarray:
    pad = 256
    warm = np.concatenate([y[:pad][::-1], y])
    return one_pole_hp(warm, cutoff)[pad:]


def apply_lp_warm(y: np.ndarray, cutoff: float) -> np.ndarray:
    pad = 256
    warm = np.concatenate([y[:pad][::-1], y])
    return one_pole_lp(warm, cutoff)[pad:]


def make_play_launch() -> np.ndarray:
    """Card leave-hand: dry paper scrape-swipe on confirm.

    Mid-band cardstock friction, not a flip snap and not a chrome click.
    High scrape dies faster than the paper body so it reads as a swipe.
    """
    rng = np.random.default_rng(20260913)
    n = int(round(LAUNCH_DUR_S * SR))

    # Nail / card-edge scrape already moving at sample 0; dies first.
    scrape = band_noise(n, rng, 1400.0, 6200.0) * exp_from_zero(n, 118.0) * 0.70

    # Dry cardstock body — the swipe weight, lasts the 76ms window.
    stock = band_noise(n, rng, 380.0, 2600.0) * exp_from_zero(n, 34.0) * 0.92

    # Short fingertip cloth kiss as the card leaves the fan.
    grip = band_noise(n, rng, 150.0, 850.0) * exp_from_zero(n, 86.0) * 0.32

    # Quiet trailing rustle; kept below the stock so it is not a hiss click.
    rustle = band_noise(n, rng, 1800.0, 5400.0) * exp_from_zero(n, 52.0) * 0.11

    y = scrape + stock + grip + rustle
    y = apply_hp_warm(y, 85.0)
    y = apply_lp_warm(y, 7200.0)
    y *= tail_fade(n, int(0.010 * SR))
    return peak_normalize(y, LAUNCH_PEAK_DB)


def make_play_land() -> np.ndarray:
    """Soft felt / table land thud at PlayLanded.

    Muted, low-mid, dry tavern felt — not a wood knock, not a keypad click.
    Distinct beat from launch inside the 320ms fly window.
    """
    rng = np.random.default_rng(20260914)
    n = int(round(LAND_DUR_S * SR))

    # Muted table-felt body — the thud. Noise-only, no sine.
    thud = band_noise(n, rng, 55.0, 360.0) * exp_from_zero(n, 30.0) * 1.05

    # Soft card face kissing felt (mid paper, quieter than launch scrape).
    kiss = band_noise(n, rng, 180.0, 980.0) * exp_from_zero(n, 44.0) * 0.40

    # Tiny paper edge after the thud (dies inside 80–120ms).
    edge = band_noise(n, rng, 600.0, 1800.0) * exp_from_zero(n, 88.0) * 0.09

    # Short air/cloth puff so the land isn't a single filtered click.
    puff = band_noise(n, rng, 65.0, 480.0) * exp_from_zero(n, 18.0) * 0.30

    y = thud + kiss + edge + puff
    y = apply_hp_warm(y, 40.0)
    y = apply_lp_warm(y, 1900.0)
    y *= tail_fade(n, int(0.016 * SR))
    return peak_normalize(y, LAND_PEAK_DB)


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
    first = float(pcm[0]) if pcm.size else 0.0
    first_db = -120.0 if abs(first) < 1e-12 else 20.0 * math.log10(abs(first) / 32767.0)
    mag = np.abs(np.fft.rfft(pcm))
    freqs = np.fft.rfftfreq(pcm.size, 1.0 / sr)
    centroid = float(np.sum(freqs * mag) / np.sum(mag)) if mag.sum() > 0 else 0.0
    return {
        "path": str(path),
        "name": path.name,
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
        "first_sample_dbfs": first_db,
        "spectral_centroid_hz": centroid,
        "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def gate_launch(m: dict[str, float | int | str]) -> None:
    _gate_format(m)
    dur = float(m["duration_ms"])
    pk = float(m["peak_dbfs"])
    lead = float(m["leading_silence_m40_ms"])
    if dur < 60.0 - 0.05 or dur > 90.0 + 0.05:
        raise SystemExit(f"launch duration {dur:.2f}ms not in 60–90")
    if not (-11.05 <= pk <= -8.0):
        raise SystemExit(f"launch peak {pk:.2f} dBFS outside −11..−8")
    if lead >= 5.0:
        raise SystemExit(f"launch leading silence {lead:.3f}ms >= 5ms")
    if float(m["zero_lead_ms"]) >= 1.0:
        raise SystemExit(f"launch zero-sample head {m['zero_lead_ms']}ms too long")


def gate_land(m: dict[str, float | int | str]) -> None:
    _gate_format(m)
    dur = float(m["duration_ms"])
    pk = float(m["peak_dbfs"])
    lead = float(m["leading_silence_m40_ms"])
    if dur < 80.0 - 0.05 or dur > 120.0 + 0.05:
        raise SystemExit(f"land duration {dur:.2f}ms not in 80–120")
    if not (-11.05 <= pk <= -8.0):
        raise SystemExit(f"land peak {pk:.2f} dBFS outside −11..−8")
    if lead >= 5.0:
        raise SystemExit(f"land leading silence {lead:.3f}ms >= 5ms")
    if float(m["zero_lead_ms"]) >= 1.0:
        raise SystemExit(f"land zero-sample head {m['zero_lead_ms']}ms too long")


def _gate_format(m: dict[str, float | int | str]) -> None:
    if m["sample_rate"] != 48000 or m["channels"] != 1 or m["sample_fmt"] != "pcm16":
        raise SystemExit(f"format {m['sample_rate']}/{m['channels']}/{m['sample_fmt']}")


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def assert_frozen_untouched(before: dict[Path, str]) -> None:
    for path, old in before.items():
        now = sha256_file(path)
        if now != old:
            raise SystemExit(f"refusing: {path.name} changed ({old[:8]} → {now[:8]})")


def print_metrics(label: str, call_id: str, m: dict[str, float | int | str]) -> None:
    print(f"{label}: {Path(str(m['path'])).relative_to(ROOT)}")
    print(f"  call id                  {call_id}")
    print(f"  duration_ms              {m['duration_ms']:.2f}")
    print(f"  sample_rate / channels   {m['sample_rate']} / {m['channels']}")
    print(f"  sample_fmt               {m['sample_fmt']} ({m['comptype']})")
    print(f"  leading silence <-40dB   {m['leading_silence_m40_ms']:.3f} ms "
          f"({m['leading_silence_m40_samples']} samples)")
    print(f"  zero-sample head         {m['zero_lead_ms']:.3f} ms "
          f"({m['zero_lead_samples']} samples)")
    print(f"  first sample             {m['first_sample_dbfs']:.1f} dBFS")
    print(f"  peak dBFS                {m['peak_dbfs']:.2f}")
    print(f"  spectral centroid        {m['spectral_centroid_hz']:.0f} Hz")
    print(f"  bytes                    {m['bytes']}")
    print(f"  sha256                   {m['sha256']}")


def main() -> None:
    frozen_before = {p: sha256_file(p) for p in FROZEN if p.exists()}

    write_wav(OUT_LAUNCH, make_play_launch())
    write_wav(OUT_LAND, make_play_land())

    launch = measure(OUT_LAUNCH)
    land = measure(OUT_LAND)
    gate_launch(launch)
    gate_land(land)

    if float(launch["spectral_centroid_hz"]) <= float(land["spectral_centroid_hz"]):
        raise SystemExit(
            "launch must be brighter than land "
            f"(centroid {launch['spectral_centroid_hz']:.0f} vs "
            f"{land['spectral_centroid_hz']:.0f} Hz)"
        )

    assert_frozen_untouched(frozen_before)

    print_metrics("play-launch", "lb_sfx_play_launch", launch)
    print_metrics("play-land", "lb_sfx_play_land", land)
    print("frozen slots not written: sfx_card_flip.wav / sfx_life_extinguish.wav")
    for path, digest in frozen_before.items():
        print(f"  {path.name} sha256 {digest}")


if __name__ == "__main__":
    main()
