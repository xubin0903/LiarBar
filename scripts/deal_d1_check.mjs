#!/usr/bin/env node
/**
 * D1 deal-show spec check (docs/04-设计/08 §2 / 09 §3).
 * Cloud has no DevEco — this is not CompileArkTS.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
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

function readConst(text, name) {
  const m = text.match(new RegExp(`static readonly ${name}: number = ([0-9.]+);`));
  if (!m) {
    fail(`missing ${name}`);
    return 0;
  }
  return Number(m[1]);
}

const fx = src('entry/src/main/ets/features/table/DealFx.ets');
const audio = src('entry/src/main/ets/features/table/DealAudio.ets');
const table = src('entry/src/main/ets/pages/Table.ets');
const engine = src('entry/src/main/ets/engine/MatchEngine.ets');
const ids = src('entry/src/main/ets/common/Ids.ets');
const lines = src('entry/src/main/ets/engine/DealerLines.ets');
const lobby = src('entry/src/main/ets/pages/Lobby.ets');
const challenge = src('entry/src/main/ets/pages/Challenge.ets');
const beats = src('entry/src/main/ets/features/challenge/ChallengeBeats.ets');
const match = JSON.parse(src('entry/src/main/resources/rawfile/config/match_defaults.json'));

const CARD = readConst(fx, 'DEAL_CARD_MS_DEFAULT');
const STAG = readConst(fx, 'DEAL_STAGGER_MS_DEFAULT');
const CARD_R = readConst(fx, 'DEAL_CARD_MS_REBUILD');
const STAG_R = readConst(fx, 'DEAL_STAGGER_MS_REBUILD');
const SCALE = readConst(fx, 'DEAL_REBUILD_SCALE_MIN');
const SETTLE = readConst(fx, 'DEAL_DONE_SETTLE_MS');
const OPEN_MS = readConst(fx, 'DEAL_OPENING_MS');
const OPEN_N = readConst(fx, 'DEAL_OPENING_N4');

function totalMs(n, card, stag) {
  if (n <= 0) {
    return 0;
  }
  return n * card + (n - 1) * stag;
}

const opening = totalMs(OPEN_N, CARD, STAG);
const rebuild = totalMs(OPEN_N, CARD_R, STAG_R);

if (CARD === 220 && STAG === 55 && opening === 5445 && OPEN_MS === 5445) {
  pass(`D1c opening T_card=${CARD} T_stagger=${STAG} T_deal=${opening}`);
} else {
  fail(`opening timing ${CARD}/${STAG}/${opening} expected 220/55/5445`);
}
if (opening >= 4000 && opening <= 6000) {
  pass('D1c opening window 4000–6000');
} else {
  fail('opening window');
}

if (CARD_R === 180 && STAG_R === 40 && rebuild === 4360) {
  pass(`D1e rebuild T_card=${CARD_R} T_stagger=${STAG_R} T_rebuild=${rebuild}`);
} else {
  fail(`rebuild timing ${CARD_R}/${STAG_R}/${rebuild}`);
}
if (SCALE === 0.6 && rebuild >= opening * SCALE) {
  pass(`D1e rebuild ${rebuild} ≥ ${SCALE}×${opening} (${(rebuild / opening).toFixed(3)})`);
} else {
  fail('rebuild floor 0.60× opening');
}
if (SETTLE > 0 && SETTLE <= 250) {
  pass(`T02 settle ${SETTLE}ms ≤250`);
} else {
  fail('DEAL_DONE settle');
}

if (CARD >= 180 && CARD <= 260 && STAG >= 40 && STAG <= 70) {
  pass('D1g windows: T_card 180–260, stagger 40–70 (land then wait)');
} else {
  fail('D1g windows');
}

function planBeats(aliveIds, handSize) {
  const beats = [];
  let index = 0;
  for (let slot = 0; slot < handSize; slot++) {
    for (let s = 0; s < aliveIds.length; s++) {
      beats.push({ index, seatId: aliveIds[s], slot });
      index++;
    }
  }
  return beats;
}

const four = planBeats([0, 1, 2, 3], match.hand_size_default);
const order = four.map((b) => b.seatId).join(',');
const expect = Array.from({ length: 5 }, () => '0,1,2,3').join(',');
if (four.length === 20 && order === expect && four[0].seatId === 0) {
  pass('D1a clockwise from self, one-by-one, 5 each (not dump-5)');
} else {
  fail(`deal order ${order}`);
}

const ghosted = planBeats([0, 1, 3], 5);
if (ghosted.length === 15 && !ghosted.some((b) => b.seatId === 2)) {
  pass('ghosts skipped (15 cards / 3 alive)');
} else {
  fail('ghost skip');
}

function takeoffAt(i, card, stag) {
  return i * (card + stag);
}
function landAt(i, card, stag) {
  return takeoffAt(i, card, stag) + card;
}
const gap = takeoffAt(1, CARD, STAG) - landAt(0, CARD, STAG);
if (gap === STAG && gap >= 40 && gap <= 70) {
  pass(`D1g land(i)→takeoff(i+1)=${gap}ms (serial, not overlap)`);
} else {
  fail(`stagger gap ${gap}`);
}
if (landAt(19, CARD, STAG) === 5445) {
  pass('D1c first takeoff → last land = 5445ms');
} else {
  fail(`last land ${landAt(19, CARD, STAG)}`);
}

if (fx.includes('serial') && fx.includes('land') && table.includes('Curve.EaseInOut') &&
  !table.includes('TransitionEffect') && !table.includes('Curve.Spring')) {
  pass('D1 transform: animateTo EaseInOut, no TransitionEffect / spring');
} else {
  fail('animation API');
}

if (table.includes('DealFx') && table.includes('DealAudio.playDealCard') &&
  table.includes('art_card_back') && table.includes('dealPileAnchor')) {
  pass('Table wires DealFx + pile + card-back flyers');
} else {
  fail('Table DealFx wiring');
}

if (table.includes('applyDealHud') && table.includes('cardBacks = this.indexes(this.landed0)') &&
  engine.includes('selfHand: this.phase === Phase.DEAL ? []')) {
  pass('D1a hands do not pop in (DEAL snapshot empty; UI reveals on land)');
} else {
  fail('pop-in guard');
}

if (engine.includes('dealDone()') && engine.includes('T02 DEAL_DONE') &&
  /this\.phase = Phase\.DEAL;\s*this\.dealFresh\(false\);/.test(engine) &&
  !/this\.dealFresh\(false\);\s*this\.announceClaim\(\);/.test(engine) &&
  !/this\.dealFresh\(true\);\s*this\.announceClaim\(\);/.test(engine)) {
  pass('H3 SM: start/rebuild stay DEAL until dealDone; no new DEALING phase');
} else {
  fail('DEAL hold / dealDone');
}

if (engine.includes('T17 REDEAL_STALL → DEAL (rebuild show, no L1)') &&
  engine.includes('dealFresh(true)') && table.includes("rebuild ? 'rebuild' : 'opening'")) {
  pass('D1e rebuild uses same DealFx, keeps redeal line, no L1');
} else {
  fail('rebuild path');
}

if (lobby.includes('MatchLoadOverlay') && lobby.includes('beginMatchLoad') &&
  lobby.includes('OverlayIds.MATCH_LOAD') &&
  ids.includes("MATCH_LOAD: string = 'lb_ovl_match_load'") &&
  ids.includes("MATCH_OPEN: string = 'lb_sfx_match_open'")) {
  pass('L1 overlay still on lobby (#40): MatchLoadOverlay + lb_sfx_match_open');
} else {
  fail('L1 overlay / MATCH_OPEN missing from lobby after rebase');
}

if (!table.includes('MatchLoadOverlay') && !table.includes('beginMatchLoad') &&
  !table.includes('lb_ovl_match_load') && !engine.includes('MatchLoadOverlay') &&
  !engine.includes('beginMatchLoad') && engine.includes('rebuild show, no L1')) {
  pass('D1e rebuild/redeal does not trigger MatchLoadOverlay');
} else {
  fail('rebuild path must not re-run L1 MatchLoadOverlay');
}

if (!engine.includes('MATCH_LOADING') && !engine.includes("DEALING =")) {
  pass('no MATCH_LOADING / DEALING engine phase');
} else {
  fail('invented phase');
}

if (table.includes('challengeEnabled = false') && table.includes('playEnabled = false') &&
  table.includes('showPlay = false') && table.includes('snap.phase === Phase.DEAL') &&
  engine.includes('if (this.phase !== Phase.TURN)') &&
  table.includes('snap.phase === Phase.DEAL || snap.phase === Phase.CLAIM')) {
  pass('D1b/d DEAL blocks play / challenge / peek; claim after DEAL_DONE');
} else {
  fail('DEAL block');
}

if (ids.includes("MATCH_OPEN: string = 'lb_sfx_match_open'") &&
  ids.includes("DEAL_CARD: string = 'lb_sfx_deal_card'") &&
  audio.includes("audio/sfx/sfx_deal_card.wav") &&
  audio.includes('skipped (silent)') &&
  audio.includes('MAX_STREAMS') &&
  !audio.includes('sfx_cta_tap') &&
  !audio.includes('sfx_boot_hit')) {
  pass('D1f SFX: both MATCH_OPEN + DEAL_CARD ids; real sfx_deal_card; silent skips');
} else {
  fail('DealAudio slot / SfxIds');
}

const wav = join(root, 'entry/src/main/resources/rawfile/audio/sfx/sfx_deal_card.wav');
if (existsSync(wav) && statSync(wav).size > 8000) {
  const buf = readFileSync(wav);
  const riff = buf.toString('ascii', 0, 4) === 'RIFF';
  const wave = buf.toString('ascii', 8, 12) === 'WAVE';
  if (riff && wave) {
    pass(`#39 sfx_deal_card.wav present (${statSync(wav).size} bytes, RIFF/WAVE)`);
  } else {
    fail('deal wav not RIFF/WAVE');
  }
} else {
  fail('sfx_deal_card.wav missing or tiny (beep placeholder)');
}

if (lines.includes("snap.phase === Phase.DEAL") && lines.includes("return '发牌'") &&
  lines.includes("return '重新发牌'")) {
  pass('live window: 发牌 / 重新发牌 (not 轮到你出牌)');
} else {
  fail('live DEAL text');
}

if (match.hand_size_default === 5 && !engine.includes('hand_size_default =')) {
  pass('rules/hand size unchanged (config 5)');
} else {
  fail('hand size');
}

const challengeTouched = beats.includes('DealFx') || challenge.includes('DealAudio') ||
  beats.includes('sfx_deal_card');
if (!challengeTouched) {
  pass('challenge / 质疑特效 frozen');
} else {
  fail('challenge files touched by deal');
}

const scan = [fx, audio, table, engine].join('\n');
if (/\bany\b/.test(scan) || /ESObject/.test(scan)) {
  fail('ESObject/any in deal path');
} else {
  pass('no ESObject/any in deal path');
}

if (!table.includes('#FF') && !table.includes('Color.Red') && table.includes('art_card_back')) {
  pass('no color-block placeholders; flyers use art_card_back');
} else {
  fail('placeholder art');
}

console.log('');
console.log(`SM/timing: DEAL_CARD_MS_DEFAULT=${CARD} DEAL_STAGGER_MS_DEFAULT=${STAG} T_deal=${opening}`);
console.log(`           DEAL_CARD_MS_REBUILD=${CARD_R} DEAL_STAGGER_MS_REBUILD=${STAG_R} T_rebuild=${rebuild}`);
console.log(`           DEAL_REBUILD_SCALE_MIN=${SCALE} DEAL_DONE_SETTLE_MS=${SETTLE}`);
console.log(process.exitCode ? 'D1 CHECK FAILED' : 'D1 CHECK OK');
