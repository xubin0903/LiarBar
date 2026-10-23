# LLM 云端代理 · 验收勾选清单

> ## 合入≠终验 · 未 Rebuild 勿勾 · **未绿勿勾** · **写勾选 only · 不发明玩法**
>
> **本表勾选纸（LLM 云端代理 · v0.1.0）**：对齐真源 [人机对局AI-LLM云端代理](../02-游戏设计/人机对局AI-LLM云端代理.md) **v0.1**（[#340](https://github.com/xubin0903/LiarBar/pull/340) 已合 develop@`94f7430c`；锁 head `063991f4`；父 `8777df13`）。  
> **客户端接线**：[#339](https://github.com/xubin0903/LiarBar/pull/339) squash 已合 develop@`8777df13`（`LlmDecisionClient` / `LlmApiConfig` / `MatchDirector`）。  
> **§5 六条 + 软 nit**：本表 **P-01～P-06** ≡ schema §5；**P-07** `timeout_default`、**P-08** `parse_fail` 为收口补条。  
> **鉴权 = 登录 Bearer**；**禁**直连 `api.deepseek.com`；本机 Key **不闸** decide（与 [DeepSeek-Key设置页勾选](./DeepSeek-Key设置页验收勾选清单.md) K-02「空 Key→skip」**解耦**：decide 路径以本表为准）。  
> **合入本表 ≠ 客户端过关。** 未 Rebuild、无登录态 / 无网夹具未造齐，一律不得勾「本批过关」。

| 项 | 内容 |
|----|------|
| 版本 | **v0.1.0 · P-01～P-10**（基线 develop@`94f7430c` · #340；客户端 #339@`8777df13`；失败看 hilog tag / 行为；**合入≠终验 · 未 Rebuild 勿勾**） |
| 读者 | **用户本机终验** / 测试岗 / 鸿蒙开发 / 负责人 |
| 范围 | 只验：云端 `decide`/`report` 主路径、Bearer、15s、六 `source`、`match_id` 可空、Key 解耦、report 尽力不挡局、预取只读缓存；string **373**；零新玩法 |
| 对齐 | [人机对局AI-LLM云端代理](../02-游戏设计/人机对局AI-LLM云端代理.md) **v0.1** §0 硬锁 · §1 path · §2 source · §3 Key 解耦 · §5 勾选 · [人机对局AI-LLM决策](../02-游戏设计/人机对局AI-LLM决策.md) **v0.1.2** §0.3/§0.5 · [登录与本地令牌](../02-游戏设计/登录与本地令牌.md) Bearer · [LLM 决策勾选](./人机对局AI-LLM决策验收勾选清单.md) L 表不改写（传输层改以本表为准） |
| 不做 | 改写 L-01～L-10 信封/intent 窗细则；改写 K-01～K-12 UI 挂点；真 Key/Bearer 进仓或 hilog；发明玩法；把合入当终验；未 Rebuild / 未绿勾过关 |

---

## 0. 硬锁（必须镜像 · 抄自云端代理 schema §0）

| # | 锁 | 本表怎么验 |
|---|-----|------------|
| 1 | **禁直连 DeepSeek**；客户端不得打 `api.deepseek.com`、不得把本机 Key 放进 Authorization | **P-01** · **P-09** |
| 2 | 鉴权同登录：`Authorization: Bearer <auth_token>`；无 token → 不发 HTTP，`source=no_ready` | **P-01** · **P-02** |
| 3 | 基址同机 `http://101.33.196.35:18080`；path `/api/v1/llm/decide` · `/api/v1/llm/report` | **P-01** · **P-09** |
| 4 | 超时 **15000** ms；非 2xx/空体/超时/网错 → `http_error`（或窗到点 `timeout_default`）fail-soft | **P-03** · **P-07** |
| 5 | `source` 六枚举写死：`cloud_llm` \| `local_policy` \| `timeout_default` \| `parse_fail` \| `http_error` \| `no_ready` | **P-01～P-08** · **P-09** |
| 6 | `match_id` **可空**（`""`）；不得因空串单独导致 decide 失败 | **P-04** |
| 7 | 本机 Key **不闸** decide；未配置 Key 不得当云端 decide 失败因 | **P-05** |
| 8 | report fire-and-forget；失败不回滚已应用动作 | **P-06** |
| 9 | `string.json` **373**；决策信封仍认决策文 §2；Table:1913–1975 硬锁未漂 | **P-09** |

---

## 1. 过关闸（未齐不得勾本批过关）

| 门 | 必须 | 过 |
|----|------|----|
| Rebuild | 现场含 #339 云端 decide/report（`LlmDecisionClient` + `LlmApiConfig` + `MatchDirector` arm/try） | [ ] **未落地勿勾** |
| 真机前置 | 本机在线；已登录有 token；能打到 `:18080`；能开 hilog | [ ] |
| 有 token 云端成功 | **P-01** | [ ] **未绿勿勾** |
| 无 token no_ready | **P-02** | [ ] **未绿勿勾** |
| 断网/非 2xx | **P-03** | [ ] **未绿勿勾** |
| match_id 空串 | P-04 | [ ] |
| Key 解耦 | **P-05** | [ ] **未绿勿勾** |
| report 不挡局 | P-06 | [ ] |
| timeout_default | P-07 | [ ] |
| parse_fail | P-08 | [ ] |
| 硬锁/键数/静态 | P-09 | [ ] |
| 本批过关 | 上列 ∧ **P-01～P-10** 现场过且**已绿** | [ ] **未 Rebuild / 未绿勿勾** |

> **合入≠终验。** 文档合入或本表 PR 绿 **≠** 上表可勾；须本机 Rebuild 后按夹具复跑。

---

## 2. 前置

- [ ] 本机 DevEco 已 **Rebuild** 到至少 develop@`94f7430c`（含 #339 客户端 + #340 schema）；**不要热重载冒充**
- [ ] **需本机在线**；真机/模拟器能访问 `http://101.33.196.35:18080`；已能登录拿到 `lb.auth` token
- [ ] 能造：① 已登录 + 网通；② 退出登录 / 清 token；③ 断网或禁 INTERNET / mock 非 2xx；④ 设置页清/不填 DeepSeek Key 但仍登录；⑤ AI 思考窗极短或拖网制造预取未就绪；⑥（可选）mock 坏 `content`/非法信封
- [ ] **看 hilog tag / 行为**（本表不 ADD `string.json`，键数维持 **373**）：
  - `llm_post` → `llm_http` → `llm_apply source=cloud_llm`（成功）
  - `llm_skip_prefetch reason=no_auth_token` / `source=no_ready`
  - `llm_fallback … source=http_error` / `timeout_default` / `parse_fail` / `local_policy`
  - `llm_report ok|fail`（report 失败不得回滚已应用）
  - **无** `api.deepseek.com` 出站
- [ ] **不改写** [人机对局AI-LLM决策验收勾选清单](./人机对局AI-LLM决策验收勾选清单.md) L-01～L-10 的信封/intent 细则；传输/鉴权/source 以本表为准
- [ ] **Key 设置页勾选**仍可独立验 UI；但 **decide 是否发出以本表 P-05 为准**（空 Key + 已登录 → 仍应 `llm_post`）
- [ ] **合入≠终验**；本表合入 **不得**代替现场勾选；**未 Rebuild / 未绿勿勾**

---

## 3. P-01～P-10 勾选表

| ID | 夹具 | 期望 | 看什么 / 算不过 | 绑行 | 过 |
|----|------|------|-----------------|------|----|
| **P-01** | 已登录有 token；网通；AI 到出牌/质疑窗 | hilog：`llm_post`→`llm_http`；成功 `llm_apply source=cloud_llm`；请求打云端 decide；**无** `api.deepseek.com` | **有 token 未见 llm_post** / **成功无 llm_apply** / **出现直连 DS** | 云端代理 §5.1 · `LlmApiConfig.ets:27–30` · `:68–73` · `LlmDecisionClient.ets:351–393` · `:438–449` · `MatchDirector.ets:500/503` | [ ] **未绿勿勾** |
| **P-02** | 未登录或空 `auth_token`；开局/AI 回合 | `llm_skip_prefetch reason=no_auth_token`；`source=no_ready`；**不发** decide HTTP；局继续走 Policy | **无 token 仍 POST decide** / **局卡死** | §5.2 · `LlmDecisionClient.ets:106–112` · `:138–144` · `:351–355` | [ ] **未绿勿勾** |
| **P-03** | 人为断网 / 禁 INTERNET / 服务端非 2xx | `source=http_error` 回落 Policy；不崩、不挡局；可有 `llm_http`/`llm_fallback` | **断网崩退** / **卡死等待** / **未回落 Policy** | §5.3 · `:401–425` · `MatchDirector.ets:571–584` | [ ] **未绿勿勾** |
| **P-04** | decide 体 `match_id=""`（或未起局 id 的预取默认空串） | 客户端照发；**不得**因空串单独失败（服务端按缺省；客户端无「空 match_id 拒发」闸） | **空 match_id 客户端拒发** / **仅因空串 4xx 且无回落说明** | §5.4 · `armPrefetch*:98/130` · body `:371` · `currentMatchId:329–331` | [ ] |
| **P-05** | 设置页清/不填 Key（`hasApiKey=false`）；**仍已登录** | decide **仍可发**（`llm_post`）；**不以**「未配置 Key」为失败因 | **空 Key 挡云端 decide** / **要求填 Key 才出网** | §5.5 · §3 · `LlmApiConfig.ets:46–48`（仅设置态）· decide 路径零 `hasApiKey()` | [ ] **未绿勿勾** |
| **P-06** | 云端已 `llm_apply`；随后 report 失败（断网/非 2xx） | 已应用出牌/质疑**不回滚**；hilog 可有 `llm_report fail`；局继续 | **report 失败回滚动作** / **挡下一手** | §5.6 · `fireReport:462–472` · `postReport:495–528` | [ ] |
| **P-07** | 思考窗到点时预取未就绪（`playReady`/`chalReady` 仍 false） | `tryDecide*` → `emitFallback(…, timeout_default)` → null→Policy；不卡 | **窗到点同步死等 HTTP** / **无 timeout_default 回落** | §2 `timeout_default` · `LlmDecisionClient.ets:162–175` · `MatchDirector.ets:571–584` | [ ] |
| **P-08** | 云端 2xx 但 `content` 空/非法 / 决策信封非法或越权 | `source=parse_fail`（或通了不可用→后续 `local_policy`）；整包丢弃→Policy；局继续 | **坏包仍 llm_apply** / **越权字段进引擎** | §2 `parse_fail`/`local_policy` · `:412–416` · `:201–205` · `:217–221` · tryDecide `:172–174` | [ ] |
| **P-09** | 静态：path/超时/source 类型；string 键数；无 DS URL；Table 硬锁 | `CLOUD_BASE`+`DECIDE_PATH`/`REPORT_PATH`；`DECIDE_TIMEOUT_MS=15000`；六 source 字面量；string **373**；源码无 `api.deepseek.com` 出站 URL；Table:1913–1975 未漂 | 硬锁漂 / 键数变 / 仍直连 DS | `LlmApiConfig.ets:27–30` · `LlmDecisionClient.ets:29–31` · string · Table | [ ] |
| **P-10** | 真机前置勾齐 + P-01～P-09 已绿 | 本批过关可勾 | — | 前置 | [ ] **未 Rebuild / 未绿勿勾** |

### 3.1 实现锚点（develop@`94f7430c` / 客户端 #339 · 供鸿蒙/负责人核）

| 文件:行 | 看什么 |
|---------|--------|
| `LlmApiConfig.ets:27–30` | `CLOUD_BASE` · `DECIDE_PATH` · `REPORT_PATH` · `DECIDE_TIMEOUT_MS=15000` |
| `LlmApiConfig.ets:68–73` | `getDecideUrl` / `getReportUrl` = 基址+path |
| `LlmApiConfig.ets:46–48` | `hasApiKey` **仅**设置页态；decide **不**调用 |
| `LlmDecisionClient.ets:29–31` | 六 `source` 类型字面量 |
| `LlmDecisionClient.ets:98` / `:130` | `armPrefetch*(…, matchId='')` 可空默认 |
| `LlmDecisionClient.ets:106–112` / `:138–144` | 空 token → `llm_skip_prefetch` / `no_ready` |
| `LlmDecisionClient.ets:162–175` | `tryDecide*`：未就绪 `timeout_default`；缓存空→`local_policy` 或保留 lastSource |
| `LlmDecisionClient.ets:329–331` | `currentMatchId()` ← `lastMatchId` |
| `LlmDecisionClient.ets:351–393` | Bearer POST decide；`timeout_ms`/connect/read=15000；`match_id` body |
| `LlmDecisionClient.ets:401–425` | 非 2xx / 空体 / 网错 → `http_error` |
| `LlmDecisionClient.ets:412–416` · `:201–221` | 无 content / 解析失败 → `parse_fail` |
| `LlmDecisionClient.ets:438–449` | `llm_apply source=cloud_llm` + `fireReport(true)` |
| `LlmDecisionClient.ets:462–472` · `:495–528` | report fire-and-forget；无 token 跳过；失败只日志 |
| `MatchDirector.ets:500` / `:503` | `armPrefetchChallenge` / `armPrefetchPlay` 传 `snap.matchId` |
| `MatchDirector.ets:571–584` | `tryDecide*` null → 本地 Policy |
| `人机对局AI-LLM云端代理.md` §0/§1/§2/§5 | 契约真源 |
| `string.json` | **373**；本表不 ADD |
| `Table.ets:1913–1975` | 硬锁未漂（本票零 Table） |

---

## 4. 不做 / 冻结

- 不重开质疑机制；不调 Soft 连续参数；不启 L1/C1/D1。
- 不改写 L-01～L-10 的 D4/D5/intent / 越权键细则（仍认决策勾选 + 决策文 §2）。
- 不把本机 Key UI 下线当本表范围（另票）；本表只锁 **Key 不闸 decide**。
- 不要求失败短句键已进 `string.json`；以 hilog tag + 回落行为为准。
- 不往 Aron 本机推；终验需本机 Rebuild。

---

**合入≠终验 · 未 Rebuild 勿勾。**
