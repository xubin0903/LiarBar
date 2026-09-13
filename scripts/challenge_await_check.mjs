#!/usr/bin/env node
/**
 * Spec check for Section 2 AwaitChallenge entry (17 / 02 / C2-1～8).
 * Cloud has no DevEco — this is not CompileArkTS. 合入 ≠ 终验.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
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
const entry = src('entry/src/main/ets/features/table/components/ChallengeEntry.ets');
const fx = src('entry/src/main/ets/features/table/ChallengeFx.ets');
const ids = src('entry/src/main/ets/common/Ids.ets');
const strings = src('entry/src/main/resources/base/element/string.json');
const audio = src('entry/src/main/ets/features/table/TableAudio.ets');
const router = src('entry/src/main/ets/common/LbRouter.ets');
const challengePage = src('entry/src/main/ets/pages/Challenge.ets');
const layout = src('entry/src/main/ets/features/table/TableLayout.ets');
const pile = src('entry/src/main/ets/features/table/components/PlayFrontPile.ets');
const match = JSON.parse(src('entry/src/main/resources/rawfile/config/match_defaults.json'));

if (match.lives_default === 3) {
  pass('C2 hard lock: lives_default still 3');
} else {
  fail(`lives_default drifted to ${match.lives_default}`);
}
if (match.max_play_cards === 3) {
  pass('C2 hard lock: MAX_PLAY still 3');
} else {
  fail('MAX_PLAY drifted');
}
if (layout.includes('HAND_RING_GAP_PCT: number = 24')) {
  pass('C2 hard lock: HAND_RING_GAP_PCT frozen at 24');
} else {
  fail('HAND_RING_GAP_PCT changed');
}
if (table.includes('nextB: number = this.insetVp(box.bottom)') &&
    !table.includes('this.padB = this.padB +')) {
  pass('C2 hard lock: padB stays avoidArea inset');
} else {
  fail('padB path rewritten');
}

if (existsSync(join(root, 'entry/src/main/ets/features/table/components/ChallengeEntry.ets')) &&
    entry.includes("CHALLENGE_TRUE") &&
    entry.includes("CHALLENGE_FALSE") &&
    entry.includes("CHALLENGE_PASS") &&
    entry.includes("CHALLENGE_ENTRY") &&
    entry.includes("CHALLENGE_TIMER") &&
    entry.includes("CHALLENGE_RING") &&
    /Button\('真'\)/.test(entry) &&
    /Button\('假'\)/.test(entry) &&
    /Button\('过'\)/.test(entry)) {
  pass('C2-2: 真/假 same-layer + 过 on lb_cmp_challenge_entry');
} else {
  fail('ChallengeEntry missing same-layer 真/假/过');
}

if (table.includes('ChallengeEntry({') &&
    table.includes("Alignment.BottomEnd") &&
    table.includes('ControlIds.CHALLENGE_AWAIT') &&
    !table.includes('this.handPin()')?.valueOf()) {
  // handPin still exists for cards; entry must not be constructed inside handPin()
}

const handPinFn = table.split('@Builder\n  handPin()')[1] || table.split('handPin()')[1] || '';
const handPinBody = handPinFn.slice(0, 2500);
if (table.includes('ChallengeEntry({') &&
    table.includes('ControlIds.CHALLENGE_AWAIT') &&
    !handPinBody.includes('ChallengeEntry') &&
    !handPinBody.includes('CHALLENGE_ENTRY')) {
  pass('C2 overlay: BottomEnd AwaitChallenge, not inside handPin');
} else {
  fail('entry missing or mounted in handPin');
}

if (fx.includes('AWAIT_MS: number = 10000') &&
    fx.includes('AWAIT_MS_MIN: number = 8000') &&
    fx.includes('AWAIT_MS_MAX: number = 12000') &&
    fx.includes('BTN_VP: number = 48') &&
    fx.includes('PASS_VP: number = 44') &&
    table.includes('onChallengePass(true)') &&
    table.includes('AwaitChallenge timeout Pass')) {
  pass('C2-8: 10s (8～12) timeout → Pass');
} else {
  fail('timeout window / Pass missing');
}

if (table.includes('lastPlay.isFirstOfRound') &&
    table.includes('shouldShowChallengeEntry') &&
    table.includes('actorEmptied') &&
    table.includes('this.playFlyOn || this.confirmBusy || this.rankSettleOn')) {
  pass('C2-1/4/5: first-hand / emptied / fly+busy gates');
} else {
  fail('entry gates incomplete');
}

if (table.includes('snap.lastPlay.playId') &&
    table.includes('challengeTargetPlayId') &&
    table.includes('intentChallenge()') &&
    !table.includes('lastPlayRanks') &&
    pile.includes('art_card_back') &&
    !pile.includes('Text(')) {
  pass('C2-3/7: target=lastPlay; pile stays backs (no local-first open)');
} else {
  fail('target / no-local-open incomplete');
}

if (strings.includes('lb_str_challenge_reject') &&
    strings.includes('质疑未生效') &&
    !strings.includes('lb_str_challenge_rollback') &&
    table.includes("hintKind === 5") &&
    table.includes("lb_str_challenge_reject") &&
    table.includes('rejectChallengeRestore')) {
  pass('C2-7: reject key is only lb_str_challenge_reject = 质疑未生效');
} else {
  fail('reject string / restore missing or rollback key invented');
}

if (ids.includes("CHALLENGE_ENTER: string = 'lb_sfx_challenge_enter'") &&
    ids.includes("CHALLENGE_COMMIT: string = 'lb_sfx_challenge_commit'") &&
    audio.includes('sfx_challenge_enter.wav') &&
    audio.includes('sfx_challenge_commit.wav') &&
    table.includes('playChallengeEnter') &&
    table.includes('playChallengeCommit') &&
    table.includes('onChallengeTrue') &&
    table.includes('onChallengeFalse') &&
    table.includes('onChallengePass')) {
  pass('listen: enter on AwaitChallenge; commit on 真/假');
} else {
  fail('enter/commit SFX wiring');
}

const passFn = table.split('private onChallengePass')[1] || '';
const passBody = passFn.split('private ', 1)[0];
if (passBody.includes('closeChallengeEntry(true)') &&
    !passBody.includes('playChallenge') &&
    !passBody.includes('CARD_FLIP') &&
    !passBody.includes('playPlayLaunch') &&
    !passBody.includes('playPlayLand')) {
  pass('C2-2 listen: Pass silent (no enter/commit/flip/launch/land)');
} else {
  fail('Pass is not silent');
}

const trueFn = table.split('private onChallengeTrue')[1] || '';
const trueBody = trueFn.split('private onChallengeFalse')[0];
if (trueBody.includes('playChallengeCommit') && !trueBody.includes('intentChallenge')) {
  pass('真 = commit SFX then own play (no reveal / no ritual)');
} else {
  fail('真 path');
}

const falseFn = table.split('private onChallengeFalse')[1] || '';
const falseBody = falseFn.split('private rejectChallengeRestore')[0];
if (falseBody.includes('playChallengeCommit') &&
    falseBody.includes('intentChallenge') &&
    falseBody.includes('rejectChallengeRestore') &&
    !falseBody.includes('lastPlayRanks') &&
    !falseBody.includes('revealOpen')) {
  pass('假 = commit SFX, wait intentChallenge ACK, no flip');
} else {
  fail('假 ACK path');
}

if (!table.includes('LbRouter.toChallenge()') &&
    router.includes('toChallenge frozen') &&
    router.includes('replaceChallenge frozen') &&
    challengePage.includes('lb_scr_challenge frozen') &&
    !challengePage.includes('ChallengeBeats') &&
    !challengePage.includes('CHALLENGE_SKIP') &&
    !challengePage.includes('BET_TRUE') &&
    !table.includes('ControlIds.CHALLENGE)') &&
    !table.includes("id(ControlIds.CHALLENGE)")) {
  pass('C2-6: old four-beat / weak CTA / toChallenge frozen (single track)');
} else {
  fail('dual track still present');
}

const enterWav = 'entry/src/main/resources/rawfile/audio/sfx/sfx_challenge_enter.wav';
const commitWav = 'entry/src/main/resources/rawfile/audio/sfx/sfx_challenge_commit.wav';
if (existsSync(join(root, enterWav)) && statSync(join(root, enterWav)).size >= 8000 &&
    existsSync(join(root, commitWav)) && statSync(join(root, commitWav)).size >= 5000 &&
    !existsSync(join(root, 'entry/src/main/resources/rawfile/audio/sfx/sfx_challenge_pass.wav'))) {
  pass('existing enter/commit wavs; no pass wav');
} else {
  fail('enter/commit wav missing or pass wav invented');
}

if (fx.includes('C2-1') && fx.includes('C2-8') && fx.includes('lb_str_challenge_reject')) {
  pass('C2-1～8 noted on ChallengeFx');
} else {
  fail('implementation notes missing C2 gates');
}

if (table.includes('playChallengeEnter') &&
    (table.split('playPlayLaunch').length > 1) &&
    !audio.includes('playChallengeEnter();')?.valueOf()) {
  // enter must not reuse launch/land/flip files
}
if (audio.includes('sfx_challenge_enter.wav') &&
    audio.includes('sfx_challenge_commit.wav') &&
    !audio.includes('sfx_card_flip') &&
    !audio.includes('sfx_play_launch.wav')?.valueOf()) {
  // TableAudio still has launch/land paths — that is Section 1. Challenge methods must not call them.
}

const enterPlay = audio.split('static playChallengeEnter')[1] || '';
const enterBody = enterPlay.split('static playChallengeCommit')[0];
const commitPlay = audio.split('static playChallengeCommit')[1] || '';
const commitBody = commitPlay.split('static playStyleAtPeak')[0];
if (enterBody.includes('CHALLENGE_ENTER') && !enterBody.includes('PLAY_LAUNCH') &&
    !enterBody.includes('CARD_FLIP') &&
    commitBody.includes('CHALLENGE_COMMIT') && !commitBody.includes('PLAY_LAND')) {
  pass('enter/commit methods do not impersonate flip/launch/land');
} else {
  fail('challenge SFX methods reuse frozen slots');
}

console.log(process.exitCode ? 'challenge-await check FAILED' : 'challenge-await check OK');
