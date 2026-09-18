#!/usr/bin/env python3
"""Table SFX only. BGM must NOT be generated here.

BGM (`bgm_table_bluff`) is a licensed bed per
docs/04-设计/13b-局内BGM打回换源.md — currently Moil (Ruskerdax, CC0).
Running this script will hard-abort before any BGM bake. Do not restore
numpy / sine-stack generation. Do not overwrite the ogg.

SFX §5.2 makers remain below for a later ticket; this script must not
rewrite docs/04-设计/局内声场-资产交件.md.

No challenge slots.
"""

from __future__ import annotations

# Hard abort when invoked as CLI — before numpy / soundfile, before any bake.
if __name__ == "__main__":
    raise SystemExit(
        "refusing BGM generation: bgm_table_bluff must come from a licensed bed "
        "(Moil / Ruskerdax / CC0) per docs/04-设计/13b-局内BGM打回换源.md. "
        "Do not re-bake toy numpy BGM. See docs/04-设计/ATTRIBUTION-audio.md."
    )

import math
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import lfilter

ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / "entry/src/main/resources/rawfile/audio"
DOC = ROOT / "docs/04-设计/局内声场-资产交件.md"
SR = 48000

# BGM bake is forbidden (13b). Licensed bed: Moil / Ruskerdax / CC0.
# Do not reintroduce BPM / BGM_SECONDS / XFADE_S generation knobs.

SFX_SPEC: dict[str, tuple[float, float, int]] = {
    # name: (seconds, peak_db, channels)
    "sfx_claim_set": (0.34, -10.0, 1),
    "sfx_play_soft": (0.16, -11.0, 1),
    "sfx_play_slam": (0.24, -9.0, 1),
    "sfx_play_hesitate": (0.18, -13.0, 1),
    "sfx_turn_tick": (0.08, -15.0, 1),
    "sfx_named_stare": (0.38, -11.0, 1),
    "sfx_result_win": (0.95, -9.0, 2),
    "sfx_result_lose": (0.90, -9.0, 1),
}


def db(x: float) -> float:
    return 10.0 ** (x / 20.0)


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


def sine(freq: float, n: int, phase: float = 0.0) -> np.ndarray:
    t = np.arange(n) / SR
    return np.sin(2.0 * math.pi * freq * t + phase)


def harmonic_tone(
    freq: float, n: int, harmonics: list[tuple[int, float]], phase: float = 0.0
) -> np.ndarray:
    y = np.zeros(n, dtype=np.float64)
    for k, amp in harmonics:
        y += sine(freq * k, n, phase + 0.13 * k) * amp
    return y


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


def stereo(left: np.ndarray, right: np.ndarray | None = None, width: float = 0.26) -> np.ndarray:
    if right is None:
        n = len(left)
        pad = int(0.011 * SR)
        right = np.concatenate([np.zeros(pad), left[:-pad]]) if pad < n else left.copy()
        mid = (left + right) * 0.5
        side = (left - right) * width
        left = mid + side
        right = mid - side
    return np.stack([left, right], axis=1)


def seamless_loop(x: np.ndarray, xfade: float = XFADE_S) -> np.ndarray:
    n = int(round(xfade * SR))
    if n <= 8 or n * 2 >= len(x):
        return x
    head = x[:n].astype(np.float64)
    tail = x[-n:].astype(np.float64)
    w = np.linspace(0.0, 1.0, n)
    if x.ndim == 2:
        w = w[:, None]
    mixed = tail * (1.0 - w) + head * w
    return np.concatenate([mixed, x[n:-n]], axis=0)


def add_at(dest: np.ndarray, src: np.ndarray, i0: int) -> None:
    end = min(len(dest), i0 + len(src))
    if end <= i0:
        return
    dest[i0:end] += src[: end - i0]


def envelope_compress(x: np.ndarray, thresh: float = 0.22, ratio: float = 2.2) -> np.ndarray:
    env = np.max(np.abs(x), axis=1) if x.ndim == 2 else np.abs(x)
    env = one_pole_lp(env, 14.0)
    gain = np.ones_like(env)
    over = env > thresh
    gain[over] = (thresh + (env[over] - thresh) / ratio) / np.maximum(env[over], 1e-8)
    if x.ndim == 2:
        return x * gain[:, None]
    return x * gain


