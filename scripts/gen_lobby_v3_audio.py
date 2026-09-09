#!/usr/bin/env python3
"""Lobby v3 audio beds — layered tavern material, not beep / single oscillator.

Specs: docs/04-设计/04-开场声场与大厅氛围-v3.md §2.3
Outputs under entry/src/main/resources/rawfile/audio/
Voice is produced separately (edge-tts) then finalized here if a wav is passed.
"""

from __future__ import annotations

import argparse
import math
import os
import shutil
import struct
import subprocess
import wave
from pathlib import Path

import numpy as np
from scipy.signal import lfilter

ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / "entry/src/main/resources/rawfile/audio"
SR = 48000


def db(x: float) -> float:
    return 10 ** (x / 20.0)


def write_wav(path: Path, samples: np.ndarray, channels: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    samples = np.clip(samples, -1.0, 1.0)
    if samples.ndim == 1:
        frames = samples
        ch = 1
    else:
        frames = samples.reshape(-1)
        ch = channels
    pcm = (frames * 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(ch)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())


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


def harmonic_tone(freq: float, n: int, harmonics: list[tuple[int, float]], phase: float = 0.0) -> np.ndarray:
    y = np.zeros(n, dtype=np.float64)
    for k, amp in harmonics:
        y += sine(freq * k, n, phase + 0.17 * k) * amp
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
    # y[n] = x[n] + fb * y[n-d]
    b = np.zeros(d + 1, dtype=np.float64)
    a = np.zeros(d + 1, dtype=np.float64)
    b[0] = 1.0
    a[0] = 1.0
    a[d] = -fb
    y = lfilter(b, a, x)
    return x * (1.0 - mix) + y * mix


def stereo(left: np.ndarray, right: np.ndarray | None = None, width: float = 0.22) -> np.ndarray:
    if right is None:
        n = len(left)
        pad = int(0.012 * SR)
        right = np.concatenate([np.zeros(pad), left[:-pad]]) if pad < n else left
        mid = (left + right) * 0.5
        side = (left - right) * width
        left = mid + side
        right = mid - side
    return np.stack([left, right], axis=1)


def seamless_loop(x: np.ndarray, xfade: float = 0.45) -> np.ndarray:
    n = int(xfade * SR)
    if n <= 8 or n * 2 >= len(x):
        return x
    head = x[:n].astype(np.float64)
    tail = x[-n:].astype(np.float64)
    w = np.linspace(0.0, 1.0, n)[:, None] if x.ndim == 2 else np.linspace(0.0, 1.0, n)
    mixed = tail * (1.0 - w) + head * w
    return np.concatenate([mixed, x[n:-n]], axis=0)


def envelope_compress(x: np.ndarray, thresh: float = 0.22, ratio: float = 2.4) -> np.ndarray:
    """Slow envelope compressor so beds read louder without eating the peak."""
    if x.ndim == 2:
        env = np.max(np.abs(x), axis=1)
    else:
        env = np.abs(x)
    env = one_pole_lp(env, 12.0)
    gain = np.ones_like(env)
    over = env > thresh
    gain[over] = (thresh + (env[over] - thresh) / ratio) / np.maximum(env[over], 1e-8)
    if x.ndim == 2:
        return x * gain[:, None]
    return x * gain


def make_bgm() -> np.ndarray:
    """Night-tavern bed: low strings + slow plucked figure + wood. ~23s loop."""
    rng = np.random.default_rng(20260909)
    seconds = 23.6
    n = int(SR * seconds)
    t = np.arange(n) / SR

    # Slow bow noise on the body — more present than #28.
    bow = one_pole_lp(rng.normal(0.0, 1.0, n), 220.0) * 0.28

    # Cello-ish drones (D2 / A2 / F2 / D3), stacked — not one oscillator.
    cello_d = harmonic_tone(73.42, n, [(1, 0.62), (2, 0.34), (3, 0.16), (4, 0.08), (5, 0.04)])
    cello_a = harmonic_tone(110.00, n, [(1, 0.40), (2, 0.18), (3, 0.08)])
    cello_f = harmonic_tone(87.31, n, [(1, 0.28), (2, 0.14), (3, 0.05)])
    cello_d3 = harmonic_tone(146.83, n, [(1, 0.16), (2, 0.07)])
    lfo = 0.82 + 0.18 * np.sin(2.0 * math.pi * 0.07 * t)
    drones = (cello_d * 0.58 + cello_a * 0.32 + cello_f * 0.22 + cello_d3 * 0.14 + bow) * lfo
    drones = one_pole_lp(drones, 880.0)

    # Warm fifth pad, detuned — midrange so the night hall is audible.
    pad = (
        sine(146.83, n, 0.2) * 0.28
        + sine(146.83 * 1.004, n, 1.1) * 0.22
        + sine(220.00, n, 0.4) * 0.16
        + sine(174.61, n, 2.0) * 0.12
        + sine(196.00, n, 0.8) * 0.08
    )
    pad *= 0.62 + 0.38 * np.sin(2.0 * math.pi * 0.045 * t + 0.6)
    pad = one_pole_lp(pad, 1100.0)

    # Sparse plucked night figure (Karplus-Strong). Louder than #28 so it reads.
    melody_hz = {
        1.4: 220.00,
        3.6: 164.81,
        5.2: 174.61,
        7.0: 146.83,
        9.6: 196.00,
        11.8: 220.00,
        14.2: 164.81,
        16.6: 130.81,
        18.8: 174.61,
        21.0: 146.83,
    }
    plucks = np.zeros(n, dtype=np.float64)
    for start, freq in melody_hz.items():
        i0 = int(start * SR)
        length = int(2.6 * SR)
        tone = karplus(freq, length, 0.990, rng) * fade(length, int(0.004 * SR), int(1.0 * SR))
        end = min(n, i0 + length)
        plucks[i0:end] += tone[: end - i0] * 0.42
    plucks = one_pole_lp(plucks, 2800.0)

    # Soft hall wood — felt, not a UI beep.
    ticks = np.zeros(n, dtype=np.float64)
    for start in (2.4, 6.8, 11.2, 15.6, 20.2):
        i0 = int(start * SR)
        length = int(0.36 * SR)
        body = karplus(86.0, length, 0.974, rng) * fade(length, 24, int(0.26 * SR))
        end = min(n, i0 + length)
        ticks[i0:end] += body[: end - i0] * 0.14

    mono = drones * 0.78 + pad * 0.52 + plucks + ticks
    mono = comb_delay(mono, 0.037, 0.30, 0.20)
    mono = comb_delay(mono, 0.053, 0.24, 0.14)
    mono = one_pole_hp(mono, 38.0)
    left = mono + one_pole_lp(np.roll(mono, 180), 620.0) * 0.14
    right = mono + one_pole_lp(np.roll(mono, -210), 620.0) * 0.14
    st = stereo(left, right, width=0.20)
    st = envelope_compress(st, thresh=0.18, ratio=3.2)
    st = np.tanh(st / 0.42) * 0.42
    st = seamless_loop(st, 0.50)
    return peak_normalize(st, -12.0)


def make_amb() -> np.ndarray:
    """Room tone: cups / distant murmur / timber. ~11.5s loop, under the BGM."""
    rng = np.random.default_rng(20260910)
    seconds = 12.0
    n = int(SR * seconds)
    brown = np.cumsum(rng.normal(0.0, 1.0, n))
    brown = brown - brown.mean()
    brown = brown / (np.max(np.abs(brown)) + 1e-8)
    room = one_pole_lp(brown, 260.0) * 0.42
    room += one_pole_lp(rng.normal(0.0, 1.0, n), 110.0) * 0.16
    room += one_pole_lp(rng.normal(0.0, 1.0, n), 420.0) * 0.05

    # Unintelligible murmur: band-limited noise bursts, no words.
    murmur = np.zeros(n, dtype=np.float64)
    for start, dur, amp in (
        (0.6, 1.6, 0.085),
        (2.8, 1.9, 0.078),
        (5.4, 1.5, 0.082),
        (8.0, 1.8, 0.088),
        (10.2, 1.4, 0.070),
    ):
        i0 = int(start * SR)
        length = int(dur * SR)
        burst = one_pole_lp(rng.normal(0.0, 1.0, length), 480.0)
        burst = one_pole_hp(burst, 140.0)
        burst *= fade(length, int(0.22 * SR), int(0.32 * SR))
        end = min(n, i0 + length)
        murmur[i0:end] += burst[: end - i0] * amp

    # Glass / cup rims — modal, not a sine tip.
    clinks = np.zeros(n, dtype=np.float64)
    modes = (1840.0, 2460.0, 3120.0, 980.0)
    for start, amp in ((1.8, 0.16), (4.6, 0.12), (7.2, 0.14), (10.1, 0.11)):
        i0 = int(start * SR)
        length = int(0.62 * SR)
        t = np.arange(length) / SR
        click = np.zeros(length, dtype=np.float64)
        for i, f in enumerate(modes):
            click += np.sin(2 * math.pi * f * t) * np.exp(-t * (7.0 + i * 2.2)) * (0.38 / (i + 1))
        noise = rng.normal(0.0, 1.0, length) * np.exp(-t * 40.0) * 0.16
        click = (click + noise) * fade(length, 8, int(0.38 * SR))
        end = min(n, i0 + length)
        clinks[i0:end] += click[: end - i0] * amp

    # Timber beam.
    beams = np.zeros(n, dtype=np.float64)
    for start in (0.5, 3.4, 6.6, 9.4):
        i0 = int(start * SR)
        length = int(1.0 * SR)
        body = karplus(64.0, length, 0.992, rng) * fade(length, 36, int(0.75 * SR))
        end = min(n, i0 + length)
        beams[i0:end] += body[: end - i0] * 0.10

    mono = room + murmur + clinks + beams
    mono = comb_delay(mono, 0.044, 0.28, 0.20)
    mono = comb_delay(mono, 0.067, 0.20, 0.12)
    mono = one_pole_hp(mono, 32.0)
    st = stereo(mono, width=0.30)
    st = envelope_compress(st, thresh=0.14, ratio=2.6)
    st = np.tanh(st / 0.28) * 0.28
    st = seamless_loop(st, 0.40)
    return peak_normalize(st, -17.0)


def make_boot_hit() -> np.ndarray:
    """One hall-y sign / lamp hit. Brass + wood + tail. Not a beep."""
    rng = np.random.default_rng(20260911)
    n = int(SR * 0.62)
    t = np.arange(n) / SR
    # Brass / copper strike (several inharmonic partials).
    brass = np.zeros(n, dtype=np.float64)
    for f, decay, amp in (
        (186.0, 9.0, 0.38),
        (312.0, 11.0, 0.22),
        (478.0, 14.0, 0.14),
        (740.0, 18.0, 0.08),
        (1120.0, 22.0, 0.04),
    ):
        brass += np.sin(2 * math.pi * f * t + rng.uniform(0, 1)) * np.exp(-t * decay) * amp
    wood = karplus(118.0, n, 0.968, rng) * np.exp(-t * 8.0) * 0.28
    air = rng.normal(0.0, 1.0, n) * np.exp(-t * 14.0) * 0.16
    air = one_pole_lp(air, 1800.0)
    hit = brass + wood + air
    hit *= fade(n, int(0.010 * SR), int(0.28 * SR))
    # Hall tail via stacked combs.
    hit = comb_delay(hit, 0.019, 0.42, 0.28)
    hit = comb_delay(hit, 0.031, 0.36, 0.22)
    hit = comb_delay(hit, 0.047, 0.30, 0.16)
    hit = one_pole_hp(hit, 50.0)
    # Natural fall toward -40 dB by the end.
    return peak_normalize(hit, -6.5)


def make_cta_tap() -> np.ndarray:
    """Short wood + brass nail. Attack <8ms, ≤0.18s, mono."""
    rng = np.random.default_rng(20260912)
    n = int(SR * 0.14)
    t = np.arange(n) / SR
    wood = karplus(196.0, n, 0.955, rng) * np.exp(-t * 28.0)
    nail = (
        np.sin(2 * math.pi * 980.0 * t) * np.exp(-t * 55.0) * 0.22
        + np.sin(2 * math.pi * 1480.0 * t) * np.exp(-t * 70.0) * 0.10
    )
    noise = rng.normal(0.0, 1.0, n) * np.exp(-t * 90.0) * 0.12
    tap = wood * 0.70 + nail + one_pole_lp(noise, 3200.0)
    tap *= fade(n, 4, int(0.06 * SR))  # ~8 samples @48k < 8ms
    tap = one_pole_hp(tap, 80.0)
    return peak_normalize(tap, -10.0)


def wav_info(path: Path) -> tuple[int, int, float]:
    with wave.open(str(path), "rb") as wf:
        ch = wf.getnchannels()
        rate = wf.getframerate()
        dur = wf.getnframes() / float(rate)
    return ch, rate, dur


def encode_ogg(wav_path: Path, ogg_path: Path, channels: int) -> None:
    ogg_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(wav_path),
        "-c:a",
        "libvorbis",
        "-q:a",
        "5",
        "-ar",
        str(SR),
        "-ac",
        str(channels),
        str(ogg_path),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


VO_LINE = "夜深了，位子给你留着。"
VO_VOICE = "zh-CN-YunxiNeural"


def synthesize_voice(dest: Path) -> None:
    """edge-tts Yunxi, rate=-12%, pitch=-6Hz — not Yunyang news read."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    exe = shutil.which("edge-tts") or str(Path.home() / ".local/bin/edge-tts")
    cmd = [
        exe,
        "--voice",
        VO_VOICE,
        "--rate=-12%",
        "--pitch=-6Hz",
        "--text",
        VO_LINE,
        "--write-media",
        str(dest),
    ]
    env = os.environ.copy()
    env["PATH"] = str(Path.home() / ".local/bin") + os.pathsep + env.get("PATH", "")
    subprocess.run(cmd, check=True, env=env)


def trim_tail_silence(samples: np.ndarray, floor: float = 0.012, keep: float = 0.10) -> np.ndarray:
    """Drop trailing hush but keep a breath. Do not eat the mid-comma pause."""
    absx = np.abs(samples)
    win = int(0.012 * SR)
    if win < 8:
        return samples
    kernel = np.ones(win) / win
    env = np.convolve(absx, kernel, mode="same")
    voiced = np.where(env > floor)[0]
    if voiced.size == 0:
        return samples
    end = min(len(samples), int(voiced[-1] + keep * SR))
    start = max(0, int(voiced[0]))
    return samples[start:end]


def finalize_voice(src: Path, dest: Path) -> None:
    """48 kHz mono 16-bit, close tavern tone: HPF90 / LPF6k + light aecho, peak −8 dB."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(src),
        "-ac",
        "1",
        "-ar",
        str(SR),
        "-c:a",
        "pcm_s16le",
        "-af",
        "silenceremove=start_periods=1:start_threshold=-38dB:start_silence=0.02:detection=peak,"
        "highpass=f=90,lowpass=f=6000,"
        "equalizer=f=160:t=q:w=1.1:g=2.4,equalizer=f=3200:t=q:w=1.0:g=1.8,"
        "acompressor=threshold=-18dB:ratio=2.3:attack=7:release=90:makeup=2,"
        "aecho=0.82:0.72:28:0.20,aecho=0.78:0.68:62:0.10",
        str(dest),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    with wave.open(str(dest), "rb") as wf:
        raw = wf.readframes(wf.getnframes())
    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32767.0
    samples = trim_tail_silence(samples, floor=0.010, keep=0.10)
    lo, hi = int(1.8 * SR), int(2.4 * SR)
    if len(samples) > hi:
        # Keep lock-line pacing; only squeeze leftover hush, never chop the words.
        ratio = hi / float(len(samples))
        if ratio < 0.92:
            tmp = dest.with_suffix(".pre.wav")
            write_wav(tmp, samples, 1)
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(tmp),
                    "-af",
                    f"atempo={min(1.12, 1.0 / ratio):.4f}",
                    "-ar",
                    str(SR),
                    "-ac",
                    "1",
                    str(dest),
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            tmp.unlink(missing_ok=True)
            with wave.open(str(dest), "rb") as wf:
                raw = wf.readframes(wf.getnframes())
            samples = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32767.0
            samples = samples[:hi]
        else:
            samples = samples[:hi]
            samples[-int(0.04 * SR) :] *= np.linspace(1.0, 0.0, int(0.04 * SR))
    if len(samples) < lo:
        samples = np.concatenate([samples, np.zeros(lo - len(samples))])
    samples = peak_normalize(samples, -8.0)
    write_wav(dest, samples, 1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Lobby v3 audio beds")
    parser.add_argument("--polish", action="store_true", help="rewrite BGM / amb / VO only")
    args = parser.parse_args()

    AUDIO.mkdir(parents=True, exist_ok=True)
    tmp = AUDIO / "_tmp"
    tmp.mkdir(parents=True, exist_ok=True)

    bgm_wav = tmp / "bgm_lobby_night.wav"
    amb_wav = tmp / "sfx_amb_tavern.wav"
    write_wav(bgm_wav, make_bgm(), 2)
    write_wav(amb_wav, make_amb(), 2)
    encode_ogg(bgm_wav, AUDIO / "bgm/bgm_lobby_night.ogg", 2)
    encode_ogg(amb_wav, AUDIO / "sfx/sfx_amb_tavern.ogg", 2)

    if not args.polish:
        write_wav(AUDIO / "sfx/sfx_boot_hit.wav", make_boot_hit(), 1)
        write_wav(AUDIO / "sfx/sfx_cta_tap.wav", make_cta_tap(), 1)

    vo_raw = tmp / "vo_dealer_greet_raw.mp3"
    synthesize_voice(vo_raw)
    finalize_voice(vo_raw, AUDIO / "vo/vo_dealer_greet.wav")

    for path in tmp.glob("*"):
        path.unlink()
    tmp.rmdir()

    checks = [
        (AUDIO / "bgm/bgm_lobby_night.ogg", None),
        (AUDIO / "sfx/sfx_amb_tavern.ogg", None),
        (AUDIO / "sfx/sfx_boot_hit.wav", (0.70, 1)),
        (AUDIO / "sfx/sfx_cta_tap.wav", (0.18, 1)),
    ]
    vo = AUDIO / "vo/vo_dealer_greet.wav"
    if not vo.exists():
        raise SystemExit("missing vo_dealer_greet.wav")
    checks.append((vo, (2.40, 1)))
    for path, wav_spec in checks:
        if not path.exists():
            raise SystemExit(f"missing {path}")
        if path.suffix == ".wav" and wav_spec:
            ch, rate, dur = wav_info(path)
            limit, expect_ch = wav_spec
            if rate != SR:
                raise SystemExit(f"{path.name} rate {rate} != 48000")
            if ch != expect_ch:
                raise SystemExit(f"{path.name} channels {ch} != {expect_ch}")
            if dur > limit + 0.01:
                raise SystemExit(f"{path.name} duration {dur:.3f}s > {limit}")
            print(f"{path.relative_to(ROOT)}  {rate}Hz ch={ch} {dur:.3f}s {path.stat().st_size}B")
        else:
            print(f"{path.relative_to(ROOT)}  {path.stat().st_size}B")
    _, _, vo_dur = wav_info(vo)
    if vo_dur < 1.80:
        raise SystemExit(f"vo_dealer_greet duration {vo_dur:.3f}s < 1.8s")

    print("lobby v3 audio written")


if __name__ == "__main__":
    main()
