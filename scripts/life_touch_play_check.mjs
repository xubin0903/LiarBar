#!/usr/bin/env node
/**
 * Spec check for docs 14 (life candles) + 15 (hand touch play).
 * Cloud has no DevEco — this is not CompileArkTS. 合入 ≠ 终验.
 */
import { existsSync, readFileSync } from 'node:fs';
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

function pngSize(rel) {
  const buf = readFileSync(join(root, rel));
  if (buf.toString('ascii', 1, 4) !== 'PNG') {
    return { w: 0, h: 0 };
  }
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const table = src('entry/src/main/ets/pages/Table.ets');
const face = src('entry/src/main/ets/features/table/CardFace.ets');
const life = src('entry/src/main/ets/features/table/LifeCandles.ets');
const player = src('entry/src/main/ets/features/table/SoundPlayer.ets');
const overlays = src('entry/src/main/ets/features/table/TableOverlays.ets');
const layout = src('entry/src/main/ets/features/table/TableLayout.ets');
const ids = src('entry/src/main/ets/common/Ids.ets');
const strings = src('entry/src/main/resources/base/element/string.json');
const floats = src('entry/src/main/resources/base/element/float.json');
const match = JSON.parse(src('entry/src/main/resources/rawfile/config/match_defaults.json'));
const engine = src('entry/src/main/ets/engine/MatchEngine.ets');
const MEDIA = 'entry/src/main/resources/base/media';

if (match.lives_default === 3) {
  pass('lives_default still 3');
} else {
  fail(`lives_default drifted to ${match.lives_default}`);
}
if (match.max_play_cards === 3 && match.min_play_cards === 1) {
  pass('max_play_cards=3 min_play_cards=1');
} else {
  fail('play-count lock drifted');
}

if (layout.includes('HAND_RING_GAP_PCT: number = 24')) {
  pass('HAND_RING_GAP_PCT frozen at 24');
} else {
  fail('HAND_RING_GAP_PCT changed');
}

if (table.includes('floorHandPad') && table.includes('nextB: number = this.insetVp(box.bottom)')) {
  pass('padB stays avoidArea inset (no floorHandPad inflate)');
} else {
  fail('padB path rewritten');
}

const idLocks = [
  "LIFE_SELF: string = 'lb_cmp_life_self'",
  "LIFE_SEAT_P1: string = 'lb_cmp_life_seat_p1'",
  "LIFE_SEAT_P2: string = 'lb_cmp_life_seat_p2'",
  "LIFE_SEAT_P3: string = 'lb_cmp_life_seat_p3'",
  "LIFE_PIP_0: string = 'lb_cmp_life_pip_0'",
  "TXT_LIFE_SELF: string = 'lb_txt_life_self'",
  "DEBUG_OPEN: string = 'lb_btn_debug_open'",
  "DEBUG_LIFE: string = 'lb_cmp_debug_life'",
  "DEBUG_LIFE_DEC: string = 'lb_btn_debug_life_dec'",
  "DEBUG_BGM_MUTE: string = 'lb_btn_debug_bgm_mute'",
  "DEBUG_SFX_PATH: string = 'lb_btn_debug_sfx_path'",
  "PLAY_CONFIRM_BAR: string = 'lb_cmp_play_confirm_bar'",
  "PLAY_CONFIRM: string = 'lb_btn_play_confirm'",
  "CARD_FLIP: string = 'lb_sfx_card_flip'",
  "CARD_SELECT: string = 'lb_sfx_card_select'",
  "PLAY_CONFIRM: string = 'lb_sfx_play_confirm'"
];
for (const line of idLocks) {
  if (ids.includes(line)) {
    pass(`Ids ${line.split(':')[0]}`);
  } else {
    fail(`missing Ids ${line}`);
  }
}

if (table.includes('ControlIds.LIFE_SELF') &&
    table.includes('ControlIds.LIFE_SEAT_P1') &&
    table.includes('LifeCandles') &&
    life.includes("app.media.art_life_candle_body") &&
    life.includes("app.media.art_life_candle_flame_full") &&
    life.includes("app.media.art_life_candle_full") &&
    !life.includes('ControlIds.TXT_LIFE_SELF') &&
    !table.includes('ControlIds.TXT_LIFE_SELF')) {
  pass('14/14b life group + layered candle; no face digit');
} else {
  fail('14 life wiring incomplete');
}

if (table.includes('ControlIds.DEBUG_OPEN') &&
    table.includes('ControlIds.DEBUG_LIFE') &&
    table.includes('ControlIds.DEBUG_LIFE_DEC') &&
    table.includes('debugLifeOpen') &&
    table.includes('debugLifePanel') &&
    table.includes('DebugBuild.lifeDecShown')) {
  pass('R-LIFE-5 debug open → panel → −1, DebugBuild gated');
} else {
  fail('R-LIFE-5 debug panel missing');
}

if (table.includes('ControlIds.DEBUG_BGM_MUTE') &&
    table.includes('onDebugBgmMute') &&
    table.includes('debugBgmMuted') &&
    table.includes('TableAudio.setBgmMuted') &&
    strings.includes('lb_str_debug_bgm_mute') &&
    strings.includes('lb_str_debug_bgm_on')) {
  pass('EXP 1: debug BGM mute toggle (lb_btn_debug_bgm_mute)');
} else {
  fail('EXP 1 debug BGM mute toggle missing');
}

const floatDoc = JSON.parse(floats);
const floatByName = Object.fromEntries(floatDoc.float.map((item) => [item.name, item.value]));
const wantFloat = {
  life_pip_self: '32vp',
  life_pip_self_small: '22vp',
  life_pip_seat: '21vp',
  life_pip_seat_small: '17vp',
  debug_open_size: '30vp'
};
for (const [name, value] of Object.entries(wantFloat)) {
  if (floatByName[name] === value) {
    pass(`float ${name}=${value}`);
  } else {
    fail(`float ${name}=${floatByName[name]} want ${value}`);
  }
}

if (table.includes('Text(this.life0)') || table.includes('Text(this.life1)')) {
  fail('bare lives Text still mounted (F14-1)');
} else {
  pass('bare lives Text removed');
}

if (life.includes('HitTestMode.None')) {
  pass('life pips are not buttons');
} else {
  fail('life group is clickable');
}

const candles = [
  ['art_life_candle_full', 128, 128, 2000],
  ['art_life_candle_hurt', 128, 128, 2000],
  ['art_life_candle_dying', 128, 128, 2000],
  ['art_life_candle_body', 128, 160, 2000],
  ['art_life_candle_flame_full', 128, 160, 400],
  ['art_life_candle_flame_hurt', 128, 160, 400],
  ['art_life_candle_flame_dying', 128, 160, 400],
  ['art_life_candle_flame_full_0', 128, 160, 400],
  ['art_life_candle_flame_full_1', 128, 160, 400],
  ['art_life_candle_flame_full_2', 128, 160, 400],
  ['art_life_candle_flame_full_3', 128, 160, 400],
  ['art_life_candle_extinguish_0', 128, 160, 400],
  ['art_life_candle_extinguish_1', 128, 160, 400],
  ['art_life_candle_extinguish_2', 128, 160, 400],
  ['art_life_candle_extinguish_3', 128, 160, 400],
  ['art_btn_play_confirm', 720, 144, 2000],
  ['art_btn_play_confirm_on', 720, 144, 2000]
];
for (const [stem, w, h, minBytes] of candles) {
  const rel = `${MEDIA}/${stem}.png`;
  if (!existsSync(join(root, rel))) {
    fail(`missing ${rel}`);
    continue;
  }
  const size = pngSize(rel);
  const bytes = readFileSync(join(root, rel)).length;
  if (size.w === w && size.h === h && bytes >= minBytes) {
    pass(`${stem} ${w}×${h} (${bytes}B, not stub)`);
  } else {
    fail(`${stem} ${size.w}×${size.h} ${bytes}B, want ${w}×${h} ≥${minBytes}B`);
  }
}

if (strings.includes('lb_str_play_illegal_count') &&
    strings.includes('张数不符') &&
    strings.includes('lb_str_play_not_your_turn') &&
    strings.includes('非己回合') &&
    strings.includes('lb_str_play_over_select') &&
    strings.includes('超选') &&
    strings.includes('"lb_str_play"') &&
    strings.includes('出牌')) {
  pass('15 play strings locked');
} else {
  fail('15 play strings missing');
}

if (table.includes('onCardTap') &&
    table.includes('TapGesture') &&
    table.includes('LongPressGesture') &&
    table.includes('duration: 200') &&
    table.includes('PlayConfirmBar') &&
    table.includes('confirmTablePlay') &&
    table.includes('clearHandSelect') &&
    table.includes('flashHint') &&
    table.includes('SfxIds.CARD_FLIP') &&
    table.includes('SfxIds.CARD_SELECT') &&
    table.includes('SfxIds.PLAY_CONFIRM')) {
  pass('15 tap-select + confirm bar + cancel + sfx slots');
} else {
  fail('15 table play path incomplete');
}

if (table.includes('do not auto-open on PLAY_REVEAL_SELF') &&
    table.includes('openSecondaryPlaySheet')) {
  pass('sheet demoted to secondary (no auto-open)');
} else {
  fail('sheet still auto-opens or secondary path missing');
}

if (overlays.includes('art_btn_play_confirm') &&
    overlays.includes('art_btn_play_confirm_on') &&
    overlays.includes('Color.Transparent') &&
    overlays.includes('ControlIds.PLAY_CONFIRM') &&
    overlays.includes('PLACEHOLDER')) {
  pass('15 confirm chrome is art_* + transparent Button (not system gray final)');
} else {
  fail('confirm bar missing art chrome / PLACEHOLDER');
}

if (face.includes('playFlip') && face.includes('playRaise') && face.includes('playFailShake') &&
    face.includes('CARD_RAISE_VP') && face.includes('CARD_FLIP_MS')) {
  pass('CardFace flip + raise + fail shake');
} else {
  fail('CardFace missing flip/raise/fail');
}

if (face.includes('kickFlipSfx') && face.includes('SoundPlayer.playCardFlip') &&
    face.includes('this.kickFlipSfx()')) {
  pass('flip SFX kicks off with CardFace.playFlip');
} else {
  fail('flip SFX not tied to playFlip kickoff');
}

const extFn = life.split('private playExtinguish(pip: number): void {')[1] || '';
const extKick = extFn.indexOf('this.extFrame = 0');
const extSfx = extFn.indexOf('SoundPlayer.playLifeExtinguish()');
const extLoop = extFn.indexOf('for (let i = 1');
const lastBlock = extFn.indexOf('if (frame === last)');
if (extKick >= 0 && extSfx >= 0 && extLoop >= 0 && extKick < extSfx && extSfx < extLoop &&
    (lastBlock < 0 || !extFn.slice(lastBlock).includes('playLifeExtinguish'))) {
  pass('extinguish SFX on first frame (not last)');
} else {
  fail('extinguish SFX not on first extinguish frame');
}

if (life.includes('SoundPlayer.playCardFlip') || life.includes('SfxIds.CARD_FLIP')) {
  fail('extinguish path must not play card flip');
} else {
  pass('extinguish path has no card-flip slot');
}

if (player.includes('SfxReady') && player.includes('flipReady') && player.includes('warmupSlot') &&
    player.includes('firstPlay') && player.includes('deferred=') &&
    table.includes('warmupTableSfx') && table.includes('await SoundPlayer.prepare()') &&
    !table.includes('\n    SoundPlayer.prepare();')) {
  pass('enter-table SFX warmup waits loadComplete; firstPlay logs ready/pending');
} else {
  fail('SoundPlayer warmup / SfxReady firstPlay path missing');
}

if (player.includes('SfxDiag playRet') && player.includes('SfxDiag playFin') &&
    player.includes('dPlayFin-T1') && player.includes('dPlayRet-T1')) {
  pass('SfxDiag T0/T1/T2 + playRet + playFin kept (INFO)');
} else {
  fail('SfxDiag playRet / playFin missing');
}

if (player.includes('VOL_FLIP: number = 0.70') &&
    player.includes('VOL_EXTINGUISH: number = 0.55')) {
  pass('volume (SEPARATE): VOL_FLIP 0.70 VOL_EXTINGUISH 0.55');
} else {
  fail('VOL_FLIP / VOL_EXTINGUISH not the labeled volume bump');
}

if (player.includes('SfxDiag rate') &&
    player.includes('matchFlip') &&
    player.includes('resampleTo') &&
    player.includes('never trim') &&
    player.includes('createAudioRenderer') &&
    player.includes('writeData') &&
    player.includes('EXP_USE_RENDERER: boolean = true') &&
    player.includes('path=renderer') &&
    table.includes('ControlIds.DEBUG_SFX_PATH') &&
    table.includes('onDebugSfxPath') &&
    table.includes('SoundPlayer.setUseRenderer') &&
    strings.includes('lb_str_debug_sfx_pool') &&
    strings.includes('lb_str_debug_sfx_renderer')) {
  pass('EXP 2 rate probe/resample + EXP 3 AudioRenderer path + debug A/B');
} else {
  fail('EXP 2/3 renderer path, rate logs, or debug A/B missing');
}

if (table.includes('max_play_cards') && table.includes('failGen') &&
    table.includes('lb_str_play_over_select')) {
  pass('over-select fail path present');
} else {
  fail('over-select path missing');
}

if (engine.includes('lives_default') && !engine.includes('lives_default = 4') &&
    !table.includes('lives_default = 4')) {
  pass('engine/UI did not invent a 4th life');
} else {
  fail('life rule look-alike');
}

if (table.includes('lb_btn_challenge') || table.includes('ControlIds.CHALLENGE')) {
  pass('challenge lock name kept (still frozen)');
} else {
  fail('challenge control dropped');
}

if (floats.includes('"56vp"') && floats.includes('"78vp"') &&
    floats.includes('play_confirm_h') && floats.includes('card_raise')) {
  pass('hand 56×78 kept; confirm/raise floats added');
} else {
  fail('float.json card size or confirm floats');
}

const sfxDir = 'entry/src/main/resources/rawfile/audio/sfx';
for (const wav of ['sfx_card_flip.wav', 'sfx_life_extinguish.wav']) {
  const rel = `${sfxDir}/${wav}`;
  if (!existsSync(join(root, rel))) {
    fail(`missing ${rel}`);
    continue;
  }
  const bytes = readFileSync(join(root, rel)).length;
  if (bytes >= 4000) {
    pass(`${wav} present (${bytes}B)`);
  } else {
    fail(`${wav} too small (${bytes}B)`);
  }
}

const scanned = [table, face, life, overlays, engine, player].join('\n');
if (/\bany\b/.test(scanned) || /ESObject/.test(scanned)) {
  fail('ESObject/any in 14/15 path');
} else {
  pass('no ESObject/any in 14/15 path');
}

if (process.exitCode) {
  console.error('life_touch_play_check FAILED');
} else {
  console.log('life_touch_play_check OK');
}
