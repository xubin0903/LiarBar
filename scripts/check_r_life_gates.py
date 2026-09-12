#!/usr/bin/env python3
"""Static 14b R-LIFE gates. Not device Rebuild — 合入≠终验."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENTRY = ROOT / "entry/src/main/ets"
MEDIA = ROOT / "entry/src/main/resources/base/media"
AUDIO = ROOT / "entry/src/main/resources/rawfile/audio/sfx"

LAYERED = (
    "art_life_candle_body.png",
    "art_life_candle_flame_full.png",
    "art_life_candle_flame_hurt.png",
    "art_life_candle_flame_dying.png",
    "art_life_candle_extinguish_0.png",
    "art_life_candle_extinguish_1.png",
    "art_life_candle_extinguish_2.png",
    "art_life_candle_extinguish_3.png",
    "art_life_candle_flame_full_0.png",
    "art_life_candle_flame_full_1.png",
    "art_life_candle_flame_full_2.png",
    "art_life_candle_flame_full_3.png",
)
FALLBACK = (
    "art_life_candle_full.png",
    "art_life_candle_hurt.png",
    "art_life_candle_dying.png",
)
WAVS = ("sfx_card_flip.wav", "sfx_life_extinguish.wav")


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def main() -> None:
    life = read("entry/src/main/ets/features/table/LifeCandles.ets")
    fx = read("entry/src/main/ets/features/table/LifeFx.ets")
    table = read("entry/src/main/ets/pages/Table.ets")
    ids = read("entry/src/main/ets/common/Ids.ets")
    player = read("entry/src/main/ets/features/table/SoundPlayer.ets")
    engine = read("entry/src/main/ets/engine/MatchEngine.ets")
    debug = read("entry/src/main/ets/common/DebugBuild.ets")
    defaults = read("entry/src/main/resources/rawfile/config/match_defaults.json")

    if "@Prop showDigit" in life or "showDigit:" in table or "this.showDigit" in life:
        raise SystemExit("R-LIFE-1: showDigit still on the main path")
    if "TXT_LIFE_SELF" in life or "ControlIds.TXT_LIFE_SELF" in table:
        raise SystemExit("R-LIFE-1: lb_txt_life_self still mounted")
    if "Text(`${this.lives}`)" in life:
        raise SystemExit("R-LIFE-1: visible life digit Text remains")

    for name in LAYERED + FALLBACK:
        path = MEDIA / name
        if not path.is_file() or path.stat().st_size < 400:
            raise SystemExit(f"media missing/tiny: {name}")
    body = MEDIA / "art_life_candle_body.png"
    if body.stat().st_size < 10000:
        raise SystemExit("R-LIFE-2: body is still a placeholder, not #108 real art")
    if "art_life_candle_body" not in life or "art_life_candle_flame_full_0" not in life:
        raise SystemExit("R-LIFE-2/3: layered $r / full loop not bound")
    if "art_life_candle_full" not in life:
        raise SystemExit("fallback old full/hurt/dying path missing")
    if "armFullLoop" not in life or "flame_full_3" not in life:
        raise SystemExit("R-LIFE-3: no real flame_full_0..3 loop")

    if "EXTINGUISH_TOTAL_MS: number = 280" not in fx:
        raise SystemExit("R-LIFE-4: total window not 280ms")
    if "EXTINGUISH_FRAME_MS: number = 70" not in fx:
        raise SystemExit("R-LIFE-4: frame window not 70ms")
    if "EXTINGUISH_FRAMES: number = 4" not in fx or "EXTINGUISH_MAX_FRAMES: number = 4" not in fx:
        raise SystemExit("R-LIFE-4: extinguish must be 0..3 (≤4)")
    if "art_life_candle_extinguish_3" not in life:
        raise SystemExit("R-LIFE-4: extinguish_0..3 not bound")
    if "playCardFlip" in life:
        raise SystemExit("R-LIFE-4: extinguish must not play card flip")
    if "playLifeExtinguish" not in life:
        raise SystemExit("R-LIFE-4: SFX call-sites missing on drop")
    if 'static readonly CARD_FLIP: string = \'lb_sfx_card_flip\'' not in ids:
        raise SystemExit("call slot must stay lb_sfx_card_flip")
    if 'static readonly LIFE_EXTINGUISH: string = \'lb_sfx_life_extinguish\'' not in ids:
        raise SystemExit("call slot must stay lb_sfx_life_extinguish")

    if "DEBUG_OPEN" not in ids or "lb_btn_debug_open" not in ids:
        raise SystemExit("R-LIFE-5: lb_btn_debug_open missing")
    if "DEBUG_LIFE" not in ids or "lb_cmp_debug_life" not in ids:
        raise SystemExit("R-LIFE-5: lb_cmp_debug_life missing")
    if "DEBUG_LIFE_DEC" not in ids or "lb_btn_debug_life_dec" not in ids:
        raise SystemExit("R-LIFE-5: locked button id missing")
    if "debugLifeChrome" not in table or "debugLifePanel" not in table:
        raise SystemExit("R-LIFE-5: debug open/panel missing")
    if "debugLifeOpen" not in table or "onDebugLifeDec" not in table:
        raise SystemExit("R-LIFE-5: panel toggle / −1 missing")
    if "lifeDecShown" not in table or "lifeDecShown" not in debug:
        raise SystemExit("R-LIFE-5: release hide gate missing")
    if "debugDecLife" not in engine:
        raise SystemExit("R-LIFE-5: engine debug −1 missing")
    # Seat chips must not −1 by themselves (that was the overlay strip).
    chip = table.split("@Builder\n  debugSeatChip", 1)
    if len(chip) < 2:
        raise SystemExit("R-LIFE-5: seat chip builder missing")
    chip_body = chip[1].split("@Builder", 1)[0]
    if "onDebugLifeDec" in chip_body:
        raise SystemExit("R-LIFE-5: seat chip still fires −1 on the table")

    floats = json.loads(read("entry/src/main/resources/base/element/float.json"))
    vp: dict[str, float] = {}
    for item in floats["float"]:
        raw = str(item["value"])
        if raw.endswith("vp"):
            vp[str(item["name"])] = float(raw[:-2])
    self_n = vp.get("life_pip_self", 0)
    seat_n = vp.get("life_pip_seat", 0)
    self_s = vp.get("life_pip_self_small", 0)
    seat_s = vp.get("life_pip_seat_small", 0)
    open_sz = vp.get("debug_open_size", 0)
    if self_n < 30 or self_n > 33:
        raise SystemExit(f"R-LIFE-6: life_pip_self {self_n}vp not in 30～32 (cap 33)")
    if seat_n < 20 or seat_n > 22:
        raise SystemExit(f"R-LIFE-6: life_pip_seat {seat_n}vp not in 20～22")
    if self_s != 22 or seat_s != 17:
        raise SystemExit(f"R-LIFE-6: L-small must be 22 / 17, got {self_s} / {seat_s}")
    if open_sz < 28 or open_sz > 32:
        raise SystemExit(f"R-LIFE-5: debug_open_size {open_sz}vp not in 28～32")
    if "pipVp()" not in life:
        raise SystemExit("R-LIFE-6: body/flame must share pipVp()")

    if "pool.play" not in player or "sfx_card_flip.wav" not in player:
        raise SystemExit("flip is still log-only / no SoundPlayer path")
    if "SoundPlayer.playCardFlip" not in table:
        raise SystemExit("Table noteSfx does not play card flip")
    for name in WAVS:
        path = AUDIO / name
        if not path.is_file() or path.stat().st_size < 200:
            raise SystemExit(f"wav missing/tiny: {name}")

    if '"lives_default": 3' not in defaults:
        raise SystemExit("lives_default was changed")
    if '"max_play_cards": 3' not in defaults:
        raise SystemExit("max_play_cards was changed")
    dec = engine.split("debugDecLife(seatId: number): boolean {", 1)[1].split("\n  }", 1)[0]
    if "toRecap" in dec or "intentChallenge" in dec:
        raise SystemExit("debugDecLife must not jump to recap or unfreeze challenge")

    print("R-LIFE-1..6 static gates + flip SoundPlayer + locks OK")


if __name__ == "__main__":
    main()
