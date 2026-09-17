# 04 · Cocos 驱动鸿蒙宿主架构

| 项 | 内容 |
|----|------|
| 文档版本 | **v0.1.0** |
| 状态 | 宿主架构草案 · **零 ets**（本票只交文档）· 待 Cocos 岗会签 |
| 对齐 | [01-工程脚手架约定](./01-工程脚手架约定.md) · [03-鸿蒙特性选型](./03-鸿蒙特性选型.md) · 记忆包 `08-status/05-engine-refactor-plan.md` · 对局状态机 v2.0.7（规则锁不动） |
| 决议 | Aron 2026-09-17：Cocos Creator **3.8.8** 驱动对局；ArkUI 壳 + 华为 Kit 保留；默认 **Mode 2** 嵌入 |
| 岗位 | 鸿蒙开发（`feat/client`）写；Cocos 开发会签；PM 审合 |

> 读完应能回答：Cocos 怎么并进现有 `LiarBar` DevEco 工程、谁跑在哪条线程、ArkTS 桥怎么接线、Kit 落在哪、何时回退 Mode 1、C2 Spike 怎样算过。  
> **不改**规则数字、包名、`compatibleSdkVersion`、资产、`art_*` / 文案。协议定稿见后续 `05`（Cocos 岗）；本文只锁宿主侧边界。

---

## 0. 目标形态（一句话）

现有 `LiarBar` 仍是 DevEco 工程根；Lobby / Report / 教学保持 ArkUI；**对局桌**由 Cocos 场景渲染，经 `XComponent` 嵌进 `entry/pages/Table.ets`；华为 Kit 只走 `entry/.../harmony/`，经桥由 Cocos JS 触发、在 **UI 主线程**执行。

```
┌─────────────────────────────────────────────────────────┐
│  HAP entry（ArkTS · UI 主线程）                            │
│  Lobby / Report / 教学 / LbRouter                         │
│  Table.ets ──► XComponent(SURFACE) ──► libcocos.so        │
│       │              │                                    │
│       │         CocosBridge.ets（反射静态方法 + ProxyPort） │
│       ▼              │                                    │
│  harmony/*  ◄────────┘  LiveView / TTS / 防窥 / gamePerf  │
└──────────────────────┬──────────────────────────────────┘
                       │ Worker / JSVM（游戏线程）
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Cocos Creator 3.8.8 工程（仓库 cocos/ · Cocos 岗维护）     │
│  Table.scene · MatchEngine.ts · Presenter · LbBridge.ts   │
└─────────────────────────────────────────────────────────┘
```

---

## 1. Mode 2 · 嵌入（默认）

### 1.1 为何默认 Mode 2

| 保留 | 迁入 Cocos |
|------|------------|
| `AppScope` / 包名 `com.liarbar.app` / SDK `6.1.0(23)`（**改前问 PM**） | 对局表现与引擎逻辑（现 `Table.ets` 表现代码 + `engine/` 一比一移植） |
| Lobby / Report / 教学 ArkUI 页 | 飞牌 / 开牌 / 手牌 / 烛 / 质疑入口 UI |
| `harmony/*` Kit 适配层约定 | AI Director tick（现 `MatchDirector` → Cocos 内 Director） |
| 路由 `lb_scr_*`、控件/节点锁名 `lb_*` | 音频局内层（可分阶段；宿主侧 BGM 策略另票） |

Mode 2 = **壳不动、桌面换引擎**；课设答辩仍讲「鸿蒙原生壳 + 引擎对局 + ≥3 Kit」。

### 1.2 模块 / HAR 拆分（建议）

| 产物 | 路径建议 | 职责 | 谁维护 |
|------|----------|------|--------|
| 壳 HAP | `entry/`（现有） | Ability、四主路由、Kit、桥 ArkTS 侧、宿主 `Table.ets` | 鸿蒙 |
| 引擎模块或 HAR | `cocos_engine/` 或 `har/cocos_engine` | Creator 生成的 `libcocos.so`、Worker、oh-adapter、游戏 rawfile/js | 鸿蒙接线 · Cocos 产出源 |
| Creator 源工程 | `cocos/`（仓库内） | 场景、TS 引擎、资产拷贝 | Cocos |

**推荐接线顺序（C2 Spike）**：

