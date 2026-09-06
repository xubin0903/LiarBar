# entry · 谎馆客户端模块

HarmonyOS NEXT 单模块 HAP。包名 `com.liarbar.app`，应用显示名 **谎馆**。冷启动路由 `pages/Lobby`（控件 id `lb_scr_lobby`）。

**完整编译、签名、模拟器 / 真机演示是本机 DevEco 的工作。** 云端 agent / CI 不保证装得上 HarmonyOS SDK，也不把「云端编过」当作本 PR 验收。

## 用 DevEco 打开

1. 安装 [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/) 与 HarmonyOS NEXT SDK。
2. 本工程 `build-profile.json5` 默认 `compatibleSdkVersion` / `targetSdkVersion` = `6.1.0(23)`（验收机 DevEco 6.1）。若队友本机 SDK 更旧，可在本地把这两个字段下调对齐，不要另起一套包名或模块名。
3. **File → Open** 选仓库根（与 `AppScope/`、`entry/` 同级），不要只打开 `entry/` 或 `docs/`。
4. 等待 ohpm / hvigor 同步。签名在 **File → Project Structure → Signing Configs** 用本机调试证书；不要把 `.p12` / `.p7b` 提交进库。
5. 运行目标选 **Phone · 竖屏**。启动后应看到 Lobby（夜半酒馆底色、标题「谎馆」）。
6. 脚手架导航可进 `lb_scr_table` / `lb_scr_challenge` / `lb_scr_report`。看牌 `lb_cmp_peek_mask` 与出牌 `lb_sheet_play` 是桌内叠层，不是第五、第六主路由。

## 本模块有什么 / 没有什么

| 有 | 没有（下一特性 PR） |
|----|---------------------|
| 四主屏锁名、`art_*` 色块占位 | 完整 T01+ 状态转移 |
| `rawfile/config/*.json`（键与数值文档逐字一致） | demo_seed 强制事件真正执行 |
| `engine/` 阶段枚举 + 裁定公式纯函数 | LLM / 联网 / 账号 |
| `harmony/` 防窥 · 实况窗 · 智能填充 **fail-soft 桩** | 实况窗权益联调（本机白名单） |

规则数字只从 JSON 读。改手感只改 `resources/rawfile/config/`，不要在 `.ets` 里写死 `turn_seconds` / `challenge_only_seconds` / `lives_default`。

占位图可用仓库根 `scripts/gen_scaffold_assets.py` 再生成；文件名必须继续是美术清单里的 `art_*`。
