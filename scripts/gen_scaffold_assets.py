#!/usr/bin/env python3
"""Generate P0 art_* placeholders and HarmonyOS app icons (no DevEco required)."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "entry/src/main/resources/base/media"
APP_MEDIA = ROOT / "AppScope/resources/base/media"

# Night-tavern tokens from docs/04-设计/夜半酒馆-风格板.md
TAVERN_BG = (0x1A, 0x12, 0x0E, 255)
TAVERN_FELT = (0x2C, 0x18, 0x14, 255)
TAVERN_PANEL = (0x3D, 0x24, 0x1C, 255)
TAVERN_CANDLE = (0xE8, 0xB8, 0x6D, 255)
TAVERN_BRASS = (0xC4, 0xA4, 0x6A, 255)
TAVERN_PAPER = (0xF3, 0xE6, 0xC8, 255)
TAVERN_MUTE = (0x8A, 0x73, 0x5A, 255)
TAVERN_SHADOW = (0x0E, 0x1A, 0x22, 255)
TAVERN_ACCENT = (0xF0, 0xC1, 0x4B, 255)
TAVERN_DANGER = (0xC2, 0x3A, 0x3A, 255)
TAVERN_DANGER_DEEP = (0x6B, 0x12, 0x18, 255)
TAVERN_LIFE = (0xB8, 0x3B, 0x3B, 255)
TAVERN_LIFE_EMPTY = (0x4A, 0x30, 0x28, 255)
TAVERN_SUCCESS = (0xD4, 0xA0, 0x17, 255)
TAVERN_SETTLE = (0x3D, 0x6B, 0x4A, 255)
TAVERN_GHOST = (0x6E, 0x7A, 0x86, 255)


def _crc(chunk_type: bytes, data: bytes) -> int:
    return zlib.crc32(chunk_type + data) & 0xFFFFFFFF


def write_png(path: Path, width: int, height: int, rgba: list[tuple[int, int, int, int]]) -> None:
    raw = bytearray()
    i = 0
    for _y in range(height):
        raw.append(0)
        for _x in range(width):
            r, g, b, a = rgba[i]
            raw.extend((r, g, b, a))
            i += 1
    compressed = zlib.compress(bytes(raw), 9)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    chunks = [
        b"\x89PNG\r\n\x1a\n",
        struct.pack(">I", 13) + b"IHDR" + ihdr + struct.pack(">I", _crc(b"IHDR", ihdr)),
        struct.pack(">I", len(compressed)) + b"IDAT" + compressed + struct.pack(">I", _crc(b"IDAT", compressed)),
        struct.pack(">I", 0) + b"IEND" + struct.pack(">I", _crc(b"IEND", b"")),
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"".join(chunks))


def fill(w: int, h: int, color: tuple[int, int, int, int]) -> list[tuple[int, int, int, int]]:
    return [color] * (w * h)


def rect(
    pixels: list[tuple[int, int, int, int]],
    w: int,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    color: tuple[int, int, int, int],
) -> None:
    h = len(pixels) // w
    x0 = max(0, x0)
    y0 = max(0, y0)
    x1 = min(w, x1)
    y1 = min(h, y1)
    for y in range(y0, y1):
        row = y * w
        for x in range(x0, x1):
            pixels[row + x] = color


def frame(
    pixels: list[tuple[int, int, int, int]],
    w: int,
    h: int,
    t: int,
    color: tuple[int, int, int, int],
) -> None:
    rect(pixels, w, 0, 0, w, t, color)
    rect(pixels, w, 0, h - t, w, h, color)
    rect(pixels, w, 0, 0, t, h, color)
    rect(pixels, w, w - t, 0, w, h, color)


def glyph_bar(
    pixels: list[tuple[int, int, int, int]],
    w: int,
    h: int,
    color: tuple[int, int, int, int],
) -> None:
    """Simple centered bar so placeholders are visually distinct without fonts."""
    bw = max(8, w // 3)
    bh = max(6, h // 8)
    x0 = (w - bw) // 2
    y0 = (h - bh) // 2
    rect(pixels, w, x0, y0, x0 + bw, y0 + bh, color)


def make_block(
    path: Path,
    w: int,
    h: int,
    bg: tuple[int, int, int, int],
    border: tuple[int, int, int, int],
    mark: tuple[int, int, int, int],
    transparent: bool = False,
) -> None:
    base = (bg[0], bg[1], bg[2], 0 if transparent else bg[3])
    pixels = fill(w, h, base)
    if transparent:
        # Keep a filled inner panel with alpha so it is visible over table.
        inset = max(4, min(w, h) // 16)
        inner = (bg[0], bg[1], bg[2], 230)
        rect(pixels, w, inset, inset, w - inset, h - inset, inner)
        frame(pixels, w, h, max(3, min(w, h) // 24), border)
        glyph_bar(pixels, w, h, mark)
    else:
        frame(pixels, w, h, max(3, min(w, h) // 24), border)
        glyph_bar(pixels, w, h, mark)
    write_png(path, w, h, pixels)


P0: list[tuple[str, int, int, tuple[int, int, int, int], tuple[int, int, int, int], tuple[int, int, int, int], bool]] = [
    ("art_dealer_bust_idle", 324, 432, TAVERN_PANEL, TAVERN_BRASS, TAVERN_CANDLE, True),
    ("art_dealer_bust_announce", 324, 432, TAVERN_PANEL, TAVERN_ACCENT, TAVERN_PAPER, True),
    ("art_ai_timid_idle", 216, 216, TAVERN_FELT, TAVERN_MUTE, TAVERN_PAPER, True),
    ("art_ai_timid_hold", 216, 216, TAVERN_FELT, TAVERN_BRASS, TAVERN_MUTE, True),
    ("art_ai_timid_break", 216, 216, TAVERN_DANGER_DEEP, TAVERN_DANGER, TAVERN_PAPER, True),
    ("art_ai_shark_idle", 216, 216, TAVERN_PANEL, TAVERN_ACCENT, TAVERN_CANDLE, True),
    ("art_ai_shark_hold", 216, 216, TAVERN_PANEL, TAVERN_BRASS, TAVERN_ACCENT, True),
    ("art_ai_shark_break", 216, 216, TAVERN_DANGER_DEEP, TAVERN_DANGER, TAVERN_ACCENT, True),
    ("art_ai_karen_idle", 216, 216, TAVERN_PANEL, TAVERN_DANGER, TAVERN_PAPER, True),
    ("art_ai_karen_hold", 216, 216, TAVERN_PANEL, TAVERN_CANDLE, TAVERN_DANGER, True),
    ("art_ai_karen_break", 216, 216, TAVERN_DANGER_DEEP, TAVERN_PAPER, TAVERN_DANGER, True),
    ("art_frame_player_idle", 216, 216, (0, 0, 0, 0), TAVERN_BRASS, TAVERN_CANDLE, True),
    ("art_frame_player_ghost", 216, 216, (0, 0, 0, 0), TAVERN_GHOST, TAVERN_GHOST, True),
    ("art_fx_candle_stare", 144, 144, (0, 0, 0, 0), TAVERN_CANDLE, TAVERN_ACCENT, True),
    ("art_card_a", 240, 336, (0x2A, 0x16, 0x12, 255), TAVERN_CANDLE, TAVERN_CANDLE, True),
    ("art_card_k", 240, 336, (0x2A, 0x16, 0x12, 255), TAVERN_BRASS, TAVERN_BRASS, True),
    ("art_card_q", 240, 336, (0x2A, 0x16, 0x12, 255), TAVERN_PAPER, TAVERN_PAPER, True),
    ("art_card_joker", 240, 336, TAVERN_BG, TAVERN_ACCENT, TAVERN_DANGER, True),
    ("art_card_back", 240, 336, TAVERN_PANEL, TAVERN_BRASS, TAVERN_CANDLE, True),
    ("art_card_privacy_mask", 240, 336, (0x0E, 0x1A, 0x22, 204), TAVERN_SHADOW, TAVERN_SHADOW, True),
    ("art_card_glow", 260, 356, (0, 0, 0, 0), TAVERN_ACCENT, TAVERN_ACCENT, True),
    ("art_table_bg", 1080, 2340, TAVERN_BG, TAVERN_FELT, TAVERN_BRASS, False),
    ("art_pool_slot", 168, 232, (0, 0, 0, 0), TAVERN_BRASS, TAVERN_MUTE, True),
    ("art_life_cup_full", 96, 96, (0, 0, 0, 0), TAVERN_BRASS, TAVERN_LIFE, True),
    ("art_life_cup_empty", 96, 96, (0, 0, 0, 0), TAVERN_BRASS, TAVERN_LIFE_EMPTY, True),
    ("art_claim_badge_a", 144, 144, TAVERN_PANEL, TAVERN_CANDLE, TAVERN_CANDLE, True),
    ("art_claim_badge_k", 144, 144, TAVERN_PANEL, TAVERN_BRASS, TAVERN_BRASS, True),
    ("art_claim_badge_q", 144, 144, TAVERN_PANEL, TAVERN_PAPER, TAVERN_PAPER, True),
    ("art_play_soft", 144, 144, TAVERN_FELT, TAVERN_ACCENT, TAVERN_PAPER, True),
    ("art_play_slam", 144, 144, TAVERN_FELT, TAVERN_DANGER, TAVERN_PAPER, True),
    ("art_play_hesitate", 144, 144, TAVERN_FELT, TAVERN_MUTE, TAVERN_PAPER, True),
    ("art_emote_smile", 144, 144, TAVERN_FELT, TAVERN_CANDLE, TAVERN_ACCENT, True),
    ("art_emote_stare_nod", 144, 144, TAVERN_FELT, TAVERN_BRASS, TAVERN_PAPER, True),
    ("art_emote_panic", 144, 144, TAVERN_FELT, TAVERN_DANGER, TAVERN_DANGER, True),
    ("art_emote_smirk", 144, 144, TAVERN_FELT, TAVERN_ACCENT, TAVERN_CANDLE, True),
    ("art_challenge_pose_slam", 144, 144, TAVERN_PANEL, TAVERN_DANGER, TAVERN_PAPER, True),
    ("art_challenge_pose_toast", 144, 144, TAVERN_PANEL, TAVERN_CANDLE, TAVERN_PAPER, True),
    ("art_challenge_pose_point", 144, 144, TAVERN_PANEL, TAVERN_ACCENT, TAVERN_PAPER, True),
    ("art_fx_smash_cup", 360, 360, (0, 0, 0, 0), TAVERN_DANGER, TAVERN_PAPER, True),
    ("art_fx_wine_splash", 480, 320, (0, 0, 0, 0), TAVERN_LIFE, TAVERN_DANGER, True),
    ("art_result_bar_win", 1080, 120, TAVERN_SUCCESS, TAVERN_ACCENT, TAVERN_BG, True),
    ("art_result_bar_lose", 1080, 120, TAVERN_DANGER_DEEP, TAVERN_DANGER, TAVERN_PAPER, True),
    ("art_hl_long_bluff", 96, 96, TAVERN_PANEL, TAVERN_ACCENT, TAVERN_CANDLE, True),
    ("art_hl_best_challenge", 96, 96, TAVERN_PANEL, TAVERN_SETTLE, TAVERN_PAPER, True),
    ("art_hl_worst_break", 96, 96, TAVERN_PANEL, TAVERN_DANGER, TAVERN_PAPER, True),
    ("art_sign_knock", 144, 144, TAVERN_FELT, TAVERN_BRASS, TAVERN_PAPER, True),
    ("art_sign_ok", 144, 144, TAVERN_FELT, TAVERN_SETTLE, TAVERN_PAPER, True),
    ("art_sign_no", 144, 144, TAVERN_FELT, TAVERN_DANGER, TAVERN_DANGER, True),
]


def make_icon(path: Path, size: int) -> None:
    pixels = fill(size, size, TAVERN_BG)
    m = size // 8
    rect(pixels, size, m, m, size - m, size - m, TAVERN_PANEL)
    frame(pixels, size, size, max(4, size // 32), TAVERN_BRASS)
    glyph_bar(pixels, size, size, TAVERN_CANDLE)
    write_png(path, size, size, pixels)


def main() -> None:
    MEDIA.mkdir(parents=True, exist_ok=True)
    APP_MEDIA.mkdir(parents=True, exist_ok=True)
    for name, w, h, bg, border, mark, trans in P0:
        make_block(MEDIA / f"{name}.png", w, h, bg, border, mark, trans)
    make_icon(APP_MEDIA / "app_icon.png", 512)
    make_icon(MEDIA / "app_icon.png", 512)
    make_icon(MEDIA / "startIcon.png", 216)
    print(f"wrote {len(P0)} art placeholders + icons")


if __name__ == "__main__":
    main()