# ---------------------------------------------------------------------------
# BGM · FORBIDDEN. Licensed bed only (13b). Do not restore numpy 拼曲.
# ---------------------------------------------------------------------------

def refuse_bgm_bake() -> None:
    raise SystemExit(
        "refusing BGM generation: bgm_table_bluff must come from a licensed bed "
        "(Moil / Ruskerdax / CC0) per docs/04-设计/13b-局内BGM打回换源.md. "
        "Do not re-bake toy numpy BGM. See docs/04-设计/ATTRIBUTION-audio.md."
    )


def make_bgm() -> np.ndarray:
    refuse_bgm_bake()
    raise AssertionError("unreachable")


# ---------------------------------------------------------------------------
# SFX · §5.2  eight slots only. No sfx_challenge_*.
# ---------------------------------------------------------------------------

def make_claim_set() -> np.ndarray:
    """Short brass bell + wood table tap. Not a beep."""
    rng = np.random.default_rng(20260911)
    n = int(round(0.34 * SR))
    t = np.arange(n) / SR
    bell = np.zeros(n, dtype=np.float64)
    for f, decay, amp in (
        (392.0, 11.0, 0.34),
        (588.0, 14.0, 0.18),
        (784.0, 18.0, 0.10),
        (1176.0, 24.0, 0.05),
        (248.0, 9.0, 0.16),
    ):
        bell += np.sin(2 * math.pi * f * t) * np.exp(-t * decay) * amp
    wood_n = int(0.12 * SR)
    wood = karplus(118.0, wood_n, 0.958, rng) * fade(wood_n, 4, int(0.08 * SR))
    felt = band_noise(int(0.04 * SR), rng, 200.0, 1800.0) * fade(int(0.04 * SR), 3, int(0.03 * SR))
    y = bell
    y[:wood_n] += wood * 0.42
    y[: len(felt)] += felt * 0.18
    y *= fade(n, 6, int(0.10 * SR))
    y = comb_delay(y, 0.017, 0.28, 0.16)
    y = one_pole_hp(y, 70.0)
    return peak_normalize(y, -10.0)


def make_play_soft() -> np.ndarray:
    """Light paper landing. Blind-distinct from slam / hesitate."""
    rng = np.random.default_rng(20260912)
    n = int(round(0.16 * SR))
    t = np.arange(n) / SR
    paper = band_noise(n, rng, 1100.0, 6200.0)
    env = np.exp(-np.clip(t - 0.008, 0, None) * 28.0) * fade(n, 10, int(0.05 * SR))
    paper *= env * 0.70
    felt = one_pole_lp(band_noise(n, rng, 180.0, 1400.0), 1200.0) * env * 0.22
    tick_n = int(0.022 * SR)
    tick = karplus(240.0, tick_n, 0.940, rng) * np.exp(-np.arange(tick_n) / SR * 70.0)
    y = paper + felt
    y[int(0.042 * SR) : int(0.042 * SR) + tick_n] += tick * 0.22
    y = one_pole_hp(y, 100.0)
    return peak_normalize(y, -11.0)


def make_play_slam() -> np.ndarray:
    """Palm + paper. Clearly harder / louder than soft."""
    rng = np.random.default_rng(20260913)
    n = int(round(0.24 * SR))
    t = np.arange(n) / SR
    palm = (
        harmonic_tone(62.0, n, [(1, 0.70), (2, 0.28), (3, 0.10)]) * np.exp(-t * 14.0)
        + karplus(88.0, n, 0.952, rng) * np.exp(-t * 11.0) * 0.45
    )
    slap_n = int(0.035 * SR)
    slap = band_noise(slap_n, rng, 400.0, 3500.0) * fade(slap_n, 2, int(0.028 * SR))
    paper = band_noise(n, rng, 800.0, 5000.0) * np.exp(-t * 22.0) * 0.28
    y = palm * 0.85 + paper
    y[:slap_n] += slap * 0.55
    y *= fade(n, 4, int(0.07 * SR))
    y = comb_delay(y, 0.012, 0.22, 0.12)
    y = one_pole_hp(y, 40.0)
    return peak_normalize(y, -9.0)


