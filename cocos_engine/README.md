# cocos_engine · Mode 2 引擎模块占位（C2′）

> **合入 ≠ 终验**。本目录本票 **不** 把 235MB `libcocos.so` 与完整 Creator `harmonyos-next` 树 commit 进仓。

## 本票结论（诚实）

| 项 | 状态 |
|----|------|
| so 交接 | K2补已备 ASCII 包；用 `node scripts/copy_cocos_native_libs.mjs` 落到 `entry/libs/arm64-v8a/` |
| `XComponent` + `libraryname: 'cocos'` | 代码侧开关 `LINK_LIBCOCOS`（默认 **false**） |
| 根 `build-profile.json5` 增 `cocos_engine` 模块 | **未合入构建图**（见下阻塞） |
| 整包 HAP / 场景一张牌 | **未宣称过线**；需 Aron DevEco GUI |

## 为何暂不 `modules[]` 并入完整 native 树

依据 develop `docs/05-技术/05-…方案.md` §7.2 / §7.3：

1. **中文路径**：仓库在 `…\liar项目\…` 时 hvigor 报 **00306003**；junction 无效。native 须在纯 ASCII 路径编译（已有 `E:\Cocos\projects\LiarBarHarmonyNative\`）。
2. **ArkTS 模板**：同次 `assembleHap` 在 **CompileArkTS** 失败（`cocos_worker.ets` 等与 HarmonyOS **6.1** / modelVersion 不匹配）。CMake/Ninja 已能出 so，但整包 Run 仍阻塞。
3. **体积**：`libcocos.so` ~235MB，禁止进 git。

因此 C2′ 采用：

- **运行时 libs 放置**（`entry/libs/arm64-v8a/`，gitignore）
- 壳侧 `CocosTableHost` 在 `LINK_LIBCOCOS=true` 时补 `libraryname: 'cocos'`
- 本目录仅作 **接线说明 + 未来 HAR/模块落点**；待 Aron 在 ASCII 工程修通 ArkTS 模板后再把精简 ets/Worker 迁入并登记 `modules[]`

## 本机放置（与 entry 二选一）

```text
entry/libs/arm64-v8a/libcocos.so          ← 推荐（HAP entry 直带）
entry/libs/arm64-v8a/libc++_shared.so
# 或
cocos_engine/libs/arm64-v8a/…            ← 预留给独立模块；需另配 oh-package / modules[]
```

源：`E:\Cocos\projects\LiarBarHarmonyNative\handoff-arm64-v8a\`

## 给 Aron 的 DevEco GUI 步骤（单独列出）

1. 用 DevEco 打开 **ASCII** 工程：`E:\Cocos\projects\LiarBarHarmonyNative\engine\harmonyos-next\`（勿用含中文的仓库绝对路径编 native）。
2. 配置签名 / `local.properties` → `sdk.dir=E:/devStudio/DevEco Studio/sdk/default`。
3. 处理 **CompileArkTS**（`cocos_worker.ets` 等与 6.1 模板告警）；必要时跟版 Creator / 官方 NEXT 模板。
4. 确认 `libcocos.so` 仍可由 `BuildNativeWithNinja` 产出或已在 `handoff-arm64-v8a`。
5. 可选：在验证副本 `E:\Projects\LiarBar`（Agent **不碰**）把 so 拷入 `entry/libs/arm64-v8a/`，本地临时 `LINK_LIBCOCOS=true` + `USE_COCOS_TABLE=true` 冒烟 `lb_scr_table`。
6. 真机 / 模拟器终验仍归 Aron Rebuild；本 PR 不宣称 S2 场景牌面过线。

## 相关

- `docs/05-技术/04-Cocos驱动鸿蒙宿主架构.md` §7 · §10 · §11（C2′）
- `docs/05-技术/05-Cocos工程与引擎移植方案.md` §7.2 / §7.3
- `entry/src/main/ets/harmony/CocosNativeLink.ets` · `CocosTableFlag.ets` · `features/table/CocosTableHost.ets`
