#!/usr/bin/env python3
"""PLACEHOLDER art_* for 14 candles + 15 confirm chrome (no DevEco).

Art co-signed the slot names. Illustrated PNG may replace these files
in-place; $r ids stay art_life_candle_* / art_btn_play_confirm*.
Not a system-gray button. Not a rule change.
"""

from __future__ import annotations

from pathlib import Path

from gen_scaffold_assets import (
    MEDIA,
    TAVERN_ACCENT,
    TAVERN_BRASS,
    TAVERN_CANDLE,
    TAVERN_DANGER,
    TAVERN_FELT,
    TAVERN_MUTE,
    TAVERN_PANEL,
    TAVERN_PAPER,
    fill,
    frame,
    rect,
    write_png,
)


def candle(kind: str) -> list[tuple[int, int, int, int]]:
    w = h = 96
    pixels = fill(w, h, (0, 0, 0, 0))
    # Stem (brass) — same for all three so count+shape carry the state.
    rect(pixels, w, 40, 52, 56, 88, TAVERN_BRASS)
    rect(pixels, w, 36, 84, 60, 90, TAVERN_FELT)
    if kind == "full":
        # Tall warm flame.
        rect(pixels, w, 38, 18, 58, 54, TAVERN_CANDLE)
        rect(pixels, w, 42, 10, 54, 22, TAVERN_ACCENT)
        rect(pixels, w, 44, 28, 52, 48, TAVERN_PAPER)
    elif kind == "hurt":
        # Half-height, dimmer — 残血.
        rect(pixels, w, 40, 32, 56, 54, TAVERN_MUTE)
        rect(pixels, w, 44, 24, 52, 36, TAVERN_CANDLE)
        rect(pixels, w, 38, 70, 42, 86, TAVERN_DANGER)  # crack
    else:
        # Ember only — 濒死 / extinguished pip.
        rect(pixels, w, 42, 42, 54, 54, TAVERN_DANGER)
        rect(pixels, w, 46, 38, 50, 44, TAVERN_CANDLE)
    return pixels


def confirm(on: bool) -> list[tuple[int, int, int, int]]:
    w, h = 720, 144
    fill_c = TAVERN_ACCENT if on else TAVERN_PANEL
    border = TAVERN_ACCENT if on else TAVERN_BRASS
    mark = TAVERN_PAPER if on else TAVERN_CANDLE
    pixels = fill(w, h, (fill_c[0], fill_c[1], fill_c[2], 0))
    inset = 8
    inner = (fill_c[0], fill_c[1], fill_c[2], 235)
    rect(pixels, w, inset, inset, w - inset, h - inset, inner)
    frame(pixels, w, h, 8, border)
    frame(pixels, w, h, 3, TAVERN_CANDLE)
    # Center plaque — not a gray system chip.
    rect(pixels, w, 220, 48, 500, 96, mark)
    return pixels


def main() -> None:
    MEDIA.mkdir(parents=True, exist_ok=True)
    write_png(MEDIA / "art_life_candle_full.png", 96, 96, candle("full"))
    write_png(MEDIA / "art_life_candle_hurt.png", 96, 96, candle("hurt"))
    write_png(MEDIA / "art_life_candle_dying.png", 96, 96, candle("dying"))
    write_png(MEDIA / "art_btn_play_confirm.png", 720, 144, confirm(False))
    write_png(MEDIA / "art_btn_play_confirm_on.png", 720, 144, confirm(True))
    print("wrote PLACEHOLDER art_life_candle_* + art_btn_play_confirm*")


if __name__ == "__main__":
    main()
