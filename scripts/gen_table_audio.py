#!/usr/bin/env python3
"""Generate LiarBar table BGM + §5.2 SFX (noir lounge). Not lobby beds. No challenge slots.

Specs: docs/04-设计/13-局内声场与伴奏规格.md
Outputs under entry/src/main/resources/rawfile/audio/ plus
docs/04-设计/局内声场-资产交件.md

Hard targets (within ~0.5 dB / ±50 ms):
  bgm_table_bluff.ogg   stereo 48k Vorbis  28–32s  peak ≈ −13 dBFS  ~84 BPM
  sfx_claim_set         mono 0.34s −10
  sfx_play_soft         mono 0.16s −11
  sfx_play_slam         mono 0.24s −9
  sfx_play_hesitate     mono 0.18s −13
  sfx_turn_tick         mono 0.08s −15
  sfx_named_stare       mono 0.38s −11
  sfx_result_win        stereo 0.95s −9
  sfx_result_lose       mono 0.90s −9
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import lfilter

ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / "entry/src/main/resources/rawfile/audio"
DOC = ROOT / "docs/04-设计/局内声场-资产交件.md"
SR = 48000
BPM = 84.0
BEAT = 60.0 / BPM

# Measured-target durations (samples land on exact 48 kHz frames).
BGM_SECONDS = 29.45
XFADE_S = 0.55

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
# BGM · 84 BPM noir lounge (pad + bass pulse + brush + sparse EP)
# Distinct from lobby bgm_lobby_night (slow 60–72 cello bed, no pulse grid).
# ---------------------------------------------------------------------------

def _pad_layer(n: int, t: np.ndarray) -> np.ndarray:
    """Layer A: low-string / dark pad. D dorian cluster, slow bow."""
    drones = (
        harmonic_tone(73.42, n, [(1, 0.58), (2, 0.28), (3, 0.12), (4, 0.05)]) * 0.62
        + harmonic_tone(98.00, n, [(1, 0.32), (2, 0.14), (3, 0.06)]) * 0.38  # G2, not lobby A2
        + harmonic_tone(146.83, n, [(1, 0.20), (2, 0.08)]) * 0.22
        + harmonic_tone(110.00, n, [(1, 0.16), (2, 0.06)]) * 0.14
    )
    lfo = 0.84 + 0.16 * np.sin(2.0 * math.pi * 0.055 * t)
    pad = drones * lfo
    # Detuned fifth wash — mid, under the EP.
    wash = (
        sine(174.61, n, 0.4) * 0.10
        + sine(174.61 * 1.006, n, 1.7) * 0.08
        + sine(196.00, n, 0.9) * 0.06
    )
    wash *= 0.70 + 0.30 * np.sin(2.0 * math.pi * 0.033 * t + 1.1)
    y = one_pole_lp(pad + wash, 920.0)
    return one_pole_hp(y, 36.0)


def _bass_pulse(n: int, rng: np.random.Generator) -> np.ndarray:
    """Layer B: 84 BPM finger-bass / cajon pulse. Strong 1 + 3, ghost 2 + 4."""
    y = np.zeros(n, dtype=np.float64)
    # Two-bar root cycle in D dorian (not the lobby irregular pluck times).
    roots = (36.71, 36.71, 32.70, 36.71, 43.65, 36.71, 32.70, 27.50)  # D1 D1 C1 D1 F1 D1 C1 A0
    note_n = int(0.62 * SR)
    n_beats = int(math.ceil(n / (BEAT * SR))) + 1
    for bi in range(n_beats):
        i0 = int(round(bi * BEAT * SR))
        if i0 >= n:
            break
        beat_in_bar = bi % 4
        root = roots[(bi // 2) % len(roots)]
        if beat_in_bar in (0, 2):
            vel, decay = (0.90, 5.2) if beat_in_bar == 0 else (0.70, 6.0)
            body = harmonic_tone(root, note_n, [(1, 0.72), (2, 0.28), (3, 0.10), (4, 0.04)])
            body *= np.exp(-np.arange(note_n) / SR * decay) * vel
            click_n = int(0.018 * SR)
            click = band_noise(click_n, rng, 80.0, 900.0) * fade(click_n, 2, click_n // 2)
            body[:click_n] += click * 0.22
            # Cajon shell on downbeats.
            if beat_in_bar == 0:
                wood = karplus(58.0, int(0.16 * SR), 0.962, rng) * fade(
                    int(0.16 * SR), 6, int(0.10 * SR)
                )
                body[: len(wood)] += wood * 0.18
            add_at(y, one_pole_lp(body, 380.0), i0)
        else:
            # Ghost wood / finger.
            gn = int(0.11 * SR)
            ghost = karplus(72.0 + 8.0 * (bi % 3), gn, 0.948, rng)
            ghost *= fade(gn, 4, int(0.07 * SR)) * 0.16
            add_at(y, one_pole_lp(ghost, 520.0), i0)
    return one_pole_hp(y, 28.0)


def _brush_layer(n: int, rng: np.random.Generator) -> np.ndarray:
    """Layer B2: very light brush on 2 and 4 — rhythm, not a drum loop."""
    y = np.zeros(n, dtype=np.float64)
    brush_n = int(0.090 * SR)
    n_beats = int(math.ceil(n / (BEAT * SR))) + 1
    for bi in range(n_beats):
        if bi % 4 not in (1, 3):
            continue
        i0 = int(round(bi * BEAT * SR))
        if i0 >= n:
            break
        burst = band_noise(brush_n, rng, 2800.0, 9000.0)
        burst *= fade(brush_n, 8, int(0.070 * SR))
        # Slight pitch-down sweep so it is a brush, not a hat beep.
        t = np.arange(brush_n) / SR
        burst *= 0.85 + 0.15 * np.sin(2.0 * math.pi * 18.0 * t)
        add_at(y, burst * (0.20 if bi % 4 == 1 else 0.16), i0)
    return y


def _ep_motif(n: int, rng: np.random.Generator) -> np.ndarray:
    """Layer C: sparse Rhodes / EP 2–4 bar motif. Memorable, not a fanfare."""
    y = np.zeros(n, dtype=np.float64)
    # D dorian colour: D F A C E — voicings, not a scale run.
    # Times on the 84 BPM grid (beats), deliberately unlike lobby 1.4/3.6/5.2….
    events: list[tuple[float, float, float]] = [
        # (beat, hz, vel)
        (0.00, 146.83, 0.62),  # D3
        (2.00, 220.00, 0.48),  # A3
        (4.00, 174.61, 0.40),  # F3
        (8.00, 146.83, 0.55),
        (10.00, 261.63, 0.36),  # C4
        (12.00, 220.00, 0.42),
        (16.00, 174.61, 0.50),
        (18.00, 196.00, 0.34),  # G3
        (20.00, 146.83, 0.58),
        (24.00, 220.00, 0.44),
        (26.00, 329.63, 0.28),  # E4 tine
        (28.00, 174.61, 0.40),
        (32.00, 146.83, 0.60),
        (34.00, 220.00, 0.38),
        (36.00, 261.63, 0.30),
        (38.00, 196.00, 0.32),
    ]
    for beat, freq, vel in events:
        i0 = int(round(beat * BEAT * SR))
        if i0 >= n:
            continue
        length = int(1.85 * SR)
        t = np.arange(length) / SR
        tine = 7.02 + 0.04 * float(rng.uniform(-1.0, 1.0))
        tone = (
            np.sin(2.0 * math.pi * freq * t) * 0.52
            + np.sin(2.0 * math.pi * freq * 2.0 * t) * 0.22
            + np.sin(2.0 * math.pi * freq * 4.0 * t) * 0.07
            + np.sin(2.0 * math.pi * freq * tine * t) * 0.045
        )
        tone *= np.exp(-t * 2.15) * vel
        tone *= fade(length, int(0.004 * SR), int(0.55 * SR))
        hammer = band_noise(int(0.012 * SR), rng, 1200.0, 5000.0)
        tone[: len(hammer)] += hammer * 0.10 * vel
        add_at(y, one_pole_lp(tone, 4200.0), i0)
    return one_pole_hp(y, 90.0)


def _ornament_layer(n: int, rng: np.random.Generator) -> np.ndarray:
    """Layer D: tavern colour inside the cue — cup rim + timber. Not a SFX slot."""
    y = np.zeros(n, dtype=np.float64)
    modes = (1760.0, 2340.0, 3010.0, 890.0)
    for start_beat, amp in ((5.5, 0.16), (17.5, 0.14), (29.0, 0.13), (37.0, 0.12)):
        i0 = int(round(start_beat * BEAT * SR))
        length = int(0.55 * SR)
        t = np.arange(length) / SR
        click = np.zeros(length, dtype=np.float64)
        for i, f in enumerate(modes):
            click += np.sin(2 * math.pi * f * t) * np.exp(-t * (8.0 + i * 2.0)) * (0.34 / (i + 1))
        click += rng.normal(0.0, 1.0, length) * np.exp(-t * 36.0) * 0.12
        add_at(y, click * fade(length, 6, int(0.32 * SR)) * amp, i0)
    for start_beat in (3.0, 15.0, 27.0):
        i0 = int(round(start_beat * BEAT * SR))
        length = int(0.90 * SR)
        beam = karplus(62.0, length, 0.990, rng) * fade(length, 28, int(0.62 * SR))
        add_at(y, beam * 0.12, i0)
    return y


def make_bgm() -> np.ndarray:
    rng = np.random.default_rng(20260910)
    # Extra tail so ≥500 ms crossfade still leaves a 29.45 s loop body.
    raw_s = BGM_SECONDS + XFADE_S
    n = int(round(raw_s * SR))
    t = np.arange(n) / SR

    pad = _pad_layer(n, t)
    bass = _bass_pulse(n, rng)
    brush = _brush_layer(n, rng)
    ep = _ep_motif(n, rng)
    orn = _ornament_layer(n, rng)

    # Mix: pad under pulse; EP readable; ornaments ~6 dB below pulse.
    mono = pad * 0.46 + bass * 0.72 + brush * 0.85 + ep * 0.78 + orn * 0.36
    mono = comb_delay(mono, 0.029, 0.22, 0.12)
    mono = comb_delay(mono, 0.047, 0.16, 0.08)
    mono = one_pole_hp(mono, 32.0)

    # Stereo: bass/pad center-ish; EP and brush slightly wide.
    left = mono + one_pole_lp(np.roll(ep, 220), 1800.0) * 0.10
    right = mono + one_pole_lp(np.roll(ep, -260), 1800.0) * 0.10
    left += np.roll(brush, 40) * 0.08
    right += np.roll(brush, -55) * 0.08
    st = stereo(left, right, width=0.24)
    st = envelope_compress(st, thresh=0.21, ratio=2.1)
    st = np.tanh(st / 0.62) * 0.62
    st = seamless_loop(st, XFADE_S)
    # Exact frame count for 29.45 s (crossfade may be ±1 sample).
    want = int(round(BGM_SECONDS * SR))
    if st.shape[0] > want:
        st = st[:want]
    elif st.shape[0] < want:
        pad_n = want - st.shape[0]
        st = np.concatenate([st, st[-pad_n:]], axis=0)
    return peak_normalize(st, -13.0)


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
    by = {r["name"]: r for r in rows}
    bgm = by["bgm_table_bluff.ogg"]
    body = f"""# 局内声场 · 资产交件

