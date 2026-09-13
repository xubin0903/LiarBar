#!/usr/bin/env node
/**
 * Spec check for 16 v0.1.3 play-fly + front pile (Section 1).
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
const engine = src('entry/src/main/ets/engine/MatchEngine.ets');
const types = src('entry/src/main/ets/engine/MatchTypes.ets');
const director = src('entry/src/main/ets/common/MatchDirector.ets');
const layout = src('entry/src/main/ets/features/table/TableLayout.ets');
const flyFx = src('entry/src/main/ets/features/table/PlayFlyFx.ets');
const playFly = src('entry/src/main/ets/features/table/components/PlayFly.ets');
const pile = src('entry/src/main/ets/features/table/components/PlayFrontPile.ets');
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
    table.includes('floorHandPad') &&
    !table.includes('this.padB = this.padB +')) {
  pass('padB stays avoidArea inset');
} else {
  fail('padB path rewritten');
}

if (flyFx.includes('FLY_MS: number = 320') &&
    flyFx.includes('EDGE_VP: number = 10') &&
    flyFx.includes('ANG_TWO: number = 8') &&
    flyFx.includes('ANG_THREE: number = 12')) {
  pass('16 §2 numbers: 320ms / ±8 / −12·0·+12 / 10vp');
} else {
  fail('PlayFlyFx numbers drifted');
}

if (existsSync(join(root, 'entry/src/main/ets/features/table/components/PlayFly.ets')) &&
    existsSync(join(root, 'entry/src/main/ets/features/table/components/PlayFrontPile.ets')) &&
    playFly.includes("PLAY_FLY") &&
    pile.includes("PLAY_FRONT_PILE") &&
    pile.includes('HitTestMode.None') &&
    !pile.includes('Text(')) {
  pass('lb_cmp_play_fly / lb_cmp_play_front_pile exist; pile HitTest None, no count Text');
} else {
  fail('play fly / front pile components');
}

const shadowProp = /@(Prop|State)\s+(scale|opacity|rotate|translate|enabled)\b/;
if (playFly.includes('@Prop flyScale') &&
    table.includes('flyScale: this.playFlyScale') &&
    playFly.includes('.scale({ x: this.flyScale, y: this.flyScale })') &&
    !shadowProp.test(playFly) &&
    !shadowProp.test(pile)) {
  pass('PlayFly.flyScale (not CustomComponent.scale); no ArkUI shadow props');
} else {
  fail('PlayFly/PlayFrontPile shadows CustomComponent (scale/opacity/rotate/translate/enabled)');
}

if (ids.includes("PLAY_FLY: string = 'lb_cmp_play_fly'") &&
    ids.includes("PLAY_FRONT_PILE: string = 'lb_cmp_play_front_pile'") &&
    ids.includes("PLAY_LAUNCH: string = 'lb_sfx_play_launch'") &&
    ids.includes("PLAY_LAND: string = 'lb_sfx_play_land'")) {
  pass('Ids: fly / pile / launch / land');
} else {
  fail('Ids missing play-fly slots');
}

if (strings.includes('lb_str_play_rollback') &&
    strings.includes('出牌未生效 / 张数已纠正')) {
  pass('lb_str_play_rollback = 出牌未生效 / 张数已纠正');
} else {
  fail('rollback string key');
}

if (audio.includes('sfx_play_launch.wav') &&
    audio.includes('sfx_play_land.wav') &&
    audio.includes('playPlayLaunch') &&
    audio.includes('playPlayLand') &&
    !audio.includes('sfx_card_flip')) {
  pass('TableAudio dual slots launch/land (no flip file)');
} else {
  fail('TableAudio launch/land wiring');
}

const launch = 'entry/src/main/resources/rawfile/audio/sfx/sfx_play_launch.wav';
const land = 'entry/src/main/resources/rawfile/audio/sfx/sfx_play_land.wav';
if (existsSync(join(root, launch)) && statSync(join(root, launch)).size >= 7000 &&
    existsSync(join(root, land)) && statSync(join(root, land)).size >= 9000) {
  pass('existing launch/land wavs present (not invented)');
} else {
  fail('launch/land wav missing');
}

if (table.includes('beginHumanPlay') &&
    table.includes('TableAudio.playPlayLaunch()') &&
    table.includes('kickPlayFly') &&
    table.includes('submitPlay') &&
    table.includes('onPlayLanded') &&
    table.includes('TableAudio.playPlayLand()') &&
    table.includes('onPlayRollback') &&
    table.includes('rollbackLastPlay')) {
  pass('confirm → launch SFX + fly + submit; land SFX + pile; rollback hook');
} else {
  fail('optimistic fly path incomplete');
}

const beginFn = table.split('private beginHumanPlay')[1] || '';
const beginBody = beginFn.split('private openSecondaryPlaySheet')[0] || beginFn.slice(0, 1800);
if (beginBody.includes('playPlayLaunch') &&
    beginBody.includes('kickPlayFly') &&
    beginBody.includes('submitPlay') &&
    !beginBody.includes('this.pull()')) {
  pass('submit on confirm (same frame as fly); no pull-wait-for-ack');
} else {
  fail('confirm path still waits / skips fly');
}

if (table.includes('private confirmTablePlay') &&
    table.includes('this.beginHumanPlay(PlayStyle.SOFT, -1)') &&
    table.includes('this.beginHumanPlay(style, this.namedSeatId)')) {
  pass('sheet + table confirm share beginHumanPlay (no instant-commit dual track)');
} else {
  fail('old instant commit path still around');
}

if (table.includes('this.hearLastPlay(snap)') &&
    table.includes('Call from onPlayLanded only') &&
    !table.includes('this.hearLastPlay(snap);\n    const called')) {
  pass('hearLastPlay rebound to land');
} else {
  fail('hearLastPlay still on commit/pull');
}

if (table.includes('rankSettleOn') &&
    table.includes('ControlIds.RANK_SETTLE') &&
    table.includes('emptyOrder') &&
    table.includes('challengeEnabled = false') &&
    !table.includes('LbRouter.toChallenge()')) {
  pass('hand==0 RankSettle gate; old toChallenge frozen');
} else {
  fail('RankSettle / challenge freeze');
}

if (table.includes('maybeOtherPlayFly') &&
    table.includes('beginOtherPlay') &&
    director.includes('playBusy')) {
  pass('AI/other seats share launch→land; director playBusy gates second hand');
} else {
  fail('AI fly or playBusy missing');
}

if (engine.includes('rollbackLastPlay') &&
    engine.includes('emptyOrder') &&
    types.includes('emptyOrder: number[]') &&
    engine.includes('this.emptyOrder[i] === this.lastPlay.actorSeatId')) {
  pass('engine emptyOrder + rollbackLastPlay; emptied lastPlay not challengeable');
} else {
  fail('engine emptyOrder / rollback');
}

if (table.includes('this.playFlyOn = true') &&
    table.includes('this.flyOn = true') &&
    table.includes('DealAudio.playDealCard()')) {
  pass('playFlyOn is new overlay; deal flyOn stays on deal path');
} else {
  fail('play fly reused deal flyOn or deal path broken');
}

if (table.includes('playPlayLaunch') && table.includes('playCardFlip')) {
  // flip still used for 15 select — must not appear in play-fly helpers
}
const landFn = table.split('private onPlayLanded')[1] || '';
const launchFn = table.split('private kickPlayFly')[1] || '';
if (landFn.includes('CARD_FLIP') || launchFn.includes('CARD_FLIP') ||
    landFn.includes('playCardFlip') || launchFn.includes('playCardFlip')) {
  fail('play fly uses flip slot');
} else {
  pass('play fly does not call flip slot');
}

if (table.includes('PlayFlyFx.FLY_MS') && table.includes('Curve.EaseOut')) {
  pass('fly window 320ms ease-out');
} else {
  fail('fly duration / curve');
}

console.log(process.exitCode ? 'play-fly check FAILED' : 'play-fly check OK');