1. Cocos 岗用 Creator 3.8.8 建空工程 → 构建目标 **HarmonyOS Next** → 得到 `native/engine/harmonyos-next/`。
2. 鸿蒙岗把生成树中的 native/so、Worker、资源 **并入** `LiarBar`：优先 **独立模块** `cocos_engine`（`build-profile.json5` 的 `modules[]` 增一项），或先打 HAR 再被 `entry` 依赖。
3. `entry` 的 `oh-package.json5` / `dependencies` 指向该模块；`module.json5` 不改包名；Ability 仍是现有 `EntryAbility`。
4. **禁止**本阶段改 `AppScope/app.json5` 的 `bundleName`、禁止抬/降 `compatibleSdkVersion` / `targetSdkVersion`（现行 `6.1.0(23)`，见根 `build-profile.json5`）。

> 官方构建入口：[发布到 HarmonyOS Next](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-harmonyos-next.html)（Creator ≥3.8.5；本项目钉 3.8.8）。生成工程结构参考同页：`entry/src/main/ets/pages/index.ets`、`workers/cocos_worker.ts`、`cocos/WorkerManager.ets`、`common/PortProxy.ts`、`cpp/`（`libcocos.so`）等。

### 1.3 XComponent 承载

| 项 | 约定 |
|----|------|
| 控件 | ArkUI `XComponent`，`type: XComponentType.SURFACE` |
| `id` / `libraryname` | 与 Cocos 生成工程一致（常见 `libraryname: 'cocos'`）；锁名对外仍挂在 `lb_scr_table` |
| 布局 | 全屏（或安全区 inset 后全屏）；**不**再叠旧 ArkUI 手牌/池/飞牌层（parity 前可用开发开关切旧桌） |
| 初始化 | `onLoad` 拿到 XComponent 控制器后再启 Worker / `nativeEngineInit`；禁止在未 ready 时 `evalString` |
| 已知坑 | 缺 `__NATIVE_XCOMPONENT_OBJ__` 多为生命周期未挂好或 NAPI 未绑上，属 C2 必测项 |

### 1.4 生命周期对齐（对照现行 `Table.ets`）

现行宿主语义（实现仍在旧桌，Cocos 宿主须 **语义对齐**，不改规则）：

| ArkUI / Ability | 现行行为（摘） | Cocos Mode 2 应对 |
|-----------------|----------------|-------------------|
| `aboutToAppear` | 绑音频、锁横屏桌、`pull` 快照轮询、听引擎 | 启 XComponent + Worker；桥 `lb.start`；可选短暂保留轮询直到事件桥就绪 |
| `aboutToDisappear` | 清 timer、`director.playBusy=false`、释音频 | 停 Worker / 释 so 侧资源；桥清理；Kit `stop` |
| `onBackPress` / `lb_btn_home` | `director.stop` → `engine.toLobby` → 竖屏 → Lobby | 桥 `lb.back` / `lb.exit` → Cocos 停局 → 同上路由（引擎在 JS 侧后由 Cocos Director 停） |
| Lobby `director.start` | 开桌后 AI+实况窗脉冲 | 开桌意图经桥 `lb.start` 进 Cocos；实况窗改由桥事件驱动（C3） |
| Report | `director.stop` | 局终 `lb.report` → 路由 `lb_scr_report` |

**阶段 5 前**：旧 `Table.ets` 表现代码与 `MatchDirector` **保留**；可用编译/运行时开关 `USE_COCOS_TABLE`（名可调）切新旧。parity 通过且 Aron Rebuild 放行后另开 C4 删除。

### 1.5 资源打包

| 类 | Mode 2 约定 |
|----|-------------|
| `libcocos.so` + NAPI | 随 `cocos_engine` 模块打进 HAP |
| 游戏 JS / 场景 / 纹理 | Creator 构建产物进模块 `resources` / rawfile；**像素与语义不改**（从现有 `art_*` 拷贝） |
| 壳侧 string / Lobby 图 | 仍在 `entry/resources` |
| 配置 JSON | 真源仍 `docs` + 现有 rawfile；Cocos 侧拷贝键名对齐，禁止另造规则数 |

---

## 2. 线程模型