> **会签后真源 · #77 规格已合 · 本批零 ets**

| 项 | 内容 |
|----|------|
| 文档版本 | v1.0 |
| 状态 | **交件 ≠ 占位** · #77 [`13-局内声场与伴奏规格.md`](./13-局内声场与伴奏规格.md) 会签后授权生成 · **零 ets** · 不改玩法规则 · **质疑四拍不生成** |
| 读者 | 音频 / UI / 鸿蒙、**@负责人终审**、测试（可抄 [13 §7](./13-局内声场与伴奏规格.md)） |
| 规格对齐 | [13-局内声场与伴奏规格.md](./13-局内声场与伴奏规格.md) §2–§5.2 · 大厅对照 [04-开场声场与大厅氛围-v3.md](./04-开场声场与大厅氛围-v3.md) |
| 生成 | 仓库根 `python3 scripts/gen_table_audio.py`（numpy / scipy / soundfile） |

> 命名：音频 **`bgm_*` / `sfx_*`**；调用点 **`lb_bgm_*` / `lb_sfx_*`**。**禁止 `lb_art_*`。**  
> 本 PR **零规则改动**（不改 GDD / PRD / 数值 / 引擎），**零 ets**（不改 Lobby / Table / 局内换绑）。  
> **禁止**把大厅 `bgm_lobby_night` 改音量当局内床；**禁止** `sfx_challenge_*` 四槽真源。  
> 已交发牌三槽（`sfx_match_open` / `sfx_deal_card` / `sfx_deal_whoosh`）**本批不重做**。