def make_play_hesitate() -> np.ndarray:
    """Paper rub that starts then stops — half a put-down."""
    rng = np.random.default_rng(20260914)
    n = int(round(0.18 * SR))
    t = np.arange(n) / SR
    rub = band_noise(n, rng, 700.0, 4800.0)
    # Rise, then cut before a real land.
    env = np.zeros(n, dtype=np.float64)
    a = int(0.045 * SR)
    hold = int(0.095 * SR)
    env[:a] = np.linspace(0.0, 1.0, a)
    env[a:hold] = np.linspace(1.0, 0.55, hold - a)
    env[hold:] = np.linspace(0.55, 0.0, n - hold)
    rub *= env * 0.62
    abort = karplus(190.0, int(0.04 * SR), 0.935, rng) * 0.12
    y = rub
    y[hold : hold + len(abort)] += abort
    y = one_pole_hp(y, 120.0)
    return peak_normalize(y, -13.0)


def make_turn_tick() -> np.ndarray:
    """Tiny wood. Must not steal the scene."""
    rng = np.random.default_rng(20260915)
    n = int(round(0.08 * SR))
    t = np.arange(n) / SR
    wood = karplus(196.0, n, 0.938, rng) * np.exp(-t * 42.0)
    nail = np.sin(2 * math.pi * 740.0 * t) * np.exp(-t * 80.0) * 0.12
    y = wood * 0.80 + nail
    y *= fade(n, 3, int(0.035 * SR))
    y = one_pole_hp(y, 90.0)
    return peak_normalize(y, -15.0)


def make_named_stare() -> np.ndarray:
    """Candle 'hoo' + low focus. Alignable with art_fx_candle_stare."""
    rng = np.random.default_rng(20260916)
    n = int(round(0.38 * SR))
    t = np.arange(n) / SR
    hoo = band_noise(n, rng, 180.0, 1400.0)
    sweep = 0.25 + 0.75 * np.sin(np.pi * np.clip(t / 0.32, 0, 1)) ** 1.2
    hoo *= sweep * np.exp(-np.clip(t - 0.12, 0, None) * 6.0)
    focus = sine(55.0, n) * 0.28 + sine(82.5, n, 0.6) * 0.16
    focus *= fade(n, int(0.04 * SR), int(0.16 * SR)) * (0.4 + 0.6 * sweep)
    air = band_noise(n, rng, 80.0, 400.0) * sweep * 0.18
    y = hoo * 0.55 + focus + air
    y = one_pole_lp(y, 1600.0)
    y = one_pole_hp(y, 40.0)
    return peak_normalize(y, -11.0)


def make_result_win() -> np.ndarray:
    """Low-string settle + cup clink. Not an 8-bit fanfare."""
    rng = np.random.default_rng(20260917)
    n = int(round(0.95 * SR))
    t = np.arange(n) / SR
    # Settle D2 → G2 (dorian colour), no major I cadence trumpet.
    low = (
        harmonic_tone(73.42, n, [(1, 0.60), (2, 0.28), (3, 0.10)]) * np.exp(-t * 2.4)
        + harmonic_tone(98.00, n, [(1, 0.36), (2, 0.14)]) * np.exp(-np.clip(t - 0.22, 0, None) * 2.8)
    )
    low *= fade(n, int(0.02 * SR), int(0.28 * SR))
    cup_at = int(0.38 * SR)
    cup_n = int(0.42 * SR)
    ct = np.arange(cup_n) / SR
    cup = np.zeros(cup_n, dtype=np.float64)
    for i, f in enumerate((1680.0, 2240.0, 2890.0, 980.0)):
        cup += np.sin(2 * math.pi * f * ct) * np.exp(-ct * (9.0 + i * 2.2)) * (0.32 / (i + 1))
    cup += rng.normal(0.0, 1.0, cup_n) * np.exp(-ct * 40.0) * 0.10
    y = low * 0.85
    y[cup_at : cup_at + cup_n] += cup * 0.42
    y = comb_delay(y, 0.024, 0.30, 0.18)
    y = one_pole_hp(y, 40.0)
    return peak_normalize(stereo(y, width=0.28), -9.0)


