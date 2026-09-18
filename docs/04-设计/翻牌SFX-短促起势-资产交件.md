# 翻牌 SFX · 短促起势同槽覆盖

| 项 | 内容 |
|----|------|
| 文档版本 | v1.0 |
| 状态 | **交件 ≠ 占位** · **合入 ≠ 终验** · **零 ets** |
| 本 PR | `feat/art-sfx-flip-punch` → `develop` |
| 生成 | `scripts/gen_card_flip_punch_sfx.py`（numpy 程序化 Foley，无第三方采样） |
| 对照 | [15a](./15a-翻牌选牌SFX与失败短句.md) · [15 §7](./15-局内手牌触摸出牌规格.md) · [#108 精致化交件](./生命烛精致化-资产交件.md) · 署名 [ATTRIBUTION-audio.md](./ATTRIBUTION-audio.md) |

> **同槽覆盖。** 只换 `sfx_card_flip.wav`。调用点仍是 `lb_sfx_card_flip`。  
> **熄灭不动。** `sfx_life_extinguish.wav` 本票不写、不裁头。  
> **禁止** 新槽名 / beep / 纯正弦 tip / chiptune / 任何 `.ets`。  
> **合入 ≠ 终验。** Rebuild 听闸：翻牌须与翻面动效同起（不是翻完才响）。

---

## 1. 为什么换

#108 入库的翻牌槽是 **200ms** 纸翻 + 头段约 **8ms** `<-40 dB` 软起。耳起音容易落到翻面动画之后。本票把同一文件换成 **80–100ms** 干纸拍 / 桌牌短拍，**起音贴在第 1 个采样**，让耳 onset 更靠近 T0。

---

## 2. 同槽文件

路径：`entry/src/main/resources/rawfile/audio/sfx/sfx_card_flip.wav`  
媒体 id **`sfx_card_flip`** · 调用 **`lb_sfx_card_flip`**（不改名、不另起平行槽）。

| 项 | 规格 | 本批实测 |
|----|------|----------|
| 格式 | WAV PCM16 · 48 kHz **mono** | **pcm_s16le · 48000 Hz · 1ch** |
| 时长 | **80–100ms** | **92.00 ms**（4416 frames） |
| 峰值 | 约 −11～−8 dBFS（对齐 #108 窗） | **−10.00 dBFS** |
| 头静音 | ≈0 ms；`<-40 dB` 须 ≪5ms | **0.000 ms**（0 samples）；零采样头 **0.000 ms** |
| 起音 | 攻击在首帧 / 首几个采样 | 第 1 样本 **−25.6 dBFS**；前 8 样本均高于 −40 dB |
| 字节 | — | **8876** |
| 材质 | 干纸拍 / 短桌牌 snap；脆瞬态 + 短衰减 | 带通噪声 Foley（snap + 纸身 + 毡吻）；**非 beep、非正弦 tip、非长 whoosh** |

熄灭对照（本票 **未改**）：

| 文件 | sha256 | 口径 |
|------|--------|------|
| `sfx_life_extinguish.wav` | `bd96d4d91a20c0c1c65bf63c8f527a1f60e0c0b75b84ec9703a0434e5c1c0437` | 与 develop / #108 一致；**不裁头** |

---

## 3. 来源 / 授权

**原作程序化** · 团队脚本合成 · **CC0-equivalent**（无第三方媒体 id）。

- 生成：`python3 scripts/gen_card_flip_punch_sfx.py`
- **未** 嵌入外部 clip；无需 OGA / Freesound 媒体 id
- **未** 使用 beep / 纯正弦 tip / chiptune
- `scripts/gen_life_candle_polish_art.py` **不再写** `sfx_card_flip.wav`（避免回烤 200ms 旧件）

署名登记见 [ATTRIBUTION-audio.md](./ATTRIBUTION-audio.md)。

---

## 4. 明确未做

- 任何 `.ets` / 布局 / 挂点 / 新槽名
- `sfx_life_extinguish.wav` 裁头或重烤
- 质疑 SFX、BGM、发牌三槽、§5.2 八槽
- `lb_sfx_card_select` / `lb_sfx_play_confirm`

---

## 5. 自检

- [x] 只改 `sfx_card_flip.wav`；熄灭 sha256 与 develop 一致
- [x] 48 kHz mono PCM16 · 92.00ms · peak −10.00 dBFS · 头静音 0ms
- [x] 非 beep；同槽 `lb_sfx_card_flip`；零 ets
- [ ] **@LiarBar测试** Rebuild 听闸：翻牌须与翻面动效同起（不是翻完才响）
- [ ] **@LiarBar负责人** 会签

合入 ≠ 终验。

---

*维护人：美术 / 音频岗 · 2026-09-13 · 零 ets · 合入≠终验*