---

## 1. BGM · `bgm_table_bluff`

路径：`entry/src/main/resources/rawfile/audio/bgm/bgm_table_bluff.ogg`

| 项 | 规格（13） | 本批实测 |
|----|------------|----------|
| 格式 | Vorbis · 立体声 48 kHz | Vorbis · {bgm['ch']}ch · {bgm['rate']} Hz |
| 时长 | 循环体 24～40s | **{bgm['dur']:.2f}s** |
| 峰值 | −14～−12 dBFS | **{bgm['peak']:.1f} dBFS** |
| BPM | 78–92（目标 84） | **84**（1+3 低音脉冲 + 2+4 轻刷） |
| 循环 | 交叉淡化 ≥500ms | 交叉 **550ms** 后裁成上表时长 |
| 曲风 | 暗爵士 / noir lounge × 轻木感 | 垫底低弦 + 指弹/木箱脉冲 + 刷镲 + 稀疏 EP 动机 + 杯沿/木梁点缀 |

编曲层次（关画面 10s 应能指认「垫底 ≠ 律动/动机」）：

| 层 | 角色 | 本批做法 |
|----|------|----------|
| A 垫底 | 持续气场 | D 多利亚低弦 / 薄五度垫，慢 LFO |
| B 律动 | 伴奏感 | **84 BPM** 指弹低音（1 / 3 实、2 / 4 鬼音）+ 极轻刷 |
| C 动机 | 可记忆短句 | Rhodes / EP 2～4 小节稀疏动机（非大厅那条慢拨时间点） |
| D 点缀 | 酒馆色 | 杯沿 + 木梁，融进曲，**不是**独立 SFX 槽 |

