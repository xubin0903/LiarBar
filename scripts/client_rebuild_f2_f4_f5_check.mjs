#!/usr/bin/env node
/**
 * Rebuild F2+F4+F5 static gates (全员揭牌 / 宣言左上 / self烛框).
 * Cloud has no DevEco — not CompileArkTS. 合入 ≠ 终验.
 * Cross: S18-22 lb_str_challenge_no_broadcast / S18-23 lb_str_reveal_self_only.
 * Locks: HAND_RING_GAP=24 / no padB raise / candle primary / F3 lb_btn_home.
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
const layout = src('entry/src/main/ets/features/table/TableLayout.ets');
const life = src('entry/src/main/ets/features/table/LifeCandles.ets');
const fx = src('entry/src/main/ets/features/table/ChallengeFx.ets');
const ids = src('entry/src/main/ets/common/Ids.ets');
const strings = src('entry/src/main/resources/base/element/string.json');
const entry = src('entry/src/main/ets/features/table/components/ChallengeEntry.ets');
const reveal = src('entry/src/main/ets/features/table/components/RevealStage.ets');
const match = JSON.parse(src('entry/src/main/resources/rawfile/config/match_defaults.json'));

// --- hard locks ---
if (layout.includes('HAND_RING_GAP_PCT: number = 24')) pass('HAND_RING_GAP_PCT frozen at 24');
else fail('HAND_RING_GAP_PCT changed');
if (match.lives_default === 3) pass('lives_default still 3');
else fail(`lives_default drifted to ${match.lives_default}`);
if (table.includes('floorHandPad') && table.includes('nextB: number = this.insetVp(box.bottom)')) pass('padB stays avoidArea inset');
else fail('padB path rewritten');
if (table.includes('homeExitChrome') && table.includes('ControlIds.HOME') && table.includes('.id(ControlIds.HOME)')) pass('F3 lb_btn_home still present');
else fail('F3 lb_btn_home missing');
if (/revolver|RevolverGun|sfx_revolver/i.test(table) && table.includes('playRevolver')) fail('revolver primary path reintroduced');
else pass('no revolver primary on Table');

// --- F2 ---
if (strings.includes('lb_str_challenge_no_broadcast') && strings.includes('质疑无表现') &&
    strings.includes('lb_str_reveal_self_only') && strings.includes('揭牌仅自己见')) {
  pass('F2 fail strings S18-22/23 present');
} else fail('F2 fail strings missing');

if (table.includes('syncChallengeRitualBroadcast') &&
    table.includes('closeChallengeEntryChrome') &&
    table.includes('clearChallengeBroadcast') &&
    table.includes('syncNpcChallengeAwaitBroadcast')) {
  pass('F2 ritual/await broadcast helpers present');
} else fail('F2 broadcast helpers missing');

if (table.includes('Phase.CHALLENGE_RITUAL || snap.phase === Phase.JUDGE') &&
    table.includes('this.syncChallengeRitualBroadcast(snap)') &&
    table.includes('this.closeChallengeEntryChrome()') &&
    !/CHALLENGE_RITUAL[\s\S]{0,280}closeChallengeEntry\(false\)/.test(table)) {
  pass('F2 ritual pull syncs broadcast without wipe via closeChallengeEntry');
} else fail('F2 ritual pull still wipes broadcast or skips sync');

if (table.includes('revealForChallengeId') &&
    table.includes('this.beginRevealAfterAck(snap)') &&
    table.includes('isAiSeatId') &&
    reveal.includes("ControlIds.REVEAL_STAGE") &&
    table.includes('revealLayer()') &&
    table.includes('F2 / 18: lb_cmp_reveal_stage = table-wide shared overlay')) {
  pass('F2 shared RevealStage for AI+human challenges');
} else fail('F2 RevealStage table-wide path incomplete');

if (ids.includes("NPC_CHALLENGE_BUBBLE: string = 'lb_cmp_npc_challenge_bubble'") &&
    ids.includes("CHALLENGE_DEALER_ENTER: string = 'lb_txt_challenge_dealer_enter'") &&
    table.includes('ControlIds.NPC_CHALLENGE_BUBBLE') &&
    table.includes('ControlIds.CHALLENGE_DEALER_ENTER') &&
    fx.includes('NPC_BUBBLE_MS: number = 1000')) {
  pass('F2 NPC bubble + dealer enter ids + 1000ms');
} else fail('F2 bubble/dealer-enter wiring missing');

if (entry.includes('CHALLENGE_DOUBT') && entry.includes('CHALLENGE_BELIEVE') &&
    !entry.includes('CHALLENGE_TRUE') && !entry.includes('CHALLENGE_PASS')) {
  pass('F2 keeps 质疑|相信 ChallengeEntry');
} else fail('ChallengeEntry drifted from doubt|believe');

// --- F4 ---
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
  if (!m) return '';
  const start = src.indexOf('{', m.index + m[0].length - 1);
  return braceBlock(src, start);
}

const topBar = builderBody(table, 'topBar');
const heart = builderBody(table, 'tableHeart');
if (topBar.includes('ControlIds.TXT_CLAIM') && topBar.includes('ControlIds.TABLE_TIP') &&
    topBar.includes('this.claimText') && topBar.includes('this.dealerLine') &&
    ids.includes("TABLE_TIP: string = 'lb_cmp_table_tip'") &&
    ids.includes("TXT_CLAIM: string = 'lb_txt_claim'")) {
  pass('F4 claim + whose-turn in topBar TopStart');
} else fail('F4 topBar missing claim/table_tip');

if (heart.includes('this.claimText') || heart.includes('ControlIds.TXT_CLAIM') ||
    heart.includes('CHALLENGE_DEALER_ENTER') || heart.includes('challengeDealerEnter')) {
  fail('F4/R6 announcement still mounted in tableHeart (blocks pool / stacks center)');
} else if (topBar.includes('CHALLENGE_DEALER_ENTER') && topBar.includes('challengeDealerEnter')) {
  pass('F4+R6 claim/dealer/challenge-enter in topBar TopStart; heart free');
} else {
  fail('F4/R6 topBar missing challenge-enter cue');
}

// --- F5 ---
if (ids.includes("LIFE_SELF_FRAME: string = 'lb_cmp_life_self_frame'") &&
    table.includes('ControlIds.LIFE_SELF_FRAME') &&
    table.includes('LifeCandles({') &&
    /LIFE_SELF_FRAME[\s\S]{0,200}padding\(\{\s*left:\s*4,\s*right:\s*4,\s*top:\s*8/.test(table)) {
  pass('F5 lb_cmp_life_self_frame wraps self candles with flame padding');
} else fail('F5 life_self_frame missing or under-padded');

if (life.includes('.clip(false)')) pass('F5 LifeCandles clip(false) so flame not cropped');
else fail('F5 LifeCandles still clips');


// --- Aron Rebuild R1′/R2/R3 ---
const engineSrc = src('entry/src/main/ets/engine/MatchEngine.ets');
const flyFx = src('entry/src/main/ets/features/table/PlayFlyFx.ets');
const ranksFn = table.split('private ranksForReveal')[1] || '';
const ranksBody = ranksFn.split('private rejectChallengeRestore')[0] || '';
if (ranksBody.includes('lastPlayRanks') && ranksBody.includes('peekLastPlayRanks') &&
    !ranksBody.includes('currentClaim') && !/claim\s*=/.test(ranksBody)) {
  pass("R1' ranksForReveal no claim fake fill + trusted peek");
} else fail("R1' ranksForReveal claim fallback still present");
if (/showRanks[\s\S]{0,220}CHALLENGE_RITUAL/.test(engineSrc) &&
    engineSrc.includes('peekLastPlayRanks') && engineSrc.includes('peekLastPickedRanks')) {
  pass("R1' snapshot ranks on CHALLENGE_RITUAL + peeks");
} else fail("R1' engine showRanks/peeks missing");
const beginFn = table.split('private beginRevealAfterAck')[1] || '';
const beginBody = beginFn.split('private ranksCsv')[0] || '';
if (beginBody.includes('claim=') && beginBody.includes('lastPlayRanks=') &&
    beginBody.includes('lastPicked=') && beginBody.includes('lastPlay.count=') &&
    beginBody.includes('playId=')) {
  pass("R1' beginRevealAfterAck HiLog keys present");
} else fail("R1' beginRevealAfterAck HiLog keys missing");
const drawN = Number((/DRAW_TO_FLIP_MS:\s*number\s*=\s*(\d+)/.exec(flyFx) || [])[1] || 0);
const holdN = Number((/REVEAL_HOLD_MS:\s*number\s*=\s*(\d+)/.exec(flyFx) || [])[1] || 0);
if (drawN === 1000 && holdN === 3000 &&
    !flyFx.includes('DRAW_TO_FLIP_MS: number = 500') &&
    !flyFx.includes('REVEAL_HOLD_MS: number = 2000') &&
    !flyFx.includes('REVEAL_HOLD_MS: number = 3500') &&
    !flyFx.includes('REVEAL_HOLD_MS: number = 5000')) {
  pass(`R4 floors DRAW_TO_FLIP=${drawN} REVEAL_HOLD=${holdN}`);
} else fail(`R4 floors failed draw=${drawN} hold=${holdN}`);
const showEntry = table.split('private shouldShowChallengeEntry')[1] || '';
const showEntryBody = showEntry.split('private actorEmptied')[0] || '';
if (!showEntryBody.includes('lastPlay.isFirstOfRound') && showEntryBody.includes('lastPlay === null')) {
  pass('R2 shouldShowChallengeEntry no isFirstOfRound ban');
} else fail('R2 shouldShowChallengeEntry still bans isFirstOfRound');


// --- Aron Rebuild R5/R6 ---
if (table.includes('ensurePoolHandFromLastPlay') &&
    table.includes('ControlIds.PLAY_POOL_HAND') &&
    /ensurePoolHandFromLastPlay[\s\S]{0,220}lastPlay\.count/.test(table) &&
    /openChallengeEntry[\s\S]{0,700}ensurePoolHandFromLastPlay/.test(table)) {
  pass('R5 pool hand (= lastPlay.count) ensured on AwaitChallenge open');
} else fail('R5 pool visible during await missing');

const hasCenterTimer = table.includes('challengeCenterTopTimer') &&
  table.includes('ControlIds.CHALLENGE_TIMER') &&
  table.includes('ControlIds.CHALLENGE_RING');
const entryNoRing = !entry.includes('CHALLENGE_TIMER') && !entry.includes('timerRing') &&
  !entry.includes('CHALLENGE_RING');
if (hasCenterTimer && entryNoRing && topBar.includes('challengeCenterTopTimer')) {
  pass('R6 center-top timer-only; ChallengeEntry buttons-only (no ring)');
} else fail('R6 center-top timer / entry ring split failed');

if (process.exitCode) console.error('client_rebuild_f2_f4_f5_check FAILED');
else console.log('client_rebuild_f2_f4_f5_check OK');
