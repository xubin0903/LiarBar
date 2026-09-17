# LiarBarTable · Cocos Creator 3.8.8

对局桌面的 Cocos 工程（**Mode 2**：嵌入现有 HarmonyOS `LiarBar` DevEco 工程，不另起 App 壳）。

**合入 ≠ 终验。**

## 路径映射

| 角色 | 路径 |
|------|------|
| **仓库内工程根（真源进 git）** | `LiarBar/cocos/`（本目录） |
| **本机 Creator 工作副本（可先在此开）** | `E:\Cocos\projects\LiarBarTable\LiarBarTable` |
| 外层误套目录（忽略） | `E:\Cocos\projects\LiarBarTable\` |
| 编辑器 | `E:\Cocos\editor\CocosCreator-3.8.8\CocosCreator.exe` |

以内层 `...\LiarBarTable\LiarBarTable` 与仓库 `cocos/` 为同一工程语义；改完可双向 `robocopy`（排除 `library/` `temp/` `local/` `build/` `native/` `node_modules/`）。

`package.json`：`name=LiarBarTable`，`creator.version=3.8.8`。

## 打开工程

```powershell
& "E:\Cocos\editor\CocosCreator-3.8.8\CocosCreator.exe" --project "E:\Projects\liar项目\agent-cocos\LiarBar\cocos"
```

或用本机副本路径。首次打开会为 `assets/art|audio|config` 生成 `.meta`（若尚未提交）；**不要卡在账号登录**——需登录时找 Aron。

默认场景：`assets/scenes/Table.scene`（空 Canvas 骨架；局内布局见 `docs/04-设计/21-局内Cocos场景布局规格.md`，K4 再铺节点）。

## 目录骨架

```
assets/
  scenes/Table.scene
  scripts/engine/     # K3 MatchEngine 等
  scripts/game/       # K4 Presenter / Cues / LbBridge
  art/{cards,candles,buttons,dealer,avatars,bg,fx,lobby,misc}/
  audio/{bgm,sfx,vo}/
  config/             # 自 rawfile/config 原样拷贝
tools/                # K3 engine_parity 等
extensions/cocos-mcp-server/   # MCP 扩展（无 node_modules）
```

资产按 `docs/04-设计/资产迁移Cocos对照表.md` **只拷贝不改像素**；**左轮** `art_revolver_*` / `sfx_revolver_*` **不进库**。

## Cocos MCP 扩展

仓库已带 `extensions/cocos-mcp-server/`（含 `dist/`，**不含** `node_modules/`）。

若扩展面板报缺依赖，或需从权威源重装：

```powershell
E:\Cocos\mcp\install-into-project.ps1 -ProjectPath "<本工程根，即含 assets/ 的目录>"
```

装完后重启 Creator → **扩展 → Cocos MCP Server → 打开 MCP 面板 → 启动服务**（默认 `http://127.0.0.1:3000/mcp`）。  
含 token 的 `settings/mcp-server.json` **勿提交**（已在 `.gitignore`）。

## HarmonyOS NEXT 构建（K2）

官方：[发布到 HarmonyOS Next](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-harmonyos-next.html)（Creator ≥3.8.5；本工程锁 **3.8.8**）。

### GUI（推荐 · 本机无人值守常卡登录）

1. Creator 打开本工程。
2. **项目 → 构建发布**，平台选 **HarmonyOS Next**。
3. JS 引擎优先 **JSVM**；Debug/Release 按任务。
4. 点击构建。

### 产物期望路径

| 产物 | 路径（以 Creator 实际输出为准） |
|------|--------------------------------|
| 构建缓存 / 中间 | `build/harmonyos-next/`（**不进 git**） |
| 原生工程 | `native/engine/harmonyos-next/`（**不进 git**；鸿蒙岗用 DevEco 打开） |

随后用 **DevEco Studio** 打开该原生工程（或 Mode 2 并入仓库根模块）签名、真机 Run。Creator 侧 Make/Run 可能未实现 → **以 DevEco 为准**。

### 命令行

若本机已登录 Creator，可试：

```powershell
& "E:\Cocos\editor\CocosCreator-3.8.8\CocosCreator.exe" --project "<本工程根>" --build "platform=harmonyos-next"
```

**K2 实测（2026-09-17）**：

| 项 | 结果 |
|----|------|
| CLI `--build "platform=harmonyos-next"` | 已启动；写出部分 `build/harmonyos-next/`（含 `cocos.compile.config.json`、data/assets） |
| `native/engine/harmonyos-next/` | **未生成**（60s 超时杀进程；中间有压缩类型校验警告 / webgl 模块回退提示） |
| 阻塞 | 无人值守不完整；**构建待 Aron 在 Creator GUI 点一次完整 HarmonyOS Next 构建**，再用 DevEco 打开原生工程 |

合入本 PR **≠** NEXT 构建终验。

## 相关文档

- `docs/05-技术/05-Cocos工程与引擎移植方案.md`（含 **K2 落地路径**）
- `docs/04-设计/资产迁移Cocos对照表.md`
- `docs/04-设计/21-局内Cocos场景布局规格.md`
