# 人机对局 AI · 核心算法（决策真源）

| 项 | 内容 |
|----|------|
| 文档版本 | **v0.2.0** |
| 状态 | **决策真源** · 合入 ≠ 终验 · 旧 Soft/Slam 门作回归夹具，**Timid Slam≈0 窗已被本版 SUPERSEDED** |
| 主笔 | 策划（`feat/design`） |
| 路径 | `docs/02-游戏设计/人机对局AI-核心算法.md` |
| 读者 | @LiarBar负责人 · @LiarBar鸿蒙开发 · @LiarBar测试 |
| 对齐 | [对局-状态机](./对局-状态机.md) v2.0.x（规则真源）· [人机对局AI](./人机对局AI.md)（产品/人格/接口总览）· [数值与牌堆配置](./数值与牌堆配置.md) |
| 本 PR | docs + `string.json` 两失败短句 ADD。零 ets / rawfile / media。 |
| 替换目标 | 把「分值→阈值」落到 **可执行公式 + 伪代码**；出牌期望 / 质疑似然 / 思考时延 / 三档质疑窗 全部写死可测。 |

> **一句话**：AI 只吃公开信息 + 本座手牌；人格 **只**调连续参数（β / T / temperature / errorRate / thinkMinMax）；**禁止** `if(seatId)` / `if(persona===KAREN) return DOUBT`；`forceChallenge2` 仍 100% DOUBT（规则锁）。

---

## §0 硬锁（Hard locks）

### 0.1 不得改动的规则

| 锁 | 口径 |
|----|------|
| 无偷看 | 决策函数禁止读他座 `handRanks`、未揭本手真面、洞牌、GodView |
| 入口 | 前台二键 = `DOUBT` \| `BELIEVE`；真/假只在 Reveal 裁定 |
| 三烛 | `lives_default=3`；输家 `PenaltyExtinguish1`；熄尽出局 |
| 宣称 | 本轮 `claim.rank` 不可改；Joker 不可作宣称 |
| `MAX_PLAY` | 出牌张数 ∈ {1,2,3} |
| `forceChallenge2` | 存活=2 强制质疑路径 → **100% DOUBT**（规则锁，**不是**人格） |

### 0.2 人格只调连续参数

人格 / 座号 **不得**出现在决策分支谓词里。允许的旋钮：

| 参数 | 符号 | 用途 |
|------|------|------|
| 似然斜率 | `β` | `L_fake = σ(β · φ)` |
| 质疑阈值 | `T` | `DOUBT iff EV_doubt > T` |
| 温度 | `temperature` | Softmax / 采样熵 |
| 噪声 | `errorRate` | 仅噪声到次优，非主概率源 |
| 思考窗 | `thinkMsMin` / `thinkMsMax` | 表演时延上下界（再被候选数/风险缩放） |

**禁止**（失败 = `lb_str_ai_fake_decision`）：

```text
if (seatId === 3) return DOUBT;
if (persona === "AI_KAREN") return DOUBT;
if (Math.random() < 0.5) return DOUBT;   // 主路径
```

### 0.3 思考时延硬地板

| 决策 | 合法窗 `thinkMs` | 主路径低于地板 |
|------|------------------|----------------|
| 出牌 D1 | `[1200, 3500]` | → `lb_str_ai_instant_think` |
| 质疑 D2 | `[1500, 4000]` | → `lb_str_ai_instant_think` |

缩放：候选数↑ / 风险↑ → 时延↑，但仍夹在上表。详见 §5。

### 0.4 与 v0.1.2 Soft/Slam 关系

| 项 | 口径 |
|----|------|
| Soft×1 / Slam×3 **门** | 保留为 **回归夹具**（弱/强可疑探测） |
| 旧 Timid Slam≈0 / `<20%` 窗 | **SUPERSEDED**；以本版 §4b 三档窗为准 |
| Soft 三人格多数 BELIEVE | **仍有效** |

---

## §1 信息集 `I_t`

### 1.1 允许字段（Allowed）

