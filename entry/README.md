# entry · 谎馆客户端模块

HarmonyOS NEXT 单模块 HAP。包名 `com.liarbar.app`，应用显示名 **谎馆**。冷启动路由 `pages/Lobby`（控件 id `lb_scr_lobby`）。

**完整编译、签名、模拟器 / 真机演示是本机 DevEco 的工作。** 云端 agent / CI 不保证装得上 HarmonyOS SDK，也不把「云端编过」当作本 PR 验收。

本 PR 已接线 P0 主路径：`MatchEngine` T01+、三人格读表、`demo_seed=20260906` 强制合法事件。请本机 **Rebuild Project** 后再跑。

## 用 DevEco 打开

1. 安装 [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/) 与 HarmonyOS NEXT SDK。
2. 本工程 `build-profile.json5` 默认 `compatibleSdkVersion` / `targetSdkVersion` = `6.1.0(23)`（验收机 DevEco 6.1）。
3. **File → Open** 选仓库根（与 `AppScope/`、`entry/` 同级），不要只打开 `entry/` 或 `docs/`。
4. 等待 ohpm / hvigor 同步。签名用本机调试证书；不要把 `.p12` / `.p7b` 提交进库。
5. **Build → Rebuild Project**，确认 CompileArkTS ERROR=0（不要对 typed 字段做下标访问，不要引入 `ESObject`/`any`）。
6. 运行目标选 **Phone · 竖屏**。冷启动应进 Lobby；`lb_btn_quickstart` 开 1 真人 + 3 AI 入 `lb_scr_table`。

## 本模块有什么 / 没有什么

| 有 | 没有（后续 PR） |
|----|-----------------|
| T01+ 纯逻辑引擎；胜负只认命 | 联网 / 账号 / 反作弊 |
| TIMID / SHARK / KAREN 读 `ai_personas.json` | LLM 判真假 |
| `demo_seed` 强制合法事件（杠精开老千本手） | 完整美术抛光 |
| Table / Challenge / Report 跟引擎快照 | 实况窗权益联调 |

规则数字只从 `Match.config`（开局深拷贝 JSON）读。牌堆运行时键仍是 `n3`..`n6`。
