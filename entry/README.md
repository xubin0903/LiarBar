# entry · 谎馆客户端模块

HarmonyOS NEXT 单模块 HAP。包名 `com.liarbar.app`，应用显示名 **谎馆**。冷启动路由 `pages/Lobby`（控件 id `lb_scr_lobby`）。

**完整编译、签名、模拟器 / 真机演示是本机 DevEco 的工作。** 云端 agent / CI 不保证装得上 HarmonyOS SDK，也不把「云端编过」当作本 PR 验收。

本 PR 已接线 P0 主路径：`MatchEngine` T01+、三人格读表、`demo_seed=20260906` 强制合法事件。请本机 **Rebuild Project** 后再跑。

## 用 DevEco 打开

1. 安装 [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/) 与 HarmonyOS NEXT SDK。
2. 本工程 `build-profile.json5` 默认 `compatibleSdkVersion` / `targetSdkVersion` = `6.1.0(23)`（验收机 DevEco 6.1）。若队友本机 SDK 更旧，可在本地把这两个字段下调对齐，不要另起一套包名或模块名。
3. **File → Open** 选仓库根（与 `AppScope/`、`entry/` 同级），不要只打开 `entry/` 或 `docs/`。
4. 等待 ohpm / hvigor 同步。签名用本机调试证书；不要把 `.p12` / `.p7b` 提交进库。
5. **Build → Rebuild Project**，确认 CompileArkTS ERROR=0（不要对 typed 字段做下标访问，不要引入 `ESObject`/`any`）。
6. 运行目标选 **Phone · 竖屏**。冷启动应进 Lobby；`lb_btn_quickstart` 开 1 真人 + 3 AI 入 `lb_scr_table`。

## 本模块有什么 / 没有什么

| 有 | 没有（后续 PR） |
|----|-----------------|
| T01+ 纯逻辑引擎；胜负只认命 | 联网 / 账号 / 反作弊 |
| TIMID / SHARK / KAREN 读 `ai_personas.json` | LLM 判真假 |
| `demo_seed` 强制合法事件（杠精开老千本手） | 局内其余色块抛光（大厅 v2 真图已交） |
| Table / Challenge / Report 跟引擎快照 | 实况窗权益联调 |
| 四主屏锁名；大厅 v2 真图 `art_*`（其余仍可色块） | |

规则数字只从 `Match.config`（开局深拷贝 JSON）读。牌堆运行时键仍是 `n3`..`n6`。改手感只改 `resources/rawfile/config/`，不要在 `.ets` 里写死 `turn_seconds` / `challenge_only_seconds` / `lives_default`。

**回合超时（人机分工）**：`MatchDirector.tick` 在 `humanMustWait()` 时清 `thinkUntilMs` 并返回，不 `arm` / 不 `runAi`。`timeout_auto_play` 仍对 **AI** 生效（普通窗代出 1 张；仅质疑窗 skip）。HUMAN 的 `TURN` / `PLAY_REVEAL_SELF` **暂停回合钟**（`turnEndsAtMs=0`），`timeout()` / `autoPlayOne` / `demoForcePlay` 不代出、不代质疑；一直等到玩家点 出牌 / 质疑 / 跳过（合法时）。空牌且不可质疑的 T14 自动跳过仍适用。`demo_seed=20260906` 强制事件（老千 SLAM 假、杠精开）只打在 AI 座。

大厅 v2 真图用仓库根 `scripts/gen_lobby_v2_art.py`（源图在 `scripts/art_src/`）。`gen_lobby_p0_art.py` / 色块脚手架 **只算占位，不是交件**。`gen_scaffold_assets.py` 会跳过已交件的 splash / lobby / table / bust / CTA。文件名必须继续是美术清单里的 `art_*`。
