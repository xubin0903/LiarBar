#!/usr/bin/env node
/**
 * Spec check: #168 EmptySafe you/prev chrome + P2 废左轮 Foley cleanup (23 §5).
 * Media keys present; TableAudio / Ids / wav MUST NOT keep revolver SFX stubs.
 * Table MUST NOT call playRevolver*. Cloud has no DevEco — not CompileArkTS.
 * 合入 ≠ 终验.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

const bannedWav = [
  'sfx_revolver_click.wav',
  'sfx_revolver_shot.wav',
  'sfx_revolver_spin.wav',
];
const sfxAbs = join(root, sfxDir);
const present = existsSync(sfxAbs) ? readdirSync(sfxAbs) : [];
const hitWav = bannedWav.filter((n) => present.includes(n));
if (hitWav.length === 0) {
  pass('no sfx_revolver_*.wav on disk');
} else {
  fail(`revolver wav still present: ${hitWav.join(',')}`);
}

const artHits = ['art_revolver_cylinder.png', 'art_revolver_chamber_live.png',
  'art_revolver_chamber_spent.png'].filter((n) => existsSync(join(root, mediaDir, n)));
if (artHits.length === 0) {
  pass('no art_revolver_* media');
} else {
  fail(`art_revolver still present: ${artHits.join(',')}`);
}

if (!ids.includes('REVOLVER_CLICK') && !ids.includes('REVOLVER_SHOT') &&
    !ids.includes('REVOLVER_SPIN') && !ids.includes('lb_sfx_revolver_')) {
  pass('SfxIds has no revolver slots');
} else {
  fail('SfxIds still has revolver slots');
}

if (!audio.includes('sfx_revolver_') && !audio.includes('playRevolver') &&
    !audio.includes('PATH_REV_') && !audio.includes('VOL_REV_') &&
    !audio.includes('revClickId') && !audio.includes('pendingRevClick')) {
  pass('TableAudio has no revolver SFX path/method/pending');
} else {
  fail('TableAudio still has revolver SFX residue');
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

if (table.includes('onChooseEmptyYou') &&
    table.includes('onChooseEmptyShangjia') &&
    !table.includes('TableAudio.playRevolverClick()') &&
    !table.includes('TableAudio.playRevolverShot()') &&
    !table.includes('TableAudio.playRevolverSpin()') &&
    !table.includes('hearRevolverEvents') &&
    !table.includes('heardEventCount')) {
  pass('Table: EmptySafe you/prev; no revolver SFX / hearRevolverEvents');
} else {
  fail('Table still has revolver SFX call or hearRevolver residue');
}

if (layout.includes('HAND_RING_GAP_PCT: number = 24') &&
    table.includes('nextB: number = this.insetVp(box.bottom)') &&
    !table.includes('this.padB = this.padB +')) {
  pass('GAP/padB unchanged');
} else {
  fail('GAP/padB drifted');
}

if (!process.exitCode) {
  console.log('revolver_art_bind_check: all green (P2 no-revolver SFX)');
}
