# 人机对局 AI · LLM 决策验收勾选清单

> ## 合入≠终验 · 未 Rebuild 勿勾 · **未绿勿勾** · **写勾选 only · 不发明玩法**
>
> **本表勾选纸（LLM 决策通道 · v0.1.0）**：对齐真源 [人机对局AI-LLM决策](../02-游戏设计/人机对局AI-LLM决策.md) **v0.1**（[#322](https://github.com/xubin0903/LiarBar/pull/322) 已合 develop@`06be2fe`）。  
> **不改写**本地 Policy 纸 [人机对局AI验收勾选清单](./人机对局AI验收勾选清单.md) **F-01～F-10**；本表只验 LLM 接线 + fail-soft 回落。  
> **允许**：出牌 / 质疑\|相信（D1–D5）。**禁止**：LLM 判真假、点输家、改熄烛、改胜负、改荷官 JUDGE/PENALTY（`人机对局AI-LLM决策:15-17`）。  
> **质疑规则语义仍冻**；Soft 连续参数修 / L1/C1/D1 **仍暂停**——本表不扩 scope。  
> **合入本表 ≠ 客户端过关。** 未 Rebuild、无 Key、无网条件未造齐，一律不得勾「本批过关」。

| 项 | 内容 |
|----|------|
| 版本 | **v0.1.0 · L-01～L-10**（基线 develop@`06be2fe` · #322；失败短句抄 §3；**合入≠终验 · 未 Rebuild 勿勾**） |
| 读者 | **用户本机终验** / 测试岗 / 鸿蒙开发 / 负责人 |
| 范围 | 只验：有网合法决策、断网/超时/HTTP/坏 JSON/越权/非法下标 → 本地 Policy、D4/D5/D2·D3 intent 窗、`armPrefetch`+`tryLlmThenPolicy*` 只读缓存不同步死等、Table 硬锁未漂、Judge 未动、string **341** |
| 对齐 | [人机对局AI-LLM决策](../02-游戏设计/人机对局AI-LLM决策.md) **v0.1** §0 硬锁 · §2 schema · §3 短句 · `MatchDirector.ets:500/:503/:570-586` · `LlmDecisionClient.ets` · `string.json` **341**（§3 键 **未进** string.json，以 hilog tag / 行为为准） |
| 不做 | 改写 F-01～F-10；改 doubt\|believe 入口语义；扩 Soft 参数票；发明新玩法；把合入当终验；未 Rebuild / 未绿勾过关 |

---

## 0. 硬锁（必须镜像 · 抄自 LLM 决策）

| # | 锁 | 本表怎么验 |
|---|-----|------------|
| 1 | 只允许 play / challenge；**禁** JUDGE / 胜负 / 熄烛 | **L-01** · **L-05** → **LLM 越权未丢弃** |
| 2 | 失败 fail-soft → 现有 `PlayPolicy` / `ChallengePolicy`，不阻塞局 | **L-02～L-06** |
| 3 | D4 仅 `DOUBT`；D5 `DOUBT\|SKIP`；D2/D3 拒 `SKIP` | **L-07**（`人机对局AI-LLM决策:69`） |
| 4 | 越权键 `verdict`/`loser`/`trueRanks`/`judge`/`penalty`/`winner` → 整包丢弃 | **L-05**（`:70` · `:83`） |
| 5 | `Table.ets:1913-1975` 硬锁未漂；Judge / 质疑入口未动 | **L-09** |
| 6 | `string.json` **341**；§3 键未 ADD | **L-09** · 前置 |

---

## 1. 过关闸（未齐不得勾本批过关）

| 门 | 必须 | 过 |
|----|------|----|
| Rebuild | 现场包含 #322 LLM 接线（`LlmDecisionClient` + `MatchDirector` tryLlm*）；**未 Rebuild 不得勾本行** | [ ] **未落地勿勾** |
| 真机前置 | 本机在线 + `entry/.../rawfile/config/llm_secrets.json`（**.gitignore，不进仓**） | [ ] |
| 有网合法 | L-01 | [ ] **未绿勿勾** |
| 断网/超时 | L-02 | [ ] **未绿勿勾** |
| HTTP 非 2xx | L-03 | [ ] |
| 坏 JSON | L-04 | [ ] |
| 越权丢弃 | L-05 | [ ] |
| 非法下标 | L-06 | [ ] |
| D4/D5/D2·D3 | L-07 | [ ] |
| 预取只读缓存 | L-08 | [ ] |
| 硬锁/键数 | L-09 | [ ] |
| 本批过关 | 上列 ∧ **L-01～L-10** 现场过且**已绿** | [ ] **未 Rebuild / 未绿勿勾** |

> **合入≠终验。** 文档合入或 PR 绿 **≠** 上表可勾；须本机 Rebuild 后按夹具复跑。

---

## 2. 前置

- [ ] 本机 DevEco 已 **Rebuild** 到 develop@`06be2fe`（含 #322）；**不要热重载冒充**
- [ ] **需本机在线**；本地已放 `llm_secrets.json`（路径见 `.gitignore`；**永不提交**）
- [ ] 能造：① 有 Key + 网通；② 断网 / 禁 INTERNET / 人为拖超时；③ mock HTTP 非 2xx；④ 注入坏 JSON / 缺 `schemaVersion`；⑤ 注入越权键包；⑥ 注入 OOB/dup `cardIndexes`；⑦ D4 `forceChallenge2` / D5 / D2·D3 窗
- [ ] **失败短句以 §3 为准**（**键未进 `string.json`，341 不变**）：看 hilog tag / 行为，不要等 UI 文案键
  - `llm_timeout` / `llm_timeout_or_net` → **LLM 超时未回落**（`人机对局AI-LLM决策:80`）
  - `llm_http` → **HTTP 失败未回落**（`:81`）
  - `llm_bad_json` → **坏 JSON 未回落**（`:82`）
  - `llm_out_of_scope` → **LLM 越权未丢弃**（`:83`）
  - `llm_illegal_play` / `llm_illegal` → **越界下标被执行** / intent 非法（`:84` · `:69`）
- [ ] **规则语义冻**：入口仍 **质疑\|相信**；Judge / 揭牌 / 熄烛 **不**因本表改口径
- [ ] **合入≠终验**；本表合入 **不得**代替现场勾选；**未 Rebuild / 未绿勿勾**

---

## 3. L-01～L-10 勾选表

| ID | 夹具 | 期望 | 失败短句（§3） | 绑行 | 过 |
|----|------|------|----------------|------|----|
| **L-01** | 有 Key + 网通；AI 到出牌/质疑窗 | LLM 可出牌或 `DOUBT\|BELIEVE`（D5 可 SKIP）；**无** Judge/胜负/熄烛回包进引擎 | （有网路径；越权见 L-05） | `人机对局AI-LLM决策:15-17` | [ ] **未绿勿勾** |
| **L-02** | 断网或拖过思考窗超时 | → 本地 Policy；牌局不卡；AI 仍出牌/质疑 | **LLM 超时未回落** | `:80` · `:86` | [ ] **未绿勿勾** |
| **L-03** | HTTP 非 2xx（mock / 错 URL） | → Policy；局继续 | **HTTP 失败未回落** | `:81` | [ ] |
| **L-04** | 非法 JSON / 缺 `schemaVersion===1` / kind 不符 | → Policy；局继续 | **坏 JSON 未回落** | `:82` · `:52-72` | [ ] |
| **L-05** | 回包含 `verdict`/`loser`/`trueRanks`/`judge`/`penalty`/`winner` 任一 | **整包丢弃** → Policy；引擎无 LLM 裁定 | **LLM 越权未丢弃** | `:83` · `:70` | [ ] |
| **L-06** | `cardIndexes` OOB / dup / count 不符 | → Policy 出牌；越界下标**不被执行** | **越界下标被执行** | `:84` | [ ] |
| **L-07** | D4 `forceChallenge2`；D5；D2/D3 注 SKIP | D4 **仅 DOUBT**；D5 **DOUBT\|SKIP**；D2/D3 给 SKIP → null→Policy | intent 非法 / 未回落 | `:69` | [ ] |
| **L-08** | 读 `MatchDirector` 主路径 | `armPrefetch*` 在思考窗异步预取；`tryLlmThenPolicy*` **只读缓存**，不同步死等 HTTP；null→Policy | 主路径卡死 / 同步等网 | `MatchDirector.ets:500` · `:503` · `:570-586` | [ ] |
| **L-09** | 静态：`Table.ets` 不在 #322 后 diff；硬锁段 sha；`string.json` 键数 | 硬锁 `:1913-1975` 未漂；Judge/质疑入口未动；键数 **341** | 硬锁漂 / 键数变 | Table · string | [ ] |
| **L-10** | 真机前置勾齐 + L-01～L-09 已绿 | 本批过关可勾 | — | 前置 | [ ] **未 Rebuild / 未绿勿勾** |

### 3.1 实现锚点（develop@`06be2fe` · 供鸿蒙/负责人核）

| 文件:行 | 看什么 |
|---------|--------|
| `MatchDirector.ets:500` | `armPrefetchChallenge` |
| `MatchDirector.ets:503` | `armPrefetchPlay` |
| `MatchDirector.ets:570-575` | `tryLlmThenPolicyChallenge`：null→`ChallengePolicy` |
| `MatchDirector.ets:581-586` | `tryLlmThenPolicyPlay`：null→`PlayPolicy` |
| `LlmDecisionClient.ets` | tag：`llm_timeout_or_net` / `llm_http` / `llm_bad_json` / `llm_out_of_scope` / `llm_illegal_play`；`parsePlay`/`parseChallenge` D4/D5/D2·D3 |
| `Table.ets:1913-1975` | 硬锁未漂（本票零改） |
| `string.json` | **341**；§3 建议键未 ADD |

---

## 4. 不做 / 冻结

- 不重开质疑机制；不调 Soft 连续参数；不启 L1/C1/D1。
- 不把本表当 F-01～F-10 的替代；本地 Policy 纸仍独立勾。
- 不要求 §3 键已进 `string.json`；以 hilog tag + 回落行为为准。

---

**合入≠终验 · 未 Rebuild 勿勾。**
