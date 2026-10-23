# 人机对局 AI · LLM 云端代理 schema v0.1

对齐负责人 Aron 2026-10-23 紧急票裁定：**客户端禁直连 DeepSeek**；改 `POST` 云端 `decide` / `report`；Bearer = 登录 token。读者：鸿蒙看 §1–§3（已合 #339）；测试看 §5；运维看 §1.2；负责人看 §0。决策信封 / 提示词仍认 [人机对局AI-LLM决策](./人机对局AI-LLM决策.md) §1–§2。

| 项 | 内容 |
|----|------|
| 版本 | **v0.1** · **合入 ≠ 终验** |
| 路径 | `docs/02-游戏设计/人机对局AI-LLM云端代理.md` |
| 对齐 | [人机对局AI-LLM决策](./人机对局AI-LLM决策.md) v0.1.1 §1–§2 · [登录与本地令牌](./登录与本地令牌.md) §1.2 / §2 `lb.auth` · [战绩云端与本地同步](./战绩云端与本地同步.md) §1.2 同基址 · 客户端 tip `#339`（`LlmDecisionClient` / `LlmApiConfig`） |
| 本 PR | **仅本文** + 目录索引一行 + 决策文 §0 通道/Key 指针。零 `.ets` / `string.json` / `media/` / 21 正文。键数维持 **373**。 |
| 范围 | 云端代理 path / 请求·响应字段 / 超时 / Bearer / `source` 枚举 / 与本机 Key UI 解耦 / fail-soft。**不改**玩法、质疑入口、Table 硬锁段、决策 JSON 信封（仍认决策文 §2）。 |

## 0. 裁定（硬锁）

1. **禁直连 DeepSeek**：客户端 `decide` / `report` **不得**打 `api.deepseek.com`，**不得**把本机 Key 放进 Authorization。云端持 Key；客户端只持登录 Bearer。
2. **鉴权同登录**：`Authorization: Bearer <auth_token>`（`AuthStore.tokenNow()` / `lb.auth`）；无 token → 不发 HTTP，走本地 Policy（`source=no_ready`）。
3. **基址同机**：与登录 / 战绩同 `http://101.33.196.35:18080`。
4. **超时 15s**：`DECIDE_TIMEOUT_MS=15000`（连接/读同值）；到点或非 2xx → fail-soft，不阻塞局。
5. **决策信封不变**：云端回包里的决策 JSON 仍须符合决策文 §2（`kind` / `play` / `challenge`）；越权字段丢弃回落。
6. **report 尽力、不挡局**：`POST /llm/report` fire-and-forget；失败只打日志，不回滚已应用动作。
7. **本机 Key 与 decide 解耦**：设置页 DeepSeek Key 四键 / Preferences `llm_api_key` **可保留 UI**；`hasApiKey` **不闸** decide。验收不得要求「填 Key 才能云端决策」。
8. **零新玩法 / 零 ets（本 PR）**：质疑冻结；不碰 Table:1913–1975 硬锁；文档岗只改本文 + 索引 + 决策文指针。

## 1. 云端 API

### 1.1 基址

| 项 | 值 |
|----|----|
| 基址 | `http://101.33.196.35:18080` |
| 传输 | HTTP（需 `ohos.permission.INTERNET`） |
| 超时 | 连接/读各 **15000** ms |
| 鉴权头 | `Authorization: Bearer <auth_token>`（非空才发） |

| 动作 | 方法 | 路径（已锁 · #339） |
|------|------|---------------------|
| 决策 | `POST` | `/api/v1/llm/decide` |
| 上报 | `POST` | `/api/v1/llm/report` |

### 1.2 `POST /api/v1/llm/decide`

**请求体**（JSON；字段名写死）：

```json
{
  "request_id": "llm_play_1730000000000_1",
  "kind": "play",
  "seat_id": 1,
  "match_id": "m-optional",
  "user_text": "decision: play\ngate: D1\n…",
  "timeout_ms": 15000
}
```

| 字段 | 类型 | 要求 |
|------|------|------|
| `request_id` | string | 非空；客户端生成，同拍 report 复用 |
| `kind` | string | `"play"` \| `"challenge"` |
| `seat_id` | number | 本座座号 |
| `match_id` | string | **可空**：无对局 id 时发 `""`；服务端按缺省处理（不得因空串 4xx） |
| `user_text` | string | 信息集投影纯文本（决策文 §1.2）；禁他座手牌 / undealt |
| `timeout_ms` | number | 客户端声明的等待上限，常为 `15000` |

**成功响应**（客户端认 `content`；兼容 `data.content`）：

