# 资产迁移 · Cocos 对照表

| 项 | 内容 |
|----|------|
| 文档版本 | **v0.1.0** |
| 状态 | **对照草案** · 供 Cocos 岗照搬导入 · **零资产改动** · **合入 ≠ 终验** |
| 基线 | `feat/art` @ `b9e3f32`（对齐 develop 决议台账；规则锁不动） |
| 范围 | `base/media/art_*.png`（**92**）· `rawfile/audio/**`（bgm **2** / sfx **22** / vo **1**）· `rawfile/sfx/`（**3** 遗留） |
| 读者 | Cocos · 鸿蒙宿主 · UI（`lb_*` 节点）· 测试 · PM |
| 真源 | [关键资源规格清单](./关键资源规格清单.md) · [02 命名约定](./02-组件与资源命名约定.md) · [13 局内声场](./13-局内声场与伴奏规格.md) · [18 开牌区](./18-局内开牌区规格.md) · [ATTRIBUTION-audio](./ATTRIBUTION-audio.md) · `_shared/memory-pack/08-status/05-engine-refactor-plan.md` |
| 本票锁 | **不新增 / 不改 / 不重命名** 任何 `art_*` 或音频文件；不跑 `gen_*.py`；不改 ets/ts |

> **拷贝语义**：像素、时长、槽名、文件名一字不改。只登记「源 → Cocos 目标路径 → 用途 → `lb_*` → AutoAtlas」。  
> **转格式**（如 wav→ogg）须 **PM 另票放行**；本表可写建议，默认 **原样导入**。  
> 节点命名 = 现行 `lb_*`（见 02）；媒体层仍是 `art_*` / `bgm_*` / `sfx_*` / `vo_*`。**禁止 `lb_art_*`。**

---

## 0. Cocos 目录约定（Mode 2 · 嵌入）

```
cocos/assets/
├── art/                 ← 自 base/media/art_*.png 原样拷贝（同名）
│   ├── cards/           ← AutoAtlas 组建议目录（可选；也可扁平面）
│   ├── candles/
│   ├── buttons/
│   ├── dealer/
│   ├── avatars/
│   ├── fx/
│   ├── bg/              ← 全屏底图：不进 AutoAtlas
│   └── misc/
└── audio/
    ├── bgm/             ← rawfile/audio/bgm/*
    ├── sfx/             ← rawfile/audio/sfx/*（不含冻结左轮三槽时可不拷）
    └── vo/              ← rawfile/audio/vo/*
```

| 规则 | 说明 |
|------|------|
| 文件名 | 与鸿蒙仓 **完全同名**（含扩展名） |
| `$r('app.media.art_xxx')` | Cocos 侧改为 `resources.get('art/…/art_xxx')` 或 SpriteFrame 引用；**资源 id 仍用 `art_xxx`** |
| 全屏底 | `art_*_bg` / `art_splash_still` → `art/bg/` · **禁止**进 AutoAtlas |
| 左轮 | **整组不迁**（见 §3） |

### 0.1 AutoAtlas 分组（建议 · 不改像素）

| 分组 id | 建议目录 | 进图集 | 成员族 |
|---------|----------|--------|--------|
| `atlas_cards` | `art/cards/` | **是** | `art_card_*` · `art_pool_slot` · `art_claim_badge_*` |
| `atlas_candles` | `art/candles/` | **是** | `art_life_candle_*` · `art_life_cup_*` · `art_fx_candle_stare` |
| `atlas_buttons` | `art/buttons/` | **是** | `art_btn_*` · `art_input_field` · `art_play_*` |
| `atlas_dealer` | `art/dealer/` | **是** | `art_dealer_*` · `art_challenge_pose_*` |
| `atlas_avatars` | `art/avatars/` | **是** | `art_ai_*` · `art_frame_player_*` · `art_player_idle` |
| `atlas_fx` | `art/fx/` | **是**（小图） | `art_fx_*`（除全屏尘）· `art_hl_*` · `art_emote_*` · `art_sign_*` · `art_result_bar_*` |
| （无图集） | `art/bg/` | **否** | `art_lobby_bg` · `art_table_bg` · `art_splash_still` · `art_fx_dust`（1080 宽） |
| （冻结） | — | — | `art_revolver_*` **不导入** |

> 小色块占位（≤1 KB 级）仍迁：Cocos 岗可后换真图，**不改槽名**。

