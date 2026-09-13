# 质疑 SFX · enter / commit 两槽真源（第2节锁）

| 项 | 内容 |
|----|------|
| 文档版本 | v1.0 |
| 状态 | **交件 ≠ 占位** · **合入 ≠ 终验** · **零 ets** |
| 本 PR | `feat/art-sfx-challenge-enter-commit` → `develop` |
| 生成 | `scripts/gen_challenge_sfx.py`（numpy 程序化 Foley，无第三方采样） |
| 对照 | [出牌扣牌-状态机](../02-游戏设计/出牌扣牌-状态机.md) AwaitChallenge 入口 · [16 第1节](./16-局内出牌飞出与身前扣牌规格.md) 飞满窗后才进等待 · [13](./13-局内声场与伴奏规格.md) 旧四拍仍占位 · 署名 [ATTRIBUTION-audio.md](./ATTRIBUTION-audio.md) |

> **两枚新槽。** 只交 `sfx_challenge_enter.wav` + `sfx_challenge_commit.wav`。  
> **Pass 静音。** **不**写 `sfx_challenge_pass.wav` / `lb_sfx_challenge_pass`。  
> **翻牌 / 熄灭 / 飞出 / 落地不动。** `sfx_card_flip` / `sfx_life_extinguish` / `sfx_play_launch` / `sfx_play_land` 本票不写、不裁头。  
> **旧质疑四拍不动。** `sfx_challenge_windup` / `_standoff` / `_reveal` / `_result` 仍不生成。  
> **禁止** beep / 系统咔哒 / 纯正弦 tip / chiptune / 任何 `.ets`。  
> **合入 ≠ 终验。** 耳闸：enter 跟 AwaitChallenge **onEnter**，commit 跟 **质疑按下**（含真/假确认）；不得系统 click 感。

---

## 1. 为什么两槽

第2节锁：等待窗出现要一记压场，按下质疑 / 真假确认要一记短压。Pass **无声**。

| 拍 | 听感 | 窗 |
|----|------|----|
| **AwaitChallenge 出现** | 紧张低毡 + 金属一敲（不是 UI beep） | **80–120ms**，贴入口 onEnter |
| **质疑按下 / 真假确认** | 短促压力拍（指腹压毡） | **50–80ms**，贴按下 |

一槽拉长会糊成「又一声落桌」。两槽短、干、对拍。  
**禁止**拿 `lb_sfx_card_flip` / `lb_sfx_play_launch` / `lb_sfx_play_land` 冒充本两槽。

本批交出 **专用新槽**，给后续 `feat/client-*` 换绑。**本 PR 零 ets。**

---

## 2. 槽映射（文件 → 调用）

路径一律：`entry/src/main/resources/rawfile/audio/sfx/`。

| 文件 | 媒体 id | 调用 | 何时 |
|------|---------|------|------|
| `sfx_challenge_enter.wav` | `sfx_challenge_enter` | **`lb_sfx_challenge_enter`** | AwaitChallenge **onEnter** · 与等待窗出现同 onset |
| `sfx_challenge_commit.wav` | `sfx_challenge_commit` | **`lb_sfx_challenge_commit`** | 按下质疑 / 真假确认 · 与按压同 onset |
| — | — | **无** `lb_sfx_challenge_pass` | Pass **静音**。不交文件、不占槽 |

**禁误用（写死）：**

| 禁 | 只属 |
|----|------|
| `lb_sfx_card_flip` | S15-4 点按翻面 |
| `lb_sfx_play_launch` | 16 PlayLaunch 飞出 kickoff |
| `lb_sfx_play_land` | 16 PlayLanded 身前落毡 |
| 旧四拍 `sfx_challenge_windup` / `_standoff` / `_reveal` / `_result` | 13 §5.3 仍占位，本票不生成 |
| `sfx_cta_tap` / 系统按键音 / beep | 禁冒充本两槽 |

---

## 3. 实测

| 项 | 规格 | `sfx_challenge_enter.wav` | `sfx_challenge_commit.wav` |
|----|------|---------------------------|----------------------------|
| 格式 | WAV PCM16 · 48 kHz **mono** | **pcm_s16le · 48000 Hz · 1ch** | **pcm_s16le · 48000 Hz · 1ch** |
| 时长 | enter **80–120ms** · commit **50–80ms** | **100.00 ms**（4800 frames） | **64.00 ms**（3072 frames） |
| 峰值 | 约 −11～−8 dBFS | **−9.50 dBFS** | **−10.00 dBFS** |
| 头静音 | ≈0 ms；`<-40 dB` 须 ≪5ms | **0.000 ms**（0 samples） | **0.000 ms**（0 samples） |
| 起音 | 攻击在首帧 / 首几个采样 | 第 1 样本 **−20.1 dBFS** | 第 1 样本 **−27.8 dBFS** |
| 字节 | — | **9644** | **6188** |
| 材质 | 酒馆 Foley；低毡金属敲 vs 短压拍 | 低毡重量 + 中频金属一敲（非 beep） | 指腹压毡短拍（非 keypad） |
| 调用 | `lb_sfx_*` | **`lb_sfx_challenge_enter`** | **`lb_sfx_challenge_commit`** |

