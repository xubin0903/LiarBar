#!/usr/bin/env node
/**
 * Spec check: #168 art/SFX client bind (EmptySafe you/prev chrome + revolver Foley).
 * Media keys + wavs present; TableAudio slots; call sites; no flip/launch/land impersonation.
 * Cloud has no DevEco — not CompileArkTS. 合入 ≠ 终验.
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

const ids = src('entry/src/main/ets/common/Ids.ets');
const audio = src('entry/src/main/ets/features/table/TableAudio.ets');
const empty = src('entry/src/main/ets/features/table/components/EmptySafeEntry.ets');
const table = src('entry/src/main/ets/pages/Table.ets');
const layout = src('entry/src/main/ets/features/table/TableLayout.ets');

const mediaDir = 'entry/src/main/resources/base/media';
const sfxDir = 'entry/src/main/resources/rawfile/audio/sfx';

const mediaKeys = [
  'art_btn_challenge_you.png',
  'art_btn_challenge_you_on.png',
  'art_btn_challenge_prev.png',
  'art_btn_challenge_prev_on.png',
];
for (const name of mediaKeys) {
  const rel = join(mediaDir, name);
  if (existsSync(join(root, rel)) && statSync(join(root, rel)).size > 1000) {
    pass(`media ${name}`);
  } else {
    fail(`missing/small media ${name}`);
  }
}

const wavs = [
  ['sfx_revolver_click.wav', 5000],
  ['sfx_revolver_shot.wav', 7000],
  ['sfx_revolver_spin.wav', 7000],
];
for (const [name, min] of wavs) {
  const rel = join(sfxDir, name);
  if (existsSync(join(root, rel)) && statSync(join(root, rel)).size >= min) {
    pass(`wav ${name}`);
  } else {
    fail(`missing/small wav ${name}`);
  }
}

if (ids.includes("REVOLVER_CLICK: string = 'lb_sfx_revolver_click'") &&
    ids.includes("REVOLVER_SHOT: string = 'lb_sfx_revolver_shot'") &&
    ids.includes("REVOLVER_SPIN: string = 'lb_sfx_revolver_spin'")) {
  pass('SfxIds revolver click/shot/spin');
} else {
  fail('SfxIds missing revolver slots');
}

if (empty.includes("$r('app.media.art_btn_challenge_you')") &&
    empty.includes("$r('app.media.art_btn_challenge_you_on')") &&
    empty.includes("$r('app.media.art_btn_challenge_prev')") &&
    empty.includes("$r('app.media.art_btn_challenge_prev_on')") &&
    empty.includes('youPressed') &&
    empty.includes('prevPressed') &&
    empty.includes('ControlIds.CHALLENGE_YOU') &&
    empty.includes('ControlIds.CHALLENGE_PREV') &&
    empty.includes('ControlIds.EMPTY_TARGET_CHOICE')) {
  pass('EmptySafeEntry binds art_btn_challenge_you/prev ±_on pressed chrome');
} else {
  fail('EmptySafeEntry missing you/prev art ±_on wiring');
}

if (audio.includes('sfx_revolver_click.wav') &&
    audio.includes('sfx_revolver_shot.wav') &&
    audio.includes('sfx_revolver_spin.wav') &&
    audio.includes('playRevolverClick') &&
    audio.includes('playRevolverShot') &&
    audio.includes('playRevolverSpin')) {
  pass('TableAudio loads + plays revolver click/shot/spin');
} else {
  fail('TableAudio revolver wiring incomplete');
}

const clickBody = (audio.split('static playRevolverClick')[1] || '').split('static playRevolverShot')[0];
const shotBody = (audio.split('static playRevolverShot')[1] || '').split('static playRevolverSpin')[0];
const spinBody = (audio.split('static playRevolverSpin')[1] || '').split('static playStyleAtPeak')[0];
const frozen = ['CARD_FLIP', 'PLAY_LAUNCH', 'PLAY_LAND', 'sfx_card_flip', 'sfx_play_launch', 'sfx_play_land'];
function noImpersonate(label, body) {
  for (const bad of frozen) {
    if (body.includes(bad)) {
      fail(`${label} impersonates ${bad}`);
      return false;
    }
  }
  return true;
}
if (noImpersonate('playRevolverClick', clickBody) &&
    noImpersonate('playRevolverShot', shotBody) &&
    noImpersonate('playRevolverSpin', spinBody) &&
    clickBody.includes('REVOLVER_CLICK') &&
    shotBody.includes('REVOLVER_SHOT') &&
    spinBody.includes('REVOLVER_SPIN')) {
  pass('revolver methods do not impersonate flip/launch/land');
} else {
  fail('revolver SFX methods reuse frozen slots or wrong ids');
}

if (table.includes('TableAudio.playRevolverClick()') &&
    table.includes('onChooseEmptyYou') &&
    table.includes('onChooseEmptyShangjia') &&
    table.includes('playRevolverClick')) {
  pass('Table: click on you/prev press');
} else {
  fail('Table missing click hangpoint on you/prev');
}

if (table.includes('hearRevolverEvents') &&
    table.includes('EventKind.SHOOT') &&
    table.includes('playRevolverShot') &&
    table.includes('EventKind.COLLECT_REDEAL') &&
    table.includes('playRevolverSpin')) {
  pass('Table: shot on SHOOT / spin on COLLECT_REDEAL');
} else {
  fail('Table missing shot/spin eventLog hangpoints');
}

if (layout.includes('HAND_RING_GAP_PCT: number = 24') &&
    table.includes('nextB: number = this.insetVp(box.bottom)') &&
    !table.includes('this.padB = this.padB +')) {
  pass('GAP/padB unchanged');
} else {
  fail('GAP/padB drifted');
}

if (!process.exitCode) {
  console.log('revolver_art_bind_check: all green');
}