---

## 1. 图片对照表

列：`源路径` | `尺寸(px)` | `用途` | `主绑 lb_*` | `Cocos 路径` | `AutoAtlas` | `迁?`

源根：`entry/src/main/resources/base/media/`。  
Cocos 根：`cocos/assets/`（下表写相对该根的路径）。

### 1.1 牌面 / 池（`atlas_cards`）

| 源 | 尺寸 | 用途 | lb_* | Cocos 路径 | AutoAtlas | 迁 |
|----|------|------|------|------------|-----------|----|
| `art_card_a.png` | 240×336 | 正面 A | `lb_cmp_card_*` · `lb_cmp_reveal_stage` | `art/cards/art_card_a.png` | `atlas_cards` | ✅ |
| `art_card_k.png` | 240×336 | 正面 K | 同上 | `art/cards/art_card_k.png` | `atlas_cards` | ✅ |
| `art_card_q.png` | 240×336 | 正面 Q | 同上 | `art/cards/art_card_q.png` | `atlas_cards` | ✅ |
| `art_card_joker.png` | 240×336 | 正面 Joker | 同上 | `art/cards/art_card_joker.png` | `atlas_cards` | ✅ |
| `art_card_back.png` | 240×336 | 牌背 / 池未翻 / 飞牌 | `lb_cmp_card_*` · `lb_cmp_pool` · `lb_cmp_play_fly` | `art/cards/art_card_back.png` | `atlas_cards` | ✅ |
| `art_card_privacy_mask.png` | 240×336 | 防窥遮罩 | `lb_cmp_peek_mask` | `art/cards/art_card_privacy_mask.png` | `atlas_cards` | ✅ |
| `art_card_glow.png` | 260×356 | 开牌高光（占位级） | `lb_challenge_reveal` / 开牌高光 | `art/cards/art_card_glow.png` | `atlas_cards` | ✅ |
| `art_pool_slot.png` | 168×232 | 公共池牌位 | `lb_cmp_pool` | `art/cards/art_pool_slot.png` | `atlas_cards` | ✅ |
| `art_claim_badge_a.png` | 144×144 | 宣称徽 A（占位） | `lb_txt_claim` 旁 | `art/cards/art_claim_badge_a.png` | `atlas_cards` | ✅ |
| `art_claim_badge_k.png` | 144×144 | 宣称徽 K | 同上 | `art/cards/art_claim_badge_k.png` | `atlas_cards` | ✅ |
| `art_claim_badge_q.png` | 144×144 | 宣称徽 Q | 同上 | `art/cards/art_claim_badge_q.png` | `atlas_cards` | ✅ |

### 1.2 生命烛 / 杯（`atlas_candles`）

| 源 | 尺寸 | 用途 | lb_* | Cocos 路径 | AutoAtlas | 迁 |
|----|------|------|------|------------|-----------|----|
| `art_life_candle_body.png` | 128×160 | 烛身主绑 | `lb_cmp_life_self` / `lb_cmp_life_seat_pN` | `art/candles/art_life_candle_body.png` | `atlas_candles` | ✅ |
| `art_life_candle_flame_full.png` | 128×160 | 满焰（主绑参考） | 同上 | `art/candles/art_life_candle_flame_full.png` | `atlas_candles` | ✅ |
| `art_life_candle_flame_hurt.png` | 128×160 | 残焰 | 同上 | `art/candles/art_life_candle_flame_hurt.png` | `atlas_candles` | ✅ |
| `art_life_candle_flame_dying.png` | 128×160 | 濒焰 | 同上 | `art/candles/art_life_candle_flame_dying.png` | `atlas_candles` | ✅ |
| `art_life_candle_flame_full_0.png` … `_3.png` | 128×160 | 满焰 loop 可选帧 | 同上 | `art/candles/…` | `atlas_candles` | ✅ |
| `art_life_candle_extinguish_0.png` … `_3.png` | 128×160 | 灭序 4 帧 | 同上（熄灭） | `art/candles/…` | `atlas_candles` | ✅ |
| `art_life_candle_full.png` | 128×128 | 旧三态兜底 · 满 | 同上 | `art/candles/art_life_candle_full.png` | `atlas_candles` | ✅ |
| `art_life_candle_hurt.png` | 128×128 | 旧三态兜底 · 残 | 同上 | `art/candles/art_life_candle_hurt.png` | `atlas_candles` | ✅ |
| `art_life_candle_dying.png` | 128×128 | 旧三态兜底 · 濒 | 同上 | `art/candles/art_life_candle_dying.png` | `atlas_candles` | ✅ |
| `art_life_cup_full.png` | 96×96 | 酒杯满（备选非主读） | 座位旁备选 | `art/candles/art_life_cup_full.png` | `atlas_candles` | ✅ |
| `art_life_cup_empty.png` | 96×96 | 酒杯空 | 同上 | `art/candles/art_life_cup_empty.png` | `atlas_candles` | ✅ |
| `art_fx_candle_stare.png` | 144×144 | 点名焰芯叠层（占位） | `lb_cmp_seat_*` `_called` | `art/candles/art_fx_candle_stare.png` | `atlas_candles` | ✅ |

