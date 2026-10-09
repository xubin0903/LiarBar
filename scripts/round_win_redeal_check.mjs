#!/usr/bin/env node
/**
 * Spec check: hand==0 → HandEmptyGate, round end → CollectRedeal.
 *
 * History: this gate was written for U03b RoundWin → RedealAll (#160/#163).
 * #167 (038523c, GDD v0.3.0 / 对局-状态机 R8/R10) abolished RoundWin: hand==0
 * now enters HandEmptyGate (EmptySafe ≥3 / ForceChallenge =2) and every round
 * ends via CollectRedeal (→ MatchEnd when ≤1 alive, else → DEAL).
 * beginRoundWin()/redealAll() survive only as deprecated no-ops. The file name
 * is kept so existing run lists still find it.
 * Cloud has no DevEco — this is not CompileArkTS. 合入 ≠ 终验.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { methodBody, stripCommentsAndStrings } from './lib/ets_scan.mjs';

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

// Retired with RoundWin (#167): ROUND_WIN_MS 1000, lb_cmp_round_win / 本轮胜,
// Table startRoundWin→redealAll wiring. They asserted that artefacts of the
// abolished mechanic still exist; keeping them would block their cleanup.

const tableCode = stripCommentsAndStrings(table);
const engineCode = stripCommentsAndStrings(engine);

// Deprecated RoundWin API must stay inert.
const brw = methodBody(engine, 'beginRoundWin');
const rda = methodBody(engine, 'redealAll');
const inert = (b) => b !== null && /return false;\s*$/.test(b.trim() + '\n') &&
  !/dealFresh|Phase\.|toRecap|collectRedeal/.test(stripCommentsAndStrings(b));
if (inert(brw) && inert(rda)) {
  pass('beginRoundWin / redealAll are inert no-ops (return false, no deal / phase change) — 废 RoundWin');
} else {
  fail('deprecated beginRoundWin / redealAll do work again (RoundWin abolished by #167)');
}

// CollectRedeal is the only round-end redeal.
const cr = methodBody(engine, 'collectRedeal');
if (cr !== null &&
    cr.includes('this.roundWinPending = false;') && cr.includes('this.emptyOrder = [];') &&
    cr.includes('this.lastPlay = null;') && cr.includes('this.clearEmptyGate();') &&
    /const live: number = aliveCount\(this\.seats\);\s*if \(live <= 1\) \{\s*this\.toRecap\(\);/.test(cr) &&
    cr.includes('collectRedeal → MatchEnd (≤1 alive)') &&
    /this\.phase = Phase\.DEAL;\s*this\.dealFresh\(false\);/.test(cr) &&
    cr.includes('collectRedeal → DEAL')) {
  pass('collectRedeal: reset round state; ≤1 alive → toRecap (MatchEnd); else → DEAL + dealFresh');
} else {
  fail('collectRedeal → MatchEnd / DEAL path missing');
}
const pd = methodBody(engine, 'penaltyDone');
const srw = methodBody(engine, 'maybeSettleRoundSafeWait');
if (pd !== null && pd.includes('return this.collectRedeal();') &&
    srw !== null && srw.includes('this.collectRedeal();') &&
    !/this\.(redealAll|beginRoundWin)\(/.test(engineCode)) {
  pass('CollectRedeal entered from PenaltyExtinguish1 (penaltyDone) and RoundSafeWait settle; engine never calls redealAll/beginRoundWin');
} else {
  fail('CollectRedeal entry points changed / engine still calls RoundWin API');
}

if (engine.includes('Not whole-match place') ||
    types.includes('Not whole-match place')) {
  pass('emptyOrder comment no longer Aron L7 first-empty=1st');
} else {
  fail('emptyOrder still documents whole-match place');
}

// Table: hand==0 on land goes to HandEmptyGate, never to RoundWin / RankSettle.
const landEmpty = /if \(left === 0\) \{([\s\S]*?)\} else \{/.exec(tableCode);
const startRoundWinCalls = (tableCode.match(/this\.startRoundWin\(/g) || []).length;
if (landEmpty && /this\.syncEmptySafeEntry\(snap\)/.test(landEmpty[1]) &&
    /this\.isForceChallengeEmpty\(snap\)/.test(landEmpty[1]) &&
    !/RoundWin|redealAll/.test(landEmpty[1]) &&
    startRoundWinCalls === 0 &&
    !table.includes('rankSettleOn') && !table.includes('rankSettlePlace') && !table.includes('rankSettleBanner')) {
  pass('Table land hand==0 → EmptySafeEntry / ForceChallenge; startRoundWin has 0 call sites; no RankSettle-on-empty');
} else {
  fail(`Table hand==0 path not HandEmptyGate (startRoundWin call sites=${startRoundWinCalls})`);
}
if (/private startRoundWin\(/.test(tableCode) || /private finishRoundWin\(/.test(tableCode)) {
  fail('Table.ets still defines dead startRoundWin/finishRoundWin (P2 must delete)');
} else {
  pass('Table.ets has no startRoundWin/finishRoundWin defs (P2 cleaned)');
}

// Challenge gating after #167 (replaces "banned while roundWinPending").
const canCh = methodBody(engine, 'canChallengeSeat');
if (canCh !== null &&
    /if \(this\.emptySafePending \|\| this\.forceChallengeEmpty\) \{\s*return this\.lastPlay\.actorSeatId === this\.emptyHandSeatId;/.test(canCh) &&
    /this\.roundSafeWaitSeats\[i\] === this\.lastPlay\.actorSeatId\) \{\s*return false;/.test(canCh) &&
    /this\.lastPlay === null \|\| this\.playIndexInRound < 1/.test(canCh)) {
  pass('canChallengeSeat: EmptySafe/ForceChallenge → only the emptier last hand; RoundSafeWait-sealed hand not challengeable');
} else {
  fail('canChallengeSeat gate drifted from #167 HandEmptyGate');
}

if (table.includes('shouldShowChallengeEntry') &&
    /this\.playFlyOn \|\| this\.confirmBusy/.test(table)) {
  pass('UI bans ChallengeEntry while play-fly / confirm busy');
} else {
  fail('UI challenge gate missing play-fly / confirm busy');
}

if (!process.exitCode) {
  console.log('round_win_redeal_check (HandEmptyGate/CollectRedeal): all green');
}