频谱对照（交件自检，不是听闸数字）：

| 文件 | 质心 | &lt;200 Hz | 200–800 | 0.8–2.5 kHz | 2.5–8 kHz |
|------|------|------------|---------|-------------|-----------|
| enter | 约 **4.7 kHz** | **22%** 毡重 | 35% | **30%** 金属敲 | 11%（压住纸亮） |
| commit | 约 **4.3 kHz** | 2% | **44%** 压拍体 | 34% | 19% |

与冻结槽盲听可分：flip / launch 是纸拍/纸刮（质心 6.8～9.8 kHz）；land 是闷毡、几乎无金属边。enter 低毡 + 金属敲；commit 更短、中频压力、无金属延音。

冻结对照（本票 **未改**）：

| 文件 | sha256 | 口径 |
|------|--------|------|
| `sfx_card_flip.wav` | `1562f6ef890946ce6100a752b40a7e5e69edf23476d5dd129bfc8037ce5961b0` | 与 develop 翻牌短促起势一致 |
| `sfx_life_extinguish.wav` | `bd96d4d91a20c0c1c65bf63c8f527a1f60e0c0b75b84ec9703a0434e5c1c0437` | 与 develop / #108 一致；**不裁头** |
| `sfx_play_launch.wav` | `167ce317e4762037ef2040b46f83d2af598b4ada1d91e57613ec29d169c6f06e` | 与 develop / #138 一致 |
| `sfx_play_land.wav` | `9938f24f2703419fb52917f24feab1734642d4098ef0250f3ccb2fe78dfc85a4` | 与 develop / #138 一致 |

本批新槽 sha256：

| 文件 | sha256 |
|------|--------|
| `sfx_challenge_enter.wav` | `555bf89094b030abf2dcdf157571b0395e90736305dd76e7977ea26e45ddc66a` |
| `sfx_challenge_commit.wav` | `fb3aa8be9019e02216fa21579d92d43d4f612922af142f617360fd345de9f1cd` |

---

## 4. 来源 / 授权

**原作程序化** · 团队脚本合成 · **CC0-equivalent**（无第三方媒体 id）。

- 生成：`python3 scripts/gen_challenge_sfx.py`
- **未** 嵌入外部 clip；无需 OGA / Freesound 媒体 id
- **未** 使用 beep / 纯正弦 tip / chiptune / 系统 click
- 噪声带通 + 一极点滤波；**无** 正弦振荡器 / 方波 tip
- **未** 生成 `sfx_challenge_pass.wav`

署名登记见 [ATTRIBUTION-audio.md](./ATTRIBUTION-audio.md)。

---

## 5. 明确未做

- 任何 `.ets` / 布局 / 挂点 / `Ids.ets` 换绑
- `sfx_card_flip.wav` / `sfx_life_extinguish.wav` / `sfx_play_launch.wav` / `sfx_play_land.wav` 裁头或重烤
- `sfx_challenge_pass.wav`（Pass 静音）
- 旧四拍 `sfx_challenge_windup` / `_standoff` / `_reveal` / `_result`
- `sfx_play_soft` / `_slam` / `_hesitate` / 发牌三槽 / §5.2 其余冻结槽 / BGM
- 改 16 第1节线框数字；不扩旧四拍仪式

---

## 6. 自检

- [x] 只新增两枚 wav；翻牌 / 熄灭 / launch / land sha256 与 develop 一致
- [x] 两文件 48 kHz mono PCM16；enter 100.00ms · −9.50 dBFS；commit 64.00ms · −10.00 dBFS；头静音 0ms
- [x] 非 beep / 非系统 click；槽 `lb_sfx_challenge_enter` / `lb_sfx_challenge_commit`；**无** pass 文件；零 ets
- [ ] **@LiarBar测试** Rebuild 耳闸：enter 跟 AwaitChallenge onEnter，commit 跟质疑按下；无系统 click 感；不得拿 flip / launch / land 冒充
- [ ] **@LiarBar鸿蒙** 后续票换绑（本 PR 不改 ets）
- [ ] **@LiarBar负责人** 会签

合入 ≠ 终验。

---

*维护人：美术 / 音频岗 · 2026-09-13 · 零 ets · 合入≠终验*