### 1.3 按钮 / 输入 / 出牌方式（`atlas_buttons`）

| 源 | 尺寸 | 用途 | lb_* | Cocos 路径 | AutoAtlas | 迁 |
|----|------|------|------|------------|-----------|----|
| `art_btn_primary.png` / `_on.png` | 720×144 | 大厅主 CTA | `lb_btn_quickstart` | `art/buttons/…` | `atlas_buttons` | ✅ |
| `art_btn_play_confirm.png` / `_on.png` | 720×144 | 出牌确认铬 | `lb_btn_play_confirm` | `art/buttons/…` | `atlas_buttons` | ✅ |
| `art_btn_challenge_doubt.png` / `_on.png` | 360×144 | 质疑 | `lb_btn_challenge_doubt` | `art/buttons/…` | `atlas_buttons` | ✅ |
| `art_btn_challenge_believe.png` / `_on.png` | 360×144 | 相信 | `lb_btn_challenge_believe` | `art/buttons/…` | `atlas_buttons` | ✅ |
| `art_btn_challenge_you.png` / `_on.png` | 360×144 | 打光 · 你 | `lb_btn_challenge_you` | `art/buttons/…` | `atlas_buttons` | ✅ |
| `art_btn_challenge_prev.png` / `_on.png` | 360×144 | 打光 · 上家 | `lb_btn_challenge_prev` | `art/buttons/…` | `atlas_buttons` | ✅ |
| `art_btn_challenge_true.png` / `_on.png` | 360×144 | 旧真键（非入口主读） | 历史 `lb_btn_challenge_true` | `art/buttons/…` | `atlas_buttons` | ✅ 可迁备查 |
| `art_btn_challenge_false.png` / `_on.png` | 360×144 | 旧假键 | 历史 `lb_btn_challenge_false` | `art/buttons/…` | `atlas_buttons` | ✅ 可迁备查 |
| `art_input_field.png` | 720×96 | 昵称输入皮 | `lb_cmp_nick_field` | `art/buttons/art_input_field.png` | `atlas_buttons` | ✅ |
| `art_play_soft.png` | 144×144 | 出牌方式 · 软 | `lb_btn_style_soft` / `lb_sheet_play` | `art/buttons/art_play_soft.png` | `atlas_buttons` | ✅ |
| `art_play_slam.png` | 144×144 | 甩出 | `lb_btn_style_slam` | `art/buttons/art_play_slam.png` | `atlas_buttons` | ✅ |
| `art_play_hesitate.png` | 144×144 | 犹豫 | `lb_btn_style_hesitate` | `art/buttons/art_play_hesitate.png` | `atlas_buttons` | ✅ |

### 1.4 荷官（`atlas_dealer`）

