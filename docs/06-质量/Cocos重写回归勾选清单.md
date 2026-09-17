# Cocos 重写回归勾选清单

> ## 合入≠终验 · 未 Rebuild 勿勾 · **写勾选 only · 不发明玩法 · 玩法正文锁不动**
>
> **本表（v0.1.1）**：对齐 Aron 2026-09-17 决议（Cocos Creator 3.8.8 驱动对局 · `_shared/memory-pack/08-status/05-engine-refactor-plan.md`）+ 现行 Rebuild 盯纸 **F1–F5 / R1–R6** + 失败短句闸 **S18-1～28**（`01-glossary` §5）+ 性能项 + **混合宿主**专项 + `engine_parity` + **门禁迁移**（T2 脚本已落 · 缺文件 SKIP）。  
> **规则锁不动**：废左轮 · 开局 3 烛 · 揭牌输家直接熄 1 · 熄尽淘汰 · 末存活胜 · CollectRedeal 不绑枪 · 每手 **质疑|相信** · 打光 ≥3 可选/=2 强制 · 开牌**真牌面** · 第二人可质疑第一手。  
> **数字锁**：`DRAW_TO_FLIP=1000ms`（±100）· `REVEAL_HOLD=3000ms`（±100）· `HAND_RING_GAP=24%` · 禁 padB 顶高 · 手牌沉底 · 荷官回池旁 · 法官句左上 · 中顶只 timer · 张数可见。  
> **节点锁（Cocos）**：场景节点名 = `lb_*`（与 ArkUI `.id` 对齐语义）；测试按节点名勾选。  
> 旧 ArkUI 表现代码保留到 parity 通过（阶段 5 才删）；期间可开开发开关切旧/新。  
> **合入本表 ≠ Cocos 过关。** 未真机 Rebuild 到自称已切 Cocos 表/宿主的包 **勿勾**。

| 项 | 内容 |
|----|------|
| 版本 | **v0.1.1 · Cocos 重写回归总纸**（parity F1–F5 / R1–R6 / S18-1～28 + 性能 + 混合宿主 + engine_parity + 门禁迁移 **T2 已落**） |
| 读者 | 测试岗 / PM / Aron 真机终验 / Cocos·鸿蒙岗会签 |
| 范围 | 勾选 + 门禁迁移表状态；脚本见 `scripts/cocos_*_check.mjs`；不改规则；不发明玩法；不落 ets/ts |
| 对齐 | `05-engine-refactor-plan` · [局内Rebuild打回-F1-F5](./局内Rebuild打回-F1-F5验收勾选清单.md) **v0.4.2** · [局内对局验收](./局内对局验收勾选清单.md) **v0.2.2** · 对局-状态机 **v2.0.7** · glossary **S18-1～28** · develop（含 K2 `#221`） |
| 不做 | 把合入当终验；路径不存在时把门禁当红（**SKIP**）；改规则数字；新增 `art_*` / 音频 |
| 验序 | **引擎 parity → 混合宿主壳 → F3+F1 → F2 → F4/F5 → R1/R2 → R1′/R3史 → R4/R5/R6 → S18 全表交叉 → 性能** |

---

## 0. 硬锁（必须镜像）

| # | 锁 | 本表怎么验 |
|---|-----|------------|
| 1 | 规则零改动；`engine/` 判定公式一比一移植到 `cocos/assets/scripts/engine/*.ts` | **engine_parity** + S18 主链 |
| 2 | 节点名 = `lb_*`（手牌/池/timer/法官/质疑\|相信等） | **N-*** + `cocos_node_ids_check`（T2） |
| 3 | `Cues.ts`：`DRAW_TO_FLIP=1000` / `REVEAL_HOLD=3000` / `HAND_RING_GAP=24` | **R4** + **PERF** + `cocos_cues_check`（T2） |
| 4 | `engine/` 内禁 `import cc` / UI / `setTimeout`；判定公式三行原样 | `cocos_engine_purity_check`（T2） |
| 5 | Mode 2：`Table.ets` = XComponent 宿主 + 桥；Lobby/Report/Kit 仍 ArkUI | **H-*** 混合宿主 |
| 6 | 资产拷贝复用，不改像素/语义 | 美术对照表另纸；本表不扩 |
| 7 | F1–F5 / R1–R6 表现闸在 Cocos 场景上**同口径**过 | §2 |
| 8 | 失败只报 S18 短句或本表行号 | §3 |