| 类别 | 字段 | 说明 |
|------|------|------|
| 己方私有 | `self.handRanks[]` | 仅本座 |
| 己方公开 | `self.seatId` · `self.lives` · `self.handCount` | |
| 宣称 | `claim.rank ∈ {A,K,Q}` | |
| 上家出牌公开 | `lastPlay.seatId` · `count∈{1,2,3}` · `style∈{SOFT,SLAM,HESITATE}` · `namedSeatId?` | **无**真面 |
| 池 | `pool.publicBackCount` · `pool.lastHandBackCount` | |
| 各座公开 | `seats[i].{handCount,lives,alive,order}` | |
| 历史 | `history.reveals[]` · `history.challengeOutcomes[]` | 仅已揭 |
| 回合 | `phase` · `canChallenge` · `forceChallenge2` · `aliveCount` · `turnSecondsLeft` | |
| 人格 | `params`（连续参数视图） | |

### 1.2 禁止字段（Forbidden）

| 禁止 | 失败短句 |
|------|----------|
| 他座 `handRanks` / face-down 真面 | `lb_str_ai_peek` |
| 未揭 `lastPlay.trueRanks` | `lb_str_ai_peek` |
| 洞牌 / 未发区 / GodView | `lb_str_ai_peek` |

### 1.3 伪代码 `buildInfoSet`

```pseudo
function buildInfoSet(seat: SeatId) -> InfoSet I:
  auth = MatchEngine.authoritySnapshot()   // 权威态，含禁止字段

  I.self.seatId     = seat
  I.self.handRanks  = auth.hands[seat].ranks          // 仅本座
  I.self.handCount  = auth.hands[seat].count
  I.self.lives      = auth.lives[seat]

  I.claim.rank      = auth.claim.rank
  I.lastPlay        = stripTrueRanks(auth.lastPlay)   // 删 trueRanks
  I.pool            = { publicBackCount, lastHandBackCount }
  I.seats           = map seats -> {handCount, lives, alive, order}  // 无 ranks
  I.history.reveals = auth.history.reveals            // 已揭可公开
  I.history.challengeOutcomes = auth.history.challengeOutcomes
  I.phase           = auth.phase
  I.canChallenge    = auth.canChallenge[seat]
  I.forceChallenge2 = auth.forceChallenge2
  I.aliveCount      = auth.aliveCount
  I.turnSecondsLeft = auth.turnSecondsLeft
  I.params          = PersonaParams.of(seat)          // 连续参数

  assert not containsAny(I, FORBIDDEN_PATHS)
  return freeze(I)
```

`stripTrueRanks` / `FORBIDDEN_PATHS` 单测：注入禁止字段 → assert / 编译失败。

---

## §2 记忆 `M_t`

### 2.1 结构

| 字段 | 类型 | 更新时机 |
|------|------|----------|
| `seen[rank]` | `Map<Rank,int>` | 仅公开 Reveal 后累加揭出点数 |
| `revealedLegal` | `int` | 揭出中「宣称合法 ∪ Joker」张数累计 |
| `liarRate[seat]` | `float` | `fakeReveals[seat] / max(1, challengedPlays[seat])` |
| `outcomes[]` | 环形缓冲 | `{challenger, target, success, style, count}` |

**写死**：`M_t` **只**在公开 Reveal / 公开 ChallengeOutcome 事件上更新；出牌落池未揭 **不**写入真面。

### 2.2 密度公式

牌堆常量（真源）：每宣称 6 张 + Joker 2；总 20。

```text
deckLegal(claim)     = 6 + 2                          // 该宣称 + Joker
selfLegal            = |{r ∈ self.handRanks : r==claim ∨ r==JOKER}|
estRemainLegal       = max(0, deckLegal(claim) - M.revealedLegal - selfLegal)
unseenCards          = totalCards - revealedTotal - self.handCount
                       // totalCards=20；revealedTotal=已揭张数和
density              = estRemainLegal / max(1, unseenCards)
```

`density ∈ [0,1]` 越高 → 场上更「真得多」→ 质疑动机下降。

### 2.3 伪代码 `updateMemory`

```pseudo
function updateMemory(M: Memory, event: PublicEvent) -> Memory:
  match event.kind:
    case REVEAL:
      for r in event.ranks:          // 已公开真面
        M.seen[r] += 1
        if r == event.claim or r == JOKER:
          M.revealedLegal += 1
      if event.verdict == FALSE:
        M.fakeReveals[event.playSeat] += 1
      M.challengedPlays[event.playSeat] += 1
      M.liarRate[event.playSeat] =
        M.fakeReveals[event.playSeat] / max(1, M.challengedPlays[event.playSeat])
      M.outcomes.push({
        challenger: event.challenger,
        target: event.playSeat,
        success: event.verdict == FALSE,
        style: event.style,
        count: event.count
      })
    case CHALLENGE_OUTCOME_PUBLIC:
      // 与 REVEAL 同步时可不重复；若拆事件则只记 outcomes
      M.outcomes.push(event.summary)
    default:
      pass   // PlayLanded 无真面 → 不改 seen/revealedLegal
  return M
```

