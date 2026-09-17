# 05 · Cocos 工程与引擎移植方案

| 项 | 内容 |
|----|------|
| 文档版本 | **v0.1.0** |
| 状态 | **会签草案** · 零代码零资产 · **合入 ≠ 终验** |
| 对齐 | [对局-状态机](../02-游戏设计/对局-状态机.md) **v2.0.7** · [08-status/05 引擎重写规划](../../..)（记忆包）· [01-工程脚手架约定](./01-工程脚手架约定.md) · [03-鸿蒙特性选型](./03-鸿蒙特性选型.md) · Aron 2026-09-17 决议（Cocos Creator **3.8.8** 驱动对局） |
| 会签 | 草案 · 待鸿蒙岗会签宿主接线 · 待策划 ACK 事件草表与规则零改 |
| 谁写 | Cocos 开发（`feat/cocos`）· 桥与 Mode 2 接线由鸿蒙岗定稿 |
| 本票范围 | **只文档**：工程目录、移植清单、事件流、桥协议、资产规则、构建流程、验收口径。**不改规则 / 不改数字 / 不发明玩法 / 不交代码与资产** |

> 读完应能回答：Cocos 工程放哪、ets 引擎怎么一比一搬成 TS、桥叫什么、数字从哪抄、Mode 2 怎么嵌进现有 DevEco 工程。  
> **合入 ≠ 终验**：本文合入只说明 PM 审过草案；Aron 真机 Rebuild 才算过。

---

## 0. 边界（先读）

| 现在做 | 现在不做 |
|--------|----------|
| 写清 `cocos/` 目录约定、ets→ts 移植清单、`MatchEvents` 草表、`lb.*` 桥草案、`Cues.ts` 常量表 | 建 Creator 工程、改 `entry/**`、改 `docs/02-游戏设计/**` |
| Mode 2 嵌入为默认；Mode 1 写清回退触发条件 | 擅自切 Mode 1、另起独立 App 壳 |
| 资产**只拷贝**约定；构建与验收尺子 | 新增/改 `art_*`、改 rawfile 音频、改 1000/3000/320/24 |

**规则锁（全文不得触碰）**：废左轮 · 开局 3 烛 · 揭牌输家直接熄 1 · 熄尽淘汰 · 末存活胜 · CollectRedeal 不绑枪 · 每手 **质疑\|相信** · 打光 ≥3 可选/=2 强制 · 开牌**真牌面** · 第二人可质疑第一手 · `DRAW_TO_FLIP=1000` · `REVEAL_HOLD=3000` · `HAND_RING_GAP=24%` · 禁 padB 顶高。

真源优先级：对局-状态机 > GDD > 17/18 > 06-质量 > 客户端常量。

---

## 1. 目标形态与嵌入模式

### 1.1 一句话

做「**Cocos Creator 3.8.8 驱动的 HarmonyOS 原生游戏**」：对局逻辑与桌面表现进 Cocos TS；ArkUI 保留大厅 / 战报 / 教学 / 华为 Kit；规则与美术零改。

### 1.2 Mode 2（**默认**）· 嵌入现有工程

```
LiarBar/                          ← DevEco 工程根 = 仓库根
├── entry/                        ArkTS 壳：Lobby / Report / 教学 / Kits / 路由
│   ├── pages/Table.ets           → 承载 Cocos 视图（XComponent）+ 桥；旧表现 parity 后删
│   └── src/main/ets/harmony/     CocosBridge · TtsAdapter · GamePerfAdapter · LiveWindowAdapter
├── cocos_engine/ 或 HAR           Creator 生成的 HarmonyOS NEXT 引擎模块（鸿蒙岗接线）
├── cocos/                        Cocos Creator 3.8.8 工程（源 · 本岗主产出）
│   ├── assets/scenes/Table.scene
│   ├── assets/scripts/engine/    MatchEngine 等一比一 TS（见 §3）
│   ├── assets/scripts/game/      TableScene · Presenter · Director · Cues · LbBridge
│   ├── assets/art/ · audio/ · config/   自 entry 拷贝（不改像素/语义）
│   ├── native/engine/harmonyos-next/    Creator 构建生成
│   └── tools/engine_parity.mjs   同 seed 事件序列对比（K3）
├── docs/ scripts/ …
```