---

## 1. 过关闸（未齐不得勾本批过关）

| 门 | 必须 | 过 |
|----|------|----|
| Rebuild | 现场包自称已切 Cocos 对局视图（或开发开关新表）；**未 Rebuild 不得勾本行** | [ ] **未落地勿勾** |
| engine_parity | 同 seed 事件序列 ets 版 vs TS 版一致（`cocos/tools/engine_parity.mjs`） | [ ] **T3 烟雾 OK · ets NOT RUN · 未勾 100%** · [K3-parity验收记录](./K3-parity验收记录.md) |
| 混合宿主 | ArkUI 壳 ↔ Cocos 视图切换 / 返回 / 后台恢复 / 实况窗一致 | [ ] |
| F1–F5 | 他座熄烛 · 全员揭牌 · `lb_btn_home` 回大厅 · 宣言左上 · self 烛框 | [ ] |
| R1–R6 | 真牌面 · 第二人可质疑第一手 · R4 1000/3000 · 本手张数 · 法官左上/中顶 timer | [ ] |
| S18 全表 | S18-1～28 无失败短句触发（冻结项仍不得作过关听验） | [ ] |
| 性能 | 帧率 ≥55；翻 1000±100；持面 3000±100 | [ ] |
| 本批过关 | 上列全部现场过 | [ ] **未落地勿勾** |

---

## 2. Parity · F1–F5 / R1–R6

> 步骤期望与失败短句**一字对齐** [局内Rebuild打回-F1-F5验收勾选清单](./局内Rebuild打回-F1-F5验收勾选清单.md) v0.4.2；本表只标 Cocos 落点（节点名 / `Cues.ts` / 宿主）。**合入旧纸 ≠ 本纸终验。**

### 2.1 F1–F5

| ID | 期望（摘要） | Cocos 落点 | 失败短句 | 过 |
|----|--------------|------------|----------|----|
| **F1-1** | 调试对 P1/P2/P3 扣血 → 对应座熄 1 | `lb_cmp_life_seat_p*` 节点同套灭序 | **他座未熄烛** / **调试只能扣self** | [ ] |
| **F1-2** | AI 揭牌输家 → 全员可见该座熄烛 | 事件 `CandleOut` → 表现层 | **他座未熄烛** | [ ] |
| **F2-1** | 点质疑 → NPC/荷官/开牌舞台全员可见 | `ChallengeCommitted` 广播层 | **质疑无表现**（S18-22） | [ ] |
| **F2-2** | 翻牌裁定全员可见 | `RevealStarted` / `Judged` | **揭牌仅自己见**（S18-23） | [ ] |
| **F3-1** | 对局中点 **`lb_btn_home`**（或系统返回）→ 大厅；禁 `lb_btn_table_back` | 桥 `lb.exit` / 宿主 `goHome` | **局内返回失效** | [ ] |
| **F4-1/2** | 宣称+轮到谁在左上；禁堆桌心挡池 | `lb_txt_judge` TopStart | **宣言不在左上** | [ ] |
| **F5-1** | self 三烛外框完全包住 3 烛含焰 | `lb_cmp_life_self` | **self烛框未框全** | [ ] |

### 2.2 R1 / R2 / R1′ / R3（史）/ R4 / R5 / R6