---

## §3 出牌期望 D1

### 3.1 候选枚举

对手牌做子集枚举，张数 `n ∈ {1..min(3, handCount)}`：

| 类 | 定义 |
|----|------|
| **true** | 全部 `rank==claim ∨ JOKER` |
| **mix** | ≥1 合法且 ≥1 非合法 |
| **pure-bluff** | 全部非合法 |

候选集合 `C = true ∪ mix ∪ pure-bluff`（合法动作集）。

### 3.2 期望

对每个候选 `c`：

```text
P_challenged(c) ≈ σ( α0
                    + α1 · styleSignal(c.style)
                    + α2 · (n/3)
                    + α3 · nextSeatChallengeSens
                    + α4 · (1 - density) )

loseCost_true  = 0                              // 真手被质疑 → 质疑者熄
loseCost_bluff = 1                              // 假手被质疑 → 本座熄（单位：烛）
G_survive      = handPressureWeight · pressure(self)   // 甩牌减压收益
bluffBonus     = bluffTendency · (1 - caution) · n / 3

E_true(c)  = G_survive + countFit(n) - λ_keep · jokerSpent(c)
E_bluff(c) = G_survive + bluffBonus + dumpJunk(c)
             - P_challenged(c) * loseCost_bluff * (0.5 + caution)

E(c) = { E_true(c)  if c ∈ true
       { E_bluff(c) if c ∈ mix ∪ pure-bluff

risk(c) = P_challenged(c) * loseCost(c)
```

`countFit(n) = preferPlayCountWeights[n]`；`dumpJunk`：甩出非 claim 非 Joker → `+0.10`。

**主决策**：`c* = argmax_c E(c)`。

**噪声**：以 `errorRate` 概率改选 **次优** `c**(2nd best)`，禁止改选非法集。

### 3.3 熵地板（Entropy floor）

同 InfoSet 多次采样（关表演随机、仅保留 temperature / 平局破，n≥30）：

```text
H = - Σ_k p_k log2(p_k)     // k 跑在「张数」或「候选签名」上
H ≥ H_floor

H_floor_count = 0.85 bit     // 张数分布不得塌成单点
H_floor_sig   = 1.00 bit     // 候选签名分布
```

若固定张数脚本 / 永远同一组合导致 `H < H_floor` → 失败短句 **`lb_str_ai_fixed_play`（出牌固定脚本）**。

实现钉：`decidePlay` 最终用 temperature Softmax 在 top-K 上采样，**禁止** `return always(count=2)` 类脚本。

### 3.4 伪代码 `decidePlay`

```pseudo
function decidePlay(I: InfoSet, M: Memory, rng) -> PlayDecision:
  assert not peeks(I)
  C = enumerateCandidates(I.self.handRanks, I.claim.rank, maxN=3)
  assert |C| >= 1

  density = calcDensity(I, M)
  scores = []
  for c in C:
    E = expectation(c, I, M, density)     // §3.2
    scores.append((c, E))

  sort desc by E
  (c_best, E1) = scores[0]
  (c_2nd,  E2) = scores[1] if |scores|>1 else (c_best, E1)

  // temperature Softmax over topK to satisfy entropy floor
  topK = scores[0 .. min(5, |scores|)-1]
  logits = [E / max(1e-6, I.params.temperature) for (_, E) in topK]
  probs = softmax(logits)
  c* = sample(topK, probs, rng)

  if rng.uniform() < I.params.errorRate and c_2nd != c*:
    c* = c_2nd     // 仅噪声到次优

  style = sampleStyle(c*, I.params, rng)
  named = sampleNameCall(c*, I, rng)

  thinkMs = computeThinkMs_Play(|C|, risk(c*), I.params)   // §5
  logPlay({candidates: |C|, E1, E2, chosen: signature(c*), thinkMs})
  return PlayDecision(cards=c*.cards, count=c*.n, style, named, thinkMs)
```

---

## §4 质疑似然 D2

### 4.1 特征 `φ(I,M)`