- `Table.ets` 用 `XComponent` 挂 Cocos 游戏视图；壳与 Kit 全留在 ArkUI。
- 旧 `pages/Table.ets` 表现代码与 `MatchDirector` **保留到 parity 通过**（阶段 5 才删）；期间可加开发开关切旧/新。

### 1.3 Mode 1（**回退**）

以 Creator 生成的鸿蒙工程为壳，把 Lobby / Report / Kits 迁入。

| 触发 | 流程 |
|------|------|
| 鸿蒙 C2 spike 证明 Mode 2 嵌入不可稳定构建或运行 | Cocos + 鸿蒙两岗汇报 PM → **PM 定**是否切 Mode 1 |

未接到 PM 书面切换前，**禁止**按 Mode 1 改仓库结构。

---

## 2. `cocos/` 目录约定

| 路径 | 用途 | 进库？ |
|------|------|--------|
| `cocos/assets/scenes/Table.scene` | 对局主场景 | 是 |
| `cocos/assets/scripts/engine/` | 规则引擎 TS（一比一移植） | 是 |
| `cocos/assets/scripts/game/` | 场景控制、Tween、AI Director、`LbBridge`、`Cues.ts` | 是 |
| `cocos/assets/art/` | `art_*` PNG 拷贝 | 是（原样） |
| `cocos/assets/audio/` | `rawfile/audio/**` 拷贝 | 是（原样） |
| `cocos/assets/config/` | `rawfile/config/*.json` 拷贝 | 是（原样） |
| `cocos/native/engine/harmonyos-next/` | Creator 生成的原生工程 | 视接线策略；中间物可忽略进库规则由 K2 钉 |
| `cocos/build/` · `library/` · `temp/` · `local/` | 构建缓存 | **否**（`.gitignore`，K2 落地） |
| `cocos/tools/engine_parity.mjs` | 同 seed 与 ets 版比事件序列 | 是（K3） |

**节点命名** = `lb_*`（与现 UI/测试锁名一致），例：`lb_cmp_hand` · `lb_cmp_pool` · `lb_btn_challenge_doubt` · `lb_btn_challenge_believe` · `lb_txt_timer` · `lb_txt_judge` · `lb_cmp_reveal_stage`。测试按节点名勾选。

---

## 3. 引擎移植清单（ets → ts）

### 3.1 文件对照（一比一；规则零改动）

| 源（ArkTS） | 目标（Cocos TS） | 备注 |
|-------------|------------------|------|
| `entry/.../engine/MatchEngine.ets` | `cocos/assets/scripts/engine/MatchEngine.ts` | 主状态机；阶段语义逐字保留 |
| `MatchTypes.ets` | `MatchTypes.ts` | 类型/快照字段不删不改语义 |
| `Phase.ets` | `Phase.ts` | 枚举值字符串保持 |
| `Judge.ets` | `Judge.ts` | **三公式原样**（§3.2） |
| `DeckDeal.ets` | `DeckDeal.ts` | 发牌 / demo 修补 |
| `HandEmptyGate.ets` | `HandEmptyGate.ts` | ≥3 `safe3` / =2 `force2` |
| `DealerLines.ets` | `DealerLines.ts` | 文案键与模板；不发明新句 |
| `SeatUtil.ets` | `SeatUtil.ts` | alive / nextAlive |
| `SeededRng.ets` | `SeededRng.ts` | 同 seed 可复现 |
| `RevolverRulesApi.ets` | `RevolverRulesApi.ts` | 仅常量/API 面说明；`v2-no-revolver` |
| `RevolverGun.ets` | **不移植** | 废左轮；禁止复活膛位/开枪结算 |
| — | `MatchEvents.ts`（**新**） | 环缓冲 + `drain(seq)`；见 §3.3 |
| `common/MatchDirector.ets` | **不整文件搬** | 语义拆到 `game/Director.ts`（AI tick）+ 场景 Presenter；规则仍只走 `MatchEngine` |

配置读取：现有 `ConfigRepository` / `rawfile/config` → Cocos 侧读 `assets/config/*.json`（键名与数值表一致；**禁止散落魔法数改规则**）。

### 3.2 判定三公式（必须原样）

