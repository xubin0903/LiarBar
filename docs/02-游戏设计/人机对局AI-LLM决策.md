# 人机对局 AI · LLM 决策（DeepSeek）v0.1

对齐负责人 2026-10-23 裁定。读者：鸿蒙看 §2 schema；测试看 §3 短句；负责人看 §0 禁 JUDGE。

| 项 | 内容 |
|----|------|
| 版本 | **v0.1** 会签草案 · **合入 ≠ 终验** |
| 路径 | `docs/02-游戏设计/人机对局AI-LLM决策.md` |
| 对齐 | [人机对局AI](./人机对局AI.md) §2 信息集 / §3 决策点 D1–D5 · [核心算法](./人机对局AI-核心算法.md) 本地 Policy |
| 本 PR | **仅本文**（目录索引一行）。零 `.ets` / `string.json` / `media/`。键数维持 **341**；§3 键名供接线 PR **ADD**。 |
| 范围 | 模型只填「出牌 / 质疑\|相信」。揭牌真假、胜负、荷官 JUDGE / PENALTY 仍由引擎 Judge。 |

## 0. 裁定（硬锁）

1. **允许** NPC：D1 出牌；D2/D3 `DOUBT|BELIEVE`；D4 `forceChallenge2==true` 必须 `DOUBT`；D5 `DOUBT|SKIP`。
2. **禁止** LLM 判真假、点输家、改熄烛、改胜负、改荷官 `JUDGE` / `PENALTY`。引擎 Judge 不动。
3. 通道：信息集投影 + 近几手短日志（纯文本）→ `@ohos.net.http` POST DeepSeek → 解析 JSON → 现有 `AiSeatController.decidePlay` / `decideChallenge` 与 `MatchDirector` 入口。需 `ohos.permission.INTERNET`。失败 fail-soft，不阻塞局。
4. 不扩玩法、不动质疑入口状态机 UI、不碰 Table 硬锁段。本地 `PlayPolicy` / `ChallengePolicy` 保留作超时/断网回落。Soft 上半窗连续参数修已暂停；LLM 上线后 Soft 频率改由提示词 + 验收观察，本票不调 `ChallengePolicy` 连续参数。

## 1. 提示词

### 1.1 system（固定）

```text
你是谎馆牌友 NPC，只替本座做合法动作。只输出一个 JSON 对象，不要 Markdown，不要解释。
只能 kind=play（出牌）或 kind=challenge（质疑/相信/跳过）。
不得输出真假判定、输家、熄烛、胜负，不得输出 JUDGE、PENALTY、verdict、loser、trueRanks、judge。
不得偷看或索要他座手牌与未发牌。宣称 rank 以 user 中的 claim 为准，不得改写。
forceChallenge2 为 true 时，challenge.intent 必须是 DOUBT。
你只填决策字段；揭牌与惩罚由引擎完成。
params 只作性格口吻，不是透视。
```

### 1.2 user（每拍纯文本；禁止注入他座 `handRanks` / undealt）

```text
decision: play|challenge
gate: D1|D2|D3|D4|D5
self: seatId={n} handRanks=[{本座点数，与 self.cards 同序}] handCount={n} lives={n}
claim: rank=A|K|Q
lastPlay: seatId={n} count={1|2|3} style=SOFT|SLAM|HESITATE namedSeatId={n|-}
seats: 每座一行 seatId handCount lives alive（无 handRanks）
memory: revealedRankCounts publicPlayTotal
phase={phase} aliveCount={n} forceChallenge2={true|false} turnWindow={窗口}
params: personaId 与口吻词（aggression/caution/bluffTendency/…），勿当偷看
log:
- 近 6 条公开短日志，一行一条（出牌张数/风格/点名；已揭才写真面与谁熄烛）
```

`handRanks` 只属于 `self`。`history.reveals` 已揭内容可进短日志（全员公开）。未揭真面不得出现。

## 2. 回包 JSON schema（严格，只此信封）

```json
{
  "schemaVersion": 1,
  "kind": "play",
  "play": { "cardIndexes": [0], "count": 1, "style": "SOFT", "namedSeatId": null },
  "challenge": { "intent": "DOUBT" },
  "reason": ""
}
```

`kind`：`"play"` | `"challenge"`。`style`：`"SOFT"` | `"SLAM"` | `"HESITATE"`。`intent`：`"DOUBT"` | `"BELIEVE"` | `"SKIP"`。`reason`：短中文，可空，仅调试。`namedSeatId`：座号或 `null`（接线映射引擎无点名 `-1`）。

| 条件 | 合法包 |
|------|--------|
| `kind=play` | 必须有 `play`；`challenge` 忽略。`cardIndexes` 落在本座手牌下标、互异；`count`∈1..`limits.maxPlay`（与引擎 `MAX_PLAY` 一致，通常 ≤3）且等于下标个数。宣称跟随 InfoSet.`claim`，回包不得另给 rank。接线把下标换成 `PlayAction.cardIds`。 |
| `kind=challenge` | 必须有 `challenge.intent`。D4 仅 `DOUBT`；D5 仅 `DOUBT\|SKIP`；D2/D3 仅 `DOUBT\|BELIEVE`。 |
| 越权 | 出现 `verdict` / `loser` / `trueRanks` / `judge` / `penalty` / `winner` 任一 → 非法，整包丢弃。 |

解析失败、缺字段、越界、越权 → §3 fail-soft。合法包才进既有入口；引擎仍校验出牌合法集。

## 3. 失败短句（看什么 / 算不过）

本 PR 不改 `string.json`（当前 341 键）。短句给测试勾选与鸿蒙日志；键名接线 PR 再 ADD。

| 场景 | 短句 | 建议键 |
|------|------|--------|
| 无网/超时 | 看什么：AI 秒回本地；算不过：LLM 超时未回落 | `lb_str_ai_llm_timeout` |
| HTTP 非 2xx | 看什么：AI 仍出牌或质疑；算不过：HTTP 失败未回落 | `lb_str_ai_llm_http` |
| 非法 JSON / schema | 看什么：牌局继续；算不过：坏 JSON 未回落 | `lb_str_ai_llm_bad_json` |
| 越权字段（判真假等） | 看什么：整包丢弃后走本地；算不过：LLM 越权未丢弃 | `lb_str_ai_llm_out_of_scope` |
| 非法出牌下标 | 看什么：改走本地出牌；算不过：越界下标被执行 | `lb_str_ai_llm_illegal_play` |

上述任一 → 调用现有 `PlayPolicy.decidePlay` / `ChallengePolicy.decideChallenge`，不阻塞局。等待不超过现有思考窗（出牌 `[1200,3500]` ms、质疑 `[1500,4000]` ms），到点即回落。

合入 ≠ 终验。
