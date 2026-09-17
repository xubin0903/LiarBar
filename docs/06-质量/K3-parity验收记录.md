# K3 · engine_parity 验收记录（T3）

> **合入 ≠ 终验** · 本票只验 K3 合入后的烟雾与闸；**不宣称 parity 100%**。

| 项 | 值 |
|----|-----|
| 票 | **T3** |
| 基线 | `origin/develop` @ `28c5a61`（K3 **#225**） |
| 日期 | 2026-09-17 |
| 范围 | 仓库根跑 `cocos/tools/engine_parity.mjs` + `scripts/cocos_engine_purity_check.mjs` / `cocos_cues_check.mjs` |
| 不做 | 改引擎规则；宣称未跑通的 100%；Aron 真机 Rebuild |

---

## 1. 烟雾 · `node cocos/tools/engine_parity.mjs`

| 项 | 结果 |
|----|------|
| exit | **0** |
| 静态锁 | PASS：Cues `1000/3000/320/24`；Judge wild←`deck()`；无 `RevolverGun`；`MatchEvents` 15 名 + `drain(seq)` |
| TS harness | PASS：`seed=20260906` → `parity-out/ts-events.json` **count=10**（含 `MatchStarted` / `Dealt` / `ClaimSet` / … / `ChallengeWindowOpened`） |
| 脚本收尾 | `SMOKE OK · parity 100% 未宣称` |

### parity 100%？

| 字段 | 值 |
|------|-----|
| `ts_side` | **RAN** |
| `ets_side` | **NOT_RUN** |
| `parity_100` | **false** |
| 结论 | **未达成 100%**（诚实） |

**依据**（`cocos/tools/README-parity.md`）：ArkTS `MatchEngine` 依赖 `@kit.*` / `ConfigRepository.loadAll(UIAbilityContext)`，无法在 Node 同进程 import；本骨架只跑 TS 侧序列 + 静态锁检。对照法：DevEco/专用入口导出 `ets-events.json` → 与 `ts-events.json` 比 `name` 序列（及 `RevealStarted.payload.ranks` = 真 `lastPlayRanks`）后，方可宣称 `parity_100: true`。

---

## 2. 闸结果（K3 合入后应不再 SKIP）

| 脚本 | 结果 | 备注 |
|------|------|------|
| `node scripts/cocos_engine_purity_check.mjs` | **PASS / OK** · exit 0 | 11 engine 源文件；禁 cc/UI/`setTimeout`；Judge 三符号在 |
| `node scripts/cocos_cues_check.mjs` | **PASS / OK** · exit 0 | `DRAW_TO_FLIP=1000` · `REVEAL_HOLD=3000` · `HAND_RING_GAP=24` · `FLY_MS=320` |

两闸均 **不再 SKIP**，与 T2「K3 合入后应变绿」预期一致。

---

## 3. 清单勾选口径

总纸 [`Cocos重写回归勾选清单.md`](./Cocos重写回归勾选清单.md) §1 `engine_parity` / §6 **EP-1**：**勿勾过关**——ets 对照仍 NOT RUN；烟雾绿 ≠ 终验 100%。详见本记录 + README-parity。

---

*测试岗 · T3 · K3 #225 · 烟雾 OK · 闸绿 · parity 100% NOT RUN · 合入≠终验*
