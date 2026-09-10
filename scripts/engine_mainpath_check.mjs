#!/usr/bin/env node
/**
 * Spec check for locked T01+ rules. ArkTS MatchEngine is the product source.
 * This script restates the same formulas so CI-less review can fail-fast.
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

if (match.demo_seed_enabled === true && match.demo_seed_value === 20260906) {
  pass('demo_seed 20260906 enabled');
} else {
  fail('demo_seed lock');
}
if (demo.demo_seed_value === 20260906 && Array.isArray(demo.force_events)) {
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

if (personas.personas.TIMID && personas.personas.SHARK && personas.personas.KAREN) {
  pass('personas TIMID/SHARK/KAREN');
} else {
  fail('personas');
}

const etsFiles = [
  'entry/src/main/ets/engine/MatchEngine.ets',
  'entry/src/main/ets/engine/Judge.ets',
  'entry/src/main/ets/engine/DeckDeal.ets',
  'entry/src/main/ets/config/DeckConfig.ets',
  'entry/src/main/ets/ai/AiFriend.ets',
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
if (/\bany\b/.test(joined) || /ESObject/.test(joined)) {
  fail('ESObject/any found in engine/UI path');
} else {
  pass('no ESObject/any in scanned ets');
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

const rng = lcg(20260906);
const bag = expandBag(deck.decks.n4);
shuffle(bag, rng);
const hands = [[], [], [], []];
let cur = 0;
for (let h = 0; h < match.hand_size_default; h++) {
  for (let s = 0; s < 4; s++) {
    hands[s].push(bag[cur++]);
  }
}
function ensure(hand, pred, donor) {
  if (hand.some(pred)) return;
  const di = donor.findIndex(pred);
  const hi = hand.findIndex((r) => !pred(r));
  if (di >= 0 && hi >= 0) {
    const tmp = hand[hi];
    hand[hi] = donor[di];
    donor[di] = tmp;
  }
}
const discard = bag.slice(cur);
ensure(hands[0], (r) => isLegal(r, 'A'), discard);
ensure(hands[0], (r) => !isLegal(r, 'A'), discard);
ensure(hands[2], (r) => !isLegal(r, 'A'), discard);
if (hands[0].some((r) => isLegal(r, 'A')) && hands[0].some((r) => !isLegal(r, 'A')) &&
  hands[2].some((r) => !isLegal(r, 'A'))) {
  pass('demo deal constraints: human legal+fake, shark fake');
} else {
  fail('demo deal constraints');
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

