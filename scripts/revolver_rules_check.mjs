#!/usr/bin/env node
/**
 * Spec check: 对局-状态机 v2.0.0 / GDD v0.4.0 — 废左轮 · lives_default=3.
 * SUPERSEDES revolver v1 (左轮对局-状态机). Asserts PenaltyExtinguish1 primary,
 * no RevolverGun on MatchEngine primary path, CollectRedeal unbound from gun.
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
const ids = src('entry/src/main/ets/common/Ids.ets');
const emptyEntry = src('entry/src/main/ets/features/table/components/EmptySafeEntry.ets');
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

if (match.lives_default === 3) {
  pass('lives_default=3 (candle lives; abolish 1 / 真弹即死)');
} else {
  fail(`lives_default must be 3, got ${match.lives_default}`);
}

if (defaultsTs.includes('lives_default') && defaultsTs.includes('Candle lives')) {
  pass('MatchDefaults documents candle lives_default=3');
} else if (defaultsTs.includes('lives_default') && !defaultsTs.includes('alive-token (1)')) {
  pass('MatchDefaults lives_default not alive-token=1');
} else {
  fail('MatchDefaults still describes lives_default as alive-token=1');
}

// RevolverGun must NOT be MatchEngine primary path.
if (engine.includes("import { RevolverGun }") || engine.includes('new RevolverGun') ||
    engine.includes('this.gun') || engine.includes('applyShoot')) {
  fail('MatchEngine still wires RevolverGun / applyShoot as primary');
} else {
  pass('MatchEngine has no RevolverGun / applyShoot primary path');
}

if (engine.includes('applyPenaltyExtinguish1') && engine.includes('PenaltyExtinguish1') &&
    engine.includes('LIFE_CHANGE') && engine.includes('extinguishPending')) {
  pass('engine PenaltyExtinguish1 (lives−1) primary');
} else {
  fail('engine missing PenaltyExtinguish1 / extinguishPending / LIFE_CHANGE');
}

if (engine.includes('collectRedeal') &&
    (engine.includes('不绑枪') || engine.includes('PenaltyExtinguish1') ||
      engine.includes('after PenaltyExtinguish1'))) {
  pass('CollectRedeal after settle without gun binding');
} else if (engine.includes('collectRedeal') && !engine.includes('only after shot')) {
  pass('CollectRedeal present; not shot-bound wording');
} else {
  fail('CollectRedeal still gun/shot-bound or missing');
}

if (phase.includes('EMPTY_SAFE') && phase.includes('FORCE_CHALLENGE')) {
  pass('Phase TurnWindow EMPTY_SAFE/FORCE_CHALLENGE');
} else {
  fail('Phase missing empty-safe windows');
}

if (types.includes('emptySafePending') && types.includes('forceChallengeEmpty') &&
    types.includes('roundSafeWaitSeats')) {
  pass('MatchSnapshot HandEmptyGate fields');
} else {
  fail('MatchTypes missing HandEmptyGate snapshot fields');
}

if (ids.includes("CHALLENGE_YOU: string = 'lb_btn_challenge_you'") &&
    ids.includes("CHALLENGE_PREV: string = 'lb_btn_challenge_prev'") &&
    ids.includes("EMPTY_TARGET_CHOICE: string = 'lb_cmp_empty_target_choice'") &&
    !ids.includes("'lb_cmp_empty_safe_entry'")) {
  pass('Ids lock lb_btn_challenge_you / lb_btn_challenge_prev / lb_cmp_empty_target_choice');
} else {
  fail('Ids missing CHALLENGE_YOU / CHALLENGE_PREV / EMPTY_TARGET_CHOICE');
}

if (emptyEntry.includes('ControlIds.CHALLENGE_YOU') &&
    emptyEntry.includes('ControlIds.CHALLENGE_PREV') &&
    emptyEntry.includes('ControlIds.EMPTY_TARGET_CHOICE') &&
    !emptyEntry.includes('lb_cmp_empty_safe_entry')) {
  pass('EmptySafeEntry binds locked you/prev + EMPTY_TARGET_CHOICE');
} else {
  fail('EmptySafeEntry missing locked id binds');
}

const strings = src('entry/src/main/resources/base/element/string.json');
const prevMatch = strings.match(/"name":\s*"lb_str_challenge_prev"\s*,\s*"value":\s*"([^"]+)"/);
const prevVal = prevMatch ? prevMatch[1] : '';
if ((prevVal === '上家' || prevVal === '不质疑你') && prevVal !== '质疑上家') {
  pass('lb_str_challenge_prev is 上家 or 不质疑你 (not 质疑上家)');
} else {
  fail(`lb_str_challenge_prev must be 「上家」 or 「不质疑你」, not 「质疑上家」 (got ${JSON.stringify(prevVal)})`);
}

const emptySetsRoundWin =
  /emptied[\s\S]{0,200}roundWinPending\s*=\s*true/.test(engine) ||
  (/commitPicked[\s\S]{0,400}RoundWinPending/.test(engine) &&
    /commitPicked empty → RoundWinPending/.test(engine));

const hasNoRevolverPrimary =
  engine.includes('enterHandEmptyGate') &&
  (engine.includes('collectRedeal') || engine.includes('CollectRedeal')) &&
  engine.includes('applyPenaltyExtinguish1') &&
  !engine.includes('applyShoot') &&
  !engine.includes('new RevolverGun');

if (hasNoRevolverPrimary && !emptySetsRoundWin) {
  pass('engine HandEmptyGate + PenaltyExtinguish1 + CollectRedeal; no RoundWin-on-empty / no gun');
} else if (emptySetsRoundWin) {
  fail('engine still sets RoundWinPending on empty as primary');
} else {
  fail('engine missing no-revolver primary wiring');
}

if (engine.includes('beginRoundWin') && engine.includes('ignored') &&
    engine.includes('redealAll') && engine.includes('CollectRedeal')) {
  pass('beginRoundWin/redealAll deprecated stubs');
} else {
  fail('RoundWin APIs not gated as deprecated stubs');
}

const tableImportsEmpty = table.includes('EmptySafeEntry') &&
  table.includes('features/table/components/EmptySafeEntry');
const tableMountsEmpty = table.includes('EmptySafeEntry({') &&
  (table.includes('onChooseEmptyYou') || table.includes('chooseEmptyYou'));
const tableWiresChoose =
  table.includes('AppRuntime.engine.chooseEmptyYou()') &&
  table.includes('AppRuntime.engine.chooseEmptyShangjia()');
const tableSyncsEmpty =
  table.includes('syncEmptySafeEntry') &&
  table.includes('emptySafePending') &&
  table.includes('forceChallengeEmpty');
const tableNoRoundWinPrimary =
  !/left\s*===\s*0[\s\S]{0,280}startRoundWin\s*\(/.test(table) &&
  table.includes('HandEmptyGate primary');
const tableNoRevClick =
  !table.includes('TableAudio.playRevolverClick()');
const tableNoRevShotSpin =
  !table.includes('TableAudio.playRevolverShot()') &&
  !table.includes('TableAudio.playRevolverSpin()');

if (tableImportsEmpty && tableMountsEmpty && tableWiresChoose &&
    tableSyncsEmpty && tableNoRoundWinPrimary && tableNoRevClick && tableNoRevShotSpin) {
  pass('Table: EmptySafe hangpoints; no RoundWin-on-empty; no revolver SFX primary');
} else {
  fail('Table missing EmptySafe hangpoints or still revolver/RoundWin primary');
  if (!tableImportsEmpty) fail('  · import/mount EmptySafeEntry');
  if (!tableMountsEmpty) fail('  · EmptySafeEntry({...}) / onChooseEmptyYou');
  if (!tableWiresChoose) fail('  · engine chooseEmptyYou / chooseEmptyShangjia');
  if (!tableSyncsEmpty) fail('  · syncEmptySafeEntry / emptySafePending / forceChallengeEmpty');
  if (!tableNoRoundWinPrimary) fail('  · still startRoundWin on left===0 primary');
  if (!tableNoRevClick) fail('  · still playRevolverClick on you/prev');
  if (!tableNoRevShotSpin) fail('  · still playRevolverShot/Spin primary');
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

// Ban lives_default=1 formula in engine comments / start
if (engine.includes('alive-token') || /lives_default\s*=\s*1/.test(engine)) {
  fail('engine still documents/uses lives_default=1 alive-token formula');
} else {
  pass('engine abolished lives_default=1 / alive-token formula');
}

if (!process.exitCode) {
  console.log('revolver_rules_check: all green (no-revolver · 3lives)');
}