| ID | 期望（摘要） | Cocos 落点 | 失败短句 | 过 |
|----|--------------|------------|----------|----|
| **R1-1/2** | faceUp = 真 `lastPlayRanks`；禁 claim 假面 | Reveal 舞台 / 真牌面贴图 | **开牌假面**（S18-24） | [ ] |
| **R2-1/2** | 首手 PlayLanded 后下家得 **质疑\|相信**；废 `isFirstOfRound` 挡门 | `lb_btn_challenge_doubt` / `believe` | **第二人不可质疑第一手**（S18-6） | [ ] |
| **R1′-1～3** | 宣称 A·出 Q → faceUp=Q；空 ranks 禁瞎演 | 同上 + defer/peek | **开牌假面**（S18-24） | [ ] |
| **R3-*** | 史锁 500/2000；**不得**作终验主闸 | — | （史）开牌过快 → 见 R4 | [ ] N/A 终验 |
| **R4-1** | 抽→翻 ≈ **1000ms**（窗 800～1200；本表性能钉 ±100） | `Cues.ts` `DRAW_TO_FLIP` | **开牌过快**（S18-25） | [ ] |
| **R4-2** | 持面 ≈ **3000ms**（窗 2.5～3.5s；性能钉 ±100） | `Cues.ts` `REVEAL_HOLD` | **开牌过快**（S18-25） | [ ] |
| **R4-3** | 持面未满禁 reset/pull；&lt;2.5s 收束=失败 | Presenter Tween | **开牌过快**（S18-25） | [ ] |
| **R5-1/2** | AwaitChallenge 池上本手牌背可见；张数=`lastPlay.count`；进窗禁 clear | `lb_cmp_pool` | **质疑窗不见上家本手张数**（S18-26） | [ ] |
| **R6-1～3** | 法官/荷官句全左上；中顶仅 `lb_txt_timer` | `lb_txt_judge` / `lb_txt_timer` | **法官句未全左上**（S18-27）/ **中顶仍叠宣言**（S18-28） | [ ] |

---

## 3. Parity · S18-1～28 全表

> 打回只报短句或键。语义以 glossary §5 为准（**S18-6 = 第二人不可质疑第一手**；V1 旧纸「第一手仍可质疑」已由 R2 SUPERSEDE）。冻结项不得再作过关听验。

