# engine_parity · 对照法（K3）

## 目标

同 `seed` 下，附录 E / 05 §3.3 十五事件序列：

`entry/.../engine/*.ets`（权威） ⟷ `cocos/assets/scripts/engine/*.ts`（移植）

要求最终 **100% 一致**（测试岗 T2/T3 + Aron 终验）。**本票不宣称已 100% 绿。**

## 本票能跑的

```bash
cd cocos
node tools/engine_parity.mjs
```

会：

1. 静态锁检：Cues 1000/3000/320/24、Judge wild 读 `deck.json`、无 `RevolverGun.ts`、十五事件名、`drain(seq)`
2. 用 `tsx` 跑 `parity_harness.mts`：加载 `assets/config/*.json` → `MatchEngine.startMatch` → `dealDone` →（若人类座有牌）出 1 张 → 写 `tools/parity-out/ts-events.json`

## ets 侧为何未同进程对比

ArkTS `MatchEngine` 依赖 `@kit.*` / `ConfigRepository.loadAll(UIAbilityContext)`，无法在 Node 同进程直接 import。

### 建议对照步骤（后续票 / 测试岗）

1. DevEco 或专用 ArkTS 测试入口：固定 `demo_seed`（与 `match_defaults.json` 一致），跑同等动作序列，把附录 E 事件（或从 phase/snapshot 推导的序列）导出为 `ets-events.json`（字段：`seq/name/payload`）。
2. 将 `ets-events.json` 放到 `cocos/tools/parity-out/`。
3. 扩展本脚本：对 `name` 序列逐项相等；`RevealStarted.payload.ranks` 必须等于真 `lastPlayRanks`（禁 claim 假面）。
4. 两边都绿后再宣称 `parity_100: true`。

## 合入 ≠ 终验

PM 合 PR 只说明文档/移植审过；Aron 真机 Rebuild + 测试闸绿才算过。
