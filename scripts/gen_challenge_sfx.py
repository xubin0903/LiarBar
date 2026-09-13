#!/usr/bin/env python3
"""Challenge Foley: writes ONLY sfx_challenge_enter.wav + sfx_challenge_commit.wav.

Call ids:
  lb_sfx_challenge_enter  — AwaitChallenge appear (tense low felt / metal knock)
  lb_sfx_challenge_commit — press challenge / true-false confirm (short pressure tap)

Does not touch sfx_card_flip / sfx_life_extinguish / sfx_play_launch / sfx_play_land.
Does not write sfx_challenge_pass (Pass is silent).
Does not write old four-beat windup / standoff / reveal / result.

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
OUT_ENTER = SFX_DIR / "sfx_challenge_enter.wav"
OUT_COMMIT = SFX_DIR / "sfx_challenge_commit.wav"
BANNED_PASS = SFX_DIR / "sfx_challenge_pass.wav"
FROZEN = (
    SFX_DIR / "sfx_card_flip.wav",
    SFX_DIR / "sfx_life_extinguish.wav",
    SFX_DIR / "sfx_play_launch.wav",
    SFX_DIR / "sfx_play_land.wav",
)
OLD_FOUR_BEAT = (
    SFX_DIR / "sfx_challenge_windup.wav",
    SFX_DIR / "sfx_challenge_standoff.wav",
    SFX_DIR / "sfx_challenge_reveal.wav",
    SFX_DIR / "sfx_challenge_result.wav",
)
SR = 48000
ENTER_DUR_S = 0.100
COMMIT_DUR_S = 0.064
ENTER_PEAK_DB = -9.5
COMMIT_PEAK_DB = -10.0
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


def make_challenge_enter() -> np.ndarray:
    """AwaitChallenge appear: tense low felt + metal knock.

    Felt weight first, then a short brass/metal knock. Noise-only —
    no sine oscillator, no keypad beep, no paper scrape.
    Distinct from play-land (muted felt-only, no metal) and from flip/launch.
    """
    rng = np.random.default_rng(20260915)
    n = int(round(ENTER_DUR_S * SR))

    # Low felt / table body — the weight of the knock landing in cloth.
    felt = band_noise(n, rng, 40.0, 190.0) * exp_from_zero(n, 26.0) * 1.15

    # Felt bloom (compressed cloth, not wood).
    bloom = band_noise(n, rng, 110.0, 480.0) * exp_from_zero(n, 34.0) * 0.58

    # Metal knock: tight mid-band noise, dies fast. Filter, not a sine ping.
    metal = band_noise(n, rng, 1050.0, 2400.0) * exp_from_zero(n, 88.0) * 0.70

    # Short brass-rim edge so the knock reads metallic, then gone.
    rim = band_noise(n, rng, 1700.0, 3400.0) * exp_from_zero(n, 150.0) * 0.30

    # Quiet room air so it is not a single filtered click.
    air = band_noise(n, rng, 55.0, 360.0) * exp_from_zero(n, 15.0) * 0.24

    y = felt + bloom + metal + rim + air
    y = apply_hp_warm(y, 32.0)
    y = apply_lp_warm(y, 3900.0)
    y *= tail_fade(n, int(0.014 * SR))
    return peak_normalize(y, ENTER_PEAK_DB)


def make_challenge_commit() -> np.ndarray:
    """Press challenge / true-false confirm: short pressure tap.

    Finger-on-felt press. Tense, dry, shorter than enter.
    Not a metal knock, not paper flip/scrape, not play-land thud, not UI click.
    """
    rng = np.random.default_rng(20260916)
    n = int(round(COMMIT_DUR_S * SR))

    # Flesh-on-felt pressure body — already moving at sample 0.
    press = band_noise(n, rng, 160.0, 860.0) * exp_from_zero(n, 74.0) * 1.08

    # Short pad / knuckle tap (the press transient).
    tap = band_noise(n, rng, 480.0, 1700.0) * exp_from_zero(n, 112.0) * 0.72

    # Tiny leather grain; dies inside the 50–80ms window.
    grain = band_noise(n, rng, 1300.0, 3000.0) * exp_from_zero(n, 145.0) * 0.16

    # Low weight so it is a press, not a chrome click.
    weight = band_noise(n, rng, 65.0, 260.0) * exp_from_zero(n, 50.0) * 0.32

    y = press + tap + grain + weight
    y = apply_hp_warm(y, 48.0)
    y = apply_lp_warm(y, 3400.0)
    y *= tail_fade(n, int(0.008 * SR))
    return peak_normalize(y, COMMIT_PEAK_DB)


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


def spectral_flatness(mag: np.ndarray) -> float:
    power = np.maximum(mag.astype(np.float64) ** 2, 1e-20)
    geo = float(np.exp(np.mean(np.log(power))))
    arith = float(np.mean(power))
    if arith <= 0:
        return 0.0
    return geo / arith


def peak_bin_pct(energy: np.ndarray) -> float:
    tot = float(energy.sum())
    if tot <= 0:
        return 0.0
    return 100.0 * float(np.max(energy)) / tot


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
        "spectral_flatness": spectral_flatness(mag),
        "peak_bin_pct": peak_bin_pct(energy),
        "band_lt200": band_pct(freqs, energy, 0.0, 200.0),
        "band_200_800": band_pct(freqs, energy, 200.0, 800.0),
        "band_800_2500": band_pct(freqs, energy, 800.0, 2500.0),
        "band_2500_8000": band_pct(freqs, energy, 2500.0, 8000.0),
        "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "_pcm": pcm,
        "_mag": mag,
    }


def _gate_format(m: dict[str, float | int | str]) -> None:
    if m["sample_rate"] != 48000 or m["channels"] != 1 or m["sample_fmt"] != "pcm16":
        raise SystemExit(f"format {m['sample_rate']}/{m['channels']}/{m['sample_fmt']}")


def gate_common(m: dict[str, float | int | str], label: str) -> None:
    _gate_format(m)
    pk = float(m["peak_dbfs"])
    lead = float(m["leading_silence_m40_ms"])
    if not (-11.05 <= pk <= -8.0):
        raise SystemExit(f"{label} peak {pk:.2f} dBFS outside −11..−8")
    if lead >= 5.0:
        raise SystemExit(f"{label} leading silence {lead:.3f}ms >= 5ms")
    if float(m["zero_lead_ms"]) >= 1.0:
        raise SystemExit(f"{label} zero-sample head {m['zero_lead_ms']}ms too long")
    # Filtered felt/metal Foley is naturally not-white. Reject a sine beep
    # (one bin owning the spectrum), not ordinary one-pole noise.
    if float(m["peak_bin_pct"]) > 6.0:
        raise SystemExit(
            f"{label} peak bin {m['peak_bin_pct']:.2f}% too tonal (sine/beep)"
        )


def gate_enter(m: dict[str, float | int | str]) -> None:
    gate_common(m, "enter")
    dur = float(m["duration_ms"])
    if dur < 80.0 - 0.05 or dur > 120.0 + 0.05:
        raise SystemExit(f"enter duration {dur:.2f}ms not in 80–120")
    if float(m["spectral_centroid_hz"]) >= 5200.0:
        raise SystemExit("enter centroid too bright (reads as paper / UI)")
    if float(m["band_lt200"]) < 10.0:
        raise SystemExit("enter missing low felt weight")
    if float(m["band_800_2500"]) < 18.0:
        raise SystemExit("enter missing metal-knock mid band")
    if float(m["band_2500_8000"]) > 22.0:
        raise SystemExit("enter too much paper-bright high band")


def gate_commit(m: dict[str, float | int | str]) -> None:
    gate_common(m, "commit")
    dur = float(m["duration_ms"])
    if dur < 50.0 - 0.05 or dur > 80.0 + 0.05:
        raise SystemExit(f"commit duration {dur:.2f}ms not in 50–80")
    if float(m["spectral_centroid_hz"]) >= 6200.0:
        raise SystemExit("commit centroid too bright (reads as flip/launch)")
    mid = float(m["band_200_800"]) + float(m["band_800_2500"])
    if mid < 55.0:
        raise SystemExit("commit missing pressure-tap mid body")
    if float(m["band_2500_8000"]) > 22.0:
        raise SystemExit("commit too much paper-bright high band")


def cosine_mag(a: np.ndarray, b: np.ndarray) -> float:
    n = max(a.size, b.size)
    aa = np.zeros(n, dtype=np.float64)
    bb = np.zeros(n, dtype=np.float64)
    aa[: a.size] = a
    bb[: b.size] = b
    na = float(np.linalg.norm(aa))
    nb = float(np.linalg.norm(bb))
    if na < 1e-12 or nb < 1e-12:
        return 0.0
    return float(np.dot(aa, bb) / (na * nb))


def gate_distinct(
    enter: dict[str, float | int | str],
    commit: dict[str, float | int | str],
) -> None:
    refs: dict[str, dict[str, float | int | str]] = {}
    for path in (
        SFX_DIR / "sfx_card_flip.wav",
        SFX_DIR / "sfx_play_launch.wav",
        SFX_DIR / "sfx_play_land.wav",
    ):
        refs[path.stem] = measure(path)

    pairs = (
        ("enter", enter, "sfx_card_flip", 0.78),
        ("enter", enter, "sfx_play_launch", 0.78),
        ("enter", enter, "sfx_play_land", 0.88),
        ("commit", commit, "sfx_card_flip", 0.78),
        ("commit", commit, "sfx_play_launch", 0.78),
        ("commit", commit, "sfx_play_land", 0.88),
        ("enter", enter, "commit", 0.90),
    )
    commit_as_ref = commit
    for label, src, other, limit in pairs:
        other_m = commit_as_ref if other == "commit" else refs[other]
        sim = cosine_mag(np.asarray(src["_mag"]), np.asarray(other_m["_mag"]))
        if sim >= limit:
            raise SystemExit(
                f"{label} too similar to {other} (cosine {sim:.3f} >= {limit})"
            )
        print(f"  distinct {label} vs {other:16} cosine={sim:.3f} (limit {limit})")

    if abs(float(enter["spectral_centroid_hz"]) - float(commit["spectral_centroid_hz"])) < 180.0:
        raise SystemExit("enter and commit centroids too close")


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def assert_frozen_untouched(before: dict[Path, str]) -> None:
    for path, old in before.items():
        now = sha256_file(path)
        if now != old:
            raise SystemExit(f"refusing: {path.name} changed ({old[:8]} → {now[:8]})")


def assert_no_pass_or_old_four() -> None:
    if BANNED_PASS.exists():
        raise SystemExit("refusing: sfx_challenge_pass.wav must not exist (Pass is silent)")
    present = [p.name for p in OLD_FOUR_BEAT if p.exists()]
    if present:
        raise SystemExit(f"refusing: old four-beat challenge files present: {present}")


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
    print(f"  spectral flatness        {float(m['spectral_flatness']):.3f}")
    print(f"  peak-bin energy          {float(m['peak_bin_pct']):.2f}%")
    print(f"  bands % <200/200-800/"
          f"0.8-2.5k/2.5-8k  {m['band_lt200']:.1f} / {m['band_200_800']:.1f} / "
          f"{m['band_800_2500']:.1f} / {m['band_2500_8000']:.1f}")
    print(f"  bytes                    {m['bytes']}")
    print(f"  sha256                   {m['sha256']}")


def main() -> None:
    frozen_before = {p: sha256_file(p) for p in FROZEN if p.exists()}
    assert_no_pass_or_old_four()

    write_wav(OUT_ENTER, make_challenge_enter())
    write_wav(OUT_COMMIT, make_challenge_commit())

    enter = measure(OUT_ENTER)
    commit = measure(OUT_COMMIT)
    gate_enter(enter)
    gate_commit(commit)
    print("spectral distinction:")
    gate_distinct(enter, commit)

    assert_frozen_untouched(frozen_before)
    assert_no_pass_or_old_four()

    print_metrics("challenge-enter", "lb_sfx_challenge_enter", enter)
    print_metrics("challenge-commit", "lb_sfx_challenge_commit", commit)
    print("frozen slots not written: flip / extinguish / play_launch / play_land")
    for path, digest in frozen_before.items():
        print(f"  {path.name} sha256 {digest}")
    print("no sfx_challenge_pass.wav (Pass is silent)")
    print("no old four-beat sfx_challenge_{windup,standoff,reveal,result}")


if __name__ == "__main__":
    main()
