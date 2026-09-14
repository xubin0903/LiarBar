# 开牌 SFX · reveal-draw / reveal-flip 两槽真源（第3节揭牌）

| 项 | 内容 |
|----|------|
| 文档版本 | v1.0 |
| 状态 | **交件 ≠ 占位** · **合入 ≠ 终验** · **零 ets** |
| 本 PR | `feat/art-sfx-reveal-draw-flip` → `develop`（Ready PR 已开） |
| 生成 | `scripts/gen_reveal_sfx.py`（numpy 程序化 Foley，无第三方采样） |
| 对照 | 质疑入口「ack 后再翻」· [质疑SFX-enter-commit-资产交件](./质疑SFX-enter-commit-资产交件.md) · [出牌飞出SFX-launch-land-资产交件](./出牌飞出SFX-launch-land-资产交件.md) · [翻牌SFX-短促起势-资产交件](./翻牌SFX-短促起势-资产交件.md) · 署名 [ATTRIBUTION-audio.md](./ATTRIBUTION-audio.md) |

> **两枚新槽。** 只交 `sfx_reveal_draw.wav` + `sfx_reveal_flip.wav`。  
> **翻牌 / 熄灭 / 飞出 / 落地 / 质疑 enter·commit 不动。** 本票不写、不裁头。  
> **禁发牌冒充。** 不得用 `sfx_deal_card` / `sfx_match_open` 冒充开牌两槽。  
> **禁止** beep / 系统咔哒 / 纯正弦 tip / chiptune / 任何 `.ets`。  
> **合入 ≠ 终验。** 耳闸：draw 跟整手抽池，flip 跟揭牌翻面；两记之间建议 **≥160ms** 空隙（见 §1）。

---

## 1. 为什么两槽

第3节揭牌：权威 ack 后先从中央池 **整手抽起**，再 **赌场式翻面**。两记必须可分：

| 拍 | 听感 | 窗 |
|----|------|----|
| **RevealDraw** | 整手从中央池抽起：短纸刮 / 拉牌 | **70–100ms**，贴抽池 onset |
| **RevealFlip** | 揭牌翻面：偏慢赌场翻开（比 peek 翻面更沉） | **90–140ms**，贴翻面 onset |

**时序建议（听验闸）：** draw → flip 之间留约 **160ms** 空隙（可随动画微调，但两 onset 不得叠成一声）。  
一槽拉长 whoosh 会糊成「又一声出牌飞」。两槽短、干、对拍。

**禁止**拿下列槽冒充本两槽：

| 禁 | 只属 |
|----|------|
| `lb_sfx_card_flip` | S15-4 点按 peek 翻面（短促起势） |
| `lb_sfx_play_launch` | 16 PlayLaunch 飞出 kickoff（亮刮扫） |
| `lb_sfx_play_land` | 16 PlayLanded 身前落毡（闷触） |
| `lb_sfx_challenge_enter` / `_commit` | 第2节等待窗 / 质疑按下 |
| `sfx_deal_card` / `sfx_match_open` | 开桌发牌族 |
| `sfx_cta_tap` / 系统按键音 / beep | 禁冒充 |

本批交出 **专用新槽**，给后续 `feat/client-*` 换绑。**本 PR 零 ets。**

---

## 2. 槽映射（文件 → 调用）

路径一律：`entry/src/main/resources/rawfile/audio/sfx/`。

| 文件 | 媒体 id | 调用 | 何时 |
|------|---------|------|------|
| `sfx_reveal_draw.wav` | `sfx_reveal_draw` | **`lb_sfx_reveal_draw`** | 揭牌抽池 · 整手拉起与视觉同 onset |
| `sfx_reveal_flip.wav` | `sfx_reveal_flip` | **`lb_sfx_reveal_flip`** | 揭牌翻面 · 与牌面翻开同 onset（晚于 draw ≈160ms） |

**禁列表（写死）：** 禁 `card_flip` / `launch` / `land` / `enter` / `commit` / **发牌冒充**。

---

## 3. 实测

| 项 | 规格 | `sfx_reveal_draw.wav` | `sfx_reveal_flip.wav` |
|----|------|-----------------------|------------------------|
| 格式 | WAV PCM16 · 48 kHz **mono** | **pcm_s16le · 48000 Hz · 1ch** | **pcm_s16le · 48000 Hz · 1ch** |
| 时长 | draw **70–100ms** · flip **90–140ms** | **86.00 ms**（4128 frames） | **116.00 ms**（5568 frames） |
| 峰值 | 约 −11～−8 dBFS | **−9.50 dBFS** | **−10.00 dBFS** |
| 头静音 | ≈0 ms；`<-40 dB` 须 ≪5ms | **0.000 ms**（0 samples） | **0.000 ms**（0 samples） |
| 起音 | 攻击在首帧 / 首几个采样 | 第 1 样本 **−25.9 dBFS** | 第 1 样本 **−25.1 dBFS** |
| 字节 | — | **8300** | **11180** |
| 质心 | draw 须高于 flip | **约 6037 Hz**（偏亮纸刮） | **约 3658 Hz**（低中频翻面体） |
| 材质 | 噪声 Foley；抽池刮 vs 赌场翻 | 干纸拉刮 + 整手 rustle（非 launch 亮扫） | 低中频牌身翻开 + 轻落触（非 peek snap / 非 land 闷毡） |
| 调用 | `lb_sfx_*` | **`lb_sfx_reveal_draw`** | **`lb_sfx_reveal_flip`** |
| seed | 固定 rng | **20260915** | **20260916** |

