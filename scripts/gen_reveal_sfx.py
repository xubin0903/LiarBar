#!/usr/bin/env python3
"""Reveal Foley: writes ONLY sfx_reveal_draw.wav + sfx_reveal_flip.wav.

Call ids:
  lb_sfx_reveal_draw — whole-hand pull from central pool (short paper scrape/pull)
  lb_sfx_reveal_flip — reveal-stage face-up (slower casino reveal than peek flip)

Does not touch sfx_card_flip / sfx_life_extinguish / sfx_play_launch / sfx_play_land /
sfx_challenge_enter / sfx_challenge_commit / deal / §5.2 play_soft family.

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
OUT_DRAW = SFX_DIR / "sfx_reveal_draw.wav"
OUT_FLIP = SFX_DIR / "sfx_reveal_flip.wav"
FROZEN = (
    SFX_DIR / "sfx_card_flip.wav",
    SFX_DIR / "sfx_life_extinguish.wav",
    SFX_DIR / "sfx_play_launch.wav",
    SFX_DIR / "sfx_play_land.wav",
    SFX_DIR / "sfx_challenge_enter.wav",
    SFX_DIR / "sfx_challenge_commit.wav",
    SFX_DIR / "sfx_challenge_pass.wav",
    SFX_DIR / "sfx_challenge_windup.wav",
    SFX_DIR / "sfx_challenge_standoff.wav",
    SFX_DIR / "sfx_challenge_reveal.wav",
    SFX_DIR / "sfx_challenge_result.wav",
    SFX_DIR / "sfx_play_soft.wav",
    SFX_DIR / "sfx_play_slam.wav",
    SFX_DIR / "sfx_play_hesitate.wav",
    SFX_DIR / "sfx_deal_card.wav",
    SFX_DIR / "sfx_match_open.wav",
    SFX_DIR / "sfx_cta_tap.wav",
)
SR = 48000
DRAW_DUR_S = 0.086
FLIP_DUR_S = 0.116
DRAW_PEAK_DB = -9.5
FLIP_PEAK_DB = -10.0
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


def make_reveal_draw() -> np.ndarray:
    """Whole-hand pull from central pool — short paper scrape/pull.

    Brighter scrape than reveal-flip; not play_launch bright swipe,
    not challenge enter/commit, not felt land thud.
    """
    rng = np.random.default_rng(20260915)
    n = int(round(DRAW_DUR_S * SR))

    # Paper-edge scrape already moving at sample 0 (pool pull, not swipe kickoff).
    # Cap below play_launch bright swipe (~6.8 kHz) while staying brighter than flip.
    scrape = band_noise(n, rng, 900.0, 3800.0) * exp_from_zero(n, 88.0) * 0.72

    # Dry cardstock body of the whole-hand pull (mid weight).
    stock = band_noise(n, rng, 380.0, 1900.0) * exp_from_zero(n, 32.0) * 0.98

    # Multi-card rustle as several faces leave the pile together.
    rustle = band_noise(n, rng, 1400.0, 4200.0) * exp_from_zero(n, 52.0) * 0.18

    # Soft fingertip grip weight so it is a pull, not a chrome click.
    grip = band_noise(n, rng, 110.0, 650.0) * exp_from_zero(n, 62.0) * 0.36

    y = scrape + stock + rustle + grip
    y = apply_hp_warm(y, 80.0)
    y = apply_lp_warm(y, 5400.0)
    y *= tail_fade(n, int(0.012 * SR))
    return peak_normalize(y, DRAW_PEAK_DB)


def make_reveal_flip() -> np.ndarray:
    """Reveal-stage face-up — slower casino reveal than peek flip.

    Lower/mid body than draw. Not peek snap, not launch swipe, not land thud.
    """
    rng = np.random.default_rng(20260916)
    n = int(round(FLIP_DUR_S * SR))

    # Soft card body turning face-up — the casino reveal weight.
    body = band_noise(n, rng, 160.0, 880.0) * exp_from_zero(n, 26.0) * 1.02

    # Paper face settling (mid, quieter than draw scrape).
    face = band_noise(n, rng, 380.0, 1500.0) * exp_from_zero(n, 40.0) * 0.52

    # Quiet table/felt kiss as the face lands open.
    kiss = band_noise(n, rng, 70.0, 400.0) * exp_from_zero(n, 20.0) * 0.38

    # Tiny edge flutter; dies inside the 90–140ms window (not a bright swipe).
    edge = band_noise(n, rng, 850.0, 2300.0) * exp_from_zero(n, 78.0) * 0.13

    y = body + face + kiss + edge
    y = apply_hp_warm(y, 45.0)
    y = apply_lp_warm(y, 2700.0)
    y *= tail_fade(n, int(0.018 * SR))
    return peak_normalize(y, FLIP_PEAK_DB)


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
    energy = mag ** 2
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


def _gate_format(m: dict[str, float | int | str]) -> None:
    if m["sample_rate"] != 48000 or m["channels"] != 1 or m["sample_fmt"] != "pcm16":
        raise SystemExit(f"format {m['sample_rate']}/{m['channels']}/{m['sample_fmt']}")


def gate_draw(m: dict[str, float | int | str]) -> None:
    _gate_format(m)
    dur = float(m["duration_ms"])
    pk = float(m["peak_dbfs"])
    lead = float(m["leading_silence_m40_ms"])
    if dur < 70.0 - 0.05 or dur > 100.0 + 0.05:
        raise SystemExit(f"draw duration {dur:.2f}ms not in 70–100")
    if not (-11.05 <= pk <= -8.0):
        raise SystemExit(f"draw peak {pk:.2f} dBFS outside −11..−8")
    if lead >= 5.0:
        raise SystemExit(f"draw leading silence {lead:.3f}ms >= 5ms")
    if float(m["zero_lead_ms"]) >= 1.0:
        raise SystemExit(f"draw zero-sample head {m['zero_lead_ms']}ms too long")


def gate_flip(m: dict[str, float | int | str]) -> None:
    _gate_format(m)
    dur = float(m["duration_ms"])
    pk = float(m["peak_dbfs"])
    lead = float(m["leading_silence_m40_ms"])
    if dur < 90.0 - 0.05 or dur > 140.0 + 0.05:
        raise SystemExit(f"flip duration {dur:.2f}ms not in 90–140")
    if not (-11.05 <= pk <= -8.0):
        raise SystemExit(f"flip peak {pk:.2f} dBFS outside −11..−8")
    if lead >= 5.0:
        raise SystemExit(f"flip leading silence {lead:.3f}ms >= 5ms")
    if float(m["zero_lead_ms"]) >= 1.0:
        raise SystemExit(f"flip zero-sample head {m['zero_lead_ms']}ms too long")


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

    write_wav(OUT_DRAW, make_reveal_draw())
    write_wav(OUT_FLIP, make_reveal_flip())

    draw = measure(OUT_DRAW)
    flip = measure(OUT_FLIP)
    gate_draw(draw)
    gate_flip(flip)

    if float(draw["spectral_centroid_hz"]) <= float(flip["spectral_centroid_hz"]):
        raise SystemExit(
            "draw must be brighter than flip "
            f"(centroid {draw['spectral_centroid_hz']:.0f} vs "
            f"{flip['spectral_centroid_hz']:.0f} Hz)"
        )

    assert_frozen_untouched(frozen_before)

    print_metrics("reveal-draw", "lb_sfx_reveal_draw", draw)
    print_metrics("reveal-flip", "lb_sfx_reveal_flip", flip)
    print(
        "frozen slots not written: "
        "card_flip / life_extinguish / play_launch / play_land / "
        "challenge_enter / challenge_commit / challenge_pass / "
        "challenge_windup/standoff/reveal/result / "
        "play_soft/slam/hesitate / deal_card / match_open / cta_tap"
    )
    for path in FROZEN:
        if path in frozen_before:
            print(f"  {path.name} sha256 {frozen_before[path]} (untouched)")
        else:
            print(f"  {path.name} (absent — listed frozen, not written)")


if __name__ == "__main__":
    main()