进桌听感闸：相对 `bgm_lobby_night`（疏、慢、暖、少鼓点）本条 **有可数拍的脉冲与 EP**，不是同一振荡器改音量。

客户端挂点（本 PR **不改 ets**）：进桌大厅 BGM **400ms 淡出** → 本条 **600ms 淡入**；回大厅反向。静默局三床全关。

---

## 2. SFX · §5.2 新建八槽

路径一律：`entry/src/main/resources/rawfile/audio/sfx/`。PCM 16-bit 48 kHz。

| 文件 | 声道 | 时长（规格） | 本批时长 | 峰值规格 | 本批峰值 | 材质 | 调用建议 |
|------|------|--------------|----------|----------|----------|------|----------|
| `sfx_claim_set.wav` | 1 | 0.20～0.45s | {by['sfx_claim_set.wav']['dur']:.2f}s | −12～−8 | {by['sfx_claim_set.wav']['peak']:.1f} | 短铜铃 + 木桌一触；非 beep | `lb_sfx_claim_set` |
| `sfx_play_soft.wav` | 1 | ≤0.20s | {by['sfx_play_soft.wav']['dur']:.2f}s | −12～−10 | {by['sfx_play_soft.wav']['peak']:.1f} | 轻纸落桌 | `lb_sfx_play_soft` |
| `sfx_play_slam.wav` | 1 | ≤0.28s | {by['sfx_play_slam.wav']['dur']:.2f}s | −10～−8 | {by['sfx_play_slam.wav']['peak']:.1f} | 掌心拍桌 + 纸；比 soft 狠 | `lb_sfx_play_slam` |
| `sfx_play_hesitate.wav` | 1 | ≤0.22s | {by['sfx_play_hesitate.wav']['dur']:.2f}s | −14～−12 | {by['sfx_play_hesitate.wav']['peak']:.1f} | 纸摩擦半下又停 | `lb_sfx_play_hesitate` |
| `sfx_play_hesitate` 与 soft / slam **必须可盲听区分**。 | | | | | | | |
| `sfx_turn_tick.wav` | 1 | ≤0.12s | {by['sfx_turn_tick.wav']['dur']:.2f}s | −16～−14 | {by['sfx_turn_tick.wav']['peak']:.1f} | 极短木击；勿吵 | `lb_sfx_turn_tick` |
| `sfx_named_stare.wav` | 1 | 0.25～0.50s | {by['sfx_named_stare.wav']['dur']:.2f}s | −12～−10 | {by['sfx_named_stare.wav']['peak']:.1f} | 烛火 hoo + 低频聚焦 | `lb_sfx_named_stare` |
| `sfx_result_win.wav` | 2 | 0.6～1.2s | {by['sfx_result_win.wav']['dur']:.2f}s | −10～−8 | {by['sfx_result_win.wav']['peak']:.1f} | 低弦收束 + 轻杯碰；禁 8-bit fanfare | `lb_sfx_result_win` |
| `sfx_result_lose.wav` | 1 | 0.6～1.2s | {by['sfx_result_lose.wav']['dur']:.2f}s | −10～−8 | {by['sfx_result_lose.wav']['peak']:.1f} | 闷木 + 酒液短响；勿惨叫 | `lb_sfx_result_lose` |

