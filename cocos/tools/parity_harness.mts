/**
 * K3 parity harness — Node 侧驱动 Cocos TS MatchEngine，dump 附录 E 事件序列。
 * 由 engine_parity.mjs 通过 tsx 调用；勿在 Creator 场景里引用。
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ConfigRepository } from '../assets/scripts/config/ConfigRepository.ts';
import { MatchEngine } from '../assets/scripts/engine/MatchEngine.ts';
import { PlayStyle } from '../assets/scripts/engine/Phase.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const cfgDir = join(root, 'assets', 'config');
const outDir = join(__dirname, 'parity-out');

function loadCfg(): void {
  ConfigRepository.loadFromJsonTexts(
    readFileSync(join(cfgDir, 'match_defaults.json'), 'utf8'),
    readFileSync(join(cfgDir, 'deck.json'), 'utf8'),
    readFileSync(join(cfgDir, 'ai_personas.json'), 'utf8'),
    readFileSync(join(cfgDir, 'interaction_caps.json'), 'utf8'),
    readFileSync(join(cfgDir, 'demo_seed.json'), 'utf8')
  );
}

function compact(ev: { seq: number; name: string; payload: Record<string, unknown> }) {
  return { seq: ev.seq, name: ev.name, payload: ev.payload };
}

/**
 * 固定 seed 主路径烟雾：开局 → dealDone → 人类出 1 张 → 事件序列落盘。
 * 不做完整 AI 对局（那是 Director/K4）；只证明引擎可跑 + MatchEvents 有真 ranks 钩子。
 */
function main(): void {
  loadCfg();
  const engine = new MatchEngine();
  const ok = engine.startMatch({ nickname: '你', playerCount: 4, silent: true });
  if (!ok) {
    console.error('FAIL startMatch');
    process.exitCode = 1;
    return;
  }
  engine.dealDone();

  const snap0 = engine.current();
  const seed = snap0 !== null ? snap0.seed : -1;
  console.log(`TS harness seed=${seed} matchId=${snap0?.matchId}`);

  // 人类回合：尽量出 1 张（若当前座不是人类则只 dump 已有事件）
  const snap = engine.current();
  if (snap !== null && snap.phase === 'TURN' && snap.currentSeatId === 0 && snap.selfHand.length > 0) {
    const cardId = snap.selfHand[0].cardId;
    engine.intentPlay();
    engine.submitPlay([cardId], PlayStyle.SOFT, '', -1);
  }

  const events = engine.events().snapshot().map(compact);
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'ts-events.json');
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        seed,
        note: 'Cocos TS MatchEvents dump (Appendix E). ets 对照见 README.',
        events
      },
      null,
      2
    ),
    'utf8'
  );
  console.log(`wrote ${outPath} count=${events.length}`);
  for (let i = 0; i < events.length; i++) {
    console.log(`  ${events[i].seq} ${events[i].name} ${JSON.stringify(events[i].payload)}`);
  }

  // RevealStarted 真 ranks 静态钩子：无质疑时本烟雾可能没有 RevealStarted — 用 peek 校验源
  const ranks = engine.peekLastPlayRanks();
  if (ranks.length > 0) {
    console.log(`peekLastPlayRanks=${JSON.stringify(ranks)} (must be real, never claim)`);
  }
}

main();