依据官方说明（[发布 HarmonyOS Next · 系统接口交互](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-harmonyos-next.html)、[ArkTS 反射 · 线程安全](https://docs.cocos.com/creator/3.8/manual/zh/advanced-topics/arkts-reflection.html)）：

| 线程 | 跑什么 | 禁止 |
|------|--------|------|
| **UI 主线程** | ArkUI 布局、Ability、**全部 Kit 调用**、`CocosBridge` 静态方法体、窗口防窥 | 在游戏线程直接调 TTS / Live View / window API |
| **游戏线程（Cocos Worker）** | 引擎 JS（JSVM/V8）、渲染更新、`LbBridge.ts`、MatchEngine TS | 直接碰 ArkUI 节点；跨线程裸访问主线程对象 |

**JS 引擎选型（构建面板）**：本弧默认 **JSVM**（与 Creator 3.8.8 / HarmonyOS 6.x 课设机对齐）。注意：

- `cocos.evalString`：**仅 V8 / JSVM**；方舟引擎不支持（官方文档）。
- 方舟引擎可用 `globalThis` 同域技巧；**Kit 仍必须回 UI 线程**（TTS/ASR 等官方点名只能 UI 线程）。
- JSVM JIT 若需权限，按官方申请；失败记 `agent-client/memory/NOTES.md`，降级策略不阻塞「能打完一局」。

跨线程只走：

1. `ProxyPort` / Worker `postMessage`（UI ↔ Worker）  
2. `native.reflection.callStaticMethod`（游戏脚本 → **主线程** ArkTS 静态方法）  
3. 主线程 → Worker → `cocos.evalString`（回调进游戏脚本；需 3.8.6+）

高频每帧数据 **禁止** 打桥；桥只传意图与低频事件（开局/暂停/Kit/退出）。

---

## 3. 桥 · ArkTS 侧

### 3.1 官方通道（必读链接）

| 通道 | 文档 | 用途 |
|------|------|------|
| 反射 `native.reflection.callStaticMethod` | [ArkTS 反射](https://docs.cocos.com/creator/3.8/manual/zh/advanced-topics/arkts-reflection.html) | JS→ArkTS 静态方法；返回 string/number/boolean（复杂类型 JSON） |
| `runtimeOnly.sources` / `packages` | 同上 · `entry/build-profile.json5` | **必须**登记可被反射的 `.ets` / HAR，否则永远调不到 |
| `ProxyPort` | [发布 HarmonyOS Next](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-harmonyos-next.html) | UI↔Worker 消息（Video/WebView/TTS 类只能 UI 的能力） |
| `cocos.evalString` | 反射文档 · ArkTS→脚本 | 主线程经 Worker 转发后执行；初始化完成前禁止调用 |

### 3.2 宿主落点（实现票 C3，本文只定边界）

| 文件（计划） | 职责 |
|--------------|------|
| `entry/.../harmony/CocosBridge.ets` | 反射导出的静态方法表；参数 JSON 解析；转发到各 Adapter；**无业务规则** |
| `entry/.../pages/Table.ets`（宿主态） | XComponent + 生命周期 + 把 Port/Worker 交给 Bridge |
| Cocos `LbBridge.ts`（Cocos 岗） | JS 侧调用反射 / 收 `evalString` |

反射文件必须：

1. 放在 `entry/src/main/ets`（或 HAR 包并 `runtimeOnly.packages` 登记）。  
2. 写入 `entry/build-profile.json5` → `buildOption.arkOptions.runtimeOnly.sources`。  
3. 导出 **静态** 可调用函数；异步长耗时 **禁止** 用 `isSync=false` 堵死游戏线程——用 `evalString` 回调或 ProxyPort 回传。

### 3.3 消息草表（宿主侧认领；定稿在 `05`）

| 方向 | 名 | 语义 | Kit / 路由 |
|------|-----|------|------------|
| JS→ArkTS | `lb.tts` | 荷官播报文案 | `TtsAdapter` · Core Speech |
| JS→ArkTS | `lb.live` | 实况窗 start/update/stop + 三字段 | `LiveWindowAdapter` |
| JS→ArkTS | `lb.privacy` | 看牌防窥 on/off | `PeekPrivacyAdapter` |
| JS→ArkTS | `lb.perfScene` | 场景/负载提示 | `GamePerfAdapter` |
| JS→ArkTS | `lb.exit` / `lb.report` | 回大厅 / 进战报 | `LbRouter` |
| ArkTS→JS | `lb.start` / `lb.pause` / `lb.resume` / `lb.back` | 开桌、前后台、返回 | Cocos Director |

载荷：JSON 字符串；**禁止**把手牌 rank 塞进 `lb.live`（与 `03` F-08 一致）。

### 3.4 与现行运行时的关系

| 现行 | Mode 2 过渡 | 终态（C4） |
|------|-------------|------------|
| `AppRuntime.engine` + `MatchDirector` | 旧桌开关仍用；新桌引擎在 Cocos | 删除或瘦身为非对局工具 |
| `AppRuntime.liveWindow` | C3 起改由 `CocosBridge`→`LiveWindowAdapter` | 同左 |
| `Table` 快照 `setInterval` pull | Spike 可暂留；事件桥通后废弃 | 无 pull |

---

## 4. Kit 接线点

原则沿用 `01` / `03`：**全部进 `harmony/`**；页面与 Cocos 脚本不直呼 Kit；无权限 / 低版本 **降级仍能打完一局**。

本机 SDK（`E:\devStudio\DevEco Studio\sdk\default\hms\ets\`）已核实存在：

| Kit | d.ts / kit | 本弧用途 | Adapter（计划/已有） |
|-----|------------|----------|----------------------|
| Live View | `@kit.LiveViewKit` → `liveViewManager` | F-08 实况窗三字段 | `LiveWindowAdapter.ets`（现 stub，C3 接真） |
| Core Speech | `@kit.CoreSpeechKit` → `textToSpeech` | 荷官 TTS | `TtsAdapter.ets`（C3 新建） |
| 窗口防窥 | `@kit.ArkUI` `window.setWindowPrivacyMode` | F-03 看牌 | `PeekPrivacyAdapter.ets`（已有） |
| Game Service | `@kit.GameServiceKit` → `gamePerformance` | 场景/热/负载感知 | `GamePerfAdapter.ets`（C3 新建） |

### 4.1 Live View（已有选型，改驱动源）

- 字段锁：阶段文案 · 剩余整秒 · 宣称简称；**禁止牌面**（`03` §3）。  
- 现 `LiveWindowAdapter` 为可编译 stub；C3 内 `import { liveViewManager } from '@kit.LiveViewKit'`，失败 catch 降级。  
- 触发：由桥 `lb.live` 代替 `MatchDirector.pushLive`（Director 迁 Cocos 后）。

### 4.2 TTS（新增）

- API：`textToSpeech.createEngine` → `speak`（见 `@hms.ai.textToSpeech`）。  
- **必须 UI 线程**（官方：tts/asr 不可在 Worker 直接调）→ 只经 `CocosBridge`。  
- 静默局：Lobby `silentMode` 经 `lb.start` 传入；静默时 Adapter no-op。  
- 失败：打日志，对局继续（荷官桌内文案仍由 Cocos UI 显示）。

### 4.3 防窥（已有）

- 调用点锁名 `lb_privacy_on`；叠在 `lb_scr_table`。  
- Cocos 看牌手势 → `lb.privacy` → `PeekPrivacyAdapter.setEnabled`。  
- 失败：本机仍可看牌（现 fail-soft 语义保留）。

### 4.4 gamePerformance（新增）

- API：`@hms.core.gameservice.gameperformance`（`GameServiceKit`）。  
- 用途：对局中上报/感知场景与热状态，服务流畅，**不改规则**。  
- 无 Kit / 报错：忽略，不弹窗阻断。

### 4.5 明确不做（本弧）

- `gamePlayer` 华为账号登录（P1 选做，需 AGC，另票）。  
- 把 Kit 调用写进 `pages/*` 或 `cocos/assets/scripts/**`。  
- 为 Kit 发明新胜负/新阶段。

---

## 5. 构建与签名

| 项 | 现行 / 约定 |
|----|-------------|
| IDE | DevEco Studio（本机 `E:\devStudio\DevEco Studio`） |
| SDK | HarmonyOS **6.1.0(23)** · `compatibleSdkVersion` / `targetSdkVersion` 同值 |
| 产品 | `build-profile.json5` → product `default`；modules 现仅 `entry`，C2 起可增 `cocos_engine` |
| 签名 | `signingConfigs` 现为空数组 → **本机自动签名 / 调试证书**；正式包由 Aron 本机配置，**证书不进库** |
| Creator 侧 | 构建 HarmonyOS Next → 用 DevEco 打开/合并；官方：Make/Run 未完备时以 DevEco 为准 |
| Node | 官方安装 DevEco 时对 Node 有区间要求；与仓库闸脚本 Node 分离，勿混用搞挂 hvigor |
| 内存 | 官方注意：编译失败可能内存不足，关应用重试 |
| 自定义 Worker | Creator 再构建会覆盖 `cocos_worker.ts` 等 → 按官方「自定义项目模板 + 构建扩展 onAfterBuild 拷回」保护（反射文档末节） |

**锁**：不擅自改包名、不提交密钥、不改规则 JSON 键语义。

---

## 6. Mode 1 · 回退

| 项 | 内容 |
|----|------|
| 形态 | 以 Creator 生成的 HarmonyOS NEXT 工程为 **壳**；把 Lobby / Report / 教学 / `harmony/*` **迁入**该工程 |
| 触发 | **C2 Spike** 证明 Mode 2（模块/HAR 嵌入现有 `LiarBar`）无法稳定 **构建或运行** |
| 流程 | 鸿蒙 + Cocos 两岗书面结论 → 汇报 PM → PM 定是否切 Mode 1 |
| 仍不变 | 规则锁、数字、资产、`lb_*` 节点名、Kit 降级原则、PR→develop |
| 代价 | Ability/路由/签名配置以生成工程为准，合并成本高 → **非默认** |

---

## 7. Spike 验收（票 C2 · 本文预置口径）

| # | 验收项 | 过线标准 |
|---|--------|----------|
| S1 | 构建 | DevEco 能编过合并后的 `LiarBar`（含 cocos 模块/so） |
| S2 | 显示 | 模拟器进入 `lb_scr_table`，XComponent 内可见 Cocos 场景 **至少一张** `art_card_*` |
| S3 | 桥 | JS↔ArkTS ping-pong（反射或 ProxyPort 任一通路）；主线程收包、Worker 回收 |
| S4 | 线程 | Kit 探针（可先 no-op Adapter）证明调用发生在 UI 线程；错误跨线程不崩（或有明确 fail-soft） |
| S5 | 结论 | PR 正文写明：**Mode 2 可行** 或 **建议回退 Mode 1**（附日志要点） |

非本 Spike：完整对局、TTS 真机音色、实况窗权益、删旧 Table。

---

## 8. 与规则锁 / 真源的关系

| 锁 | 宿主文档态度 |
|----|----------------|
| 废左轮 · 3 烛 · 质疑\|相信 · 真牌面 · 打光二选 · CollectRedeal 不绑枪 | **不改**；引擎在 Cocos TS 一比一 |
| `DRAW_TO_FLIP=1000` · `REVEAL_HOLD=3000` · `HAND_RING_GAP=24%` · 禁 padB | **不改**；表现在 Cocos `Cues.ts`，真源仍 docs |
| 开牌真 ranks、第二人可质疑第一手、张数可见、宣言左上、中顶只 timer | 测试按节点名 `lb_*` 勾选（Cocos 岗命名） |
| 真源优先级 | 对局状态机 > GDD > 17/18 > 06-质量 > 客户端常量 |

---

## 9. 分期对照（宿主岗）

| 票 | 内容 | 本文章节 |
|----|------|----------|
| **C1** | 本文 v0.1.0 | 全部（零 ets） |
| C2 | Mode 2 Spike | §1 · §7 |
| C3 | `CocosBridge` + TTS + gamePerf + Live 改事件驱动 | §3 · §4 |
| C4 | 删旧 Table 表现 / MatchDirector 让位 | §1.4 · §3.4 |

并行：Cocos K1=`05` 工程文档；K2 空工程产物供 C2。

---

## 审核记录

| 日期 | 意见 | 提议修改 | 提出人 | 状态 |
|------|------|----------|--------|------|
| 2026-09-17 | 新建宿主架构 v0.1.0：Mode 2 默认、线程/桥/Kit/签名/Mode1/Spike；引用 Cocos 官方 NEXT 发布与 ArkTS 反射；本机 SDK 核实 LiveView/CoreSpeech/GameService | 新建本文；零 ets；不改规则数字包名 | 鸿蒙开发 · C1 | **待 PM 审 · 待 Cocos 会签** |

---

## 参考链接（外链）

1. [发布到 HarmonyOS Next · Cocos Creator 3.8](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-harmonyos-next.html)  
2. [基于反射机制实现 JavaScript 与 HarmonyOS Next 系统原生通信](https://docs.cocos.com/creator/3.8/manual/zh/advanced-topics/arkts-reflection.html)  
3. 本机 SDK：`E:\devStudio\DevEco Studio\sdk\default\hms\ets\kits\@kit.LiveViewKit.d.ts` · `@kit.CoreSpeechKit.d.ts` · `@kit.GameServiceKit.d.ts`  
4. 仓内：`build-profile.json5` · `entry/src/main/module.json5` · `AppRuntime.ets` · `MatchDirector.ets` · `harmony/*.ets` · `pages/Table.ets` 生命周期  

---

*相关：[本目录 README](./README.md) · [01](./01-工程脚手架约定.md) · [03](./03-鸿蒙特性选型.md) · 记忆包 `05-engine-refactor-plan.md` · **合入 ≠ 终验***