```text
φ = [
  φ_density   = 1 - density,                         // 真牌稀 → 高
  φ_style     = {SOFT:0.00, HESITATE:0.35, SLAM:1.00}[lastPlay.style],
  φ_count     = (lastPlay.count - 1) / 2,            // 1→0, 2→0.5, 3→1
  φ_pressure  = pressure(lastPlay.seat),             // 手牌少/烛少
  φ_history   = M.liarRate[lastPlay.seat],           // 揭假率
  φ_named     = 1 if namedSeatId==self.seatId else 0
]
w · φ = w_d·φ_density + w_s·φ_style + w_c·φ_count
      + w_p·φ_pressure + w_h·φ_history + w_n·φ_named

默认权重（可 JSON 覆盖）：
  w = {d:0.35, s:0.25, c:0.15, p:0.10, h:0.12, n:0.03}
```

### 4.2 似然与 EV

```text
σ(x)     = 1 / (1 + exp(-x))
L_fake   = σ( β · (w·φ) )                 // β 来自人格连续参数
L_true   = 1 - L_fake

G_catch  = 1.0                             // 抓到假 → 上家熄 1
C_wrong  = 1.0 * (0.6 + 0.4·caution)     // 错疑成本（怂货更高）
           + (self.lives==1 ? 0.25 : 0)
           + (aliveCount==2 ? 0.15 : 0)

EV_doubt = L_fake · G_catch - L_true · C_wrong
T        = T(params)                       // 连续阈值，见下

DOUBT  iff  EV_doubt > T
否则 BELIEVE
```

阈值（连续，无座号分支）：

```text
β     = lerp(1.2, 3.2, challengeSensitivity)      // 杠精陡、怂货缓
T0    = lerp(0.18, -0.05, challengeSensitivity)   // 敏感高 → T 低
T     = clamp(T0 + 0.12·caution - 0.08·aggression, -0.20, 0.35)
```

`forceChallenge2 == true` → **直接 DOUBT**，跳过 EV（规则锁）。

噪声：`errorRate` 仅在非强制路径翻转 `DOUBT↔BELIEVE`。

### 4.3 伪代码 `decideChallenge`（必须打 log）

```pseudo
function decideChallenge(I: InfoSet, M: Memory, rng) -> ChallengeDecision:
  assert not peeks(I)

  if I.forceChallenge2:
    logChallenge({L_fake: null, EV: null, T: null, intent: DOUBT, reason: "FORCE2"})
    return DOUBT with thinkMs=computeThinkMs_Challenge(1.0, I.params)

  if not I.canChallenge:
    return BELIEVE_or_SKIP

  φ = features(I, M)                         // §4.1
  β = betaOf(I.params)
  L_fake = sigmoid(β * dot(w, φ))
  L_true = 1 - L_fake
  G_catch, C_wrong = payoffs(I)
  EV = L_fake * G_catch - L_true * C_wrong
  T  = thresholdOf(I.params)

  intent = DOUBT if EV > T else BELIEVE
  if rng.uniform() < I.params.errorRate and not I.forceChallenge2:
    intent = flip(intent)

  thinkMs = computeThinkMs_Challenge(abs(EV - T), I.params)

  // 必须落盘
  logChallenge({
    seatId: I.self.seatId,
    L_fake, EV, T,
    φ, β,
    intent,
    noiseFlipped: ...,
    thinkMs
  })
  return ChallengeDecision(intent, thinkMs)
```

---

## §4b 三档质疑率窗（WRITE DEAD）

> **连续参数调出分布**，不是 `if(persona)`。同 InfoSet 夹具 · `n≥50` · 噪声可关或保留小 `errorRate`。  
> Soft/Slam **门**（弱/强可疑）作回归；**旧 Timid Slam≈0 / `<20%` 已被本表取代**。

### 4b.1 Soft×1（弱可疑 / `style=SOFT` · `w·φ` 低档）

| 人格 | 质疑率窗 | 硬禁 |
|------|----------|------|
| **全体** | **多数 BELIEVE**（`P(BELIEVE) ≥ 0.55`） | Soft 仍塌成「杠精必疑 / 另两必信」 |
| Karen | **10%～35%** | ≈100% 质疑 |
| Shark | **8%～30%** | |
| Timid | **5%～25%** | |

### 4b.2 Mid×2（中性 · `HESITATE` 或中档 `w·φ`）

| 人格 | 质疑率窗 | 硬禁 |
|------|----------|------|
| Karen | **35%～60%** | |
| Shark | **20%～45%** | |
| Timid | **10%～30%** | Timid ≈0 |

### 4b.3 Slam×3（强可疑 / `style=SLAM` 或高档 `w·φ`）