频谱对照（交件自检，不是听闸数字）：draw 质心约 **6.0 kHz**、能量在中高频纸刮但仍低于 play_launch 亮扫（~6.8 kHz）；flip 质心约 **3.7 kHz**、低中频翻面体，明显暗于 draw。两记在 draw→flip **≈160ms** 空隙下可分开。

冻结对照（本票 **未写**；本地树可缺省，脚本仍列名）：

| 文件 | 口径 |
|------|------|
| `sfx_card_flip.wav` | peek 翻面短促起势；禁冒充开牌 |
| `sfx_life_extinguish.wav` | 生命烛熄灭；本票不写 |
| `sfx_play_launch.wav` / `sfx_play_land.wav` | 出牌飞出两槽；禁冒充 |
| `sfx_challenge_enter.wav` / `sfx_challenge_commit.wav` | 质疑第2节；禁冒充 |
| `sfx_challenge_pass.wav` / 旧四拍 `windup/standoff/reveal/result` | 不生成 / Pass 静音 |
| `sfx_play_soft` / `_slam` / `_hesitate` / `sfx_deal_card` / `sfx_match_open` / `sfx_cta_tap` | 冻结 / 禁发牌冒充 |

本批新槽 sha256：

| 文件 | sha256 |
|------|--------|
| `sfx_reveal_draw.wav` | `bc2dc6505c19701bb06c328411884695b98ffe8c763ec1cd52b83e637395dc7c` |
| `sfx_reveal_flip.wav` | `0d3b50558595d8b2f6d9cda3cd4f1b000fdef72ae1321416410ce0e23957266e` |

---

## 4. 来源 / 授权

**原作程序化** · 团队脚本合成 · **CC0-equivalent**（无第三方媒体 id）。

- 生成：`python3 scripts/gen_reveal_sfx.py`
- **未** 嵌入外部 clip；无需 OGA / Freesound 媒体 id
- **未** 使用 beep / 纯正弦 tip / chiptune / 系统 click
- 噪声带通 + 一极点滤波；**无** 正弦振荡器 / 方波 tip
- 固定种子：`20260915`（draw）/ `20260916`（flip）

署名登记见 [ATTRIBUTION-audio.md](./ATTRIBUTION-audio.md)（本票片段见 [ATTRIBUTION-audio-reveal-snippet.md](./ATTRIBUTION-audio-reveal-snippet.md)）。

---

## 5. 明确未做

- 任何 `.ets` / 布局 / 挂点 / `Ids.ets` 换绑
- `sfx_card_flip` / `sfx_life_extinguish` / `sfx_play_launch` / `sfx_play_land` / `sfx_challenge_enter` / `sfx_challenge_commit` 裁头或重烤
- `sfx_deal_card` / `sfx_match_open` / §5.2 其余冻结槽 / BGM
- 旧四拍 `sfx_challenge_windup` / `_standoff` / `_reveal` / `_result` / pass
- 改第2节质疑线框数字；不扩旧四拍仪式

---

## 6. 听验闸 / 自检

**听验闸（Rebuild 耳听）：**

- draw 跟整手抽池视觉 onset；flip 跟揭牌翻面 onset
- draw → flip 空隙约 **160ms**（不得叠成一声）
- draw 听感偏亮纸刮；flip 偏低中频赌场翻开；两记互异
- **不得** 听成 play_launch 亮扫 / play_land 闷毡 / challenge enter·commit / peek `card_flip` / 发牌
- 无 beep / 系统 click / 正弦 tip

**自检勾选：**

- [x] 只新增两枚 wav；冻结槽未写（本地可缺省，脚本列名断言）
- [x] 两文件 48 kHz mono PCM16；draw 86.00ms · −9.50 dBFS；flip 116.00ms · −10.00 dBFS；头静音 0ms
- [x] draw 质心高于 flip（6037 Hz > 3658 Hz）；非 beep / 非系统 click；槽 `lb_sfx_reveal_draw` / `lb_sfx_reveal_flip`；零 ets
- [ ] **@LiarBar测试** Rebuild 耳闸：draw/flip 对拍 + **160ms** 空隙；禁 flip/launch/land/enter/commit/发牌冒充
- [ ] **@LiarBar鸿蒙** 后续票换绑（本 PR 不改 ets）
- [ ] **@LiarBar负责人** 会签

**合入 ≠ 终验。**

---

*维护人：美术 / 音频岗 · 2026-09-13 · 零 ets · 合入≠终验*
