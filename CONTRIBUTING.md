# 谎馆 LiarBar · 贡献指南

课设仓库的 Git 工作流与审阅约定。写文档、提 PR 前先读本文，再读 [`docs/00-立项/02-制作人工作流与验收.md`](docs/00-立项/02-制作人工作流与验收.md)。

原则不变：**好玩、沉浸优先，不走形式**；**GDD 已锁规则不得擅自改**。

---

## 1. 分支模型

```
功能分支（feat/* 或 docs/*）
  → 向 develop 提 PR
  → 负责人审核通过后合入 develop
  → 负责人审核通过后，由负责人合入 main（发布 / 演示基线）
```

| 分支 | 含义 | 谁可以合入 |
|------|------|------------|
| `develop` | 日常集成基线；所有岗位 PR 的目标分支 | 负责人审核通过后合入 |
| `main` | 发布 / 演示基线，不是日常开发目标 | **仅 LiarBar 负责人** |
| `feat/*`、`docs/*` | 各岗功能 / 文档分支 | 本人维护，经 PR 合入 `develop` |

- **禁止**直接往 `main` 推业务或文档；**禁止**把日常 PR 开向 `main`。
- 开分支一律从**最新 `develop`**，不要从 `main` 拉新分支。
- 上文「功能分支」即通用所说的 `feature/*`；本仓库统一用下列前缀。

---

## 2. 日常同步

每天开工先对齐 `develop`，避免各岗文档互相分叉：

```bash
git fetch origin
git checkout develop
git pull origin develop
```

再回到自己的分支，用 rebase 或 merge 接入最新 `develop`：

```bash
git checkout feat/design-your-topic   # 换成自己的分支名
git fetch origin
git rebase origin/develop             # 或：git merge origin/develop
```

文档阶段也可以直接 `git pull origin develop` 更新本地 `develop`，再开新分支或把已有分支跟上去。有冲突先本地解决，不要把未同步的旧基线拿去提 PR。

---

## 3. 分支前缀

| 前缀 | 岗位 | 示例 |
|------|------|------|
| `feat/design-*` | 策划（玩法 / GDD / 数值 / 互动深化） | `feat/design-producer-lock-v02` |
| `feat/art-*` | 美术（风格、皮肤、资源说明） | `feat/art-tavern-skin` |
| `feat/ui-*` | UI（信息架构、界面与交互稿） | `feat/ui-table-ia` |
| `feat/client-*` | 鸿蒙开发（特性映射、日后客户端） | `feat/client-harmony-spec` |
| `feat/test-*` | 测试（用例、试玩记录、验收清单） | `feat/test-mvp-checklist` |
| `docs/*` | 纯文档（目录、工作流、导航，不改玩法） | `docs/contributing-workflow` |

---

## 4. PR 要求

- **目标分支必须是 `develop`**，不要开向 `main`。
- **标题前缀**：`docs:` / `design:` / `feat:`（按改动性质选一个）。
- **描述必须写清**：对齐 [审核意见 · 已拍板决议](docs/审核意见.md) 的哪一条（或哪几条）v0.2 决议；改了哪些文件、给下游什么规格。
- **禁止**改 GDD / 数值 / PRD 已锁规则（出牌权、质疑范围、手牌耗尽、MVP 只人机+本地、不做清单等），除非 **LiarBar 负责人明确授权**。
- 文档阶段不要夹带工程业务代码。工程开工以 03～06 本岗 spec 补齐且审核合格为前提，见工作流文档。

审核人：**LiarBar 负责人**。合入 `main` **仅负责人**操作。

**打回规则**：不合格须由负责人写清具体修改意见并打回；作者改完后重新审核，通过才能合入 `develop`。禁止走过场合入。

---

## 5. 相关入口

- [制作人工作流与验收](docs/00-立项/02-制作人工作流与验收.md)
- [文档中心](docs/README.md)
- [审核意见与 v0.2 决议](docs/审核意见.md)
- [项目一页纸](docs/00-立项/01-项目一页纸.md)

---

*维护人：LiarBar 负责人 · 与工作流文档同步 · 2026-09-06*