| ID | 短句 | `lb_str_*` | Cocos 回归怎么验 | 过 |
|----|------|-----------|------------------|----|
| S18-1 | 揭牌结算后未收牌重发 | `lb_str_penalty_no_redeal` | `Judged`→`Redealt`；CollectRedeal 不绑枪 | [ ] |
| S18-2 | 真假裁定反了 | `lb_str_judge_reversed` | 真→质疑者熄 / 假→骗子熄 | [ ] |
| S18-3 | 出局仍发牌/仍出/仍质疑 | `lb_str_out_still_act` | `SeatEliminated` 后禁行动 | [ ] |
| S18-4 | 相信路径仍进揭牌 | `lb_str_trust_revealed` | `Believed` 不进 Reveal | [ ] |
| S18-5 | 仍走旧左轮或RoundWin | `lb_str_old_lives_or_roundwin` | 无 RevolverGun / RoundWin 主胜负 | [ ] |
| S18-6 | 第二人不可质疑第一手 | `lb_str_first_hand_challenge` | 同 R2 | [ ] |
| S18-7 | 牌堆不是20构成 | `lb_str_deck_not_20` | 6K+6Q+6A+2Joker；人5 | [ ] |
| S18-8 | ≥3仍强制质疑 | `lb_str_empty_force_ge3` | HandEmptyGate ≥3 可选 | [ ] |
| S18-9 | =2仍可跳过 | `lb_str_empty_skip_eq2` | =2 强制质疑 | [ ] |
| S18-10 | 打光仍走RoundWin | `lb_str_empty_still_roundwin` | 禁 RoundWin 主读 | [ ] |
| S18-11 | 未被质疑却被罚 | `lb_str_empty_shot_unasked` | ≥3 跳过不罚打光者 | [ ] |
| S18-12 | Joker未除外 | `lb_str_empty_joker_misjudge` | Joker 除外裁定 | [ ] |
| S18-13 | 入口仍真假主读 | `lb_str_entry_still_true_false` | 仅 doubt/believe | [ ] |
| S18-14 | 相信后仍不可出 | `lb_str_believe_still_blocked` | Believe 后续可出 | [ ] |
| S18-15 | 质疑未揭牌 | `lb_str_doubt_no_reveal` | Doubt→Reveal | [ ] |
| S18-16 | （废）膛位当命读 | `lb_str_revolver_as_lives` | **冻结**；不得作过关听验 | [ ] 冻 |
| S18-17 | 仍走左轮开枪 | `lb_str_still_revolver_shoot` | 无开枪主读 / 禁听验过关 | [ ] |
| S18-18 | 揭牌输家未熄烛 | `lb_str_loser_no_extinguish` | PenaltyExtinguish1 | [ ] |
| S18-19 | 仍1命即死 | `lb_str_still_one_life_elim` | `lives_default=3` 累熄 | [ ] |
| S18-20 | 开局不是三烛 | `lb_str_open_not_three_candles` | 开局每人 3 烛 | [ ] |
| S18-21 | 熄尽未淘汰 | `lb_str_all_out_not_eliminated` | 熄尽→淘汰 | [ ] |
| S18-22 | 质疑无表现 | `lb_str_challenge_no_broadcast` | 同 F2-1 | [ ] |
| S18-23 | 揭牌仅自己见 | `lb_str_reveal_self_only` | 同 F2-2 | [ ] |
| S18-24 | 开牌假面 | `lb_str_reveal_claim_face` | 同 R1/R1′ | [ ] |
| S18-25 | 开牌过快 | `lb_str_reveal_too_fast` | 同 R4；持面 &lt;2.5s 或仍锁 3500/5000 | [ ] |
| S18-26 | 质疑窗不见上家本手张数 | `lb_str_challenge_no_pile_count` | 同 R5 | [ ] |
| S18-27 | 法官句未全左上 | `lb_str_judge_not_top_start` | 同 R6-1 | [ ] |
| S18-28 | 中顶仍叠宣言 | `lb_str_center_top_claim_stack` | 同 R6-2 | [ ] |

---

## 4. 性能项

| ID | 指标 | 期望 | 量法 | 过 |
|----|------|------|------|----|
| **PERF-1** | 对局稳态帧率 | **≥55 fps**（横屏桌面；非揭牌特效尖峰可另记，稳态不得长期 &lt;55） | 真机 / DevEco Profiler 或 Cocos 统计；记机型与包 SHA | [ ] |
| **PERF-2** | 抽→翻 | **1000±100 ms**（900～1100；与 R4 窗 800～1200 兼容，本项更严） | 秒表/日志戳 `DRAW_TO_FLIP` | [ ] |
| **PERF-3** | 翻后持面 | **3000±100 ms**（2900～3100；与 R4 窗 2.5～3.5s 兼容，本项更严） | 秒表/日志戳 `REVEAL_HOLD` | [ ] |

失败：帧率不达标 → 报「帧率&lt;55」；时序偏出 → **开牌过快**（S18-25）或注明实测 ms。

---

## 5. 混合宿主专项（ArkUI 壳 ↔ Cocos 视图）

> Mode 2 默认：Lobby / Report / 教学 / Kit 在 ArkTS；对局在 Cocos（`Table.ets` XComponent + 桥）。桥草案：JS→ArkTS `lb.tts / lb.live / lb.privacy / lb.perfScene / lb.exit / lb.report`；ArkTS→JS `lb.start / lb.pause / lb.resume / lb.back`。

