#!/usr/bin/env python3
"""Static 14b R-LIFE gates. Not device Rebuild — 合入≠终验."""

from __future__ import annotations

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
    if "art_life_candle_body" not in life or "art_life_candle_flame_full" not in life:
        raise SystemExit("R-LIFE-2/3: layered $r not bound")
    if "art_life_candle_full" not in life:
        raise SystemExit("fallback old full/hurt/dying path missing")
    if "armFlameLoop" not in life or "flamePulse" not in life:
        raise SystemExit("R-LIFE-3: no flame loop intent")

    if "EXTINGUISH_TOTAL_MS: number = 240" not in fx:
        raise SystemExit("R-LIFE-4: total window not 240ms")
    if "EXTINGUISH_FRAME_MS: number = 80" not in fx:
        raise SystemExit("R-LIFE-4: frame window not 80ms")
    if "art_life_candle_extinguish_0" not in life:
        raise SystemExit("R-LIFE-4: extinguish_0/1/2 not bound")
    if "playCardFlip" not in life or "playLifeExtinguish" not in life:
        raise SystemExit("R-LIFE-4: SFX call-sites missing on drop")

    if "DEBUG_LIFE_DEC" not in ids or "lb_btn_debug_life_dec" not in ids:
        raise SystemExit("R-LIFE-5: locked button id missing")
    if "debugLifeDec" not in table or "onDebugLifeDec" not in table:
        raise SystemExit("R-LIFE-5: debug bar missing")
    if "lifeDecShown" not in table or "lifeDecShown" not in debug:
        raise SystemExit("R-LIFE-5: release hide gate missing")
    if "debugDecLife" not in engine:
        raise SystemExit("R-LIFE-5: engine debug −1 missing")

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

    print("R-LIFE-1..5 static gates + flip SoundPlayer + locks OK")


if __name__ == "__main__":
    main()