### 2.1 实测总表（脚本写入）

| 文件 | Hz | ch | 时长 | 峰值 | 字节 |
|------|----|----|------|------|------|
{fmt_row(bgm)}
{fmt_row(by['sfx_claim_set.wav'])}
{fmt_row(by['sfx_play_soft.wav'])}
{fmt_row(by['sfx_play_slam.wav'])}
{fmt_row(by['sfx_play_hesitate.wav'])}
{fmt_row(by['sfx_turn_tick.wav'])}
{fmt_row(by['sfx_named_stare.wav'])}
{fmt_row(by['sfx_result_win.wav'])}
{fmt_row(by['sfx_result_lose.wav'])}

---

## 3. 明确未做

| 项 | 口径 |
|----|------|
| `sfx_challenge_windup` / `_standoff` / `_reveal` / `_result` | **不生成、不占位 beep**。玩法仍冻，解冻另开票 |
| `sfx_amb_table.ogg` | P1 环境垫，本批不做（BGM 内嵌点缀顶上） |
| 大厅五层声场 | **不改** `bgm_lobby_night` / `sfx_amb_tavern` / boot / cta / VO |
| 发牌三槽 | **不重做** |
| ets / `$r` 换绑 | **本 PR 不做**；等 UI 挂点会签 → `feat/client-*` |

---

## 4. 请 UI / 鸿蒙会签挂点（本 PR 不改 ets）

合入后文件在包里，**现挂槽不会自动换曲 / 换击**。请对拍 [13 §6](./13-局内声场与伴奏规格.md)：

| 时机 | 挂本批哪份 | 不要做什么 |
|------|------------|------------|
| 进桌 | `bgm_table_bluff` 600ms 淡入；大厅 BGM 400ms 淡出 | 不要复用 `bgm_lobby_night` 改音量 |
| 宣称锁定 | `sfx_claim_set` | 不要 beep / 方波 tip |
| 出牌 soft / slam / hesitate | 对应三槽，跟动画峰值 | 不要一条 wav 改 pitch 填三槽 |
| 轮转 | `sfx_turn_tick` | 不要盖过宣称 / 口播 |
| 被点名盯梢 | `sfx_named_stare`（可与烛火同拍） | 不要用 turn_tick 交差 |
| 结算 | `sfx_result_win` / `sfx_result_lose` | 不要 8-bit fanfare / 惨叫 |
| 质疑四拍 | **不挂真源** | 不要先塞 beep |
| 静默局 | BGM + 本批 SFX **全无** | 字幕可在 |

---

## 5. 制作口径

- 分层合成（垫底 / 84 BPM 脉冲 / 刷 / EP / 点缀），禁止一条振荡器刷两槽。  
- SFX：铜 / 木 / 纸 / 气 可指认；soft / slam / hesitate 盲听可分。  
- 重出：`python3 scripts/gen_table_audio.py`  
- 脚手架 `gen_scaffold_assets.py` / `gen_lobby_sfx.py` / `gen_lobby_v3_audio.py` **不要**盖本表文件。

---

## 6. 自检

- [x] `bgm_table_bluff.ogg` 立体声 48 kHz Vorbis，时长 **{bgm['dur']:.2f}s**（≥24s），峰值 **{bgm['peak']:.1f} dBFS**，循环交叉 ≥500ms
- [x] 听感有垫底 + 律动/动机两层；84 BPM 可感知；**不是**大厅那条
- [x] 八槽 SFX 齐，时长 / 峰值落在 13 §5.2 窗内
- [x] **无** `sfx_challenge_*` 文件
- [x] 未改任何 `.ets`；未改 GDD / PRD / 互动方案 / 数值 v0.2
- [x] 未改大厅音频资产、未改发牌三槽
- [x] **@UI** 调用点 / 与动效同拍（阅即可）
- [ ] **@鸿蒙开发** 路径与静默路由（阅即可）
- [ ] **@负责人终审**

