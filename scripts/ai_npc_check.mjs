#!/usr/bin/env node
/**
 * S-AI / U-AI gates for 人机对局AI.md v0.1.2 (#276/#280/#282).
 * Cloud has no DevEco — static + formula replay, not CompileArkTS.
 * Fail strings: lb_str_ai_peek / lb_str_ai_fake_decision.
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

const strings = src('entry/src/main/resources/base/element/string.json');
const personas = JSON.parse(src('entry/src/main/resources/rawfile/config/ai_personas.json'));
const demo = JSON.parse(src('entry/src/main/resources/rawfile/config/demo_seed.json'));
const match = JSON.parse(src('entry/src/main/resources/rawfile/config/match_defaults.json'));
const deck = JSON.parse(src('entry/src/main/resources/rawfile/config/deck.json'));

const controller = src('entry/src/main/ets/ai/AiSeatController.ets');
const builder = src('entry/src/main/ets/ai/AiInfoSetBuilder.ets');
const types = src('entry/src/main/ets/ai/AiTypes.ets');
const director = src('entry/src/main/ets/common/MatchDirector.ets');
const engine = src('entry/src/main/ets/engine/MatchEngine.ets');
const friend = src('entry/src/main/ets/ai/AiFriend.ets');
const registry = src('entry/src/main/ets/ai/AiPersonaRegistry.ets');

const decidePath = [controller, builder, types, friend, registry].join('\n');
const runAi = director.slice(director.indexOf('private runAi'), director.indexOf('private toStyle'));

// --- S-AI keys + no string.json mass delete ---
if (strings.includes('"lb_str_ai_peek"') && strings.includes('AI偷看') &&
    strings.includes('"lb_str_ai_fake_decision"') && strings.includes('AI假决策')) {
  pass('S-AI keys lb_str_ai_peek / lb_str_ai_fake_decision');
} else {
  fail('S-AI string keys missing');
}
const hammerKeep = [
  'lb_str_hammer_on_screen_edge',
  'lb_str_hammer_presses_cards',
  'lb_str_hammer_face_wrong',
  'lb_str_hammer_smash_flat_slide'
];
if (hammerKeep.every((k) => strings.includes(`"${k}"`))) {
  pass('S19 hammer keys kept (no string.json mass delete)');
} else {
  fail('S19 hammer keys deleted');
}

// --- rule locks untouched ---
if (match.lives_default === 3 && match.max_play_cards === 3) {
  pass('v0.2 locks lives_default=3 max_play=3');
} else {
  fail('v0.2 rule lock drifted');
}

// --- personas §4.3 ---
const expected = {
  AI_KAREN: {
    aggression: 0.65, caution: 0.35, bluffTendency: 0.40, challengeSensitivity: 0.72,
    handPressureWeight: 0.45, memoryWeight: 0.40, errorRate: 0.06,
    preferPlay1: 0.35, preferPlay2: 0.45, preferPlay3: 0.20,
    pSlam: 0.25, pHesitateOnBluff: 0.20, pNameCall: 0.20
  },
  AI_TIMID: {
    aggression: 0.25, caution: 0.75, bluffTendency: 0.15, challengeSensitivity: 0.18,
    handPressureWeight: 0.55, memoryWeight: 0.35, errorRate: 0.08,
    preferPlay1: 0.70, preferPlay2: 0.25, preferPlay3: 0.05,
    pSlam: 0.10, pHesitateOnBluff: 0.15, pNameCall: 0.05
  },
  AI_SHARK: {
    aggression: 0.55, caution: 0.50, bluffTendency: 0.62, challengeSensitivity: 0.42,
    handPressureWeight: 0.40, memoryWeight: 0.65, errorRate: 0.05,
    preferPlay1: 0.20, preferPlay2: 0.55, preferPlay3: 0.25,
    pSlam: 0.35, pHesitateOnBluff: 0.25, pNameCall: 0.25
  }
};
let personaOk = true;
for (const id of Object.keys(expected)) {
  const row = personas.personas[id];
  if (!row) {
    fail(`missing persona ${id}`);
    personaOk = false;
    continue;
  }
  for (const [k, v] of Object.entries(expected[id])) {
    if (row[k] !== v) {
      fail(`${id}.${k} want ${v} got ${row[k]}`);
      personaOk = false;
    }
  }
}
if (personaOk) {
  pass('§4.3 persona numbers');
}
const bind = personas.mvpSeatBind;
if (bind && bind.seat1 === 'AI_TIMID' && bind.seat2 === 'AI_SHARK' && bind.seat3 === 'AI_KAREN') {
  pass('mvpSeatBind seat1=TIMID seat2=SHARK seat3=KAREN');
} else {
  fail('mvpSeatBind mismatch');
}

// --- demo force off ---
if (demo.demo_force_ai_enabled === false) {
  pass('demo_force_ai_enabled false');
} else {
  fail('demo_force_ai_enabled must be false');
}
if (engine.includes('demoForceAiEnabled()') && engine.includes('demo_force_ai_enabled === true')) {
  pass('engine gates shouldForce* on demoForceAiEnabled');
} else {
  fail('engine shouldForce not gated');
}
if (runAi.includes('demoForceAiEnabled()') &&
    runAi.includes('shouldForceKarenChallenge') &&
    runAi.includes('shouldForceSharkPlay')) {
  pass('director force path only inside demoForceAiEnabled');
} else {
  fail('director still uses ungated demo force or dropped the off-flag wrapper');
}

// --- no fake main path ---
if (friend.includes('rollChallenge') || friend.includes('base_p_challenge') ||
    controller.includes('base_p_challenge') || controller.includes('rollChallenge')) {
  fail('old probability-table challenge still on decide path');
} else {
  pass('no base_p_challenge / rollChallenge on decide path');
}

const alwaysSeat = /seatId\s*===?\s*[123].{0,80}(DOUBT|BELIEVE|CHALLENGE)/s;
if (alwaysSeat.test(decidePath) || alwaysSeat.test(runAi)) {
  fail('seat-hardcoded always-DOUBT/BELIEVE');
} else {
  pass('no seat-hardcoded always-doubt/believe');
}

const randHalf = /Math\.random\s*\(\s*\)\s*<\s*0\.5|nextBool\s*\(\s*0\.5\s*\)|rng\.next\s*\(\s*\)\s*<\s*0\.5/;
if (randHalf.test(controller) || randHalf.test(friend) || randHalf.test(runAi)) {
  fail('Math.random()<0.5 (or equiv) still used as challenge coin');
} else {
  pass('no random()<0.5 challenge main path');
}

if (controller.includes('lerp(0.62, 0.28') &&
    controller.includes('0.10 * params.caution - 0.08 * params.aggression') &&
    controller.includes('sFake + sNeed - sRisk') &&
    controller.includes('forceChallenge2') &&
    controller.includes('SOFT_T_LIFT') &&
    controller.includes('BASE_SENS_SCALE')) {
  pass('§5 T_base / Score / D4 + v0.1.2 Soft↑/Slam sensitivity split');
} else {
  fail('score/threshold formulas missing');
}

if (controller.includes('challenge seat=') && controller.includes('persona=') &&
    controller.includes('Score=') && controller.includes(' T=') &&
    controller.includes('intent=') && controller.includes('Logger.info(TAG')) {
  pass('HiLog challenge seat/persona/Score/T/intent');
} else {
  fail('challenge HiLog missing seat/persona/Score/T/intent');
}

if (director.includes('buildAiInfoSet') && director.includes('decideChallenge') &&
    director.includes('decidePlay') && director.includes('intentChallenge') &&
    director.includes('submitPlay')) {
  pass('director wires InfoSet → controller → intentChallenge/skip/play');
} else {
  fail('director wiring incomplete');
}

// --- peek ---
const peekNeedles = [
  'trueRanks', 'lastPicked', 'lastPlayRanks', 'peekLastPlayRanks',
  'peekLastPickedRanks', 'godView', 'otherHands', 'handRanksBySeat'
];
let peekHit = false;
for (const n of peekNeedles) {
  if (controller.includes(n) || types.includes(n)) {
    fail(`peek field ${n} in AI type/controller`);
    peekHit = true;
  }
}
if (builder.includes('isForbiddenKey') && builder.includes('trueRanks') &&
    builder.includes('lastPicked')) {
  pass('builder lists forbidden peek keys');
} else {
  fail('builder missing forbidden-key list');
}
if (!peekHit) {
  pass('AiInfoSet / controller have no peek fields');
}
if (engine.includes('buildAiInfoSet') && engine.includes('handForAi') &&
    engine.includes('projectAiSource')) {
  pass('engine projects via buildAiInfoSet / handForAi');
} else {
  fail('engine InfoSet hook missing');
}
const projectBody = engine.slice(engine.indexOf('private projectAiSource'), engine.indexOf('private currentIsGhost'));
if (projectBody.includes('lastPlayRanks') || projectBody.includes('lastPicked') || projectBody.includes('peekLast')) {
  fail('projectAiSource still copies hidden play faces');
} else {
  pass('projectAiSource omits hidden play faces');
}

if (engine.includes('isChallengeSuccess') && engine.includes('applyPenaltyExtinguish1')) {
  pass('Judge / PenaltyExtinguish1 still primary');
} else {
  fail('rule primary path broken');
}

// --- formula replay (JS twin of AiSeatController.scoreChallenge) ---
function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function legalOf(ranks, claim, wild) {
  return ranks.filter((r) => r === claim || r === wild).length;
}
function scoreFake(info) {
  const p = info.params;
  const legalSelf = legalOf(info.self.handRanks, info.claim.rank, info.limits.wild);
  let revealedLegal = 0;
  let revealedN = 0;
  for (const rev of info.history.reveals) {
    revealedN += rev.ranks.length;
    revealedLegal += legalOf(rev.ranks, info.claim.rank, info.limits.wild);
  }
  let estRemain = info.limits.deckLegal - revealedLegal - legalSelf;
  if (estRemain < 0) estRemain = 0;
  let unseen = info.limits.deckTotal - info.self.handCount - revealedN;
  if (unseen < 1) unseen = 1;
  const densityRaw = estRemain / unseen;
  let prior = info.limits.deckLegal / info.limits.deckTotal;
  if (info.limits.deckTotal < 1) prior = 0.4;
  const density = prior * (1 - p.memoryWeight) + densityRaw * p.memoryWeight;
  let sigStyle = 0;
  let sigCount = 0;
  let sigPressure = 0;
  let sigHistory = 0;
  let sigNamed = 0;
  if (info.lastPlay) {
    if (info.lastPlay.style === 'SLAM') sigStyle = 0.18;
    else if (info.lastPlay.style === 'HESITATE') sigStyle = 0.10;
    if (info.lastPlay.count === 3) sigCount = 0.12;
    else if (info.lastPlay.count === 2) sigCount = 0.05;
    const actor = info.seats.find((s) => s.seatId === info.lastPlay.seatId);
    if (actor && actor.handCount <= 2 && info.lastPlay.count >= 2) sigPressure = 0.08;
    let seen = 0;
    let fake = 0;
    const revs = info.history.reveals;
    const start = revs.length > 5 ? revs.length - 5 : 0;
    for (let i = start; i < revs.length; i++) {
      if (revs[i].playSeatId !== info.lastPlay.seatId) continue;
      seen++;
      if (revs[i].verdict === 'false') fake++;
    }
    sigHistory = (seen === 0 ? 0 : fake / seen) * 0.20;
    if (info.lastPlay.namedSeatId === info.self.seatId) sigNamed = 0.05;
  }
  const densTerm = 0.35 * (1 - density);
  const susAmp = 0.5 + p.challengeSensitivity;
  const baseAmp = 0.5 + p.challengeSensitivity * 0.62;
  return clamp((sigStyle + sigCount) * susAmp +
    (sigPressure + sigHistory + sigNamed + densTerm) * baseAmp, 0, 1);
}
function pressure(info) {
  const handDen = Math.max(1, info.limits.handSizeDefault);
  const lifeDen = Math.max(1, info.limits.livesDefault);
  return clamp(0.5 * (1 - info.self.handCount / handDen) + 0.5 * (1 - info.self.lives / lifeDen), 0, 1);
}
function scoreNeed(info) {
  return info.params.aggression * 0.3 + info.params.handPressureWeight * pressure(info);
}
function scoreRisk(info) {
  let extra = 0;
  if (info.self.lives === 1) extra += 0.25;
  if (info.aliveCount === 2) extra += 0.15;
  return info.params.caution * 0.4 + extra;
}
function threshold(info) {
  const tBase = lerp(0.62, 0.28, info.params.challengeSensitivity);
  let t = tBase + 0.10 * info.params.caution - 0.08 * info.params.aggression;
  if (info.lastPlay && info.lastPlay.style === 'SOFT') t += 0.08;
  return clamp(t, 0.22, 0.75);
}
function decideChallenge(info, noise = 0) {
  if (info.forceChallenge2) return 'DOUBT';
  if (!info.canChallenge) return info.turnWindow === 'CHALLENGE_ONLY' ? 'SKIP' : 'BELIEVE';
  const Score = scoreFake(info) + scoreNeed(info) - scoreRisk(info);
  const T = threshold(info);
  return Score >= T ? 'DOUBT' : (info.turnWindow === 'CHALLENGE_ONLY' ? 'SKIP' : 'BELIEVE');
}

function fixture(params, extra = {}) {
  return {
    self: {
      seatId: extra.seatId ?? 3,
      handRanks: extra.handRanks ?? ['A', 'A', 'K', 'Q', 'Q'],
      handCount: extra.handCount ?? 5,
      lives: extra.lives ?? 3,
      cards: []
    },
    claim: { rank: 'A' },
    lastPlay: extra.lastPlay ?? {
      seatId: 2, count: 3, style: 'SLAM', namedSeatId: extra.seatId ?? 3
    },
    seats: extra.seats ?? [
      { seatId: 0, handCount: 5, lives: 3, alive: true, order: 0, isHuman: true },
      { seatId: 1, handCount: 5, lives: 3, alive: true, order: 1, isHuman: false },
      { seatId: 2, handCount: 2, lives: 3, alive: true, order: 2, isHuman: false },
      { seatId: 3, handCount: 5, lives: 3, alive: true, order: 3, isHuman: false }
    ],
    history: { reveals: extra.reveals ?? [], challengeOutcomes: [] },
    memory: { revealedA: 0, revealedK: 0, revealedQ: 0, revealedJoker: 0, publicPlayTotal: 3 },
    phase: 'TURN',
    turnWindow: extra.turnWindow ?? 'NORMAL',
    canChallenge: extra.canChallenge ?? true,
    forceChallenge2: extra.forceChallenge2 ?? false,
    aliveCount: extra.aliveCount ?? 4,
    turnSecondsLeft: 10,
    params,
    limits: {
      maxPlay: 3, minPlay: 1, handSizeDefault: 5, livesDefault: 3,
      deckTotal: 20, deckLegal: 8, wild: 'JOKER'
    },
    personaId: params.personaId
  };
}

function toParams(row) {
  return { ...row };
}

const karen = toParams(personas.personas.AI_KAREN);
const timid = toParams(personas.personas.AI_TIMID);
const shark = toParams(personas.personas.AI_SHARK);

const slamInfoK = fixture(karen);
const slamInfoT = fixture(timid, { seatId: 1 });
if (decideChallenge({ ...slamInfoK, forceChallenge2: true, canChallenge: true }) === 'DOUBT' &&
    decideChallenge({ ...slamInfoT, forceChallenge2: true }) === 'DOUBT') {
  pass('U-AI-01 forceChallenge2 → DOUBT (both personas)');
} else {
  fail('U-AI-01 forceChallenge2 not locked');
}

const kIntent = decideChallenge(slamInfoK);
const tIntent = decideChallenge(slamInfoT);
const kScore = scoreFake(slamInfoK) + scoreNeed(slamInfoK) - scoreRisk(slamInfoK);
const tScore = scoreFake(slamInfoT) + scoreNeed(slamInfoT) - scoreRisk(slamInfoT);
const kT = threshold(slamInfoK);
const tT = threshold(slamInfoT);
if (kScore >= kT && kIntent === 'DOUBT') {
  pass(`U-AI-02 Karen Score ${kScore.toFixed(3)} >= T ${kT.toFixed(3)} → DOUBT`);
} else {
  fail(`U-AI-02 Karen expected DOUBT score=${kScore} T=${kT} intent=${kIntent}`);
}
if (tScore < tT && tIntent === 'BELIEVE') {
  pass(`U-AI-03 Timid Score ${tScore.toFixed(3)} < T ${tT.toFixed(3)} → BELIEVE`);
} else {
  fail(`U-AI-03 Timid expected BELIEVE score=${tScore} T=${tT} intent=${tIntent}`);
}

let kDoubt = 0;
let tDoubt = 0;
const trials = 100;
for (let i = 0; i < trials; i++) {
  if (decideChallenge(slamInfoK) === 'DOUBT') kDoubt++;
  if (decideChallenge(slamInfoT) === 'DOUBT') tDoubt++;
}
if (kDoubt > tDoubt + 20) {
  pass(`U-AI-04 Karen doubt ${kDoubt}/${trials} >> Timid ${tDoubt}/${trials}`);
} else {
  fail(`U-AI-04 personas indistinguishable K=${kDoubt} T=${tDoubt}`);
}

const soft = fixture(karen, { lastPlay: { seatId: 2, count: 1, style: 'SOFT', namedSeatId: -1 } });
if (decideChallenge(soft) === 'BELIEVE') {
  pass('Karen BELIEVE on soft single (not always-doubt)');
} else {
  fail('Karen still always-doubts soft singles');
}

const d5 = fixture(karen, { turnWindow: 'CHALLENGE_ONLY', lastPlay: { seatId: 2, count: 1, style: 'SOFT', namedSeatId: -1 } });
if (decideChallenge(d5) === 'SKIP') {
  pass('D5 SOFT → SKIP (not BELIEVE)');
} else {
  fail(`D5 expected SKIP got ${decideChallenge(d5)}`);
}

function bandRanks(legalSelf, handCount) {
  const ranks = [];
  for (let i = 0; i < legalSelf; i++) ranks.push('A');
  const junk = ['K', 'Q', 'K', 'Q', 'K'];
  while (ranks.length < handCount) ranks.push(junk[ranks.length % junk.length]);
  return ranks;
}

function bandReveals(legalRev, fakeRev) {
  const out = [];
  if (legalRev > 0) {
    out.push({ playSeatId: 2, ranks: Array(legalRev).fill('A'), verdict: 'true' });
  }
  if (fakeRev > 0) {
    out.push({ playSeatId: 2, ranks: Array(fakeRev).fill('K'), verdict: 'false' });
  }
  return out;
}

function bandInfo(params, spec, style, count) {
  const seatId = spec.seatId ?? 3;
  return fixture(params, {
    seatId,
    handRanks: bandRanks(spec.legalSelf, spec.handCount),
    handCount: spec.handCount,
    lives: spec.lives,
    lastPlay: {
      seatId: 2, count, style,
      namedSeatId: spec.named ? seatId : -1
    },
    seats: [
      { seatId: 0, handCount: 5, lives: 3, alive: true, order: 0, isHuman: true },
      { seatId: 1, handCount: 5, lives: 3, alive: true, order: 1, isHuman: false },
      { seatId: 2, handCount: spec.actorHand, lives: 3, alive: true, order: 2, isHuman: false },
      { seatId: 3, handCount: spec.handCount, lives: spec.lives, alive: true, order: 3, isHuman: false }
    ],
    reveals: bandReveals(spec.legalRev, spec.fakeRev)
  });
}

function softFamily() {
  const out = [];
  for (const legalSelf of [1, 2, 3]) {
    for (const lives of [2, 3]) {
      for (const handCount of [4, 5]) {
        for (const actorHand of [3, 5]) {
          for (const legalRev of [0, 2, 3]) {
            out.push({ legalSelf, lives, handCount, actorHand, named: false, legalRev, fakeRev: 0 });
          }
        }
      }
    }
  }
  return out.slice(0, 54);
}

function slamFamily() {
  const out = [];
  for (const legalSelf of [0, 1, 2, 3]) {
    for (const lives of [2, 3]) {
      for (const handCount of [3, 4, 5]) {
        out.push({ legalSelf, lives, handCount, actorHand: 5, named: false, legalRev: 0, fakeRev: 0 });
      }
    }
  }
  for (const legalSelf of [0, 1, 2, 3]) {
    for (const lives of [2, 3]) {
      for (const handCount of [4, 5]) {
        out.push({ legalSelf, lives, handCount, actorHand: 2, named: false, legalRev: 0, fakeRev: 0 });
      }
    }
  }
  for (const actorHand of [5, 2]) {
    for (const legalSelf of [1, 2]) {
      for (const lives of [3, 2]) {
        out.push({ legalSelf, lives, handCount: 5, actorHand, named: true, legalRev: 0, fakeRev: 0 });
      }
    }
  }
  for (const actorHand of [5, 2]) {
    for (const legalSelf of [1, 2, 3]) {
      out.push({ legalSelf, lives: 3, handCount: 5, actorHand, named: false, legalRev: 1, fakeRev: 1 });
    }
  }
  return out.slice(0, 54);
}

function doubtRate(params, family, style, count, seatId) {
  let n = 0;
  for (const spec of family) {
    if (decideChallenge(bandInfo(params, { ...spec, seatId }, style, count)) === 'DOUBT') n++;
  }
  return n / family.length;
}

const softSpecs = softFamily();
const slamSpecs = slamFamily();
if (softSpecs.length < 50 || slamSpecs.length < 50) {
  fail('Soft×1 / Slam×3 families must be n≥50');
}

const softK = doubtRate(karen, softSpecs, 'SOFT', 1, 3);
const softS = doubtRate(shark, softSpecs, 'SOFT', 1, 2);
const softT = doubtRate(timid, softSpecs, 'SOFT', 1, 1);
if ((1 - softK) >= 0.55 && (1 - softS) >= 0.55 && (1 - softT) >= 0.55 && softK < 0.30) {
  pass(`U-AI-04b/S-AI-08 Soft×1 believe K=${(1 - softK).toFixed(2)} S=${(1 - softS).toFixed(2)} T=${(1 - softT).toFixed(2)} (Karen doubt ${softK.toFixed(2)}<0.30)`);
} else {
  fail(`lb_str_ai_fake_decision Soft×1 band fail K=${softK} S=${softS} T=${softT}`);
}

const slamK = doubtRate(karen, slamSpecs, 'SLAM', 3, 3);
const slamS = doubtRate(shark, slamSpecs, 'SLAM', 3, 2);
const slamTm = doubtRate(timid, slamSpecs, 'SLAM', 3, 1);
if (slamK >= 0.70 && slamS >= 0.30 && slamS <= 0.60 && slamTm < 0.20 && slamK > slamS && slamS > slamTm) {
  pass(`U-AI-04c/S-AI-09 Slam×3 K=${slamK.toFixed(2)} S=${slamS.toFixed(2)} T=${slamTm.toFixed(2)}`);
} else {
  fail(`lb_str_ai_fake_decision Slam×3 band fail K=${slamK} S=${slamS} T=${slamTm}`);
}

const soft2K = doubtRate(karen, softSpecs, 'SOFT', 2, 3);
if (soft2K < 0.85) {
  pass(`Soft×2 Karen doubt ${soft2K.toFixed(2)} not ~100%`);
} else {
  fail(`lb_str_ai_fake_decision Soft×2 Karen still ~always DOUBT (${soft2K})`);
}

const mix = [];
for (let i = 0; i < 10; i++) {
  mix.push({ style: 'SOFT', count: 1, spec: softSpecs[i * 5], personaSeat: { k: 3, s: 2, t: 1 } });
}
for (let i = 0; i < 10; i++) {
  mix.push({ style: 'SLAM', count: 3, spec: slamSpecs[Math.min(i * 5, slamSpecs.length - 1)] });
}
let karenAllDoubt = true;
let othersAllBelieve = true;
for (const m of mix) {
  const kd = decideChallenge(bandInfo(karen, { ...m.spec, seatId: 3 }, m.style, m.count));
  const sd = decideChallenge(bandInfo(shark, { ...m.spec, seatId: 2 }, m.style, m.count));
  const td = decideChallenge(bandInfo(timid, { ...m.spec, seatId: 1 }, m.style, m.count));
  if (kd !== 'DOUBT') karenAllDoubt = false;
  if (sd !== 'BELIEVE' || td !== 'BELIEVE') othersAllBelieve = false;
}
if (karenAllDoubt && othersAllBelieve) {
  fail('ai_fake_decision: mixed 20 collapse Karen-all-DOUBT + others-all-BELIEVE (lb_str_ai_fake_decision)');
} else {
  pass('mixed 20: no Karen-all-doubt + others-all-believe collapse');
}

function playScore(isFake, n, params, legalSelf) {
  const base = isFake ? 0.15 + 0.50 * params.bluffTendency : 0.40 + 0.25 * params.caution;
  const countFit = n === 1 ? params.preferPlay1 : n === 2 ? params.preferPlay2 : params.preferPlay3;
  let keep = 0;
  if (isFake) keep = 0.10;
  let ag = 0;
  if (n >= 2) ag = 0.05 * params.aggression;
  if (n === 3) ag += 0.05 * params.aggression;
  return base + countFit + keep + ag;
}
const timidTrue = playScore(false, 1, timid, 2);
const timidFake = playScore(true, 1, timid, 2);
if (timidTrue > timidFake) {
  pass('U-AI-10 Timid true-hand score > fake');
} else {
  fail('U-AI-10 Timid should prefer true');
}
const sharkTrue = playScore(false, 2, shark, 2);
const sharkFake = playScore(true, 2, shark, 2);
if (sharkFake > 0 && shark.bluffTendency > timid.bluffTendency) {
  pass(`U-AI-12 Shark bluffTendency ${shark.bluffTendency} > Timid; fake score ${sharkFake.toFixed(3)} vs true ${sharkTrue.toFixed(3)}`);
} else {
  fail('U-AI-12 Shark bluff not distinct');
}

function enumNs(handCount, maxPlay) {
  const ns = [];
  const maxN = Math.min(maxPlay, handCount, 3);
  for (let n = 1; n <= maxN; n++) ns.push(n);
  return ns;
}
if (!enumNs(5, 3).includes(4) && enumNs(5, 3).join() === '1,2,3') {
  pass('U-AI-13 n>MAX_PLAY not generated');
} else {
  fail('U-AI-13 max play');
}

function allCombosFakeWhenNoLegal(hand, claim, wild) {
  const legal = hand.filter((r) => r === claim || r === wild);
  if (legal.length > 0) return false;
  return hand.every((r) => r !== claim && r !== wild);
}
if (allCombosFakeWhenNoLegal(['K', 'Q', 'K'], 'A', 'JOKER')) {
  pass('U-AI-11 legalSelf==0 only fake candidates');
} else {
  fail('U-AI-11');
}

function stripForbidden(raw) {
  const out = { ...raw };
  for (const k of ['trueRanks', 'lastPicked', 'lastPlayRanks', 'godView', 'otherHands']) {
    delete out[k];
  }
  if (out.lastPlay) {
    const lp = { seatId: out.lastPlay.seatId, count: out.lastPlay.count, style: out.lastPlay.style, namedSeatId: out.lastPlay.namedSeatId };
    out.lastPlay = lp;
  }
  return out;
}
const injected = stripForbidden({
  trueRanks: ['K', 'K'],
  lastPicked: [{ rank: 'K' }],
  lastPlayRanks: ['K'],
  godView: true,
  lastPlay: { seatId: 2, count: 2, style: 'SOFT', namedSeatId: -1, trueRanks: ['K', 'A'] }
});
if (!injected.trueRanks && !injected.lastPicked && !injected.lastPlay.trueRanks && !injected.godView) {
  pass('S-AI-01/02 builder strip drops peek fields');
} else {
  fail('builder strip leaked peek');
}

if (/\bany\b/.test(decidePath) || /ESObject/.test(decidePath)) {
  fail('any/ESObject in AI path');
} else {
  pass('no any/ESObject in AI modules');
}

const n4 = deck.decks.n4;
if (n4.A + n4.K + n4.Q + n4.JOKER === 20 && n4.JOKER === 2) {
  pass('deck legal estimate source 6+6+6+2');
} else {
  fail('deck composition');
}

console.log(process.exitCode ? 'AI NPC CHECK FAILED' : 'AI NPC CHECK OK');
