#!/usr/bin/env node
/**
 * Spec check for 16 v0.2.0 play→pool + 18 v0.1.0 reveal stage + #150 SFX wire.
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
const audio = src('entry/src/main/ets/features/table/TableAudio.ets');
const flyFx = src('entry/src/main/ets/features/table/PlayFlyFx.ets');
const layout = src('entry/src/main/ets/features/table/TableLayout.ets');
const reveal = src('entry/src/main/ets/features/table/components/RevealStage.ets');
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

// Land dest = pool
const destFn = table.split('private playDestOf')[1] || '';
const destBody = destFn.split('private setPile')[0] || destFn.slice(0, 1200);
if (destBody.includes('pileGX') && destBody.includes('pileX') &&
    destBody.includes('pileW / 2') && destBody.includes('pileH / 2') &&
    !destBody.includes('handBandCenterX') &&
    !destBody.includes('SELF_GAP_VP') &&
    !destBody.includes('seatXs[')) {
  pass('playDestOf lands at pool center (pileGX/pileX), not seat front');
} else {
  fail('playDestOf still seat-front or missing pool coords');
}

if (table.includes('lb_cmp_pool') &&
    table.includes('flyFromPile') &&
    table.includes('capturePile')) {
  pass('pool / capturePile / flyFromPile still present');
} else {
  fail('pool measurement path broken');
}

// Single pool hand mount
if (table.includes('ControlIds.PLAY_POOL_HAND') &&
    !table.includes('PLAY_FRONT_PILE}_p1') &&
    !table.includes('PLAY_FRONT_PILE}_p2') &&
    !table.includes('PLAY_FRONT_PILE}_p3') &&
    ids.includes("PLAY_POOL_HAND: string = 'lb_cmp_pool_hand'")) {
  pass('one PLAY_POOL_HAND at pool; no seat p1/p2/p3 mounts');
} else {
  fail('pool hand id / seat piles still mounted');
}

// setPile → pileN0 only
const setFn = table.split('private setPile')[1] || '';
const setBody = setFn.split('private clearPile')[0] || setFn.slice(0, 800);
if (setBody.includes('this.pileN0 = count') &&
    setBody.includes('this.pileN1 = 0') &&
    setBody.includes('this.pileN2 = 0') &&
    setBody.includes('this.pileN3 = 0') &&
    !setBody.includes('TableCompass.RIGHT')) {
  pass('setPile writes pileN0 only; zeros seat piles');
} else {
  fail('setPile still seat-routed');
}

// Ban poolText digits in tableHeart
function braceBlock(src, from) {
  if (from < 0 || src[from] !== '{') return '';
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  return '';
}
function builderBody(src, name) {
  const re = new RegExp(`@Builder\\s+${name}\\(\\)\\s*`);
  const m = re.exec(src);
  if (m === null) return '';
  const braceAt = src.indexOf('{', m.index + m[0].length - 1);
  return braceBlock(src, braceAt);
}
const heart = builderBody(table, 'tableHeart');
if (heart.length > 0 && !heart.includes('Text(this.poolText)')) {
  pass('tableHeart has no poolText digit Text');
} else {
  fail('tableHeart still shows poolText digits');
}
if (table.includes("const nextPool: string = ''") ||
    table.includes('const nextPool: string = "";') ||
    (table.includes('nextPool') && table.includes("nextPool: string = ''"))) {
  pass('nextPool never bound to lastPlay.count');
} else if (!table.includes('nextPool = `${snap.lastPlay.count}`') &&
           !table.includes("nextPool = '' + snap.lastPlay.count")) {
  // also OK if poolText assignment of count removed
  if (!table.includes('poolText = `${snap.lastPlay.count}`')) {
    pass('poolText not set to count digits');
  } else {
    fail('poolText still set to count');
  }
} else {
  fail('nextPool still set from count');
}

// Reveal stage + constants
if (existsSync(join(root, 'entry/src/main/ets/features/table/components/RevealStage.ets')) &&
    reveal.includes("REVEAL_STAGE") &&
    reveal.includes('HitTestMode.None') &&
    reveal.includes('art_card_back') &&
    reveal.includes('revealScale') &&
    !reveal.includes('@Prop scale') &&
    ids.includes("REVEAL_STAGE: string = 'lb_cmp_reveal_stage'")) {
  pass('RevealStage + REVEAL_STAGE id; HitTest None; revealScale not scale');
} else {
  fail('RevealStage missing / shadows scale');
}

if (flyFx.includes('REVEAL_DOWN_VP: number = 56') &&
    flyFx.includes('REVEAL_SCALE: number = 0.90') &&
    flyFx.includes('REVEAL_DIM: number = 0.40') &&
    flyFx.includes('REVEAL_BLUR_VP: number = 6')) {
  pass('18 numbers: DOWN 56 / scale 0.90 / dim 0.40 / blur 6');
} else {
  fail('PlayFlyFx reveal geometry drifted');
}

// R4: draw→flip 1000 (窗 800～1200); face-up hold 5000 (窗 4～6s); abolish 500/2000 primary
const drawFlip = /DRAW_TO_FLIP_MS:\s*number\s*=\s*(\d+)/.exec(flyFx);
const holdMs = /REVEAL_HOLD_MS:\s*number\s*=\s*(\d+)/.exec(flyFx);
const drawN = drawFlip ? Number(drawFlip[1]) : 0;
const holdN = holdMs ? Number(holdMs[1]) : 0;
if (drawN === 1000 && holdN === 5000 &&
    !flyFx.includes('DRAW_TO_FLIP_MS: number = 160') &&
    !flyFx.includes('DRAW_TO_FLIP_MS: number = 500') &&
    !flyFx.includes('REVEAL_HOLD_MS: number = 600') &&
    !flyFx.includes('REVEAL_HOLD_MS: number = 2000')) {
  pass(`R4 duration floors: DRAW_TO_FLIP=${drawN} REVEAL_HOLD=${holdN}`);
} else {
  fail(`R4 duration floors failed draw=${drawN} hold=${holdN}`);
}

// R4: beginRevealAfterAck must nest hold before resetRevealUi/pull (ban instant cut)
const beginFn = table.split('private beginRevealAfterAck')[1] || '';
const beginBody = beginFn.split('private ranksCsv')[0] || beginFn.split('private ranksForReveal')[0] || '';
if (beginBody.includes('PlayFlyFx.DRAW_TO_FLIP_MS') &&
    beginBody.includes('PlayFlyFx.REVEAL_HOLD_MS') &&
    beginBody.includes('resetRevealUi') &&
    /DRAW_TO_FLIP_MS[\s\S]{0,400}REVEAL_HOLD_MS[\s\S]{0,200}resetRevealUi/.test(beginBody)) {
  pass('R4 beginRevealAfterAck: draw→flip→hold then resetRevealUi (no instant cut)');
} else {
  fail('R4 beginRevealAfterAck missing timed hold before resetRevealUi');
}

if (ids.includes("REVEAL_DRAW: string = 'lb_sfx_reveal_draw'") &&
    ids.includes("REVEAL_FLIP: string = 'lb_sfx_reveal_flip'") &&
    audio.includes('sfx_reveal_draw.wav') &&
    audio.includes('sfx_reveal_flip.wav') &&
    audio.includes('playRevealDraw') &&
    audio.includes('playRevealFlip')) {
  pass('Ids + TableAudio reveal draw/flip slots');
} else {
  fail('reveal SFX wiring incomplete');
}

const drawWav = 'entry/src/main/resources/rawfile/audio/sfx/sfx_reveal_draw.wav';
const flipWav = 'entry/src/main/resources/rawfile/audio/sfx/sfx_reveal_flip.wav';
if (existsSync(join(root, drawWav)) && statSync(join(root, drawWav)).size >= 7000 &&
    existsSync(join(root, flipWav)) && statSync(join(root, flipWav)).size >= 9000) {
  pass('reveal draw/flip wavs present (#150)');
} else {
  fail('reveal wav missing');
}

const drawPlay = audio.split('static playRevealDraw')[1] || '';
const drawBody = drawPlay.split('static playRevealFlip')[0];
const flipPlay = audio.split('static playRevealFlip')[1] || '';
const flipBody = flipPlay.split('static playStyleAtPeak')[0];
if (drawBody.includes('REVEAL_DRAW') && !drawBody.includes('PLAY_LAUNCH') &&
    !drawBody.includes('CARD_FLIP') && !drawBody.includes('CHALLENGE_ENTER') &&
    flipBody.includes('REVEAL_FLIP') && !flipBody.includes('PLAY_LAND') &&
    !flipBody.includes('CHALLENGE_COMMIT')) {
  pass('reveal methods do not impersonate flip/launch/land/enter/commit');
} else {
  fail('reveal SFX methods reuse frozen slots');
}

if (table.includes('beginRevealAfterAck') &&
    table.includes('playRevealDraw') &&
    table.includes('playRevealFlip') &&
    table.includes('revealLayer') &&
    table.includes('REVEAL_DOWN_VP') &&
    table.includes('.blur(PlayFlyFx.REVEAL_BLUR_VP)') &&
    table.includes("rgba(0, 0, 0, 0.40)") &&
    !table.includes('LbRouter.toChallenge()')) {
  pass('beginRevealAfterAck + dim/blur bg + no old Challenge page');
} else {
  fail('reveal after ACK path incomplete');
}

// Keep Section 1 locks
if (table.includes('this.playFlyOn = true') &&
    table.includes('this.flyOn = true') &&
    table.includes('DealAudio.playDealCard()') &&
    !table.includes('DealFx.flyOn') === false) {
  // deal path still uses flyOn separately
}
if (table.includes('playFlyOn') && table.includes('flyOn = true') &&
    table.includes('DealAudio.playDealCard()')) {
  pass('playFlyOn separate from DealFx.flyOn / deal SFX');
} else {
  fail('play fly reused deal path');
}

if (table.includes('beginHumanPlay') &&
    table.includes('TableAudio.playPlayLaunch()') &&
    table.includes('onPlayLanded') &&
    table.includes('TableAudio.playPlayLand()') &&
    table.includes('onPlayRollback') &&
    table.includes('roundWinOn')) {
  pass('optimistic fly + launch/land + rollback + RoundWin kept');
} else {
  fail('Section 1 path regressed');
}

if (table.includes('PLACEHOLDER') || reveal.includes('PLACEHOLDER') ||
    flyFx.includes('PLACEHOLDER')) {
  fail('PLACEHOLDER left in client');
} else {
  pass('no PLACEHOLDER in play/reveal client');
}

if (flyFx.includes('FLY_MS: number = 320')) {
  pass('fly window still 320ms');
} else {
  fail('FLY_MS drifted');
}


// Rebuild: pool hand anchored on dealPileAnchor / lb_cmp_pool (stack-local)
if (table.includes('anchored: true') &&
    table.includes('dealPileAnchor') &&
    table.includes('ControlIds.PLAY_POOL_HAND') &&
    pile.includes('anchored')) {
  pass('pool hand anchored on dealPileAnchor (not overlay abs primary)');
} else {
  fail('pool hand not anchored on pool slot');
}

// Rebuild: clear only when lastPlay gone (persist across seat rotation)
if (table.includes('snap.lastPlay === null && !this.playFlyOn && !this.revealOn') &&
    !table.includes('snap.playIndexInRound === 0 && !this.playFlyOn)')) {
  pass('clearAllPiles gated on lastPlay===null (not playIndexInRound===0 alone)');
} else {
  fail('pile clear still fires on playIndexInRound===0 alone');
}

// F4: claim/dealer in topBar (not heart-blocking pool)
function braceBlock2(src, from) {
  if (from < 0 || src[from] !== '{') return '';
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  return '';
}
function builderBody2(src, name) {
  const re = new RegExp(`@Builder\\s+${name}\\(\\)\\s*`);
  const m = re.exec(src);
  if (m === null) return '';
  const braceAt = src.indexOf('{', m.index + m[0].length - 1);
  return braceBlock2(src, braceAt);
}
const topBarBody = builderBody2(table, 'topBar');
const heartBody = builderBody2(table, 'tableHeart');
// F4 (#190): claim + whose-turn live in topBar TopStart; must not block pool in heart.
if (topBarBody.includes('claimText') && topBarBody.includes('dealerLine') &&
    !heartBody.includes('claimText') && !heartBody.includes('TXT_CLAIM')) {
  pass('F4 claim/dealer in topBar; heart free of claim (pool clear)');
} else {
  fail('F4 claim/dealer layout drifted (expect topBar, not heart)');
}

// playDest uses poolCenterOverlay (pad-corrected)
if (table.includes('poolCenterOverlay') && table.includes('toPlayOverlay') &&
    table.includes('this.padL') && table.includes('this.padT')) {
  pass('playDest/reveal use pad-corrected poolCenterOverlay');
} else {
  fail('overlay pad correction missing');
}


// R5: AwaitChallenge keeps pool hand (= lastPlay.count); ban clear on entry open
const openFn = table.split('private openChallengeEntry')[1] || '';
const openBody = openFn.split('private readChallengeDealerEnter')[0] || openFn.slice(0, 1200);
if (table.includes('ensurePoolHandFromLastPlay') &&
    openBody.includes('ensurePoolHandFromLastPlay') &&
    table.includes('ControlIds.PLAY_POOL_HAND') &&
    heartBody.includes('PLAY_POOL_HAND')) {
  pass('R5 pool hand ensured on AwaitChallenge entry; PLAY_POOL_HAND stays in heart');
} else {
  fail('R5 pool visible during await incomplete');
}

// R6: tips TopStart; center-top timer-only; challenge-enter not in heart
if (topBarBody.includes('CHALLENGE_DEALER_ENTER') &&
    topBarBody.includes('challengeDealerEnter') &&
    topBarBody.includes('challengeCenterTopTimer') &&
    table.includes('challengeCenterTopTimer') &&
    !heartBody.includes('CHALLENGE_DEALER_ENTER') &&
    !heartBody.includes('challengeDealerEnter')) {
  pass('R6 tips TopStart / center-top timer-only; enter cue off heart');
} else {
  fail('R6 tip/timer placement drifted');
}

console.log(process.exitCode ? 'play-to-pool check FAILED' : 'play-to-pool check OK');