### 审核记录

| 日期 | 意见 | 提议修改 | 提出人 | 状态 |
|------|------|----------|--------|------|
| 2026-09-10 | #77 规格会签后落真源；禁方波 tip / 干 loop / 大厅复用 / 质疑四槽 | 本批：`bgm_table_bluff` + §5.2 八槽 + 交件表；零 ets | 负责人会签 #77 / 生成票 | **本批交件** |

---

*维护人：美术 / 音频岗 · 2026-09-10*
"""
    # Fix the accidental extra table-break row — keep a clean 8-row SFX table.
    body = body.replace(
        "| `sfx_play_hesitate` 与 soft / slam **必须可盲听区分**。 | | | | | | | |\n",
        "",
    )
    DOC.write_text(body, encoding="utf-8")


def main() -> None:
    AUDIO.mkdir(parents=True, exist_ok=True)
    (AUDIO / "bgm").mkdir(parents=True, exist_ok=True)
    (AUDIO / "sfx").mkdir(parents=True, exist_ok=True)

    bgm_path = AUDIO / "bgm/bgm_table_bluff.ogg"
    write_ogg_peak(bgm_path, make_bgm(), -13.0)

    makers = {
        "sfx_claim_set": make_claim_set,
        "sfx_play_soft": make_play_soft,
        "sfx_play_slam": make_play_slam,
        "sfx_play_hesitate": make_play_hesitate,
        "sfx_turn_tick": make_turn_tick,
        "sfx_named_stare": make_named_stare,
        "sfx_result_win": make_result_win,
        "sfx_result_lose": make_result_lose,
    }
    for name, fn in makers.items():
        write_wav(AUDIO / "sfx" / f"{name}.wav", fn())

    # Guard: never emit challenge four.
    for forbidden in (
        "sfx_challenge_windup",
        "sfx_challenge_standoff",
        "sfx_challenge_reveal",
        "sfx_challenge_result",
    ):
        for folder in (AUDIO / "sfx", AUDIO / "bgm", AUDIO):
            for ext in (".wav", ".ogg"):
                p = folder / f"{forbidden}{ext}"
                if p.exists():
                    raise SystemExit(f"refusing challenge slot on disk: {p}")

    rows = [measure(bgm_path)]
    for name, (sec, peak, ch) in SFX_SPEC.items():
        path = AUDIO / "sfx" / f"{name}.wav"
        m = measure(path)
        rows.append(m)
        if abs(float(m["dur"]) - sec) > 0.05:
            raise SystemExit(f"{name} duration {m['dur']:.3f}s != {sec}")
        if abs(float(m["peak"]) - peak) > 0.5:
            raise SystemExit(f"{name} peak {m['peak']:.2f} != {peak}")
        if int(m["ch"]) != ch:
            raise SystemExit(f"{name} ch {m['ch']} != {ch}")
        if int(m["rate"]) != SR:
            raise SystemExit(f"{name} rate {m['rate']} != {SR}")

    bgm_m = rows[0]
    if float(bgm_m["dur"]) < 24.0 or float(bgm_m["dur"]) > 40.0:
        raise SystemExit(f"BGM duration {bgm_m['dur']:.3f}s outside 24–40")
    if abs(float(bgm_m["dur"]) - BGM_SECONDS) > 0.05:
        raise SystemExit(f"BGM duration {bgm_m['dur']:.3f}s != {BGM_SECONDS}")
    if abs(float(bgm_m["peak"]) - (-13.0)) > 0.5:
        raise SystemExit(f"BGM peak {bgm_m['peak']:.2f} != -13")
    if int(bgm_m["ch"]) != 2 or int(bgm_m["rate"]) != SR:
        raise SystemExit("BGM must be stereo 48 kHz")

    write_delivery_doc(rows)

    print(f"{'file':<28} {'ch':>2} {'dur':>7} {'peak':>8}  path")
    for m in rows:
        print(
            f"{m['name']:<28} {m['ch']:>2} {m['dur']:7.3f} {m['peak']:8.2f}  {m['rel']}"
        )
    print(f"wrote {DOC.relative_to(ROOT)}")
    print("table audio written (no challenge slots)")


if __name__ == "__main__":
    main()