| ID | 步骤 | 期望 | 失败短句 | 过 |
|----|------|------|----------|----|
| **H-1** | 大厅开桌 → 进入对局 | Cocos 场景可见（至少牌桌/手牌节点）；非白屏/卡死 | **宿主进桌失败** | [ ] |
| **H-2** | 对局中点 `lb_btn_home` / 系统返回 | 回到 ArkUI 大厅；Cocos 侧 pause/销毁不泄漏 | **局内返回失效**（同 F3） | [ ] |
| **H-3** | 对局中切后台再回前台 | `lb.pause`→`lb.resume`；倒计时/阶段可恢复或按设计安全重置；可打完一局 | **后台恢复失败** | [ ] |
| **H-4** | 实况窗（Live View） | 事件驱动更新与旧 ArkUI 口径一致（或文档声明的降级）；无 Kit 仍可打完 | **实况窗不一致** | [ ] |
| **H-5** | 开发开关旧表/新表（若有） | 切换可达；parity 阶段旧表可对照；勿默默丢宿主 | **双轨切换失效** | [ ] |
| **H-6** | Kit 降级 | 无 TTS / 无 gamePerformance 仍可打完主链 | **无Kit不可完局** | [ ] |

---

## 6. engine_parity

| ID | 步骤 | 期望 | 过 |
|----|------|------|----|
| **EP-1** | 跑 `cocos/tools/engine_parity.mjs`（路径不存在 → **SKIP**，不红；见 §7） | 同 seed 事件序列：ArkTS `MatchEngine` vs Cocos `engine/*.ts` **100% 一致** | [ ] **T3：TS 烟雾绿 · ets NOT RUN · 勿勾 100%** |
| **EP-2** | 覆盖主链事件（草表，正式以 05 文档 + 状态机附录 E 为准） | 至少含：`MatchStarted` `Dealt` `ClaimSet` `TurnBegan` `PlayLanded` `ChallengeWindowOpened` `Believed` `ChallengeCommitted` `RevealStarted` `Judged` `CandleOut` `SeatEliminated` `Redealt` `EmptyGate` `MatchEnded` | [ ] |
| **EP-3** | 判定公式抽检 | 真假裁定 / PenaltyExtinguish1 / HandEmptyGate ≥3|=2 与文档锁一致 | [ ] |

**合入 parity 脚本绿 ≠ 真机终验。**

---

## 7. 门禁迁移（T2 脚本已落 · 缺文件 SKIP）

> **规则**：旧路径存在则查旧；新路径存在则查新；**目标路径尚不存在 → 打印 `SKIP` 而非红**。双轨期旧 ArkUI 闸仍有效，直到阶段 5 删旧表。  
> **T2 状态（2026-09-17）**：`cocos_*_check.mjs` 已进仓；`engine_mainpath_check.mjs` 双轨 INFO/软断言；K3/K4 未合时新闸应 **SKIP 绿**，不得依赖 K3。  
> **T3 状态（2026-09-17 · develop `28c5a61` / K3 #225）**：`engine_parity` 烟雾 **OK**（`parity_100: false` · ets **NOT RUN**）；`cocos_engine_purity` / `cocos_cues` **PASS 绿**（不再 SKIP）。详见 [K3-parity验收记录](./K3-parity验收记录.md)。

### 7.1 现有 `scripts/*_check.mjs`

