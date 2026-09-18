#!/usr/bin/env node
/**
 * K3 · engine_parity 骨架
 *
 * 目标：同 seed 下对比 ets MatchEngine 与 Cocos TS MatchEvents 事件序列。
 * 本票实况：
 *   - TS 侧：用 tsx 跑 parity_harness.mts，落盘 tools/parity-out/ts-events.json
 *   - ets 侧：同进程难跑（需 ArkTS / DevEco 运行时）→ 不假装 100% 绿
 * 对照法见同目录 README-parity.md
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(__dirname, 'parity-out');
const harness = join(__dirname, 'parity_harness.mts');

const APPENDIX_E = [
  'MatchStarted',
  'Dealt',
  'ClaimSet',
  'TurnBegan',
  'PlayLanded',
  'ChallengeWindowOpened',
  'Believed',
  'ChallengeCommitted',
  'RevealStarted',
  'Judged',
  'CandleOut',
  'SeatEliminated',
  'Redealt',
  'EmptyGate',
  'MatchEnded'
];

function pass(msg) {
  console.log('PASS', msg);
}

function fail(msg) {
  console.error('FAIL', msg);
  process.exitCode = 1;
}

function warn(msg) {
  console.warn('WARN', msg);
}

function checkCuesLock() {
  const cues = readFileSync(join(root, 'assets/scripts/game/Cues.ts'), 'utf8');
  if (!cues.includes('DRAW_TO_FLIP_MS = 1000')) fail('Cues DRAW_TO_FLIP_MS≠1000');
  else pass('Cues DRAW_TO_FLIP_MS=1000');
  if (!cues.includes('REVEAL_HOLD_MS = 3000')) fail('Cues REVEAL_HOLD_MS≠3000');
  else pass('Cues REVEAL_HOLD_MS=3000');
  if (!cues.includes('FLY_MS = 320')) fail('Cues FLY_MS≠320');
  else pass('Cues FLY_MS=320');
  if (!cues.includes('HAND_RING_GAP_PCT = 24')) fail('Cues HAND_RING_GAP_PCT≠24');
  else pass('Cues HAND_RING_GAP_PCT=24');
}

function checkJudgeWildFromDeck() {
  const judge = readFileSync(join(root, 'assets/scripts/engine/Judge.ts'), 'utf8');
  const deck = JSON.parse(readFileSync(join(root, 'assets/config/deck.json'), 'utf8'));
  if (!judge.includes('ConfigRepository.deck().wild')) fail('Judge must read wild from deck.json');
  else pass('Judge wild ← ConfigRepository.deck()');
  if (deck.wild !== 'JOKER') fail('deck.json wild lock');
  else pass(`deck.wild=${deck.wild}`);
  // 禁止硬编码 JOKER 作 wild 公式
  if (/cardRank === ['"]JOKER['"]/.test(judge)) fail('Judge must not hardcode JOKER as wild');
  else pass('Judge no hardcoded wild');
}

function checkNoRevolverGun() {
  const engDir = join(root, 'assets/scripts/engine');
  if (existsSync(join(engDir, 'RevolverGun.ts'))) fail('RevolverGun.ts must not be ported');
  else pass('RevolverGun not ported');
  const api = readFileSync(join(engDir, 'RevolverRulesApi.ts'), 'utf8');
  if (!api.includes('v2-no-revolver')) fail('RevolverRulesApi missing v2-no-revolver');
  else pass('RevolverRulesApi v2-no-revolver');
}

function checkMatchEventsNames() {
  const src = readFileSync(join(root, 'assets/scripts/engine/MatchEvents.ts'), 'utf8');
  for (const name of APPENDIX_E) {
    if (!src.includes(`'${name}'`)) fail(`MatchEvents missing ${name}`);
  }
  if (process.exitCode) return;
  pass('MatchEvents 15 Appendix-E names');
  if (!src.includes('drain(seq')) fail('MatchEvents missing drain(seq)');
  else pass('MatchEvents.drain(seq)');
}

function runTsHarness() {
  mkdirSync(outDir, { recursive: true });
  const r = spawnSync('npx', ['--yes', 'tsx', `"${harness}"`], {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    env: process.env
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    fail(`parity_harness.mts exited ${r.status}`);
    return null;
  }
  const outPath = join(outDir, 'ts-events.json');
  if (!existsSync(outPath)) {
    fail('ts-events.json not written');
    return null;
  }
  const dump = JSON.parse(readFileSync(outPath, 'utf8'));
  pass(`TS event dump seed=${dump.seed} count=${dump.events?.length ?? 0}`);
  const names = (dump.events || []).map((e) => e.name);
  if (!names.includes('MatchStarted')) fail('TS dump missing MatchStarted');
  else pass('TS dump has MatchStarted');
  if (!names.includes('Dealt')) fail('TS dump missing Dealt');
  else pass('TS dump has Dealt');
  if (!names.includes('ClaimSet')) fail('TS dump missing ClaimSet');
  else pass('TS dump has ClaimSet');
  return dump;
}

function main() {
  console.log('=== cocos/tools/engine_parity.mjs (K3 skeleton) ===');
  checkCuesLock();
  checkJudgeWildFromDeck();
  checkNoRevolverGun();
  checkMatchEventsNames();
  const dump = runTsHarness();

  const summary = {
    ts_side: dump ? 'RAN' : 'FAILED',
    ets_side: 'NOT_RUN',
    parity_100: false,
    reason:
      'ets MatchEngine 需 ArkTS 运行时；本骨架只跑 TS 侧序列 + 静态锁检。对照法见 README-parity.md。合入 ≠ 终验。'
  };
  writeFileSync(join(outDir, 'parity-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log('---');
  console.log('PARITY vs ets: NOT RUN (honest)');
  console.log(JSON.stringify(summary, null, 2));
  if (!process.exitCode) {
    console.log('SMOKE OK · parity 100% 未宣称');
  }
}

main();