| 源 | 尺寸 | 用途 | lb_* | Cocos 路径 | AutoAtlas | 迁 |
|----|------|------|------|------------|-----------|----|
| `art_dealer_bust_idle.png` | 324×432 | 荷官常态 | `lb_cmp_dealer` | `art/dealer/art_dealer_bust_idle.png` | `atlas_dealer` | ✅ |
| `art_dealer_bust_announce.png` | 324×432 | 播报 | `lb_cmp_dealer` | `art/dealer/art_dealer_bust_announce.png` | `atlas_dealer` | ✅ |
| `art_dealer_idle_blink.png` | 324×432 | idle 眨眼 | `lb_cmp_dealer` | `art/dealer/art_dealer_idle_blink.png` | `atlas_dealer` | ✅ |
| `art_dealer_idle_nod.png` | 324×432 | idle 点头 | `lb_cmp_dealer` | `art/dealer/art_dealer_idle_nod.png` | `atlas_dealer` | ✅ |
| `art_dealer_idle_cup.png` | 324×432 | idle 抬杯 | `lb_cmp_dealer` | `art/dealer/art_dealer_idle_cup.png` | `atlas_dealer` | ✅ |
| `art_dealer_idle_mask.png` | 324×432 | idle 面具偏 | `lb_cmp_dealer` | `art/dealer/art_dealer_idle_mask.png` | `atlas_dealer` | ✅ |
| `art_challenge_pose_point.png` | 144×144 | 旧四拍 windup 姿（占位） | `lb_challenge_windup` | `art/dealer/art_challenge_pose_point.png` | `atlas_dealer` | ✅ 备查 |
| `art_challenge_pose_slam.png` | 144×144 | standoff 姿（占位） | `lb_challenge_standoff` | `art/dealer/…` | `atlas_dealer` | ✅ 备查 |
| `art_challenge_pose_toast.png` | 144×144 | result 姿（占位） | `lb_challenge_result` | `art/dealer/…` | `atlas_dealer` | ✅ 备查 |

### 1.5 头像 / 框（`atlas_avatars`）

| 源 | 尺寸 | 用途 | lb_* | Cocos 路径 | AutoAtlas | 迁 |
|----|------|------|------|------------|-----------|----|
| `art_ai_timid_idle.png` | 256×256 | 怂货 idle | `lb_cmp_seat_p{1-3}` | `art/avatars/…` | `atlas_avatars` | ✅ |
| `art_ai_timid_hold.png` / `_break.png` | 216×216 | 死撑 / 破防（占位色块） | 反应叠层 | `art/avatars/…` | `atlas_avatars` | ✅ |
| `art_ai_shark_idle.png` | 256×256 | 老千 idle | 同上 | `art/avatars/…` | `atlas_avatars` | ✅ |
| `art_ai_shark_hold.png` / `_break.png` | 216×216 | 死撑 / 破防 | 同上 | `art/avatars/…` | `atlas_avatars` | ✅ |
| `art_ai_karen_idle.png` | 256×256 | 杠精 idle | 同上 | `art/avatars/…` | `atlas_avatars` | ✅ |
| `art_ai_karen_hold.png` / `_break.png` | 216×216 | 死撑 / 破防 | 同上 | `art/avatars/…` | `atlas_avatars` | ✅ |
| `art_player_idle.png` | 256×256 | 玩家自位图 | `lb_cmp_seat_self` | `art/avatars/art_player_idle.png` | `atlas_avatars` | ✅ |
| `art_frame_player_idle.png` | 256×256 | 玩家框 idle | `lb_cmp_seat_self` | `art/avatars/art_frame_player_idle.png` | `atlas_avatars` | ✅ |
| `art_frame_player_ghost.png` | 216×216 | 出局幽灵框（占位） | `lb_cmp_seat_self` `_ghost` | `art/avatars/…` | `atlas_avatars` | ✅ |

### 1.6 FX / 战报 / 手势（`atlas_fx` · 小图）

| 源 | 尺寸 | 用途 | lb_* | Cocos 路径 | AutoAtlas | 迁 |
|----|------|------|------|------------|-----------|----|
| `art_fx_candle.png` | 288×288 | 大厅近景烛焰 | `lb_scr_lobby` 烛层 | `art/fx/art_fx_candle.png` | `atlas_fx` | ✅ |
| `art_fx_wine_splash.png` | 480×320 | 质疑结果溅酒（占位） | `lb_challenge_result` | `art/fx/…` | `atlas_fx` | ✅ |
| `art_fx_smash_cup.png` | 360×360 | 砸杯 FX（占位） | 结算旁 | `art/fx/…` | `atlas_fx` | ✅ |
| `art_emote_smile.png` 等 4 张 | 144×144 | 教学表情（占位） | `lb_btn_emote_*` | `art/fx/…` | `atlas_fx` | ✅ |
| `art_sign_knock.png` / `ok` / `no` | 144×144 | 观众手势 | `lb_btn_sign_*` / spectator | `art/fx/…` | `atlas_fx` | ✅ |
| `art_hl_best_challenge.png` 等 3 张 | 96×96 | 战报高光图标（占位） | `lb_txt_highlight` | `art/fx/…` | `atlas_fx` | ✅ |
| `art_result_bar_win.png` / `_lose.png` | 1080×120 | 战报顶条（占位） | `lb_scr_report` | `art/fx/…` | **否**（过宽） | ✅ 单图 |