| 脚本 | 现行主要探针 | Cocos 弧策略 | T2 状态 | 备注 |
|------|--------------|--------------|---------|------|
| `engine_mainpath_check.mjs` | rawfile JSON + ArkTS `MatchEngine` 公式复述 | **双轨** | **已改** | 无 cocos engine `.ts` → INFO tip；有文件则断言公式符号 + 禁 cc/setTimeout；ets 路径不改严 |
| `revolver_rules_check.mjs` | `MatchEngine` / Phase / lives=3 / 无 RevolverGun | **双轨** | 待后续 | 新引擎路径同样禁左轮主读；旧路径在则仍查 |
| `challenge_await_check.mjs` | `Table.ets` / `ChallengeEntry` / doubt\|believe | **双轨→迁 Cocos** | 待后续 | 表内入口迁场景后查 `lb_btn_challenge_*` 节点 / `Cues`；壳层 ids 可留 |
| `client_rebuild_f3_f1_check.mjs` | `Table.ets` home / 他座熄烛 / GAP24 | **双轨** | 待后续 | F3 宿主仍可能在 `Table.ets`；熄烛表现迁 Cocos 后双查 |
| `client_rebuild_f2_f4_f5_check.mjs` | 全员揭牌 / 宣言左上 / 烛框 / GAP24 | **双轨** | 待后续 | 表现迁场景后查节点与布局常量 |
| `play_fly_check.mjs` | `PlayFlyFx` / 飞牌 / 身前扣 | **双轨→迁 Cocos** | 待后续 | Tween 飞牌在 Presenter 后查 Cocos 脚本常量 |
| `play_to_pool_check.mjs` | 飞池 + RevealStage + SFX 线 | **双轨→迁 Cocos** | 待后续 | R4/R5 数字跟 `Cues.ts` |
| `deal_d1_check.mjs` | DealFx / 发牌演出 | **双轨→迁 Cocos** | 待后续 | 发牌表现迁场景后双轨 |
| `life_touch_play_check.mjs` | 烛 + 手牌触摸出牌 | **双轨→迁 Cocos** | 待后续 | `lb_cmp_hand` 触摸在 Cocos；烛节点名保留 |
| `card_faces_check.mjs` | media 牌面绑定 / 手牌默认背 | **双轨** | 待后续 | 资产拷贝进 `cocos/assets/art` 后可兼查；不改像素 |
| `table_audio_check.mjs` | TableAudio / BGM+SFX | **双轨** | 待后续 | 音频路径迁 `cocos/assets/audio` 后双轨；壳层大厅音可仍查 ArkUI |
| `lobby_boot_check.mjs` | 大厅 v3 冷启动 | **保留（ArkUI）** | 不变 | 大厅不迁 Cocos；无需双轨 |
| `revolver_art_bind_check.mjs` | EmptySafe chrome + 禁左轮 Foley 主调 | **双轨 / 部分冻结** | 待后续 | 禁 `playRevolver*` 主路径在新引擎同样锁；听验过关仍冻 |
| `round_win_redeal_check.mjs` | 旧 RoundWin→RedealAll | **废弃（SUPERSEDED）** | 待后续 | 不得再作正路径过关；Cocos 侧可 SKIP / 禁令闸 |

### 7.2 新增（T2 · 路径不存在 → SKIP）

| 脚本 | 规则摘要 | T2 状态 | 路径不存在 |
|------|----------|---------|------------|
| `cocos_engine_purity_check.mjs` | `cocos/assets/scripts/engine/` 内：**禁** `import` cc/UI、**禁** `setTimeout`；判定公式三行原样（与 ets / 文档锁一致） | **已落** | **SKIP**（不红） |
| `cocos_cues_check.mjs` | `Cues.ts`（或等价）数字 = **1000 / 3000 / 24 / 320**（`DRAW_TO_FLIP` / `REVEAL_HOLD` / `HAND_RING_GAP` / `FLY_MS`） | **已落** | **SKIP** |
| `cocos_node_ids_check.mjs` | 场景 JSON 必含节点：`lb_cmp_hand` · `lb_cmp_pool` · `lb_txt_timer` · `lb_txt_judge` · `lb_btn_challenge_doubt` · `lb_btn_challenge_believe`；骨架零 `lb_*` → **SKIP** | **已落** | **SKIP** |
| （共用）`cocos/tools/engine_parity.mjs` | 同 seed 事件序列对比；Cocos 岗维护，测试 T3 跑验 | **T3 已验烟雾**（ets 对照仍 NOT RUN） | 工具缺失 → **SKIP**；K3 合入后应能跑 |

