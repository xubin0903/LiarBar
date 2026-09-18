#!/usr/bin/env node
/**
 * Spec check: U03b RoundWin → RedealAll (出牌扣牌 v0.4.0 / #160).
 * hand==0 → RoundWin tip → RedealAll; no RankSettle-on-empty.
 * Cloud has no DevEco — this is not CompileArkTS. 合入 ≠ 终验.
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

const table = src('entry/src/main/ets/pages/Table.ets');
const ids = src('entry/src/main/ets/common/Ids.ets');
const strings = src('entry/src/main/resources/base/element/string.json');
const engine = src('entry/src/main/ets/engine/MatchEngine.ets');
const types = src('entry/src/main/ets/engine/MatchTypes.ets');
const flyFx = src('entry/src/main/ets/features/table/PlayFlyFx.ets');
const layout = src('entry/src/main/ets/features/table/TableLayout.ets');
const match = JSON.parse(src('entry/src/main/resources/rawfile/config/match_defaults.json'));

if (match.lives_default === 3) {
  pass('lives_default still 3');
} else {
  fail(`lives_default drifted to ${match.lives_default}`);
}
if (match.max_play_cards === 3 && match.min_play_cards === 1) {
  pass('MAX_PLAY still 3');
} else {
  fail('MAX_PLAY drifted');
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

if (flyFx.includes('ROUND_WIN_MS: number = 1000') &&
    flyFx.includes('ROUND_WIN_MS_MIN: number = 800') &&
    flyFx.includes('ROUND_WIN_MS_MAX: number = 1200')) {
  pass('ROUND_WIN_MS=1000 (window 800～1200)');
} else {
  fail('ROUND_WIN_MS drifted');
}

if (ids.includes("ROUND_WIN: string = 'lb_cmp_round_win'") &&
    strings.includes('"name": "lb_str_round_win"') &&
    strings.includes('本轮胜') &&
    table.includes('ControlIds.ROUND_WIN') &&
    table.includes("lb_str_round_win")) {
  pass('lb_cmp_round_win + lb_str_round_win = 本轮胜');
} else {
  fail('RoundWin id / string missing');
}

if (table.includes('startRoundWin') &&
    table.includes('finishRoundWin') &&
    table.includes('beginRoundWin') &&
    table.includes('redealAll') &&
    table.includes('PlayFlyFx.ROUND_WIN_MS') &&
    table.includes('roundWinOn')) {
  pass('Table RoundWin tip → redealAll path');
} else {
  fail('Table RoundWin path incomplete');
}

// No RankSettle-on-empty: land hand==0 must not set rankSettleOn / RankSettle place.
if (!table.includes('rankSettleOn') &&
    !table.includes('rankSettlePlace') &&
    !table.includes('rankSettleBanner') &&
    table.includes('startRoundWin()') &&
    table.includes('left === 0')) {
  pass('no RankSettle-on-empty (RoundWin replaces)');
} else {
  fail('RankSettle-on-empty still present');
}

if (engine.includes('beginRoundWin()') &&
    engine.includes('redealAll()') &&
    engine.includes('roundWinPending') &&
    types.includes('roundWinPending: boolean') &&
    engine.includes('RoundWinPending') &&
    engine.includes('redealAll → DEAL')) {
  pass('engine beginRoundWin / redealAll + roundWinPending');
} else {
  fail('engine RoundWin API missing');
}

if (engine.includes('Not whole-match place') ||
    types.includes('Not whole-match place')) {
  pass('emptyOrder comment no longer Aron L7 first-empty=1st');
} else {
  fail('emptyOrder still documents whole-match place');
}

if (engine.includes('aliveCount(this.seats)') &&
    engine.includes('redealAll → RankSettle (1 alive)') &&
    engine.includes('this.toRecap()')) {
  pass('match RankSettle only when ≤1 alive on redealAll');
} else {
  fail('1-alive RankSettle path missing on redealAll');
}

if (engine.includes('roundWinPending') &&
    engine.includes('canChallengeNow') &&
    engine.includes('if (this.roundWinPending)')) {
  pass('AwaitChallenge banned while roundWinPending');
} else {
  fail('challenge not gated by roundWinPending');
}

if (table.includes('this.roundWinOn') &&
    table.includes('shouldShowChallengeEntry') &&
    table.includes('this.playFlyOn || this.confirmBusy || this.roundWinOn')) {
  pass('UI bans AwaitChallenge during RoundWin tip');
} else {
  fail('UI challenge gate missing RoundWin');
}

if (!process.exitCode) {
  console.log('round_win_redeal_check: all green');
}
