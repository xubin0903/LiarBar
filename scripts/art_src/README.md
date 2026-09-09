# 大厅 v2 源图（处理前）

本目录只放 **Pillow 处理用源图**，不是 `$r` 槽位。交件 PNG 在 `entry/src/main/resources/base/media/art_*`。

生成脚本：仓库根 `scripts/gen_lobby_v2_art.py`。

| 源文件 | 用途 |
|--------|------|
| `src_splash.png` | 门脸 / 「谎馆」招牌 → `art_splash_still.png` |
| `src_lobby.png` | 桌场景景深 → `art_lobby_bg.png`、`art_table_bg.png` |
| `src_dealer_idle.png` | 荷官 idle → `art_dealer_bust_idle.png` |
| `src_dealer_announce.png` | 荷官 announce（举牌）→ `art_dealer_bust_announce.png` |
| `src_btn_primary.png` | 木纹铜框 CTA 常态 → `art_btn_primary.png` |
| `src_btn_primary_on.png` | accent 金面按下态 → `art_btn_primary_on.png` |
| `src_input_field.png` | 木框内凹输入槽 → `art_input_field.png` |

**旧脚本** `gen_lobby_p0_art.py` / `gen_scaffold_assets.py` 产出的 Pillow 色块 = **占位**，不是本批交件。

大厅氛围 v3 四态不另放源图：从已交 `art_dealer_bust_idle` 派生，脚本是仓库根 `scripts/gen_lobby_v3_art.py`。音频见 `scripts/gen_lobby_v3_audio.py`。

| 源文件 | 用途 |
|--------|------|
| `src_fx_candle.jpg` | 焰源（棋盘/黑底烤在像素里）→ key 成 `art_fx_candle.png`。`--candle-only` 重出。 |