权威实现：`entry/src/main/ets/engine/Judge.ets`。移植时 **逐行语义等价**（wild 仍读 `deck.json`，禁止硬编码）：

```ts
// isLegal：牌点 == 宣称 或 == wild
isLegal(cardRank, claim) => cardRank === claim || cardRank === wild

// handIsClean：每一张都 isLegal
handIsClean(cardRanks, claim) => ∀ r ∈ cardRanks: isLegal(r, claim)

// isChallengeSuccess：质疑成功 ⟺ 被质疑出牌不干净
isChallengeSuccess(targetRanks, claim) => !handIsClean(targetRanks, claim)
```

连带锁定：`HandEmptyGate.classifyEmptyGate`（≥3→`safe3`，=2→`force2`）；`PenaltyExtinguish1`（真→质疑者熄 1 / 假→上家熄 1）；`CollectRedeal` **不绑枪**。

### 3.3 MatchEvents 事件草表

供 D1 / K3 起步；正式附录以策划状态机 **附录 E**（待 v2.0.8）为准。表现层只订阅事件，**不改判定**。

| 事件 | 载荷（草） | 说明 |
|------|------------|------|
| `MatchStarted` | seed / seats | 开局 |
| `Dealt` | `{ seat, count }` | 发牌张数可见口径 |
| `ClaimSet` | `{ rank }` | 本轮指定点 |
| `TurnBegan` | `{ seat, window }` | 回合窗 |
| `PlayLanded` | `{ seat, count, claim }` | 出牌落地；池上张数=`count` |
| `ChallengeWindowOpened` | `{ seat, prevSeat, count }` | 质疑\|相信门 |
| `Believed` | `{ seat }` | 相信 / 过门续对 |
| `ChallengeCommitted` | `{ seat, targetSeat }` | 点质疑（ack 后再揭） |
| `RevealStarted` | `{ ranks` **真牌面**, `claim }` | **禁** claim 假面；空 ranks 禁瞎演 |
| `Judged` | `{ liar, loserSeat }` | 裁定谁熄烛 |
| `CandleOut` | `{ seat, livesLeft }` | 熄 1 |
| `SeatEliminated` | `{ seat }` | 烛尽出局 |
| `Redealt` | — | CollectRedeal 后重发 |
| `EmptyGate` | `{ kind: 3 \| 2 }` | 打光二选 / 强制质疑 |
| `MatchEnded` | `{ winnerSeat }` | 末存活胜 |

实现约定（K3）：`MatchEvent` 环缓冲 + `drain(seq)`；`tools/engine_parity.mjs` 同 seed 对比 ets 版与 TS 版事件序列，要求 **100% 一致**。

---

## 4. `Cues.ts` 常量表（表现数字 · 禁止改值）

落点：`cocos/assets/scripts/game/Cues.ts`。值必须与现行客户端常量一致；**真源仍是 docs**（对局-状态机 R4 / 布局 11），代码只是引用挂点。

| 常量 | 锁值 | 引用源 | 禁 |
|------|------|--------|----|
| `DRAW_TO_FLIP_MS` | **1000** | `PlayFlyFx.DRAW_TO_FLIP_MS` | 160 / 500 / 改窗主闸 |
| `REVEAL_HOLD_MS` | **3000** | `PlayFlyFx.REVEAL_HOLD_MS` | 3500 / 5000 / 2000；持面未满 reset |
| `FLY_MS` | **320** | `PlayFlyFx.FLY_MS`（窗 280～400） | 另起飞牌主时长 |
| `HAND_RING_GAP_PCT` | **24** | `TableLayout` / `TableBreakpoints.HAND_RING_GAP_PCT` | 改百分比；用 padB 顶高手牌 |

交叉：翻窗 **800～1200ms**；持面窗 **2.5～3.5s**（持面锁值本体 3000，`REVEAL_HOLD_MS_MIN=3000`）。手牌沉底贴底缝；荷官回池旁；法官句左上；中顶只 timer。

---

## 5. 桥协议 `lb.*`（与鸿蒙共同定稿）

### 5.1 方法草表