```json
{
  "content": "{\"schemaVersion\":1,\"kind\":\"play\",\"play\":{\"cardIndexes\":[0],\"count\":1,\"style\":\"SOFT\",\"namedSeatId\":null},\"challenge\":{\"intent\":\"DOUBT\"},\"reason\":\"\"}"
}
```

| 字段 | 要求 |
|------|------|
| `content` | 非空 string；内容为决策文 §2 信封的 **JSON 文本**（再经客户端 `parsePlay` / `parseChallenge`） |
| `data.content` | 可选嵌套同义；二者皆无或空 → `parse_fail` |

HTTP 非 2xx / 空体 / 超时 / 网络错 → 客户端 `source=http_error`（或超时窗未就绪 `timeout_default`），回落本地 Policy。

**禁止**：响应或日志出现 DeepSeek Key、Bearer 明文。

### 1.3 `POST /api/v1/llm/report`

**请求体**（JSON；无 `latency_ms` / `http_code`）：

```json
{
  "request_id": "llm_play_1730000000000_1",
  "kind": "play",
  "applied": true,
  "source": "cloud_llm",
  "action_summary": "PLAY count=1 style=SOFT"
}
```

| 字段 | 类型 | 要求 |
|------|------|------|
| `request_id` | string | 与对应 decide 同 id；缺省时客户端可新发 |
| `kind` | string | `"play"` \| `"challenge"` |
| `applied` | boolean | `true` = 采用云端决策；`false` = 回落未用云端动作 |
| `source` | string | 见 §2 六枚举 |
| `action_summary` | string | 短摘要；回落时常 `FALLBACK source=…` |

客户端 fire-and-forget；无 token 则跳过上报。服务端应 2xx 吞掉；非 2xx 不挡局。

## 2. `source` 枚举（写死）

| `source` | 含义（客户端） |
|----------|----------------|
| `cloud_llm` | 云端 `content` 解析合法并已 `llm_apply` |
| `local_policy` | 请求曾通但未得到可用云端动作，改走本地 Policy |
| `timeout_default` | 思考窗到点预取未就绪 |
| `parse_fail` | 根 JSON / `content` / 决策信封非法或越权 |
| `http_error` | 非 2xx、空体、超时、网络错 |
| `no_ready` | 无登录 token（或未到可发态），未发 decide |

## 3. 本机 Key UI（解耦）

| 项 | 口径 |
|----|------|
| 设置页四键 | `lb_str_set_llm_key` / `_ph` / `_saved` / `_save_fail`（21 §4.2）可保留 |
| Preferences | `lb.settings` / `llm_api_key` 仍可读写；**不得**写入仓 / hilog 明文 |
| decide 闸 | **只认**登录 Bearer；**不认** `hasApiKey` |
| 验收 | 「未配置 Key」不得当作云端 decide 失败原因 |

后续若负责人裁定下线 Key UI，另票改 21 / string；本页不删键。

## 4. 与决策文 / 客户端边界

| 层 | 真源 |
|----|------|
| 提示词 · 决策 JSON 信封 · 越权禁字段 | [人机对局AI-LLM决策](./人机对局AI-LLM决策.md) §1–§2 |
| 传输 path · Bearer · 超时 · report · source | **本文** |
| 接线实现 | `#339` 合入 develop：`LlmApiConfig` `CLOUD_BASE`/`DECIDE_PATH`/`REPORT_PATH`；`LlmDecisionClient` decide/report |
| 硬锁 | `Table.ets:1913–1975` 段 sha 不变（本票零 Table） |

## 5. 测试勾选要点（供勾选 PR 收口）

1. 已登录有 token → hilog 见 `llm_post` → `llm_http`；成功见 `llm_apply source=cloud_llm`；**无** `api.deepseek.com`。
2. 未登录 / 空 token → `llm_skip_prefetch` / `no_ready`，局继续走 Policy。
3. 人为断网或服务端非 2xx → `http_error` 回落，不崩、不挡局。
4. `match_id=""` 不得单独导致 decide 失败（服务端按缺省）。
5. 清/不填设置页 Key → 只要已登录，decide 仍可发（与 Key 解耦）。
6. report 失败不影响已应用出牌/质疑。

失败短句建议键仍认决策文 §3（本 PR 不 ADD `string.json`）。

合入 ≠ 终验。

## 版本

| 版本 | 日期 | 说明 |
|------|------|------|
| **v0.1** | 2026-10-23 | 紧急票后补：云端 decide/report 契约；禁直连 DS；Key 与 decide 解耦；绑 #339。 |
