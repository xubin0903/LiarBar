# 出牌飞出 SFX · PlayLaunch / PlayLanded 两槽真源

| 项 | 内容 |
|----|------|
| 文档版本 | v1.0 |
| 状态 | **交件 ≠ 占位** · **合入 ≠ 终验** · **零 ets** |
| 本 PR | `feat/art-sfx-play-launch-land` → `develop` |
| 生成 | `scripts/gen_play_fly_sfx.py`（numpy 程序化 Foley，无第三方采样） |
| 对照 | [16 第1节](./16-局内出牌飞出与身前扣牌规格.md) · [13 §5.2](./13-局内声场与伴奏规格.md) 出牌材质族 · 署名 [ATTRIBUTION-audio.md](./ATTRIBUTION-audio.md) |

> **两枚新槽。** 只交 `sfx_play_launch.wav` + `sfx_play_land.wav`。  
> **翻牌 / 熄灭不动。** `sfx_card_flip.wav` / `sfx_life_extinguish.wav` 本票不写、不裁头。  
> **§5.2 出牌三槽不动。** `sfx_play_soft` / `_slam` / `_hesitate` 仍冻结。  
> **禁止** beep / 系统咔哒 / 纯正弦 tip / chiptune / 任何 `.ets`。  
> **合入 ≠ 终验。** 耳闸：launch 跟 PlayLaunch，land 跟 PlayLanded；不得系统 click 感。

---

## 1. 为什么两槽

16 第1节飞窗 **320ms**（280～400）。确认后要两记可分开的拍：

| 拍 | 听感 | 窗 |
|----|------|----|
| **PlayLaunch** | 牌离手：干纸短刮 / 轻扫 | **60–90ms**，贴飞出 kickoff |
| **PlayLanded** | 身前落毡：闷桌 / 绿呢一触 | **80–120ms**，贴扇形成形 |

一槽拉长 whoosh 会糊进 320ms 窗，听不出起飞 vs 落地。两槽短、干、对拍。

16 §5 仍写默认挂 `lb_sfx_soft`（docs-only，本票不改 16 正文）。本批交出 **专用新槽**，给后续 `feat/client-*` 换绑。**本 PR 零 ets。**

---

## 2. 槽映射（文件 → 调用）

路径一律：`entry/src/main/resources/rawfile/audio/sfx/`。

| 文件 | 媒体 id | 调用 | 何时 |
|------|---------|------|------|
| `sfx_play_launch.wav` | `sfx_play_launch` | **`lb_sfx_play_launch`** | PlayLaunch 起 · 与飞出视觉同 onset |
| `sfx_play_land.wav` | `sfx_play_land` | **`lb_sfx_play_land`** | PlayLanded 起 · 与身前扇形成形同 onset |

**禁翻牌槽误用：** `lb_sfx_card_flip` **只属 S15-4 点按翻面**。飞出 / 落地 **禁止** 复用翻牌槽（与熄灭禁复用同一口径）。也禁止拿 `sfx_cta_tap` / 系统按键音冒充。

---

## 3. 实测

| 项 | 规格 | `sfx_play_launch.wav` | `sfx_play_land.wav` |
|----|------|-----------------------|---------------------|
| 格式 | WAV PCM16 · 48 kHz **mono** | **pcm_s16le · 48000 Hz · 1ch** | **pcm_s16le · 48000 Hz · 1ch** |
| 时长 | launch **60–90ms** · land **80–120ms** | **76.00 ms**（3648 frames） | **104.00 ms**（4992 frames） |
| 峰值 | 约 −11～−8 dBFS | **−10.00 dBFS** | **−9.50 dBFS** |
| 头静音 | ≈0 ms；`<-40 dB` 须 ≪5ms | **0.000 ms**（0 samples） | **0.000 ms**（0 samples） |
| 起音 | 攻击在首帧 / 首几个采样 | 第 1 样本 **−22.7 dBFS** | 第 1 样本 **−10.5 dBFS** |
| 字节 | — | **7340** | **10028** |
| 材质 | 酒馆 / 毡 Foley；干纸 vs 闷落 | 干纸刮扫（中高频摩擦，非 snap） | 绿呢闷触（能量在 &lt;800 Hz） |
| 调用 | `lb_sfx_*` | **`lb_sfx_play_launch`** | **`lb_sfx_play_land`** |

频谱对照（交件自检，不是听闸数字）：launch 质心约 **6.8 kHz**、能量在 0.8–6 kHz 纸刮；land 质心约 **3.4 kHz**、约 76% 能量在 800 Hz 以下闷毡。两记在 320ms 飞窗内可分开。

冻结对照（本票 **未改**）：

| 文件 | sha256 | 口径 |
|------|--------|------|
| `sfx_card_flip.wav` | `1562f6ef890946ce6100a752b40a7e5e69edf23476d5dd129bfc8037ce5961b0` | 与 develop 翻牌短促起势一致 |
| `sfx_life_extinguish.wav` | `bd96d4d91a20c0c1c65bf63c8f527a1f60e0c0b75b84ec9703a0434e5c1c0437` | 与 develop / #108 一致；**不裁头** |

---

## 4. 来源 / 授权

**原作程序化** · 团队脚本合成 · **CC0-equivalent**（无第三方媒体 id）。

- 生成：`python3 scripts/gen_play_fly_sfx.py`
- **未** 嵌入外部 clip；无需 OGA / Freesound 媒体 id
- **未** 使用 beep / 纯正弦 tip / chiptune / 系统 click
- 噪声带通 + 一极点滤波；**无** 正弦叠层 / 方波 tip

署名登记见 [ATTRIBUTION-audio.md](./ATTRIBUTION-audio.md)。

---

## 5. 明确未做

- 任何 `.ets` / 布局 / 挂点 / `Ids.ets` 换绑
- `sfx_card_flip.wav` / `sfx_life_extinguish.wav` 裁头或重烤
- `sfx_play_soft` / `_slam` / `_hesitate` / 发牌三槽 / §5.2 其余冻结槽
- 质疑 `sfx_challenge_*`、BGM
- 改 16 第1节线框数字（飞 320ms / 扇形° / 露边 10vp / 禁抬 `padB` 不动）

---

## 6. 自检

- [x] 只新增两枚 wav；翻牌 / 熄灭 sha256 与 develop 一致
- [x] 两文件 48 kHz mono PCM16；launch 76.00ms · −10.00 dBFS；land 104.00ms · −9.50 dBFS；头静音 0ms
- [x] 非 beep / 非系统 click；槽 `lb_sfx_play_launch` / `lb_sfx_play_land`；零 ets
- [ ] **@LiarBar测试** Rebuild 耳闸：launch 跟 PlayLaunch，land 跟 PlayLanded；无系统 click 感
- [ ] **@LiarBar鸿蒙** 后续票换绑（本 PR 不改 ets）
- [ ] **@LiarBar负责人** 会签

合入 ≠ 终验。

---

*维护人：美术 / 音频岗 · 2026-09-13 · 零 ets · 合入≠终验*
