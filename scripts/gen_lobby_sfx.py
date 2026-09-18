#!/usr/bin/env python3
"""Short placeholder wavs for lobby v2 (rawfile/sfx). Not art_*; call sites are lb_sfx_*."""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "entry/src/main/resources/rawfile/sfx"
RATE = 22050


def write_wav(path: Path, samples: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(RATE)
        frames = b"".join(
            struct.pack("<h", max(-32767, min(32767, int(s * 32767)))) for s in samples
        )
        wf.writeframes(frames)


def env(i: int, n: int, attack: float, release: float) -> float:
    a = max(1, int(n * attack))
    r = max(1, int(n * release))
    if i < a:
        return i / a
    if i > n - r:
        return max(0.0, (n - i) / r)
    return 1.0


def sfx_boot() -> list[float]:
    n = int(RATE * 0.38)
    out: list[float] = []
    for i in range(n):
        t = i / RATE
        knock = math.sin(2 * math.pi * (140 - 40 * t) * t) * env(i, n, 0.02, 0.55)
        brass = math.sin(2 * math.pi * 392 * t) * math.exp(-t * 6) * 0.28
        out.append(max(-1.0, min(1.0, knock * 0.7 + brass)))
    return out


def sfx_amb() -> list[float]:
    n = int(RATE * 2.4)
    out: list[float] = []
    seed = 20260906
    prev = 0.0
    for i in range(n):
        t = i / RATE
        seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF
        white = (seed / 4294967295.0) * 2.0 - 1.0
        prev = prev * 0.93 + white * 0.07
        drone = math.sin(2 * math.pi * 55 * t) * 0.18 + math.sin(2 * math.pi * 82.5 * t) * 0.08
        fade = 0.5 - 0.5 * math.cos(2 * math.pi * i / n)
        out.append(max(-1.0, min(1.0, (drone + prev * 0.22) * fade)))
    return out


def sfx_cta() -> list[float]:
    n = int(RATE * 0.07)
    out: list[float] = []
    for i in range(n):
        t = i / RATE
        tick = math.sin(2 * math.pi * 880 * t) * math.exp(-t * 40)
        wood = math.sin(2 * math.pi * 220 * t) * math.exp(-t * 28) * 0.4
        out.append(max(-1.0, min(1.0, tick * 0.55 + wood)))
    return out


def main() -> None:
    write_wav(OUT / "sfx_boot.wav", sfx_boot())
    write_wav(OUT / "sfx_lobby_amb.wav", sfx_amb())
    write_wav(OUT / "sfx_cta.wav", sfx_cta())
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