| 人格 | 质疑率窗 | 硬禁 |
|------|----------|------|
| Karen | **≥55%** | 未达窗 / 二值塌缩 |
| Shark | **25%～55%** | |
| Timid | **10%～30%** | **Timid floor ≥10%**；禁塌缩 ≈0（**SUPERSEDE** 旧 `<20%`≈怂货几乎不疑） |

### 4b.4 参数锚点（建议初值，验收以窗为准）

| 人格 | `challengeSensitivity` | `β` 目标 | `T` 目标（Slam 夹具） |
|------|------------------------|----------|----------------------|
| AI_KAREN | 0.72 | ≈ 2.8 | ≈ −0.02 |
| AI_SHARK | 0.42 | ≈ 2.0 | ≈ 0.08 |
| AI_TIMID | 0.28（**上调**自 0.18，为满足 Slam floor≥10%） | ≈ 1.6 | ≈ 0.16 |

> Timid 的 `challengeSensitivity` 从 v0.1.2 的 0.18 **上调到约 0.28**，否则无法同时满足 Soft 多数信与 Slam floor≥10%。只改连续参数，不写人格 if。

### 4b.5 回归夹具对照

| 夹具 | v0.1.2 | v0.2.0 |
|------|--------|--------|
| Soft×1 多数信 | 保留 | 保留 + 分人格窗 §4b.1 |
| Slam Karen | ≥70% | **≥55%**（放宽上沿期望，仍高档） |
| Slam Shark | 30～60% | **25～55%** |
| Slam Timid | **`<20%`（≈允许近 0）** | **10～30%，floor≥10%（SUPERSEDED）** |

---

## §5 思考时延

### 5.1 公式

```text
// 出牌
base_play      = lerp(thinkPlayMin, thinkPlayMax, u)     // u~U(0,1)
candFactor     = clamp( |C| / 12, 0.0, 1.0 )
riskFactor     = clamp( risk(c*) / 1.0, 0.0, 1.0 )
thinkMs_play   = clamp(
                   base_play + 800·candFactor + 600·riskFactor,
                   1200, 3500 )

// 质疑
base_chal      = lerp(thinkChalMin, thinkChalMax, u)
margin         = abs(EV - T)                 // 越接近阈值越纠结
ambigFactor    = clamp(1.0 - margin / 0.35, 0.0, 1.0)
thinkMs_chal   = clamp(
                   base_chal + 900·ambigFactor + 500·φ_style,
                   1500, 4000 )
```

人格默认窗（可覆盖，但 **最终仍夹**到硬地板）：

| | thinkMin | thinkMax |
|--|----------|----------|
| Play | 1200 | 3500 |
| Challenge | 1500 | 4000 |

### 5.2 伪代码

```pseudo
function computeThinkMs_Play(candCount, risk, params, rng) -> int:
  u = rng.uniform()
  base = lerp(params.thinkPlayMin, params.thinkPlayMax, u)
  ms = base + 800*clamp(candCount/12,0,1) + 600*clamp(risk,0,1)
  ms = clamp(ms, 1200, 3500)
  if ms < 1200: fail("lb_str_ai_instant_think")   // 主路径不可达
  return floor(ms)

function computeThinkMs_Challenge(marginAbs, params, rng, styleSignal=0) -> int:
  u = rng.uniform()
  base = lerp(params.thinkChalMin, params.thinkChalMax, u)
  ambig = clamp(1.0 - marginAbs/0.35, 0, 1)
  ms = base + 900*ambig + 500*styleSignal
  ms = clamp(ms, 1500, 4000)
  if ms < 1500: fail("lb_str_ai_instant_think")
  return floor(ms)
```

**例外（不算失败）**：引擎跳过思考的强制 UI（例如断线托管已展示倒计时）须在日志标 `thinkSkipped=true`；主路径 AI 自主决策 **不得**跳过。

---

## §6 HarmonyOS 可替换模块

核心算法按模块切开，便于 `MatchEngine` 热替换实现而不改规则：

| 模块 | 职责 | 关键 API |
|------|------|----------|
| **InfoSetBuilder** | 权威态 → 允许视图；剥禁止字段 | `buildInfoSet(seat)->I` |
| **Memory** | 公开事件记忆；密度 | `updateMemory(event)` · `density(I)` |
| **PlayPolicy** | D1 期望 + 熵地板 | `decidePlay(I,M)->PlayDecision` |
| **ChallengePolicy** | D2 似然 + EV + 强制门 | `decideChallenge(I,M)->ChallengeDecision` |
| **ThinkDelay** | 时延公式与硬地板 | `computeThinkMs_*(...)` |
| **PersonaParams** | 连续参数表（β/T/temperature/errorRate/think*） | `of(seat)->params` |

