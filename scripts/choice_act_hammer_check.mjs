#!/usr/bin/env node
/**
 * Spec check: 质疑/相信桌槌 + 调试二键 (#236 / 质疑相信-桌槌表现).
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
const audio = src('entry/src/main/ets/features/table/TableAudio.ets');
const flyFx = src('entry/src/main/ets/features/table/PlayFlyFx.ets');
const layout = src('entry/src/main/ets/features/table/TableLayout.ets');
const hammer = src('entry/src/main/ets/features/table/components/HammerFx.ets');
const choiceFx = src('entry/src/main/ets/features/table/ChoiceActFx.ets');
const engine = src('entry/src/main/ets/engine/MatchEngine.ets');

if (layout.includes('HAND_RING_GAP_PCT: number = 24')) {
  pass('HAND_RING_GAP_PCT frozen at 24');
} else {
  fail('HAND_RING_GAP_PCT changed');
}

const drawN = Number((/DRAW_TO_FLIP_MS:\s*number\s*=\s*(\d+)/.exec(flyFx) || [])[1] || 0);
const holdN = Number((/REVEAL_HOLD_MS:\s*number\s*=\s*(\d+)/.exec(flyFx) || [])[1] || 0);
if (drawN === 1000 && holdN === 3000 &&
    !choiceFx.includes('DRAW_TO_FLIP_MS') &&
    !choiceFx.includes('REVEAL_HOLD_MS')) {
  pass(`open-card gates untouched DRAW_TO_FLIP=${drawN} REVEAL_HOLD=${holdN}`);
} else {
  fail(`open-card gates drifted draw=${drawN} hold=${holdN}`);
}

if (ids.includes("CHOICE_ACT: string = 'lb_cmp_choice_act'") &&
    ids.includes("DEBUG_HAMMER_DOUBT: string = 'lb_btn_debug_hammer_doubt'") &&
    ids.includes("DEBUG_HAMMER_BELIEVE: string = 'lb_btn_debug_hammer_believe'") &&
    ids.includes("HAMMER_HIT: string = 'lb_sfx_hammer_hit'") &&
    ids.includes("HAMMER_REST: string = 'lb_sfx_hammer_rest'") &&
    ids.includes("FX_MALLET: string = 'art_fx_mallet'")) {
  pass('ids: choice act layer + debug hammer + sfx + art_fx_mallet reserved');
} else {
  fail('locked hammer ids missing');
}

if (strings.includes('lb_str_debug_hammer_doubt') &&
    strings.includes('调试·质疑锤') &&
    strings.includes('lb_str_debug_hammer_believe') &&
    strings.includes('调试·相信锤') &&
    strings.includes('lb_str_challenge_no_act') &&
    strings.includes('lb_str_debug_hammer_has_logic')) {
  pass('string keys: debug labels + S19-1/6');
} else {
  fail('debug / S19 strings missing');
}

if (table.includes('choiceActLayer()') &&
    table.includes('HammerFx({') &&
    table.includes('ControlIds.CHOICE_ACT') &&
    table.includes('HitTestMode.None') &&
    hammer.includes('HitTestMode.None') &&
    hammer.includes('art_fx_mallet')) {
  pass('HammerFx hang point on Table choiceActLayer (HitTest None)');
} else {
  fail('HammerFx hang point missing');
}

if (table.includes('ControlIds.DEBUG_HAMMER_DOUBT') &&
    table.includes('ControlIds.DEBUG_HAMMER_BELIEVE') &&
    table.includes('onDebugHammerDoubt') &&
    table.includes('onDebugHammerBelieve') &&
    table.includes("id(ControlIds.DEBUG_HAMMER_DOUBT)") &&
    table.includes("id(ControlIds.DEBUG_HAMMER_BELIEVE)")) {
  pass('debug panel two hammer buttons wired');
} else {
  fail('debug hammer buttons missing');
}

const doubtFn = table.split('private onDebugHammerDoubt')[1] || '';
const doubtBody = doubtFn.split('private ', 1)[0];
const believeFn = table.split('private onDebugHammerBelieve')[1] || '';
const believeBody = believeFn.split('private ', 1)[0];
const debugBanned = ['intentChallenge', 'beginRevealAfterAck', 'debugDecLife',
  'engine.skip', 'this.pull(', 'chooseEmptyYou', 'chooseEmptyShangjia'];
const debugClean = [doubtBody, believeBody].every((body) =>
  body.includes('playChoiceAct') &&
  body.includes('TableCompass.BOTTOM') &&
  debugBanned.every((ban) => !body.includes(ban)));
if (debugClean) {
  pass('debug hammer: local seat only, zero business');
} else {
  fail('debug hammer leaked engine / reveal / lives');
}

if (table.includes('playChoiceActForChallenge') &&
    table.includes('this.playChoiceActForChallenge(after)') &&
    table.includes('this.playChoiceActForChallenge(snap)') &&
    table.includes('ChoiceActFx.KIND_DOUBT') &&
    table.includes('ChoiceActFx.KIND_BELIEVE') &&
    table.includes('maybePlayChoiceActTrust')) {
  pass('formal ACK: ChallengeCommit + Trust + AI same playChoiceAct');
} else {
  fail('formal hammer broadcast incomplete');
}

const formalBelieve = table.split('private onChallengeBelieve')[1] || '';
const formalBelieveBody = formalBelieve.split('private ', 1)[0];
if (formalBelieveBody.includes('playChoiceAct') &&
    formalBelieveBody.includes('KIND_BELIEVE') &&
    !formalBelieveBody.includes('beginRevealAfterAck') &&
    !formalBelieveBody.includes('playPlayLaunch') &&
    !formalBelieveBody.includes('playRevealFlip')) {
  pass('formal Trust plays rest hammer; no reveal/launch/flip');
} else {
  fail('formal Trust hammer path wrong');
}

const beginFn = table.split('private beginRevealAfterAck')[1] || '';
const beginBody = beginFn.split('private ranksCsv')[0] || '';
if (beginBody.includes('armChoiceActAutoHide') &&
    beginBody.includes('PlayFlyFx.DRAW_TO_FLIP_MS') &&
    beginBody.includes('PlayFlyFx.REVEAL_HOLD_MS') &&
    /DRAW_TO_FLIP_MS[\s\S]{0,400}REVEAL_HOLD_MS[\s\S]{0,200}resetRevealUi/.test(beginBody) &&
    !beginBody.includes('DRAW_TO_FLIP_MS =') &&
    !beginBody.includes('REVEAL_HOLD_MS =')) {
  pass('reveal 起势收锤 decoupled; 1000/3000 nest unchanged');
} else {
  fail('reveal hammer retract coupled or gate nest broken');
}

const hitFn = audio.split('static playHammerHit')[1] || '';
const hitBody = hitFn.split('static playHammerRest')[0];
const restFn = audio.split('static playHammerRest')[1] || '';
const restBody = restFn.split('static playStyleAtPeak')[0];
if (audio.includes('playOptional') &&
    audio.includes('loadOptional') &&
    audio.includes('no-op (slot empty)') &&
    hitBody.includes('playOptional') &&
    restBody.includes('playOptional') &&
    !hitBody.includes('playPlayLaunch') &&
    !hitBody.includes('playRevealFlip') &&
    !hitBody.includes('playChallengeCommit') &&
    !restBody.includes('playPlayLaunch') &&
    !restBody.includes('playRevealFlip')) {
  pass('SFX: hammer hit/rest optional no-op; no flip/launch/commit impersonation');
} else {
  fail('hammer SFX missing or impersonates old slots');
}

if (choiceFx.includes('RAISE_ROT') &&
    choiceFx.includes('REST_ROT') &&
    choiceFx.includes('REST_SLOT_X') &&
    table.includes('animateTo') &&
    table.includes('choiceActRot') &&
    table.includes('choiceActLift')) {
  pass('smash lift/rotate vs rest flat slot (animateTo)');
} else {
  fail('hammer poses incomplete');
}

if (!engine.includes('playChoiceAct') &&
    !engine.includes('ChoiceActFx') &&
    !engine.includes('HammerFx')) {
  pass('engine rules untouched (no hammer in MatchEngine)');
} else {
  fail('hammer leaked into engine');
}

console.log('');
console.log(process.exitCode ? 'choice_act_hammer_check FAILED' : 'choice_act_hammer_check OK');
