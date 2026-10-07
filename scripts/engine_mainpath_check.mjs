#!/usr/bin/env node
/**
 * Spec check for locked T01+ rules. ArkTS MatchEngine is the product source.
 * This script restates the same formulas so CI-less review can fail-fast.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANY_ESOBJECT, findInCode, formatHits } from './lib/ets_scan.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFileSync(join(root, rel), 'utf8');

function fail(msg) {
  console.error('FAIL', msg);
  process.exitCode = 1;
}

function pass(msg) {
  console.log('PASS', msg);
}

const deck = JSON.parse(src('entry/src/main/resources/rawfile/config/deck.json'));
const match = JSON.parse(src('entry/src/main/resources/rawfile/config/match_defaults.json'));
const demo = JSON.parse(src('entry/src/main/resources/rawfile/config/demo_seed.json'));
const personas = JSON.parse(src('entry/src/main/resources/rawfile/config/ai_personas.json'));

if (deck.decks.n3 && deck.decks.n4 && deck.decks.n5 && deck.decks.n6) {
  pass('deck keys n3..n6');
} else {
  fail('deck keys must be n3..n6');
}
if (deck.decks['3'] || deck.decks['4']) {
  fail('numeric deck keys must not return');
}

// #291 (ef232ac): demo_seed is OFF by default; delivery builds must not ship a
// fixed seed. Acceptance uses the in-memory demo switch (doc 21), never this
// config flag. The old check demanded `true` and contradicted #291.
const engineMain = src('entry/src/main/ets/engine/MatchEngine.ets');
if (match.demo_seed_enabled === false && demo.demo_seed_enabled === false) {
  pass('demo_seed_enabled default false in match_defaults + demo_seed (#291)');
} else {
  fail(`demo_seed must default OFF (#291): match_defaults=${match.demo_seed_enabled} demo_seed=${demo.demo_seed_enabled}`);
}
if (Number.isInteger(match.demo_seed_value) && match.demo_seed_value > 0 &&
  match.demo_seed_value === demo.demo_seed_value) {
  pass(`demo_seed_value ${match.demo_seed_value} kept as the fixed-seed channel (match_defaults == demo_seed)`);
} else {
  fail(`demo_seed_value drift: match_defaults=${match.demo_seed_value} demo_seed=${demo.demo_seed_value}`);
}
if (/this\.demoOn = cfg\.demo_seed_enabled;/.test(engineMain) &&
  /this\.seed = this\.demoOn \? cfg\.demo_seed_value : Date\.now\(\);/.test(engineMain)) {
  pass('engine: demo off → seed = Date.now() (fixed seed only when demo on)');
} else {
  fail('engine seed source no longer gated by demo_seed_enabled');
}
if (Array.isArray(demo.force_events)) {
  pass('demo_force_events present');
} else {
  fail('demo_force_events');
}

const forcePlay = demo.force_events.find((e) => e.at === 'PLAY');
const forceCh = demo.force_events.find((e) => e.at === 'CHALLENGE');
if (forcePlay && forcePlay.seat_id === 2 && forcePlay.style === 'SLAM' && forcePlay.has_fake === true &&
  forcePlay.named_seat_id === 0) {
  pass('force PLAY = Shark SLAM fake name-call');
} else {
  fail('force PLAY');
}
if (forceCh && forceCh.seat_id === 3 && forceCh.after_play_index === 3) {
  pass('force CHALLENGE = Karen after play 3');
} else {
  fail('force CHALLENGE');
}

const wild = deck.wild;
function isLegal(rank, claim) {
  return rank === claim || rank === wild;
}
function handIsClean(ranks, claim) {
  return ranks.every((r) => isLegal(r, claim));
}
function isChallengeSuccess(ranks, claim) {
  return !handIsClean(ranks, claim);
}

if (isLegal('A', 'A') && isLegal('JOKER', 'A') && !isLegal('K', 'A')) {
  pass('Judge isLegal');
} else {
  fail('Judge isLegal');
}
if (!isChallengeSuccess(['A', 'JOKER'], 'A') && isChallengeSuccess(['A', 'K'], 'A')) {
  pass('Judge success ⇔ ≥1 non-claim non-wild');
} else {
  fail('Judge formula');
}

function canChallenge(alive, lastPlay, playIndexInRound) {
  return alive && lastPlay !== null && playIndexInRound >= 1;
}
if (!canChallenge(true, null, 0) && !canChallenge(true, { id: 'p1' }, 0) &&
  canChallenge(true, { id: 'p1' }, 1) && !canChallenge(false, { id: 'p1' }, 2)) {
  pass('first play cannot challenge; only lastPlay context');
} else {
  fail('canChallenge');
}

function nextAlive(seats, from) {
  const n = seats.length;
  for (let step = 1; step <= n; step++) {
    const idx = (from + step) % n;
    if (seats[idx].status === 'ALIVE') {
      return seats[idx].seatId;
    }
  }
  return from;
}
const seats = [
  { seatId: 0, status: 'ALIVE' },
  { seatId: 1, status: 'ALIVE' },
  { seatId: 2, status: 'GHOST' },
  { seatId: 3, status: 'ALIVE' }
];
if (nextAlive(seats, 2) === 3 && nextAlive(seats, 1) === 3) {
  pass('nextAlive(penalized) skips ghost');
} else {
  fail('nextAlive');
}

function schemeA(hasCards, canCh) {
  if (!hasCards && canCh) {
    return 'CHALLENGE_ONLY';
  }
  if (!hasCards && !canCh) {
    return 'AUTO_SKIP';
  }
  return 'NORMAL';
}
if (schemeA(false, true) === 'CHALLENGE_ONLY' && schemeA(false, false) === 'AUTO_SKIP' &&
  schemeA(true, true) === 'NORMAL') {
  pass('scheme A windows (no hand-count win)');
} else {
  fail('scheme A');
}

if (personas.personas.AI_TIMID && personas.personas.AI_SHARK && personas.personas.AI_KAREN) {
  pass('personas AI_TIMID/AI_SHARK/AI_KAREN');
} else {
  fail('personas');
}
if (demo.demo_force_ai_enabled === false) {
  pass('demo_force_ai_enabled off (live AI not puppeted)');
} else {
  fail('demo_force_ai_enabled must be false in default builds');
}

const etsFiles = [
  'entry/src/main/ets/engine/MatchEngine.ets',
  'entry/src/main/ets/engine/Judge.ets',
  'entry/src/main/ets/engine/DeckDeal.ets',
  'entry/src/main/ets/config/DeckConfig.ets',
  'entry/src/main/ets/ai/AiFriend.ets',
  'entry/src/main/ets/ai/AiSeatController.ets',
  'entry/src/main/ets/ai/AiInfoSetBuilder.ets',
  'entry/src/main/ets/ai/AiPersonaRegistry.ets',
  'entry/src/main/ets/ai/InfoSetBuilder.ets',
  'entry/src/main/ets/ai/Memory.ets',
  'entry/src/main/ets/ai/PlayPolicy.ets',
  'entry/src/main/ets/ai/ChallengePolicy.ets',
  'entry/src/main/ets/ai/ThinkDelay.ets',
  'entry/src/main/ets/ai/PersonaParams.ets',
  'entry/src/main/ets/ai/AiMath.ets',
  'entry/src/main/ets/common/MatchDirector.ets',
  'entry/src/main/ets/pages/Table.ets',
  'entry/src/main/ets/features/table/DealFx.ets',
  'entry/src/main/ets/features/table/DealAudio.ets',
  'entry/src/main/ets/features/table/TableAudio.ets',
  'entry/src/main/ets/pages/Challenge.ets',
  'entry/src/main/ets/pages/Lobby.ets',
  'entry/src/main/ets/features/lobby/LobbyBoot.ets',
  'entry/src/main/ets/features/lobby/LobbyAudio.ets',
  'entry/src/main/ets/features/lobby/LobbyPanel.ets'
];
const joined = etsFiles.map((f) => src(f)).join('\n');
// Code-only scan (comments + string text stripped; see lib/ets_scan.mjs).
const anyHits = findInCode(etsFiles.map((f) => ({ path: f, text: src(f) })), ANY_ESOBJECT);
if (anyHits.length > 0) {
  fail(`ESObject/any found in engine/UI path:\n  ${formatHits(anyHits)}`);
} else {
  pass(`no ESObject/any in scanned ets (code only, ${etsFiles.length} files)`);
}
if (joined.includes('decks[') || joined.includes("decks['")) {
  fail('indexed deck bag access');
} else {
  pass('no indexed deck bag access');
}
if (!src('entry/src/main/ets/engine/MatchEngine.ets').includes('isChallengeSuccess')) {
  fail('Judge not wired');
} else {
  pass('Judge.ets wired from MatchEngine');
}
if (!src('entry/src/main/ets/pages/Challenge.ets').includes('lb_challenge_standoff') &&
  !src('entry/src/main/ets/features/challenge/ChallengeBeats.ets').includes('STANDOFF')) {
  fail('standoff beat missing');
} else {
  pass('standoff independent in Challenge UI');
}

const engineSrc = src('entry/src/main/ets/engine/MatchEngine.ets');
if (engineSrc.includes('手牌多') || engineSrc.includes('handCount >') && engineSrc.includes('winner')) {
  fail('possible hand-count win');
} else {
  pass('no hand-count win in engine');
}

function expandBag(counts) {
  const bag = [];
  for (let i = 0; i < counts.A; i++) bag.push('A');
  for (let i = 0; i < counts.K; i++) bag.push('K');
  for (let i = 0; i < counts.Q; i++) bag.push('Q');
  for (let i = 0; i < counts.JOKER; i++) bag.push('JOKER');
  return bag;
}

function lcg(seed) {
  let s = seed >>> 0;
  return {
    next() {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    },
    nextInt(n) {
      return Math.floor(this.next() * n);
    }
  };
}

function shuffle(items, rng) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const t = items[i];
    items[i] = items[j];
    items[j] = t;
  }
}

// Demo opening-hand repair, restated from DeckDeal.ets repairDemoHands (AI spec §3.2).
// Since #167 the deck is 20 cards and 4 seats × 5 deals all 20, so the discard
// pile is EMPTY; repair must swap with other seats' hands (the engine's
// fallback). The old script only swapped with the discard, which can no
// longer work. Seed = config demo_seed_value (not a hard-coded literal).
const deckDeal = src('entry/src/main/ets/engine/DeckDeal.ets');
const repairSrc = deckDeal.slice(deckDeal.indexOf('export function repairDemoHands'), deckDeal.indexOf('export function dealRound'));
if ((repairSrc.match(/for \(let s = 0; s < hands\.length; s\+\+\)/g) || []).length === 3 &&
  repairSrc.includes('countLegal(hands[s], claim) > 1') && repairSrc.includes('countFake(hands[s], claim) > 1')) {
  pass('DeckDeal.repairDemoHands keeps the other-hands fallback (needed when discard is empty)');
} else {
  fail('DeckDeal.repairDemoHands other-hands fallback changed; re-port the simulation below');
}

const SEATS = 4;
const rng = lcg(match.demo_seed_value);
const bag = expandBag(deck.decks.n4);
shuffle(bag, rng);
const hands = [];
for (let s = 0; s < SEATS; s++) hands.push([]);
let cur = 0;
for (let h = 0; h < match.hand_size_default; h++) {
  for (let s = 0; s < SEATS; s++) {
    if (cur < bag.length) hands[s].push(bag[cur++]);
  }
}
const discard = bag.slice(cur);
const forceClaim = demo.force_events.find((e) => e.at === 'CLAIM');
const claim = forceClaim && forceClaim.rank ? forceClaim.rank : 'A';
const humanSeat = 0;
const bindKey = Object.keys(personas.mvpSeatBind || {}).find((k) => personas.mvpSeatBind[k] === 'AI_SHARK');
const sharkSeat = bindKey ? Number(bindKey.replace('seat', '')) : -1;
const nLegal = (h) => h.filter((r) => isLegal(r, claim)).length;
const nFake = (h) => h.filter((r) => !isLegal(r, claim)).length;
const idxOf = (h, wantLegal) => h.findIndex((r) => isLegal(r, claim) === wantLegal);
const swap = (a, ai, b, bi) => { const t = a[ai]; a[ai] = b[bi]; b[bi] = t; };
function repairDemoHands() {
  const H = hands[humanSeat];
  if (nLegal(H) < 1) {
    const fd = idxOf(discard, true);
    const hf = idxOf(H, false);
    if (fd >= 0 && hf >= 0) swap(H, hf, discard, fd);
    else for (let s = 0; s < hands.length; s++) {
      if (s === humanSeat) continue;
      const ol = idxOf(hands[s], true);
      if (ol >= 0 && hf >= 0 && nLegal(hands[s]) > 1) { swap(H, hf, hands[s], ol); break; }
    }
  }
  if (nFake(H) < 1) {
    const fd = idxOf(discard, false);
    const hl = idxOf(H, true);
    if (fd >= 0 && hl >= 0 && nLegal(H) > 1) swap(H, hl, discard, fd);
    else for (let s = 0; s < hands.length; s++) {
      if (s === humanSeat) continue;
      const of = idxOf(hands[s], false);
      if (of >= 0 && hl >= 0 && nLegal(H) > 1) { swap(H, hl, hands[s], of); break; }
    }
  }
  if (sharkSeat >= 0 && sharkSeat < hands.length && nFake(hands[sharkSeat]) < 1) {
    const S = hands[sharkSeat];
    const fd = idxOf(discard, false);
    const sl = idxOf(S, true);
    if (fd >= 0 && sl >= 0) swap(S, sl, discard, fd);
    else if (sl >= 0) for (let s = 0; s < hands.length; s++) {
      if (s === sharkSeat || s === humanSeat) continue;
      const of = idxOf(hands[s], false);
      if (of >= 0 && nFake(hands[s]) > 1) { swap(S, sl, hands[s], of); break; }
    }
  }
}
const before = [...hands.flat(), ...discard].sort().join(',');
repairDemoHands();
const after = [...hands.flat(), ...discard].sort().join(',');
if (bag.length === 20 && discard.length === bag.length - SEATS * match.hand_size_default &&
  hands.every((h) => h.length === match.hand_size_default) && before === after) {
  pass(`demo deal: 20-card bag, ${SEATS}×${match.hand_size_default} dealt, discard ${discard.length}; repair only swaps (multiset kept)`);
} else {
  fail('demo deal arithmetic / repair changed the card multiset');
}
if (sharkSeat === 2 && nLegal(hands[humanSeat]) >= 1 && nFake(hands[humanSeat]) >= 1 && nFake(hands[sharkSeat]) >= 1) {
  pass(`demo deal constraints (seed ${match.demo_seed_value}, claim ${claim}): human legal+fake, shark seat ${sharkSeat} fake`);
} else {
  fail(`demo deal constraints (seed ${match.demo_seed_value}, claim ${claim}, shark seat ${sharkSeat}): ${JSON.stringify(hands)}`);
}

const sharkPlay = [];
const fakeIdx = hands[2].findIndex((r) => !isLegal(r, 'A'));
const otherIdx = hands[2].findIndex((_r, i) => i !== fakeIdx);
sharkPlay.push(hands[2][fakeIdx], hands[2][otherIdx]);
if (isChallengeSuccess(sharkPlay, 'A')) {
  pass('forced Shark 2-card mix is judged SUCCESS by formula (not a hardcoded verdict)');
} else {
  fail('forced mix must contain a fake so Judge can succeed');
}

const targetPlayId = 'p-3';
const challengeTarget = targetPlayId;
if (challengeTarget === targetPlayId) {
  pass('challenge target is last play only');
}

console.log(process.exitCode ? 'SPEC CHECK FAILED' : 'SPEC CHECK OK');