```pseudo
// 装配
AiSeatController.tick(gate):
  I = InfoSetBuilder.buildInfoSet(seat)
  M = Memory.current()
  match gate:
    PLAY:       d = PlayPolicy.decidePlay(I, M, rng)
    TOC:        d = ChallengePolicy.decideChallenge(I, M, rng)
    FORCE2:     d = ChallengeDecision(DOUBT, ThinkDelay.challenge(...))
  sleep(d.thinkMs)   // 表演；引擎超时仍可 AUTO_PLAY
  return d.action
```

约束：任一模块 **不得**直接改 `lives` / 牌堆；只回报动作枚举。

---

## §7 夹具表 + 失败短句

### 7.1 失败短句（string.json）

| key | value | 触发 |
|-----|-------|------|
| `lb_str_ai_peek` | AI偷看 | 决策读禁止字段 / 日志含未揭真面 |
| `lb_str_ai_fake_decision` | AI假决策 | 座号/人格 if 写死；Soft/Slam 塌成假 AI；主路径 50% 掷骰 |
| `lb_str_ai_fixed_play` | 出牌固定脚本 | 同 InfoSet 多样本熵 `< H_floor`；固定张数脚本 |
| `lb_str_ai_instant_think` | 思考过短 | 主路径 play`<1200` 或 challenge`<1500` |

### 7.2 验收夹具表

| ID | 夹具 | 期望 | 失败短句 |
|----|------|------|----------|
| F-01 | 注入他座 `handRanks` 到 InfoSet | assert / 构建失败 | `ai_peek` |
| F-02 | Soft×1 · n≥50 | 三人格多数 BELIEVE；Karen 10～35% 等 §4b.1 | `ai_fake_decision` |
| F-03 | Mid×2 · n≥50 | §4b.2 窗 | `ai_fake_decision` |
| F-04 | Slam×3 · n≥50 | Karen≥55% / Shark 25～55% / **Timid 10～30%** | `ai_fake_decision` |
| F-05 | `forceChallenge2` | 100% DOUBT（三角色） | `ai_fake_decision` |
| F-06 | 同 InfoSet 出牌采样 n≥30 | `H ≥ H_floor` | `ai_fixed_play` |
| F-07 | 主路径思考日志 | play∈[1200,3500] · chal∈[1500,4000] | `ai_instant_think` |
| F-08 | D2 日志 | 每拍含 `L_fake`,`EV`,`T` | 缺字段 = 实装未对齐 |
| F-09 | 决策主路径搜 `if(persona` / `seatId==` 定动作 | 零命中 | `ai_fake_decision` |

### 7.3 最小可跑自检伪代码

```pseudo
function fixture_slam_timid_floor():
  I = loadFixture("slam_strong_suspicion")
  params = PersonaParams.AI_TIMID
  doubts = 0
  N = 50
  for i in 1..N:
    if decideChallenge(I.with(params), M0, rng_i).intent == DOUBT:
      doubts += 1
  rate = doubts / N
  assert 0.10 <= rate <= 0.30
  // 旧窗 rate≈0 → 本版必须失败旧实现
```

---

## 附录 A · 符号表

| 符号 | 含义 |
|------|------|
| `I_t` | t 时刻信息集 |
| `M_t` | t 时刻公开记忆 |
| `density` | 未见牌合法密度估计 |
| `E(c)` | 候选出牌期望 |
| `L_fake` | 上家本手为假的似然 |
| `EV_doubt` | 质疑动作期望收益 |
| `T` | 质疑阈值（连续） |
| `β` | 似然斜率（连续） |
| `H` | 出牌多样本熵 |

## 附录 B · 修订

| 版本 | 日期 | 说明 |
|------|------|------|
| v0.2.0 | 2026-09-21 | 首版核心算法真源：InfoSet/Memory/D1/D2/Think/模块/三档窗；SUPERSEDE 旧 Timid Slam≈0；ADD `ai_fixed_play` / `ai_instant_think` |

---

**会签**：合入 ≠ 终验。Rebuild 后按 §7 夹具勾选；未过窗不得标「AI 已齐」。