### 7.3 迁移阶段建议

| 阶段 | 门禁形态 |
|------|----------|
| 0～1 文档/Spike | 旧 `*_check.mjs` 全绿；新 `cocos_*` **SKIP** |
| 2 引擎移植 | `engine_mainpath` + `revolver_rules` **双轨**；`engine_parity` 必绿；`cocos_engine_purity` 绿 |
| 3 对局场景 | `cocos_cues` / `cocos_node_ids` 绿；表现类 check **双轨** |
| 4 桥与 Kit | 宿主专项 H-*；lobby 闸仍只查 ArkUI |
| 5 收尾删旧表 | 表现类旧探针可 **废弃** 或改为仅查宿主残件；全清单本表 Rebuild 终验 |

---

## 8. 前置（勾选前）

- [ ] 已读 `05-engine-refactor-plan` 与本仓库对局-状态机 **v2.0.7** 数字锁
- [ ] Rebuild 到含 Cocos 嵌入（或明确开发开关）的包；记下 SHA / 机型
- [ ] 能造：他座熄烛、首手可质疑、宣称≠实出揭牌、完整 1000/3000 开牌轴、AwaitChallenge 见本手张数、后台切换、大厅往返
- [ ] 失败只报 S18 短句或本表 ID；**未 Rebuild 勿勾过关**
- [ ] T2/T3 门禁：`node scripts/cocos_engine_purity_check.mjs` / `cocos_cues_check.mjs` / `cocos_node_ids_check.mjs`（缺文件应为 SKIP；K3 合入后 purity/cues 应绿）
- [ ] T3：`node cocos/tools/engine_parity.mjs` 烟雾；**parity 100% 仅当 ets 对照也跑通**（见 README-parity / [K3-parity验收记录](./K3-parity验收记录.md)）

---

## 9. 不做 / 禁偷换

| 禁 | 说明 |
|----|------|
| **合入当终验** | merge / 本表合入 ≠ Aron 真机 Rebuild |
| **未 Rebuild 勾过** | 禁止 |
| **发明玩法 / 改锁** | 规则与数字只有 Aron 能拍 |
| **路径缺失报红** | 新闸必须 SKIP；不得因 K3/K4 未合而红 |
| **用 R3/3500/5000 勾 R4** | 主闸 1000/3000 |
| **左轮听验过关** | S18-16/17 冻结口径 |
| **替勾大厅 v3 过关** | 大厅另纸；且 v3 仍暂停宣称过关 |

---

### 审核记录

| 日期 | 说明 | 状态 |
|------|------|------|
| 2026-09-17 | **v0.1.0** 新建 Cocos 重写回归总纸：parity F1–F5 / R1–R6 / S18-1～28 + 性能 + 混合宿主 + engine_parity + 门禁迁移计划；**本票不改脚本**；合入≠终验 · 未 Rebuild 勿勾 | 已合（T1） |
| 2026-09-17 | **v0.1.1** T2：落 `cocos_engine_purity_check` / `cocos_cues_check` / `cocos_node_ids_check`（缺文件 SKIP）；`engine_mainpath` 双轨 tip；§7 迁移表标 **已落/已改**；玩法正文锁零改；合入≠终验 | 已合（T2 #224） |
| 2026-09-17 | **T3**：K3 #225 后跑 `engine_parity` 烟雾 OK；`parity_100: false`（ets NOT RUN）；`cocos_engine_purity`/`cocos_cues` 绿；见 [K3-parity验收记录](./K3-parity验收记录.md)；玩法正文锁零改；合入≠终验 | **本提交 · 待审** |

请 **@LiarBar负责人** **@测试** **@Cocos** **@鸿蒙** 会签。合入≠终验。

---

*测试岗 · T3 · Cocos 重写回归 · K3 parity 烟雾 · 闸绿 · 100% 未宣称 · 合入≠终验 · 未 Rebuild 勿勾*