### 1.7 全屏底 / 大气（不进图集）

| 源 | 尺寸 | 用途 | lb_* | Cocos 路径 | AutoAtlas | 迁 |
|----|------|------|------|------------|-----------|----|
| `art_lobby_bg.png` | 1080×2340 | 大厅景深底 | `lb_scr_lobby` | `art/bg/art_lobby_bg.png` | **否** | ✅ |
| `art_table_bg.png` | 1080×2340 | 局内桌底 | `lb_scr_table` | `art/bg/art_table_bg.png` | **否** | ✅ |
| `art_splash_still.png` | 1080×2340 | 启动独立静帧 | `lb_scr_lobby` 开场 | `art/bg/art_splash_still.png` | **否** | ✅ |
| `art_fx_dust.png` | 1080×600 | 远景光尘层 | `lb_scr_lobby` | `art/bg/art_fx_dust.png` | **否** | ✅ |

### 1.8 工程图标（非 `art_*` · 对照备注）

| 源 | 尺寸 | 说明 | 迁 |
|----|------|------|----|
| `app_icon.png` | 512×512 | DevEco 应用图标 | ❌ 不进 Cocos 对局场景 |
| `startIcon.png` | 216×216 | 启动图标 | ❌ 同上 |

**盘点**：`base/media/` 共 **94** 文件 = **92** `art_*` + **2** 工程图标。ROLE 记忆「94 art」口径按「media 总文件」理解；本表以磁盘 `art_*` **92** 为准。

---

## 2. 音频对照表

源根：`entry/src/main/resources/rawfile/`。  
Cocos 根：`cocos/assets/audio/`（相对路径下表省略 `audio/` 前已含分类时写全）。

兼容性默认（Creator 3.8.8 / HarmonyOS NEXT）：

| 格式 | Cocos | 备注 |
|------|-------|------|
| **OGG Vorbis** 48 kHz | ✅ 推荐 | BGM / 循环垫优先 |
| **WAV PCM16** 48 kHz | ✅ 原样 | SFX 短音；体积大可接受；**转 ogg 须 PM 放行** |
| **WAV 22050 Hz**（遗留 `rawfile/sfx/`） | ⚠️ 能播但不齐采样率 | **优先用 `audio/` 下 48k 同语义槽**；遗留三文件默认不迁 |

### 2.1 BGM（循环）

| 源 | 格式 / 大小 | 时长 | 槽 / 调用 | 循环 | Cocos 路径 | 兼容 | 迁 |
|----|-------------|------|-----------|------|------------|------|----|
| `audio/bgm/bgm_lobby_night.ogg` | Vorbis 48k **2ch** · 295520 B | 23.100s | `bgm_lobby_night` · `lb_bgm_lobby_night` | **是** | `audio/bgm/bgm_lobby_night.ogg` | ✅ | ✅ |
| `audio/bgm/bgm_table_bluff.ogg` | Vorbis 48k **2ch** · 530600 B | 32.000s | `bgm_table_bluff` · `lb_bgm_table_bluff` | **是** | `audio/bgm/bgm_table_bluff.ogg` | ✅ | ✅ |

### 2.2 环境 / VO

| 源 | 格式 / 大小 | 时长 | 槽 / 调用 | 循环 | Cocos 路径 | 兼容 | 迁 |
|----|-------------|------|-----------|------|------------|------|----|
| `audio/sfx/sfx_amb_tavern.ogg` | Vorbis 48k **2ch** · 212131 B | 11.600s | `sfx_amb_tavern` · `lb_sfx_amb_tavern` | **是** | `audio/sfx/sfx_amb_tavern.ogg` | ✅ | ✅ |
| `audio/vo/vo_dealer_greet.wav` | PCM16 48k **1ch** · 187738 B | 1.955s | `vo_dealer_greet` · `lb_vo_dealer_greet` | 否 | `audio/vo/vo_dealer_greet.wav` | ✅ | ✅ |

### 2.3 大厅 / 开桌 SFX

