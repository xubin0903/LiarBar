# 音频署名 · Attribution

课设可嵌素材的作者 / URL / 许可证。CC0 不强制署名，仍写清来源便于核验。

---

## 局内 BGM · `bgm_table_bluff`

| 项 | 内容 |
|----|------|
| 仓内文件 | `entry/src/main/resources/rawfile/audio/bgm/bgm_table_bluff.ogg` |
| 曲名 | **Moil** |
| 作者 | **Ruskerdax** |
| 许可 | **CC0**（Creative Commons CC0 1.0 Universal） |
| 源页 | https://opengameart.org/content/moil |
| 源文件 | https://opengameart.org/sites/default/files/ruskerdax_-_moil.mp3 |
| 本仓用法 | 从 56s 裁 32s，淡入 0.4s / 淡出 0.8s，`volume=-12.7dB`，转 Vorbis 48 kHz 立体声 |
| 源 mp3 | **不进仓** |

许可页：https://creativecommons.org/publicdomain/zero/1.0/

规格与实测见 [局内声场-资产交件.md](./局内声场-资产交件.md)。换源依据见 [13b-局内BGM打回换源.md](./13b-局内BGM打回换源.md)。

---

## 生命烛精致化 · 程序化 Foley（无第三方源）

本批 **未** 嵌入 CC0 / 商用库采样。两槽均为仓内脚本合成，**原作 · 程序化**。

| 项 | 内容 |
|----|------|
| 仓内文件 | `entry/src/main/resources/rawfile/audio/sfx/sfx_card_flip.wav` |
| 媒体 id / 调用 | `sfx_card_flip` · `lb_sfx_card_flip` |
| 许可 / 来源 | **原作程序化**（`scripts/gen_life_candle_polish_art.py` · 带通噪声纸翻 + 轻毡吻；非 beep / 非系统 click） |
| 实测 | 48 kHz mono PCM16 · 0.200s · peak −11.00 dBFS |

| 项 | 内容 |
|----|------|
| 仓内文件 | `entry/src/main/resources/rawfile/audio/sfx/sfx_life_extinguish.wav` |
| 媒体 id / 调用 | `sfx_life_extinguish` · `lb_sfx_life_extinguish` |
| 许可 / 来源 | **原作程序化**（同脚本 · 气声 hush + 短芯熄；非惨叫） |
| 实测 | 48 kHz mono PCM16 · 0.420s · peak −11.00 dBFS |

视觉分层（`art_life_candle_body` / `flame_*` / `extinguish_*`）同为 Pillow 程序化，色值只来自 [夜半酒馆-风格板](./夜半酒馆-风格板.md)；焰场复用 #104 脚本函数，**不**另引第三方插画。交件见 [生命烛精致化-资产交件.md](./生命烛精致化-资产交件.md)。

**未** 使用 numpy BGM 路径；**未** 生成 `sfx_challenge_*`。

---

*维护人：美术 / 音频岗 · 2026-09-10 · 2026-09-12 增补生命烛 Foley 程序化署名*
