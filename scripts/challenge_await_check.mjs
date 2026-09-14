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

// 对局-状态机 v2.0.0: lives_default=3 candle lives (废左轮 / 废 alive-token=1).
if (match.lives_default === 3) {
  pass('C2 hard lock: lives_default=3 (candle; abolish 1)');
} else {
  fail(`lives_default must be 3, got ${match.lives_default}`);
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
    entry.includes("CHALLENGE_DOUBT") &&
    entry.includes("CHALLENGE_BELIEVE") &&
    entry.includes("CHALLENGE_ENTRY") &&
    entry.includes("CHALLENGE_TIMER") &&
    entry.includes("CHALLENGE_RING") &&
    entry.includes("art_btn_challenge_doubt") &&
    entry.includes("art_btn_challenge_believe") &&
    entry.includes("lb_str_challenge_doubt") &&
    entry.includes("lb_str_challenge_believe") &&
    !entry.includes("CHALLENGE_TRUE") &&
    !entry.includes("CHALLENGE_FALSE") &&
    !entry.includes("CHALLENGE_PASS") &&
    !/Button\('真'\)/.test(entry) &&
    !/Button\('假'\)/.test(entry) &&
    !/Button\('过'\)/.test(entry)) {
  pass('C2-2: 质疑|相信 same-layer on lb_cmp_challenge_entry (no 真/假/过)');
} else {
  fail('ChallengeEntry missing doubt/believe or still binds true/false/pass entry');
}

if (ids.includes("CHALLENGE_DOUBT: string = 'lb_btn_challenge_doubt'") &&
    ids.includes("CHALLENGE_BELIEVE: string = 'lb_btn_challenge_believe'") &&
    strings.includes('lb_str_challenge_doubt') &&
    strings.includes('"value": "质疑"') &&
    strings.includes('lb_str_challenge_believe') &&
    strings.includes('"value": "相信"') &&
    strings.includes('lb_str_challenge_true') &&
    strings.includes('lb_str_challenge_false')) {
  pass('Ids+strings: doubt/believe locked; true/false strings kept (reveal only)');
} else {
  fail('Ids/strings doubt/believe lock or true/false reveal keys missing');
}

/**
 * Brace-match one `{ ... }` starting at `from` (must point at `{`).
 * Do not split on 'handPin()' — that call in build() sits before ChallengeEntry
 * and a naive split falsely treats the sibling overlay as inside handPin.
 */
function braceBlock(src, from) {
  if (from < 0 || src[from] !== '{') {
    return '';
  }
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return src.slice(from, i + 1);
      }
    }
  }
  return '';
}

function builderBody(src, name) {
  const re = new RegExp(`@Builder\\s+${name}\\(\\)\\s*`);
  const m = re.exec(src);
  if (m === null) {
    return '';
  }
  const braceAt = src.indexOf('{', m.index + m[0].length - 1);
  return braceBlock(src, braceAt);
}

const handPinBody = builderBody(table, 'handPin');
const pinNested = /ChallengeEntry|CHALLENGE_AWAIT|CHALLENGE_ENTRY/.test(handPinBody);
const pinCallAt = table.indexOf('this.handPin()');
const entryAt = table.indexOf('ChallengeEntry({');
const awaitAt = table.indexOf('ControlIds.CHALLENGE_AWAIT');
// Slice the ChallengeEntry mount Stack (nearest Stack({ before ChallengeEntry({).
const mountStackAt = entryAt >= 0 ? table.lastIndexOf('Stack({', entryAt) : -1;
const mountSlice = mountStackAt >= 0 && entryAt > mountStackAt
  ? table.slice(mountStackAt, Math.min(table.length, entryAt + 900))
  : '';
const siblingOverlay = pinCallAt >= 0 && entryAt > pinCallAt && awaitAt > entryAt &&
  handPinBody.length > 0 && !pinNested;