| 源 | 格式 / 大小 | 时长 | 槽 / 调用 | 循环 | Cocos 路径 | 兼容 | 迁 |
|----|-------------|------|-----------|------|------------|------|----|
| `audio/sfx/sfx_boot_hit.wav` | PCM16 48k 1ch · 59564 B | 0.620s | `lb_sfx_boot_hit` | 否 | `audio/sfx/sfx_boot_hit.wav` | ✅ | ✅ |
| `audio/sfx/sfx_cta_tap.wav` | PCM16 48k 1ch · 13484 B | 0.140s | `lb_sfx_cta_tap` | 否 | `audio/sfx/sfx_cta_tap.wav` | ✅ | ✅ |
| `audio/sfx/sfx_match_open.wav` | PCM16 48k **2ch** · 149804 B | 0.780s | `lb_sfx_match_open` | 否 | `audio/sfx/sfx_match_open.wav` | ✅ | ✅ |
| `audio/sfx/sfx_deal_card.wav` | PCM16 48k 1ch · 13004 B | 0.135s | `lb_sfx_deal_card` | 否（可叠播） | `audio/sfx/sfx_deal_card.wav` | ✅ | ✅ |
| `audio/sfx/sfx_deal_whoosh.wav` | PCM16 48k 1ch · 13484 B | 0.140s | （可选走牌气） | 否 | `audio/sfx/sfx_deal_whoosh.wav` | ✅ | ✅ |

### 2.4 局内操作 / 结算 SFX

| 源 | 格式 / 大小 | 时长 | 槽 / 调用 | 循环 | Cocos 路径 | 兼容 | 迁 |
|----|-------------|------|-----------|------|------------|------|----|
| `audio/sfx/sfx_claim_set.wav` | PCM16 48k 1ch · 32684 B | 0.340s | `lb_sfx_claim_set` | 否 | `audio/sfx/sfx_claim_set.wav` | ✅ | ✅ |
| `audio/sfx/sfx_play_soft.wav` | PCM16 48k 1ch · 15404 B | 0.160s | `lb_sfx_play_soft` | 否 | `audio/sfx/sfx_play_soft.wav` | ✅ | ✅ |
| `audio/sfx/sfx_play_slam.wav` | PCM16 48k 1ch · 23084 B | 0.240s | `lb_sfx_play_slam` | 否 | `audio/sfx/sfx_play_slam.wav` | ✅ | ✅ |
| `audio/sfx/sfx_play_hesitate.wav` | PCM16 48k 1ch · 17324 B | 0.180s | `lb_sfx_play_hesitate` | 否 | `audio/sfx/sfx_play_hesitate.wav` | ✅ | ✅ |
| `audio/sfx/sfx_play_launch.wav` | PCM16 48k 1ch · 7340 B | 0.076s | `lb_sfx_play_launch` | 否 | `audio/sfx/sfx_play_launch.wav` | ✅ | ✅ |
| `audio/sfx/sfx_play_land.wav` | PCM16 48k 1ch · 10028 B | 0.104s | `lb_sfx_play_land` | 否 | `audio/sfx/sfx_play_land.wav` | ✅ | ✅ |
| `audio/sfx/sfx_turn_tick.wav` | PCM16 48k 1ch · 7724 B | 0.080s | `lb_sfx_turn_tick` | 否 | `audio/sfx/sfx_turn_tick.wav` | ✅ | ✅ |
| `audio/sfx/sfx_named_stare.wav` | PCM16 48k 1ch · 36524 B | 0.380s | `lb_sfx_named_stare` | 否 | `audio/sfx/sfx_named_stare.wav` | ✅ | ✅ |
| `audio/sfx/sfx_card_flip.wav` | PCM16 48k 1ch · 8876 B | 0.092s | `lb_sfx_card_flip`（peek） | 否 | `audio/sfx/sfx_card_flip.wav` | ✅ | ✅ |
| `audio/sfx/sfx_life_extinguish.wav` | PCM16 48k 1ch · 40364 B | 0.420s | `lb_sfx_life_extinguish` | 否 | `audio/sfx/sfx_life_extinguish.wav` | ✅ | ✅ |
| `audio/sfx/sfx_challenge_enter.wav` | PCM16 48k 1ch · 9644 B | 0.100s | `lb_sfx_challenge_enter` | 否 | `audio/sfx/sfx_challenge_enter.wav` | ✅ | ✅ |
| `audio/sfx/sfx_challenge_commit.wav` | PCM16 48k 1ch · 6188 B | 0.064s | `lb_sfx_challenge_commit` | 否 | `audio/sfx/sfx_challenge_commit.wav` | ✅ | ✅ |
| `audio/sfx/sfx_result_win.wav` | PCM16 48k **2ch** · 182444 B | 0.950s | `lb_sfx_result_win` | 否 | `audio/sfx/sfx_result_win.wav` | ✅ | ✅ |
| `audio/sfx/sfx_result_lose.wav` | PCM16 48k 1ch · 86444 B | 0.900s | `lb_sfx_result_lose` | 否 | `audio/sfx/sfx_result_lose.wav` | ✅ | ✅ |