| 方向 | API | 语义 |
|------|-----|------|
| JS→ArkTS | `lb.tts(text)` | 荷官播报（Core Speech Kit；无权限降级静默） |
| JS→ArkTS | `lb.live(phaseText, remainSec, claimShort)` | 实况窗文案（事件驱动） |
| JS→ArkTS | `lb.privacy(on)` | 看牌防窥开关 |
| JS→ArkTS | `lb.perfScene(sceneId)` | Game Service `gamePerformance` 场景 |
| JS→ArkTS | `lb.exit()` | 回壳 / 离桌 |
| JS→ArkTS | `lb.report(resultJson)` | 战报数据交给 ArkUI |
| ArkTS→JS | `lb.start(optsJson)` | 开局参数（seed、座位等） |
| ArkTS→JS | `lb.pause()` / `lb.resume()` | 前后台 |
| ArkTS→JS | `lb.back()` | 系统返回 |

实现落点：Cocos `LbBridge.ts` ↔ 鸿蒙 `CocosBridge.ets`。Kit 调用**必须在 UI 线程**（鸿蒙侧负责）；游戏 JS 在 Worker。

### 5.2 官方依据（须跟版）

| 主题 | 文档 | 本方案取用 |
|------|------|------------|
| HarmonyOS NEXT 发布 | [发布到 HarmonyOS Next](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-harmonyos-next.html)（Creator **≥3.8.5**；我们锁 **3.8.8**） | Project→Build→HarmonyOS Next；产物用 DevEco 打开 `native/engine/harmonyos-next` 编译运行；JS 引擎优先 **JSVM**（官方推荐最优性能；V8/Ark 备选） |
| JS ↔ ArkTS 反射 | [基于反射机制实现 JavaScript 与 HarmonyOS Next 系统原生通信](https://docs.cocos.com/creator/3.8/manual/zh/advanced-topics/arkts-reflection.html) | JS→原生：`native.reflection.callStaticMethod(clsPath, methodName, paramStr, isSync)`；ArkTS→JS：`cocos.evalString`（**3.8.6+**，仅 V8/JSVM；须在 Worker、`nativeEngineInit` 之后）；UI↔Worker 用 **ProxyPort** / worker `postMessage`；**禁**在游戏线程直接调只能 UI 线程跑的 Kit（tts 等） |

线程纪律（官方「线程安全」节）：主线程（ArkUI）与游戏线程（Cocos Worker）不得直接互踩资源；跨线程走消息。异步 `callStaticMethod(…, false)` 可能阻塞游戏线程 → Kit 长调用配合 `evalString` 回调，避免卡死。

版本注记：3.8.8 适配 HarmonyOS 6.0.1(21)；课设 `compatibleSdkVersion` 保持 **6.1.0(23)** 兼容策略见鸿蒙 04 宿主文档。

---

## 6. 资产规则

| 做 | 不做 |
|----|------|
| 从 `entry/src/main/resources/base/media/art_*.png`、`rawfile/audio/**`、`rawfile/config/*.json` **原样拷贝**到 `cocos/assets/` | 改像素、改文件名语义、新增 `art_*`、numpy 拼曲 |
| 文案继续认 `lb_str_*` / `string.json`（壳侧或同步拷贝键） | 发明新玩法文案当规则 |

美术岗另交「资产迁移对照表」；本岗只消费拷贝结果。

---

## 7. 构建流程

1. 本机 Creator **3.8.8**：`E:\Cocos\editor\CocosCreator-3.8.8\CocosCreator.exe` 打开仓库 `cocos/`（或本机副本，见 §7.1）。  
2. 菜单 **项目 → 构建发布**，平台选 **HarmonyOS Next**；JS 引擎选 **JSVM**；Debug/Release 按任务。  
3. 构建输出（期望）：  
   - 中间产物 `cocos/build/harmonyos-next/`（**.gitignore**，不进库）  
   - 原生工程 `cocos/native/engine/harmonyos-next/`（**.gitignore**；DevEco 打开）  
4. DevEco Studio 打开该原生工程（或 Mode 2 并入仓库根后的模块），配置签名，真机/模拟器 Run。  
5. Mode 2：鸿蒙岗把引擎模块 / HAR 接到现有 `LiarBar`；`Table.ets` `XComponent` 显示场景。  
6. 官方注意：Make/Run 在 Creator 侧可能未实现 → **以 DevEco 编译运行为准**；内存不足导致编译失败时关掉占用再编。  
7. **K2 阻塞**：CLI/`--build` 无人值守常因 Creator 登录或 HarmonyOS SDK 未配失败 → **构建待 Aron 在 Creator GUI 点一次**；详见 `cocos/README.md`。

### 7.1 K2 落地路径（工程真根 vs 仓库）

| 角色 | 路径 |
|------|------|
| 仓库进库工程根 | `LiarBar/cocos/`（`package.json` name=`LiarBarTable`，Creator **3.8.8**） |
| 本机 Creator 工作副本 | `E:\Cocos\projects\LiarBarTable\LiarBarTable`（**以内层为准**；外层多套一层忽略） |
| 编辑器 | `E:\Cocos\editor\CocosCreator-3.8.8\CocosCreator.exe` |
| MCP 扩展 | 仓库 `cocos/extensions/cocos-mcp-server/`（无 `node_modules`）；重装：`E:\Cocos\mcp\install-into-project.ps1` |
| 资产 | 按 [资产迁移Cocos对照表](../04-设计/资产迁移Cocos对照表.md) 自 `entry/.../media` / `rawfile/audio` **原样拷贝**；左轮不迁 |
| 默认场景 | `cocos/assets/scenes/Table.scene`（空 Canvas；K4 铺 `lb_*`） |

同步本机副本 → 仓库：`robocopy` 排除 `library/` `temp/` `local/` `build/` `native/` `node_modules/` `.git/`。操作步骤见 `cocos/README.md`。

---

## 8. 验收口径

| 层 | 标准 |
|----|------|
| 文档本票（K1） | 本稿齐：Mode、目录、移植表、三公式、事件草表、Cues、桥、资产、构建、验收；**零代码零资产** |
| 引擎（K3） | `engine_parity.mjs` 同 seed 事件序列一致；相关闸绿（测试岗迁路径到 `cocos/assets/scripts/engine/` 后） |
| 场景（K4） | Rebuild **F1–F5 / R1–R6 / S18** 全表；帧率 **≥55**；翻 **1000±100ms**；持面 **3000±100ms** |
| 桥与 Kit（K5） | 静默局可关 TTS；无 Kit 降级仍可打完人机局 |
| 纪律 | **合入 ≠ 终验**；Aron 在验证副本真机 Rebuild 才算过 |

失败短句用 S18-xx（见术语表）；打回不辩解，改完再交。

---

## 9. 与邻岗分界

| 岗 | 本文相关 |
|----|----------|
| 鸿蒙 | `docs/05-技术/04` 宿主架构；Mode 2 接线、`CocosBridge.ets`、Kit 线程 |
| 策划 | 状态机附录 E 与本事件草表对齐（仅附录，不改锁规则） |
| UI | Cocos 场景布局规格；节点名 `lb_*` |
| 测试 | Cocos 回归清单、门禁双轨、节点名检查 |
| 美术 | 资产迁移对照表；本岗只拷贝 |

---

## 审核记录

| 日期 | 意见 | 提议修改 | 提出人 | 状态 |
|------|------|----------|--------|------|
| 2026-09-17 | K1：Cocos 工程目录 / ets→ts 移植清单 / MatchEvents 草表 / `lb.*` 桥 / Cues 1000·3000·320·24 / Mode 2 默认 / 官方 NEXT+反射引用；零代码零资产；不改规则数字 | 新建本文 v0.1.0 | Cocos 开发 | 会签草案 · 待审 |
| 2026-09-17 | K2：回填 §7 构建路径 + §7.1 仓库/`E:\Cocos\projects\...` 映射；工程骨架与资产拷贝见 `cocos/` | 增补本节 | Cocos 开发 | 草案 · 构建待 Aron GUI |

---

*上接：[05-技术 README](./README.md) · [对局-状态机 v2.0.7](../02-游戏设计/对局-状态机.md) · [03-鸿蒙特性选型](./03-鸿蒙特性选型.md)*  
*官方：[发布到 HarmonyOS Next](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-harmonyos-next.html) · [ArkTS 反射通信](https://docs.cocos.com/creator/3.8/manual/zh/advanced-topics/arkts-reflection.html)*