// 17 v0.2.1: must be self-front / ring–hand GAP — FAIL if ONLY BottomEnd with no seat-front lift.
const onlyBottomEnd = /alignContent:\s*Alignment\.BottomEnd/.test(mountSlice) &&
  !/challengeFrontLiftVp|handY|ring–hand|ring-hand|HAND_RING_GAP|self-front|身前|\.position\(/.test(mountSlice);
const selfFront = /challengeFrontLiftVp|handY|ring–hand|ring-hand|self-front|身前/.test(mountSlice) ||
  (table.includes('challengeFrontLiftVp') && /HAND_RING_GAP|ring–hand|self-front|身前/.test(table.slice(Math.max(0, entryAt - 400), entryAt + 200)));
if (onlyBottomEnd) {
  fail('C2 overlay: ChallengeEntry ONLY BottomEnd — need self-front / ring–hand GAP (17 v0.2.1)');
} else if (siblingOverlay && selfFront) {
  pass('C2 overlay: AwaitChallenge self-front sibling of handPin (ring–hand GAP, not BottomEnd-only)');
} else if (siblingOverlay) {
  fail('C2 overlay: sibling ok but missing self-front / ring–hand / handY / GAP band positioning');
} else {
  fail('entry missing or mounted in handPin');
}

if (fx.includes('AWAIT_MS: number = 10000') &&
    fx.includes('AWAIT_MS_MIN: number = 8000') &&
    fx.includes('AWAIT_MS_MAX: number = 12000') &&
    fx.includes('BTN_VP: number = 48') &&
    fx.includes('PASS_VP: number = 44') &&
    table.includes('onChallengeBelieve(true)') &&
    (table.includes('AwaitChallenge timeout Believe') || table.includes('AwaitChallenge timeout Pass'))) {
  pass('C2-8: 10s (8～12) timeout → 相信 (Trust/Pass)');
} else {
  fail('timeout window / Believe missing');
}

if (table.includes('lastPlay.isFirstOfRound') &&
    table.includes('shouldShowChallengeEntry') &&
    table.includes('actorEmptied') &&
    table.includes('this.playFlyOn || this.confirmBusy || this.roundWinOn')) {
  pass('C2-1/4/5: first-hand / emptied / fly+busy gates');
} else {
  fail('entry gates incomplete');
}

if (table.includes('snap.lastPlay.playId') &&
    table.includes('challengeTargetPlayId') &&
    table.includes('intentChallenge()') &&
    pile.includes('art_card_back') &&
    !pile.includes('Text(') &&
    !table.includes('revealOpen = true')) {
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
    table.includes('onChallengeDoubt') &&
    table.includes('onChallengeBelieve') &&
    !table.includes('onChallengeTrue') &&
    !table.includes('onChallengeFalse') &&
    !table.includes('onChallengePass')) {
  pass('listen: enter on AwaitChallenge; commit SFX only on 质疑');
} else {
  fail('enter/commit SFX wiring (doubt/believe)');
}

const believeFn = table.split('private onChallengeBelieve')[1] || '';
const believeBody = believeFn.split('private ', 1)[0];
if (believeBody.includes('closeChallengeEntry(true)') &&
    !believeBody.includes('playChallenge') &&
    !believeBody.includes('CARD_FLIP') &&
    !believeBody.includes('playPlayLaunch') &&
    !believeBody.includes('playPlayLand') &&
    !believeBody.includes('beginRevealAfterAck')) {
  pass('C2-2 listen: 相信 silent + no reveal (no enter/commit/flip/launch/land)');
} else {
  fail('Believe is not silent Trust/Pass');
}

const doubtFn = table.split('private onChallengeDoubt')[1] || '';
const doubtBody = doubtFn.split('private commitChallenge')[0];
if (doubtBody.includes('this.commitChallenge()') && !doubtBody.includes('closeChallengeEntry(true)')) {
  pass('质疑 = ChallengeCommit (not disguised Believe / own play)');
} else {
  fail('质疑 still unloads to own play / Believe');
}

const commitFn = table.split('private commitChallenge')[1] || '';
const commitBody = commitFn.split('private rejectChallengeRestore')[0];
// F2: closeChallengeEntryChrome() preferred — closeChallengeEntry(false) wiped dealer/NPC broadcast.
const closedEntry = commitBody.includes('closeChallengeEntryChrome()') ||
  commitBody.includes('closeChallengeEntry(false)');
if (commitBody.includes('playChallengeCommit') &&
    commitBody.includes('intentChallenge') &&
    commitBody.includes('rejectChallengeRestore') &&
    commitBody.includes('beginRevealAfterAck') &&
    closedEntry &&
    !commitBody.includes('closeChallengeEntry(true)') &&
    !commitBody.includes('LbRouter.toChallenge') &&
    !commitBody.includes('revealOpen')) {
  pass('质疑 ChallengeCommit → ACK → beginRevealAfterAck; no local-first / old page');
} else {
  fail('ChallengeCommit ACK path');
}

if (table.includes('this.commitChallenge()') &&
    table.includes('onChallengeDoubt') &&
    !table.includes('this.commitChallenge(true)') &&
    !table.includes('this.commitChallenge(false)')) {
  pass('质疑 alone calls commitChallenge; 相信 does not');
} else {
  fail('commitChallenge still true/false dual or missing doubt');
}

// Ban entry primary true/false/pass on Table mount
const entryMount = table.slice(
  Math.max(0, table.indexOf('ChallengeEntry({')),
  Math.max(0, table.indexOf('ChallengeEntry({')) + 500
);
if (entryMount.includes('onDoubt') && entryMount.includes('onBelieve') &&
    !entryMount.includes('onTrue') && !entryMount.includes('onFalse') &&
    !entryMount.includes('onPass')) {
  pass('Table ChallengeEntry mount wires onDoubt/onBelieve only');
} else {
  fail('Table still mounts true/false/pass entry handlers');
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
const audioCommitBody = commitPlay.split('static playStyleAtPeak')[0];
if (enterBody.includes('CHALLENGE_ENTER') && !enterBody.includes('PLAY_LAUNCH') &&
    !enterBody.includes('CARD_FLIP') &&
    audioCommitBody.includes('CHALLENGE_COMMIT') && !audioCommitBody.includes('PLAY_LAND')) {
  pass('enter/commit methods do not impersonate flip/launch/land');
} else {
  fail('challenge SFX methods reuse frozen slots');
}


// Rebuild: hang slots for dealer enter + NPC bubble
const stringsHang = src('entry/src/main/resources/base/element/string.json');
if (stringsHang.includes('lb_str_challenge_dealer_enter') &&
    stringsHang.includes('lb_str_npc_challenge_thinking') &&
    stringsHang.includes('lb_str_npc_challenge_true') &&
    stringsHang.includes('lb_str_npc_challenge_false') &&
    stringsHang.includes('lb_str_npc_challenge_doubt') &&
    stringsHang.includes('lb_str_npc_challenge_believe') &&
    table.includes('challengeDealerEnter') &&
    table.includes('npcChallengeBubble') &&
    table.includes('readNpcChallengeDoubt') &&
    ids.includes('CHALLENGE_DEALER_ENTER') &&
    ids.includes('NPC_CHALLENGE_BUBBLE')) {
  pass('hang: dealer_enter + npc doubt/believe (+ true/false kept) and Table stubs');
} else {
  fail('challenge dealer/npc hang slots missing');
}

// Rebuild: syncChallengeEntry on land so 质疑|相信 show when canChallenge
const landFn = table.split('private onPlayLanded')[1] || '';
const landBody = landFn.split('private onPlayRollback')[0] || '';
if (landBody.includes('this.syncChallengeEntry(snap)')) {
  pass('onPlayLanded syncs AwaitChallenge entry for challenger keys');
} else {
  fail('onPlayLanded missing syncChallengeEntry');
}

// Candle lives primary: do not make revolver cylinder the lives primary read in Table
if (!/revolver.*lives.?primary|cylinder.*lives.?primary|lives.?primary.*cylinder/i.test(table)) {
  pass('lives UI: no revolver-cylinder-as-lives-primary rewrite');
} else {
  fail('revolver cylinder promoted to lives primary');
}

console.log(process.exitCode ? 'challenge-await check FAILED' : 'challenge-await check OK');