def make_result_lose() -> np.ndarray:
    """Muted wood + short liquid. No scream, no 8-bit fail."""
    rng = np.random.default_rng(20260918)
    n = int(round(0.90 * SR))
    t = np.arange(n) / SR
    wood = (
        karplus(72.0, n, 0.978, rng) * np.exp(-t * 4.2) * 0.55
        + karplus(48.0, n, 0.984, rng) * np.exp(-t * 3.4) * 0.32
    )
    wood *= fade(n, int(0.012 * SR), int(0.30 * SR))
    # Short pour / glass-liquid, not a gulp cartoon.
    liq_at = int(0.18 * SR)
    liq_n = int(0.38 * SR)
    liq = band_noise(liq_n, rng, 400.0, 2200.0)
    lt = np.arange(liq_n) / SR
    liq *= (0.35 + 0.65 * np.sin(np.pi * np.clip(lt / 0.30, 0, 1))) * np.exp(-lt * 5.5)
    y = wood
    y[liq_at : liq_at + liq_n] += liq * 0.28
    y = comb_delay(y, 0.019, 0.24, 0.14)
    y = one_pole_hp(y, 35.0)
    return peak_normalize(y, -9.0)


# ---------------------------------------------------------------------------
# I/O + delivery doc
# ---------------------------------------------------------------------------

def write_wav(path: Path, samples: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    samples = np.clip(samples, -1.0, 1.0)
    sf.write(str(path), samples, SR, format="WAV", subtype="PCM_16")


def write_ogg(path: Path, samples: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    samples = np.clip(samples, -1.0, 1.0)
    sf.write(str(path), samples, SR, format="OGG", subtype="VORBIS")


def write_ogg_peak(path: Path, samples: np.ndarray, target_db: float) -> None:
    """Vorbis can lift the peak a few tenths; iterate so the file measures on target."""
    aimed = target_db
    y = samples
    for _ in range(4):
        write_ogg(path, peak_normalize(y, aimed))
        data, _ = read_audio(path)
        pk = peak_dbfs(data)
        err = pk - target_db
        if abs(err) <= 0.12:
            return
        aimed -= err
    write_ogg(path, peak_normalize(y, aimed))


def read_audio(path: Path) -> tuple[np.ndarray, int]:
    data, rate = sf.read(str(path), always_2d=False)
    return np.asarray(data, dtype=np.float64), int(rate)


def measure(path: Path) -> dict[str, float | int | str]:
    data, rate = read_audio(path)
    ch = 1 if data.ndim == 1 else int(data.shape[1])
    n = data.shape[0]
    return {
        "name": path.name,
        "rel": str(path.relative_to(ROOT)),
        "rate": rate,
        "ch": ch,
        "dur": n / float(rate),
        "peak": peak_dbfs(data),
        "bytes": path.stat().st_size,
    }


def fmt_row(m: dict[str, float | int | str]) -> str:
    return (
        f"| `{m['name']}` | {m['rate']} | {m['ch']} | "
        f"{m['dur']:.2f}s | {m['peak']:.1f} dBFS | {m['bytes']} |"
    )


def write_delivery_doc(rows: list[dict[str, float | int | str]]) -> None:
    raise SystemExit(
        "refusing to rewrite docs/04-设计/局内声场-资产交件.md: "
        "that file is hand-maintained after the Moil (CC0) swap. "
        "BGM must come from licensed beds per 13b."
    )


def main() -> None:
    # Hard abort at the BGM path. Do not write/overwrite bgm_table_bluff.
    # SFX makers remain in this file for a later ticket; this entrypoint
    # must not re-bake toy BGM or rewrite the delivery doc.
    refuse_bgm_bake()


if __name__ == "__main__":
    main()