### 2.5 开牌双槽（迁 · 分拍见 §4）

| 源 | 格式 / 大小 | 时长 | 槽 / 调用 | 循环 | Cocos 路径 | 兼容 | 迁 |
|----|-------------|------|-----------|------|------------|------|----|
| `audio/sfx/sfx_reveal_draw.wav` | PCM16 48k 1ch · **8300** B | **0.086s** | `sfx_reveal_draw` · **`lb_sfx_reveal_draw`** | 否 | `audio/sfx/sfx_reveal_draw.wav` | ✅ | ✅ |
| `audio/sfx/sfx_reveal_flip.wav` | PCM16 48k 1ch · **11180** B | **0.116s** | `sfx_reveal_flip` · **`lb_sfx_reveal_flip`** | 否 | `audio/sfx/sfx_reveal_flip.wav` | ✅ | ✅ |

### 2.6 左轮三槽（**冻结 · 不迁**）

| 源 | 格式 / 大小 | 时长 | 槽 / 调用 | 迁 |
|----|-------------|------|-----------|----|
| `audio/sfx/sfx_revolver_click.wav` | PCM16 48k 1ch · 7724 B | 0.080s | `lb_sfx_revolver_click` | ❌ **冻结** |
| `audio/sfx/sfx_revolver_shot.wav` | PCM16 48k 1ch · 15404 B | 0.160s | `lb_sfx_revolver_shot` | ❌ **冻结** |
| `audio/sfx/sfx_revolver_spin.wav` | PCM16 48k 1ch · 19244 B | 0.200s | `lb_sfx_revolver_spin` | ❌ **冻结** |

> 仓内文件可保留在鸿蒙树；Cocos **`cocos/assets/audio/` 不拷贝**。CollectRedeal **不得**再绑 `sfx_revolver_spin`。

### 2.7 遗留 `rawfile/sfx/`（默认不迁）

| 源 | 格式 / 大小 | 时长 | 说明 | 迁 |
|----|-------------|------|------|----|
| `sfx/sfx_boot.wav` | PCM16 **22050** 1ch · 16802 B | 0.380s | 旧 boot；现行用 `audio/sfx/sfx_boot_hit.wav` | ❌ |
| `sfx/sfx_cta.wav` | PCM16 **22050** 1ch · 3130 B | 0.070s | 旧 CTA；现行用 `sfx_cta_tap.wav` | ❌ |
| `sfx/sfx_lobby_amb.wav` | PCM16 **22050** 1ch · 105884 B | 2.400s | 旧大厅垫；现行用 `sfx_amb_tavern.ogg` | ❌ |

**音频迁入合计（建议）**：BGM 2 + amb 1 + vo 1 + SFX（不含左轮 3、不含遗留 3）= **2+1+1+19 = 23** 文件进 `cocos/assets/audio/`。  
（`audio/sfx` 磁盘 22 张 wav = 19 迁 + 3 左轮冻。）

---

## 3. 冻结左轮资源（整组不迁）

规则真源：废左轮 · 揭牌直接熄烛 · [左轮与你上家键-资产交件](./左轮与你上家键-资产交件.md) 顶栏冻结声明。

| 类别 | 文件 | 处理 |
|------|------|------|
| HUD 图 | `art_revolver_cylinder.png`（128×128）· `art_revolver_chamber_live.png`（48×48）· `art_revolver_chamber_spent.png`（48×48） | **不导入** Cocos；不进任何 AutoAtlas |
| SFX | `sfx_revolver_click` / `_shot` / `_spin` | **不导入**；调用点不进 `Cues` / 新场景 |
| 可留美术 | `art_btn_challenge_you*` / `art_btn_challenge_prev*` | **迁**（EmptySafe 打光二选，非左轮结算） |

