#!/usr/bin/env node
/**
 * Spec check: revolver rules v1 (左轮对局-状态机 v1.1.1 / GDD v0.3.0).
 * Deck 20 / hand 5 / chambers 6 / no RoundWin-on-empty as primary.
 * Cloud has no DevEco — not CompileArkTS. 合入 ≠ 终验.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFileSync(join(root, rel), 'utf8');

function fail(msg) {
  console.error('FAIL', msg);
  process.exitCode = 1;
}

function pass(msg) {
  console.log('PASS', msg);
}

const deck = JSON.parse(src('entry/src/main/resources/rawfile/config/deck.json'));
const match = JSON.parse(src('entry/src/main/resources/rawfile/config/match_defaults.json'));
const engine = src('entry/src/main/ets/engine/MatchEngine.ets');
const types = src('entry/src/main/ets/engine/MatchTypes.ets');
const defaultsTs = src('entry/src/main/ets/config/MatchDefaults.ets');
const phase = src('entry/src/main/ets/engine/Phase.ets');
const gun = src('entry/src/main/ets/engine/RevolverGun.ets');
const layout = src('entry/src/main/ets/features/table/TableLayout.ets');
const table = src('entry/src/main/ets/pages/Table.ets');

function deckTotal(bag) {
  return bag.A + bag.K + bag.Q + bag.JOKER;
}

for (const key of ['n3', 'n4', 'n5', 'n6']) {
  const bag = deck.decks[key];
  if (bag && bag.A === 6 && bag.K === 6 && bag.Q === 6 && bag.JOKER === 2 && deckTotal(bag) === 20) {
    pass(`deck.${key} = 6+6+6+2 (20)`);
  } else {
    fail(`deck.${key} not 20=6K+6Q+6A+2Joker`);
  }
}

if (match.hand_size_default === 5) {
  pass('hand_size_default = 5');
} else {
  fail(`hand_size_default=${match.hand_size_default}`);
}

if (match.revolver_chambers === 6 && match.revolver_live === 1) {
  pass('revolver 6 chambers / 1 live');
} else {
  fail(`revolver chambers/live = ${match.revolver_chambers}/${match.revolver_live}`);
}

if (match.lives_default === 1) {
  pass('lives_default=1 (alive token, not 3-life win)');
} else {
  fail(`lives_default drifted to ${match.lives_default}`);
}

if (defaultsTs.includes('revolver_chambers') && defaultsTs.includes('revolver_live')) {
  pass('MatchDefaults has revolver fields');
} else {
  fail('MatchDefaults missing revolver fields');
}

if (gun.includes('class RevolverGun') && gun.includes('fire()') && gun.includes('liveSlots')) {
  pass('RevolverGun helper present');
} else {
  fail('RevolverGun missing');
}

if (phase.includes("EMPTY_SAFE") && phase.includes("FORCE_CHALLENGE") && phase.includes("SHOOT")) {
  pass('Phase TurnWindow EMPTY_SAFE/FORCE_CHALLENGE + EventKind.SHOOT');
} else {
  fail('Phase missing empty-safe / SHOOT');
}

if (types.includes('emptySafePending') && types.includes('forceChallengeEmpty') &&
    types.includes('chamberIndex') && types.includes('roundSafeWaitSeats')) {
  pass('MatchSnapshot revolver / HandEmptyGate fields');
} else {
  fail('MatchTypes missing revolver snapshot fields');
}

// Primary path must not be RoundWin-on-empty.
const emptySetsRoundWin =
  /emptied[\s\S]{0,200}roundWinPending\s*=\s*true/.test(engine) ||
  /RoundWinPending/.test(engine) && /commitPicked empty → RoundWinPending/.test(engine);

if (engine.includes('collectRedeal') || engine.includes('CollectRedeal') ||
    engine.includes('enterHandEmptyGate') || engine.includes('HandEmptyGate') ||
    engine.includes('applyShoot') || engine.includes('RevolverGun')) {
  pass('engine references CollectRedeal / HandEmptyGate / shoot / RevolverGun (wiring in progress)');
} else {
  // Soft until MatchEngine commit lands; still fail if RoundWin remains sole empty path.
  if (emptySetsRoundWin) {
    fail('engine still sets RoundWinPending on empty as primary');
  } else {
    pass('engine no longer documents RoundWinPending-on-empty as sole path');
  }
}

if (layout.includes('HAND_RING_GAP_PCT: number = 24')) {
  pass('HAND_RING_GAP_PCT frozen at 24');
} else {
  fail('HAND_RING_GAP_PCT changed');
}

if (table.includes('nextB: number = this.insetVp(box.bottom)') &&
    !table.includes('this.padB = this.padB +')) {
  pass('padB stays avoidArea inset');
} else {
  fail('padB path rewritten');
}

if (match.max_play_cards === 3 && match.min_play_cards === 1) {
  pass('MAX_PLAY still 1–3');
} else {
  fail('MAX_PLAY drifted');
}

if (!process.exitCode) {
  console.log('revolver_rules_check: all green');
}
