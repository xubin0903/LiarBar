#!/usr/bin/env node
/**
 * Spec check: 四座常驻桌槌 + 质疑就地砸 + 相信静置 (#243 v0.2).
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
    ids.includes("FX_MALLET: string = 'art_fx_mallet'") &&
    ids.includes("FX_MALLET_UP: string = 'art_fx_mallet_up'") &&
    ids.includes("FX_MALLET_HIT: string = 'art_fx_mallet_hit'") &&
    !ids.includes('P0 geometry')) {
  pass('ids: choice act layer + debug hammer + sfx + mallet frames');
} else {
  fail('locked hammer ids missing');
}

const actHold = Number((/static readonly HOLD_MS:\s*number\s*=\s*(\d+)/.exec(choiceFx) || [])[1] || 0);
if (actHold >= 800 &&
    (choiceFx.includes('已换绑 #238') || choiceFx.includes('#248')) &&
    !choiceFx.includes('DRAW_TO_FLIP_MS') &&
    !choiceFx.includes('REVEAL_HOLD_MS')) {
  pass(`HOLD_MS=${actHold} (≥800 / 0.8～1.2s); #238/#248 mallet bind; open-card gates absent`);
} else {
  fail(`HOLD_MS/bind comment drifted hold=${actHold}`);
}

if (strings.includes('lb_str_debug_hammer_doubt') &&
    strings.includes('调试·质疑锤') &&
    strings.includes('lb_str_debug_hammer_believe') &&
    strings.includes('调试·相信锤') &&
    strings.includes('lb_str_challenge_no_act') &&
    strings.includes('lb_str_debug_hammer_has_logic') &&
    strings.includes('lb_str_hammer_on_cards') &&
    strings.includes('锤压在牌上') &&
    strings.includes('lb_str_believe_hammer_moves') &&
    strings.includes('相信还在动') &&
    strings.includes('lb_str_hammer_smash_on_pool') &&
    strings.includes('砸点贴牌心') &&
    strings.includes('相信无常驻锤')) {
  pass('string keys: debug labels + S19-1/6 + S19-7/8/9');
} else {
  fail('debug / S19 strings missing');
}

if (table.includes('choiceActLayer()') &&
    table.includes('residentMallet(TableCompass.BOTTOM)') &&
    table.includes('residentMallet(TableCompass.RIGHT)') &&
    table.includes('residentMallet(TableCompass.TOP)') &&
    table.includes('residentMallet(TableCompass.LEFT)') &&
    table.includes('visible: true') &&
    table.includes('ControlIds.CHOICE_ACT') &&
    table.includes('HitTestMode.None') &&
    hammer.includes('HitTestMode.None') &&
    hammer.includes('seatId')) {
  pass('four resident HammerFx hang points (HitTest None, always visible)');
} else {
  fail('resident four-mallet hang point missing');
}

const hammerCode = hammer.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
if (/\$r\('app\.media\.art_fx_mallet'\)/.test(hammerCode) &&
    hammerCode.includes("$r('app.media.art_fx_mallet_up')") &&
    hammerCode.includes("$r('app.media.art_fx_mallet_hit')") &&
    hammerCode.includes('Image(') &&
    !hammerCode.includes('tavern_brass') &&
    !hammerCode.includes('tavern_mute')) {
  pass('HammerFx binds #238 art_fx_mallet frames (not geometry)');
} else {
  fail('HammerFx still geometry or missing art_fx_mallet bind');
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
const doubtClean = doubtBody.includes('playChoiceAct') &&
  doubtBody.includes('TableCompass.BOTTOM') &&
  doubtBody.includes('KIND_DOUBT') &&
  debugBanned.every((ban) => !doubtBody.includes(ban));
const believeClean = !believeBody.includes('playChoiceAct') &&
  !believeBody.includes('animateTo') &&
  debugBanned.every((ban) => !believeBody.includes(ban));
if (doubtClean && believeClean) {
  pass('debug: doubt local smash; believe no-anim; both zero business');
} else {
  fail('debug hammer leaked engine / reveal / believe still animates');
}

if (table.includes('playChoiceActForChallenge') &&
    table.includes('this.playChoiceActForChallenge(after)') &&
    table.includes('this.playChoiceActForChallenge(snap)') &&
    table.includes('ChoiceActFx.KIND_DOUBT') &&
    table.includes('maybePlayChoiceActTrust')) {
  pass('formal ACK: ChallengeCommit still playChoiceAct smash');
} else {
  fail('formal doubt hammer broadcast incomplete');
}

const formalBelieve = table.split('private onChallengeBelieve')[1] || '';
const formalBelieveBody = formalBelieve.split('private ', 1)[0];
const trustFn = table.split('private maybePlayChoiceActTrust')[1] || '';
const trustBody = trustFn.split('private ', 1)[0];
if (!formalBelieveBody.includes('playChoiceAct') &&
    !formalBelieveBody.includes('KIND_BELIEVE') &&
    !formalBelieveBody.includes('beginRevealAfterAck') &&
    !formalBelieveBody.includes('playPlayLaunch') &&
    !formalBelieveBody.includes('playRevealFlip') &&
    !formalBelieveBody.includes('playHammerRest') &&
    !trustBody.includes('playChoiceAct') &&
    !trustBody.includes('KIND_BELIEVE')) {
  pass('S19-8: formal Trust / AI believe do not play hammer motion');
} else {
  fail('formal Trust still plays rest/believe hammer');
}

const playFn = table.split('private playChoiceAct(')[1] || '';
const playBody = playFn.split('private retractChoiceAct')[0] || '';
if (playBody.includes('kind !== ChoiceActFx.KIND_DOUBT') &&
    playBody.includes('RAISE_ROT') &&
    playBody.includes('DOWN_ROT') &&
    playBody.includes('this.choiceActRot = 0') &&
    playBody.includes('this.choiceActLift = 0') &&
    !playBody.includes('playHammerRest') &&
    !playBody.includes('REST_SLOT') &&
    !playBody.includes('poolCenterOverlay')) {
  pass('doubt: in-place lift/smash/return-rest; no rest-slot / pool fly');
} else {
  fail('playChoiceAct smash path wrong');
}

const beginFn = table.split('private beginRevealAfterAck')[1] || '';
const beginBody = beginFn.split('private ranksCsv')[0] || '';
if (beginBody.includes('PlayFlyFx.DRAW_TO_FLIP_MS') &&
    beginBody.includes('PlayFlyFx.REVEAL_HOLD_MS') &&
    /DRAW_TO_FLIP_MS[\s\S]{0,400}REVEAL_HOLD_MS[\s\S]{0,200}resetRevealUi/.test(beginBody) &&
    !beginBody.includes('DRAW_TO_FLIP_MS =') &&
    !beginBody.includes('REVEAL_HOLD_MS =') &&
    !beginBody.includes('armChoiceActAutoHide')) {
  pass('reveal 1000/3000 nest unchanged; smash no longer hides resident mallets');
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

const hitWav = 'entry/src/main/resources/rawfile/audio/sfx/sfx_hammer_hit.wav';
const restWav = 'entry/src/main/resources/rawfile/audio/sfx/sfx_hammer_rest.wav';
if (existsSync(join(root, hitWav)) && statSync(join(root, hitWav)).size >= 8000 &&
    existsSync(join(root, restWav)) && statSync(join(root, restWav)).size >= 4000 &&
    audio.includes("PATH_HAMMER_HIT: string = 'audio/sfx/sfx_hammer_hit.wav'") &&
    audio.includes("PATH_HAMMER_REST: string = 'audio/sfx/sfx_hammer_rest.wav'") &&
    audio.includes('loadOptional(PATH_HAMMER_HIT)') &&
    audio.includes('loadOptional(PATH_HAMMER_REST)')) {
  pass('hammer SFX rawfile present; TableAudio loadOptional');
} else {
  fail('hammer SFX rawfile or loadOptional missing');
}

const posIdx = table.indexOf('private choiceActPosOf');
const posEnd = table.indexOf('private choiceActFallbackPlayH');
const posBody = posIdx >= 0 && posEnd > posIdx ? table.slice(Math.max(0, posIdx - 420), posEnd) : '';
const selfDy = Number((/SELF_ANCHOR_DY:\s*number\s*=\s*(-?\d+)/.exec(choiceFx) || [])[1] || 0);
const leftDx = Number((/LEFT_ANCHOR_DX:\s*number\s*=\s*(-?\d+)/.exec(choiceFx) || [])[1] || 0);
const rightDx = Number((/RIGHT_ANCHOR_DX:\s*number\s*=\s*(-?\d+)/.exec(choiceFx) || [])[1] || 0);
const topDy = Number((/TOP_ANCHOR_DY:\s*number\s*=\s*(-?\d+)/.exec(choiceFx) || [])[1] || 99);
if (choiceFx.includes('SELF_ANCHOR_DX') &&
    choiceFx.includes('LEFT_ANCHOR_DX') &&
    choiceFx.includes('RIGHT_ANCHOR_DX') &&
    choiceFx.includes('TOP_ANCHOR_DX') &&
    !choiceFx.includes('REST_SLOT_X') &&
    !choiceFx.includes('INWARD_PCT') &&
    !choiceFx.includes('SELF_SIDE_VP') &&
    selfDy < 0 &&
    leftDx < 0 &&
    rightDx > 0 &&
    topDy <= 8 &&
    posBody.includes('TableCompass.BOTTOM') &&
    posBody.includes('TableCompass.LEFT') &&
    posBody.includes('TableCompass.RIGHT') &&
    posBody.includes('SELF_ANCHOR_DX') &&
    posBody.includes('LEFT_ANCHOR_DX') &&
    posBody.includes('RIGHT_ANCHOR_DX') &&
    posBody.includes('TOP_ANCHOR_DX') &&
    posBody.includes('seatWs[seatId] + ChoiceActFx.RIGHT_ANCHOR_DX') &&
    !posBody.includes('seatWs[seatId] + ChoiceActFx.LEFT_ANCHOR_DX') &&
    posBody.includes('lb_cmp_hand') &&
    (posBody.includes('avatar') || posBody.includes('头像')) &&
    !posBody.includes('challengeFrontLiftVp') &&
    !posBody.includes('poolCenterOverlay') &&
    !posBody.includes('REST_SLOT') &&
    !posBody.includes('INWARD_PCT')) {
  pass('S19-7/9: four distinct avatar-side anchors; no hand belt / pool heart');
} else {
  fail('choiceActPosOf still shared-slot or overlaps hand/pool');
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
