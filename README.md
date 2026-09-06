# 谎馆 LiarBar

华为高校创新赛 · 应用创新赛道

AI 荷官驱动的虚张声势社交博弈 · HarmonyOS 原生应用（文档已锁 v0.2 · 工程脚手架已开工）

正式中文名：**谎馆**（口语别称：骗子酒馆）

## 一句话定位

不用真人主持、手牌防偷窥、回合节奏可触达的鸿蒙「骗子酒吧」——用动作演、用舆论压、用 AI 荷官控场。

## 仓库内容

```
AppScope/  entry/     HarmonyOS NEXT 单模块工程（包名 com.liarbar.app，显示名 谎馆）
docs/
├── 00-立项/          项目一页纸 · 制作人工作流
├── 01-产品/          PRD
├── 02-游戏设计/      GDD · 互动方案 · 数值配置
├── 03-鸿蒙与AI/      策划 AI 规格已交（播报/三人格/demo_seed）；特性选型见 05/03
├── 04-设计/          UI 线框 + 美术风格板 / 资源清单
├── 05-技术/          脚手架约定 / 状态机 / 鸿蒙特性选型
├── 06-质量/          用例 + 课设 5 分钟清单
└── 07-交付/          项目创意介绍 PPT 及生成脚本
```

入口文档：[`docs/README.md`](docs/README.md)  
贡献与 Git：[`CONTRIBUTING.md`](CONTRIBUTING.md)（`feat/*` → PR 合入 `develop` → 负责人合入 `main`）

介绍 PPT：[`docs/07-交付/谎馆-项目创意介绍.pptx`](docs/07-交付/谎馆-项目创意介绍.pptx)

## 当前进度

- **规则已锁定 v0.2**（制作人拍板：名称、MVP 只人机+本地、质疑/出牌权/手牌耗尽、互动与数值）
- **03 策划本批已交**：[AI荷官与牌友规格](docs/03-鸿蒙与AI/AI荷官与牌友规格.md)（播报模板 / 三人格 / `demo_seed=20260906`）；C1～C8 一眼看 [鸿蒙特性玩法话术](docs/03-鸿蒙与AI/鸿蒙特性玩法话术.md)
- **鸿蒙特性映射正文**在 [`docs/05-技术/03-鸿蒙特性选型.md`](docs/05-技术/03-鸿蒙特性选型.md)（PR#5 已合）。`docs/03-鸿蒙与AI/` **不重复造**特性选型，只补玩法话术与 AI 规格；**待 @LiarBar鸿蒙开发 会签**后再请负责人终审
- 04 UI/美术、05 技术草案、06 用例已在 `develop`；日常合入 `develop`
- **工程脚手架已开工**（`feat/client-scaffold`）：四主屏导航 + rawfile 配置 + 引擎/鸿蒙桩。完整规则与模拟器编译在本地 DevEco，见 [`entry/README.md`](entry/README.md)

## 本地用 DevEco 打开

云端不保证能编过 HarmonyOS SDK。请在本机：

1. 安装 DevEco Studio，SDK 对齐 HarmonyOS NEXT（工程默认 `5.0.0(12)`，可按本机 SDK 上调）
2. **Open** 本仓库根目录（有 `build-profile.json5` / `AppScope/` 的那一层，不要只开 `docs/`）
3. 等待 ohpm 同步；在 Project Structure 里完成本机签名（仓库不提交证书）
4. 竖屏手机运行；冷启动应进入 `lb_scr_lobby`（显示名 **谎馆**）

详细步骤与验收边界见 [`entry/README.md`](entry/README.md)。

## 明确不做（范围约束）

全场景接续主流程、3D/3DGS、LLM 判定胜负、真金赌博、首版强制语音房。

## License

文档与方案仅用于参赛与学习交流。