---

## 4. 开牌双槽 SFX · 分拍跟 1000 / 3000

常量真源：[18 开牌区](./18-局内开牌区规格.md) · `PlayFlyFx.DRAW_TO_FLIP_MS=1000` · `REVEAL_HOLD_MS=3000`。  
SFX 真源：[开牌SFX-reveal-draw-flip-资产交件](./开牌SFX-reveal-draw-flip-资产交件.md)。

```
t=0          RevealDraw onset  →  play lb_sfx_reveal_draw  (clip ≈86ms)
             （整手抽池视觉起势；短纸刮）

t=1000ms     RevealFlip onset  →  play lb_sfx_reveal_flip  (clip ≈116ms)
             DRAW_TO_FLIP=1000；牌面翻开同拍

t=1000+3000  持面结束 → 收舞台 / 进判罚熄烛等
             REVEAL_HOLD=3000；此窗内不另造第三开牌槽
```

| 拍 | 槽 | 跟谁 | 不跟谁 |
|----|----|------|--------|
| Draw | `lb_sfx_reveal_draw` | 抽池视觉 **onset**（窗起点） | 不填满 1000ms；不拉长 whoosh |
| Flip | `lb_sfx_reveal_flip` | 翻面视觉 **onset**（**+1000ms**） | 不冒充 `lb_sfx_card_flip` / launch / land / deal |
| Hold | （无新 SFX） | 真牌面静持 **3000ms** | 禁止 hold 前 reset；禁止第三声盖判罚 |

历史交件曾写 draw→flip 耳感空隙 ≥160ms（短动画时代）。**现行 R4 主读**：两 onset 间距锁 **1000ms**；clip 仍短干，**不改槽名硬凑时长**。

Cocos：`Cues.ts` / Presenter 必须 `play('reveal_draw')` @ draw · `play('reveal_flip')` @ flip；禁止一槽冒充两拍。

---

## 5. 许可声明（迁移不改许可）

| 资产 | 许可 / 来源 | 迁移注意 |
|------|-------------|----------|
| `bgm_table_bluff.ogg` | **Moil** · Ruskerdax · **CC0** · OpenGameArt | 同名拷贝；保留 ATTRIBUTION；禁止 numpy 回烤 |
| `bgm_lobby_night.ogg` · `sfx_amb_tavern.ogg` · 多数大厅/局内 Foley | 团队程序化或已交件床；见各资产交件 | 原样拷贝 |
| `sfx_reveal_*` · `sfx_play_launch/land` · `sfx_challenge_enter/commit` · `sfx_card_flip` · `sfx_life_extinguish` · `sfx_revolver_*` | **原作程序化** · CC0-equivalent · 见 [ATTRIBUTION-audio.md](./ATTRIBUTION-audio.md) | 左轮三槽 **不迁**；其余可迁 |
| 全部 `art_*.png` | 团队 Pillow / 交件插画 · 风格板色值 | 原样 PNG；不改像素 |

完整署名表以 [ATTRIBUTION-audio.md](./ATTRIBUTION-audio.md) 为准；本对照表 **不替代** 署名文件。

---

## 6. 审核记录

| 日期 | 角色 | 结论 | 备注 |
|------|------|------|------|
| 2026-09-17 | 美术 Agent（A1） | **交对照表 v0.1.0** | 基线 `b9e3f32`；磁盘实测 92 art + audio 清单；**零资产改动** |
| （待） | PM | 审合 / 打回 | 合入 ≠ 终验 |
| （待） | Cocos | 导入验收 | 按表拷贝；左轮不进工程 |
| （待） | Aron | 真机 Rebuild | 终验 |

自检：

- [x] 图片表含源 / 尺寸 / 用途 / lb_* / Cocos 路径 / AutoAtlas
- [x] 音频表含格式·大小·槽名·循环·兼容性
- [x] 开牌双槽分拍跟 **1000 / 3000**
- [x] 左轮 HUD + SFX **标冻不迁**
- [x] 许可声明引用 ATTRIBUTION
- [x] 本 PR **未改** `base/media/**` · `rawfile/**` · `scripts/gen_*.py` · 任何 ets

**合入 ≠ 终验。**

---

*维护：美术 / 听感岗 · A1 · 2026-09-17 · v0.1.0*
