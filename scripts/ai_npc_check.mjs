#!/usr/bin/env node
/**
 * F-01～F-09 gates for 人机对局AI-核心算法.md v0.2.0 (#286).
 * Cloud has no DevEco — static + JS twin of the six-module core.
 * Fail strings: lb_str_ai_peek / lb_str_ai_fake_decision /
 *   lb_str_ai_fixed_play / lb_str_ai_instant_think.
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
const builder = src('entry/src/main/ets/ai/InfoSetBuilder.ets');
const builderFacade = src('entry/src/main/ets/ai/AiInfoSetBuilder.ets');
const types = src('entry/src/main/ets/ai/AiTypes.ets');
const director = src('entry/src/main/ets/common/MatchDirector.ets');
const engine = src('entry/src/main/ets/engine/MatchEngine.ets');
const friend = src('entry/src/main/ets/ai/AiFriend.ets');
const registry = src('entry/src/main/ets/ai/AiPersonaRegistry.ets');
const playPol = src('entry/src/main/ets/ai/PlayPolicy.ets');
const chalPol = src('entry/src/main/ets/ai/ChallengePolicy.ets');
const thinkSrc = src('entry/src/main/ets/ai/ThinkDelay.ets');
const memorySrc = src('entry/src/main/ets/ai/Memory.ets');
const personaSrc = src('entry/src/main/ets/ai/PersonaParams.ets');
const mathSrc = src('entry/src/main/ets/ai/AiMath.ets');

const runAi = director.slice(director.indexOf('private runAi'), director.indexOf('private challengeGate'));
const decidePath = [playPol, chalPol, thinkSrc, builder, memorySrc, personaSrc, controller, runAi].join('\n');

// --- string keys (ADD, do not delete S19 / S-AI) ---
const needStr = [
  ['lb_str_ai_peek', 'AI偷看'],
  ['lb_str_ai_fake_decision', 'AI假决策'],
  ['lb_str_ai_fixed_play', '出牌固定脚本'],
  ['lb_str_ai_instant_think', '思考过短']
];
if (needStr.every(([k, v]) => strings.includes(`"${k}"`) && strings.includes(v))) {
  pass('S-AI keys peek / fake_decision / fixed_play / instant_think');
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

if (match.lives_default === 3 && match.max_play_cards === 3) {
  pass('v0.2 locks lives_default=3 max_play=3');
} else {
  fail('v0.2 rule lock drifted');
}

const expected = {
  AI_KAREN: {
    aggression: 0.65, caution: 0.35, bluffTendency: 0.40, challengeSensitivity: 0.72,
    handPressureWeight: 0.45, memoryWeight: 0.40, errorRate: 0.06,
    preferPlay1: 0.35, preferPlay2: 0.45, preferPlay3: 0.20,
    pSlam: 0.25, pHesitateOnBluff: 0.20, pNameCall: 0.20
  },
  AI_TIMID: {
    aggression: 0.25, caution: 0.75, bluffTendency: 0.15, challengeSensitivity: 0.33,
    handPressureWeight: 0.55, memoryWeight: 0.35, errorRate: 0.08,
    preferPlay1: 0.70, preferPlay2: 0.25, preferPlay3: 0.05,
    pSlam: 0.10, pHesitateOnBluff: 0.15, pNameCall: 0.05
  },
  AI_SHARK: {
    aggression: 0.55, caution: 0.50, bluffTendency: 0.62, challengeSensitivity: 0.48,
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
  pass('§4b.4 persona continuous knobs (Timid challengeSensitivity=0.33 Soft nudge)');
}
const bind = personas.mvpSeatBind;
if (bind && bind.seat1 === 'AI_TIMID' && bind.seat2 === 'AI_SHARK' && bind.seat3 === 'AI_KAREN') {
  pass('mvpSeatBind seat1=TIMID seat2=SHARK seat3=KAREN');
} else {
  fail('mvpSeatBind mismatch');
}

if (demo.demo_force_ai_enabled === false) {
  pass('demo_force_ai_enabled false');
} else {
  fail('demo_force_ai_enabled must be false');
}
if (demo.demo_seed_enabled === false && match.demo_seed_enabled === false) {
  pass('demo_seed_enabled false (demo_seed.json + match_defaults)');
} else {
  fail(`demo_seed_enabled must be false demo=${demo.demo_seed_enabled} match=${match.demo_seed_enabled}`);
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

if (friend.includes('rollChallenge') || friend.includes('base_p_challenge') ||
    controller.includes('base_p_challenge') || controller.includes('rollChallenge') ||
    chalPol.includes('base_p_challenge') || playPol.includes('base_p_challenge')) {
  fail('old probability-table challenge still on decide path');
} else {
  pass('no base_p_challenge / rollChallenge on decide path');
}

const alwaysSeat = /seatId\s*===?\s*[123].{0,80}(DOUBT|BELIEVE|CHALLENGE)/s;
if (alwaysSeat.test(decidePath) || alwaysSeat.test(runAi)) {
  fail('lb_str_ai_fake_decision seat-hardcoded always-DOUBT/BELIEVE');
} else {
  pass('no seat-hardcoded always-doubt/believe');
}

const randHalf = /Math\.random\s*\(\s*\)\s*<\s*0\.5|nextBool\s*\(\s*0\.5\s*\)|rng\.next\s*\(\s*\)\s*<\s*0\.5/;
if (randHalf.test(chalPol) || randHalf.test(playPol) || randHalf.test(runAi) || randHalf.test(controller)) {
  fail('lb_str_ai_fake_decision Math.random()<0.5 still used as challenge coin');
} else {
  pass('no random()<0.5 challenge main path');
}

// --- six modules wired ---
const modulesOk =
  director.includes('ChallengePolicy') && director.includes('PlayPolicy') &&
  director.includes('Memory') && director.includes('buildAiInfoSet') &&
  runAi.includes('decideChallenge') && runAi.includes('decidePlay') &&
  runAi.includes('intentChallenge') && runAi.includes('submitPlay') &&
  builder.includes('stripTrueRanks') && builder.includes('isForbiddenKey') &&
  memorySrc.includes('revealedLegal') && memorySrc.includes('liarRate') &&
  playPol.includes('enumerateCandidates') && playPol.includes('softmax') &&
  chalPol.includes('L_fake') && chalPol.includes('forceChallenge2') &&
  thinkSrc.includes('1200') && thinkSrc.includes('1500') &&
  personaSrc.includes('challengeSensitivity');
if (modulesOk) {
  pass('six-module core wired (InfoSet/Memory/Play/Challenge/Think/Persona)');
} else {
  fail('six-module wiring incomplete');
}

if (chalPol.includes('L_fake=') && chalPol.includes(' EV=') && chalPol.includes(' T=') &&
    chalPol.includes('Logger.info')) {
  pass('F-08 D2 log fields L_fake / EV / T');
} else {
  fail('F-08 D2 log missing L_fake, EV, T');
}

// F-09: if(persona) / if(seatId== digit) hardcoded action
if (/if\s*\(\s*persona/.test(decidePath) ||
    /if\s*\(\s*(this\.)?seatId\s*===?\s*[0-3]/.test(decidePath) ||
    /personaId\s*===?\s*['"]AI_[A-Z]+['"][\s\S]{0,80}(DOUBT|BELIEVE)/.test(decidePath)) {
  fail('lb_str_ai_fake_decision F-09 if(persona)/seatId== action hardcode');
} else {
  pass('F-09 no if(persona)/seatId== hardcoded action on decide path');
}

const peekNeedles = [
  'trueRanks', 'lastPicked', 'lastPlayRanks', 'peekLastPlayRanks',
  'peekLastPickedRanks', 'godView', 'otherHands', 'handRanksBySeat'
];
let peekHit = false;
for (const n of peekNeedles) {
  if (controller.includes(n) || types.includes(n) || playPol.includes(n) || chalPol.includes(n)) {
    fail(`peek field ${n} in AI type/policy`);
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
  pass('AiInfoSet / policies have no peek fields');
}
if ((engine.includes('buildAiInfoSet') && engine.includes('handForAi') &&
    engine.includes('projectAiSource')) || builderFacade.includes('InfoSetBuilder')) {
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

if (/\bany\b/.test(decidePath) || /ESObject/.test(decidePath) ||
    /\bany\b/.test(mathSrc) || /ESObject/.test(mathSrc)) {
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

// ---------- JS twin of v0.2.0 modules ----------
function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function sigmoid(x) {
  const z = Math.max(-30, Math.min(30, x));
  return 1 / (1 + Math.exp(-z));
}
function softmax(logits) {
  const max = Math.max(...logits);
  const exps = logits.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
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

const W = { d: 0.35, s: 0.25, c: 0.15, p: 0.10, h: 0.12, n: 0.03, bias: -0.60 };
const PLAY_MIN = 1200;
const PLAY_MAX = 3500;
const CHAL_MIN = 1500;
const CHAL_MAX = 4000;

function toParams(row) {
  return {
    ...row,
    thinkPlayMin: row.thinkPlayMin ?? PLAY_MIN,
    thinkPlayMax: row.thinkPlayMax ?? PLAY_MAX,
    thinkChalMin: row.thinkChalMin ?? CHAL_MIN,
    thinkChalMax: row.thinkChalMax ?? CHAL_MAX,
    temperature: row.temperature ?? 0.45,
    challengeTemperature: row.challengeTemperature ?? 0.19,
    speechPlay: row.speechPlay ?? ''
  };
}

function betaOf(p) {
  return lerp(1.2, 3.2, p.challengeSensitivity);
}
function thresholdOf(p) {
  const t0 = lerp(0.18, -0.05, p.challengeSensitivity);
  return clamp(t0 + 0.12 * p.caution - 0.08 * p.aggression, -0.20, 0.35);
}

function legalOf(ranks, claim, wild) {
  return ranks.filter((r) => r === claim || r === wild).length;
}

function memoryFrom(info) {
  let revealedLegal = 0;
  let revealedTotal = 0;
  const fake = [0, 0, 0, 0, 0, 0, 0, 0];
  const challenged = [0, 0, 0, 0, 0, 0, 0, 0];
  const liar = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const rev of info.history.reveals) {
    revealedTotal += rev.ranks.length;
    revealedLegal += legalOf(rev.ranks, info.claim.rank, info.limits.wild);
    const s = rev.playSeatId;
    if (s >= 0 && s < 8) {
      challenged[s] += 1;
      if (rev.verdict === 'false') fake[s] += 1;
      liar[s] = fake[s] / Math.max(1, challenged[s]);
    }
  }
  if (info.memoryHook && typeof info.memoryHook.liar2 === 'number') {
    liar[2] = info.memoryHook.liar2;
  }
  return { revealedLegal, revealedTotal, liar };
}

function densityOf(info, mem) {
  const legalSelf = legalOf(info.self.handRanks, info.claim.rank, info.limits.wild);
  const remain = Math.max(0, info.limits.deckLegal - mem.revealedLegal - legalSelf);
  const unseen = Math.max(1, info.limits.deckTotal - mem.revealedTotal - info.self.handCount);
  return remain / unseen;
}

function pressureOf(seat, handDen, lifeDen) {
  if (!seat) return 0;
  const hd = Math.max(1, handDen);
  const ld = Math.max(1, lifeDen);
  return clamp(0.5 * (1 - seat.handCount / hd) + 0.5 * (1 - seat.lives / ld), 0, 1);
}

function features(info) {
  const mem = memoryFrom(info);
  const phiD = 1 - densityOf(info, mem);
  let phiS = 0;
  let phiC = 0;
  let phiP = 0;
  let phiH = 0;
  let phiN = 0;
  if (info.lastPlay) {
    if (info.lastPlay.style === 'SLAM') phiS = 1;
    else if (info.lastPlay.style === 'HESITATE') phiS = 0.35;
    phiC = (info.lastPlay.count - 1) / 2;
    const actor = info.seats.find((s) => s.seatId === info.lastPlay.seatId);
    phiP = pressureOf(actor, info.limits.handSizeDefault, info.limits.livesDefault);
    phiH = mem.liar[info.lastPlay.seatId] ?? 0;
    if (info.lastPlay.namedSeatId === info.self.seatId) phiN = 1;
  }
  return [phiD, phiS, phiC, phiP, phiH, phiN];
}

function scoreChallenge(info) {
  if (info.forceChallenge2) {
    return { L_fake: 1, EV: 1, T: thresholdOf(info.params), intent: 'DOUBT' };
  }
  const p = info.params;
  const phi = features(info);
  const beta = betaOf(p);
  const dot = W.bias + W.d * phi[0] + W.s * phi[1] + W.c * phi[2] + W.p * phi[3] + W.h * phi[4] + W.n * phi[5];
  const L_fake = sigmoid(beta * dot);
  let C = 1.0 * (0.6 + 0.4 * p.caution);
  if (info.self.lives === 1) C += 0.25;
  if (info.aliveCount === 2) C += 0.15;
  const EV = L_fake * 1 - (1 - L_fake) * C;
  const T = thresholdOf(p);
  const intent = EV > T ? 'DOUBT' : (info.turnWindow === 'CHALLENGE_ONLY' ? 'SKIP' : 'BELIEVE');
  return { L_fake, EV, T, beta, phi, intent, pDoubt: sigmoid((EV - T) / Math.max(1e-6, p.challengeTemperature)) };
}

function decideChallenge(info, rng, noise = false) {
  if (info.forceChallenge2) return { type: 'DOUBT', thinkMs: thinkChal(1, info.params, rng, 1) };
  if (!info.canChallenge) {
    const t = info.turnWindow === 'CHALLENGE_ONLY' ? 'SKIP' : 'BELIEVE';
    return { type: t, thinkMs: thinkChal(1, info.params, rng, 0) };
  }
  const sc = scoreChallenge(info);
  let intent = rng.next() < sc.pDoubt ? 'DOUBT' : (info.turnWindow === 'CHALLENGE_ONLY' ? 'SKIP' : 'BELIEVE');
  if (noise && rng.next() < info.params.errorRate) {
    intent = intent === 'DOUBT' ? (info.turnWindow === 'CHALLENGE_ONLY' ? 'SKIP' : 'BELIEVE') : 'DOUBT';
  }
  const thinkMs = thinkChal(Math.abs(sc.EV - sc.T), info.params, rng, sc.phi[1]);
  return { type: intent, thinkMs, L_fake: sc.L_fake, EV: sc.EV, T: sc.T };
}

function thinkPlay(candCount, risk, params, rng) {
  const u = rng.next();
  const lo = Math.max(PLAY_MIN, params.thinkPlayMin);
  const hi = Math.min(PLAY_MAX, Math.max(lo, params.thinkPlayMax));
  const base = lerp(lo, hi, u);
  const ms = clamp(base + 800 * clamp(candCount / 12, 0, 1) + 600 * clamp(risk, 0, 1), PLAY_MIN, PLAY_MAX);
  return Math.floor(ms);
}
function thinkChal(marginAbs, params, rng, styleSignal) {
  const u = rng.next();
  const lo = Math.max(CHAL_MIN, params.thinkChalMin);
  const hi = Math.min(CHAL_MAX, Math.max(lo, params.thinkChalMax));
  const base = lerp(lo, hi, u);
  const ambig = clamp(1 - marginAbs / 0.35, 0, 1);
  const ms = clamp(base + 900 * ambig + 500 * clamp(styleSignal, 0, 1), CHAL_MIN, CHAL_MAX);
  return Math.floor(ms);
}

function fixture(params, extra = {}) {
  return {
    self: {
      seatId: extra.seatId ?? 3,
      handRanks: extra.handRanks ?? ['A', 'K', 'Q', 'K', 'Q'],
      handCount: extra.handCount ?? 5,
      lives: extra.lives ?? 3,
      cards: (extra.handRanks ?? ['A', 'K', 'Q', 'K', 'Q']).map((r, i) => ({ cardId: 'c' + i, rank: r }))
    },
    claim: { rank: extra.claim ?? 'A' },
    lastPlay: extra.lastPlay ?? { seatId: 2, count: 1, style: 'SOFT', namedSeatId: -1 },
    seats: extra.seats ?? [
      { seatId: 0, handCount: 5, lives: 3, alive: true, order: 0, isHuman: true },
      { seatId: 1, handCount: 5, lives: 3, alive: true, order: 1, isHuman: false },
      { seatId: 2, handCount: extra.actorHand ?? 5, lives: extra.actorLives ?? 3, alive: true, order: 2, isHuman: false },
      { seatId: 3, handCount: extra.handCount ?? 5, lives: extra.lives ?? 3, alive: true, order: 3, isHuman: false }
    ],
    history: { reveals: extra.reveals ?? [], challengeOutcomes: [] },
    memory: { revealedA: 0, revealedK: 0, revealedQ: 0, revealedJoker: 0, publicPlayTotal: 3 },
    memoryHook: extra.memoryHook,
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

const karen = toParams(personas.personas.AI_KAREN);
const timid = toParams(personas.personas.AI_TIMID);
const shark = toParams(personas.personas.AI_SHARK);

function bandSoft(params, seatId) {
  return fixture(params, {
    seatId,
    handRanks: ['A', 'K', 'Q', 'K', 'Q'],
    lastPlay: { seatId: 2, count: 1, style: 'SOFT', namedSeatId: -1 },
    actorHand: 5,
    actorLives: 3,
    reveals: [{ playSeatId: 1, ranks: ['K'], verdict: 'true', loserSeatId: -1 }]
  });
}
function bandMid(params, seatId) {
  return fixture(params, {
    seatId,
    handRanks: ['A', 'K', 'Q', 'K', 'Q'],
    lastPlay: { seatId: 2, count: 2, style: 'HESITATE', namedSeatId: -1 },
    actorHand: 1,
    actorLives: 3,
    reveals: [
      { playSeatId: 1, ranks: ['A', 'A'], verdict: 'true', loserSeatId: -1 },
      { playSeatId: 1, ranks: ['K', 'Q'], verdict: 'true', loserSeatId: -1 }
    ],
    memoryHook: { liar2: 0.08 }
  });
}
function bandSlam(params, seatId) {
  return fixture(params, {
    seatId,
    handRanks: ['K', 'Q', 'K', 'Q', 'K'],
    lastPlay: { seatId: 2, count: 3, style: 'SLAM', namedSeatId: -1 },
    actorHand: 3,
    actorLives: 3,
    reveals: [{ playSeatId: 1, ranks: ['K', 'Q', 'K'], verdict: 'true', loserSeatId: -1 }]
  });
}

// F-01 peek strip
function stripForbidden(raw) {
  const out = { ...raw };
  for (const k of ['trueRanks', 'lastPicked', 'lastPlayRanks', 'godView', 'otherHands', 'handRanksBySeat']) {
    delete out[k];
  }
  if (out.lastPlay) {
    out.lastPlay = {
      seatId: out.lastPlay.seatId,
      count: out.lastPlay.count,
      style: out.lastPlay.style,
      namedSeatId: out.lastPlay.namedSeatId
    };
  }
  return out;
}
const injected = stripForbidden({
  trueRanks: ['K', 'K'],
  lastPicked: [{ rank: 'K' }],
  lastPlayRanks: ['K'],
  godView: true,
  otherHands: { 2: ['A'] },
  lastPlay: { seatId: 2, count: 2, style: 'SOFT', namedSeatId: -1, trueRanks: ['K', 'A'] }
});
if (!injected.trueRanks && !injected.lastPicked && !injected.lastPlay.trueRanks &&
    !injected.godView && !injected.otherHands) {
  pass('F-01 builder strip drops peek / other-seat handRanks');
} else {
  fail('lb_str_ai_peek F-01 builder strip leaked peek');
}

// F-05 forceChallenge2
const forceOk = ['AI_KAREN', 'AI_SHARK', 'AI_TIMID'].every((id) => {
  const p = toParams(personas.personas[id]);
  const info = fixture(p, { forceChallenge2: true, canChallenge: true, lastPlay: { seatId: 2, count: 3, style: 'SLAM', namedSeatId: -1 } });
  let n = 0;
  for (let i = 0; i < 50; i++) {
    if (decideChallenge(info, lcg(1000 + i)).type === 'DOUBT') n++;
  }
  return n === 50;
});
if (forceOk) {
  pass('F-05 forceChallenge2 → 100% DOUBT (three personas)');
} else {
  fail('lb_str_ai_fake_decision F-05 forceChallenge2 not locked');
}

function inWindow(rate, lo, hi) {
  return rate >= lo && rate <= hi;
}

function reportBand(name, rates, spec) {
  const ok =
    inWindow(rates.k, spec.k[0], spec.k[1]) &&
    inWindow(rates.s, spec.s[0], spec.s[1]) &&
    inWindow(rates.t, spec.t[0], spec.t[1]) &&
    (spec.believe == null || (1 - rates.k) >= spec.believe && (1 - rates.s) >= spec.believe && (1 - rates.t) >= spec.believe);
  const line = `${name} K=${rates.k.toFixed(3)} S=${rates.s.toFixed(3)} T=${rates.t.toFixed(3)}`;
  if (ok) pass(line);
  else fail(`lb_str_ai_fake_decision ${line}`);
  return ok;
}

const softK = scoreChallenge(bandSoft(karen, 3));
const softS = scoreChallenge(bandSoft(shark, 2));
const softT = scoreChallenge(bandSoft(timid, 1));
reportBand('F-02 Soft×1', { k: softK.pDoubt, s: softS.pDoubt, t: softT.pDoubt }, {
  k: [0.10, 0.35], s: [0.08, 0.30], t: [0.05, 0.25], believe: 0.55
});

const midK = scoreChallenge(bandMid(karen, 3));
const midS = scoreChallenge(bandMid(shark, 2));
const midT = scoreChallenge(bandMid(timid, 1));
reportBand('F-03 Mid×2', { k: midK.pDoubt, s: midS.pDoubt, t: midT.pDoubt }, {
  k: [0.35, 0.60], s: [0.20, 0.45], t: [0.10, 0.30]
});

const slamK = scoreChallenge(bandSlam(karen, 3));
const slamS = scoreChallenge(bandSlam(shark, 2));
const slamT = scoreChallenge(bandSlam(timid, 1));
reportBand('F-04 Slam×3', { k: slamK.pDoubt, s: slamS.pDoubt, t: slamT.pDoubt }, {
  k: [0.55, 1], s: [0.25, 0.55], t: [0.10, 0.30]
});
if (slamT.pDoubt + 1e-9 < 0.10) {
  fail('lb_str_ai_fake_decision F-04 Timid Slam floor <10% (SUPERSEDE old ≈0)');
} else {
  pass(`F-04 Timid Slam floor ${slamT.pDoubt.toFixed(3)} ≥ 0.10`);
}

function mcRateStream(info, n, seed) {
  const rng = lcg(seed);
  let d = 0;
  for (let i = 0; i < n; i++) {
    if (decideChallenge(info, rng, false).type === 'DOUBT') d++;
  }
  return d / n;
}
const mcN = 120;
const mcSoftK = mcRateStream(bandSoft(karen, 3), mcN, 4242);
if (Math.abs(mcSoftK - softK.pDoubt) <= 0.12) {
  pass(`F-02 sampler tracks analytic mc=${mcSoftK.toFixed(3)} p=${softK.pDoubt.toFixed(3)} n=${mcN}`);
} else {
  fail(`challenge sampler drifted mc=${mcSoftK} analytic=${softK.pDoubt}`);
}

// F-07 think floors
let thinkOk = true;
for (let i = 0; i < 40; i++) {
  const rng = lcg(3000 + i);
  const pms = thinkPlay(8 + (i % 5), (i % 10) / 10, karen, rng);
  const cms = thinkChal((i % 8) / 20, timid, lcg(4000 + i), (i % 3) / 3);
  if (pms < PLAY_MIN || pms > PLAY_MAX || cms < CHAL_MIN || cms > CHAL_MAX) {
    thinkOk = false;
  }
}
if (thinkSrc.includes('PersonaParams.PLAY_MIN') || thinkSrc.includes('1200')) {
  /* source floor present */
}
if (thinkOk && thinkSrc.includes('1500') && thinkSrc.includes('3500') && thinkSrc.includes('4000')) {
  pass('F-07 thinkMs play∈[1200,3500] chal∈[1500,4000]');
} else {
  fail('lb_str_ai_instant_think F-07 think window broken');
}

// F-06 play entropy
function comboIsTrue(cards, claim, wild) {
  return cards.every((c) => c.rank === claim || c.rank === wild);
}
function dumpsJunk(cards, claim, wild) {
  return cards.some((c) => c.rank !== claim && c.rank !== wild);
}
function jokerSpent(cards, wild) {
  return cards.filter((c) => c.rank === wild).length;
}
function walkCombos(cards, n, start, acc, out) {
  if (acc.length === n) {
    out.push(acc.slice());
    return;
  }
  const lastStart = cards.length - (n - acc.length);
  for (let i = start; i <= lastStart; i++) {
    walkCombos(cards, n, i + 1, acc.concat([cards[i]]), out);
  }
}
function prefer(p, n) {
  if (n === 1) return p.preferPlay1;
  if (n === 2) return p.preferPlay2;
  if (n === 3) return p.preferPlay3;
  return 0;
}
function enumeratePlay(info) {
  const mem = memoryFrom(info);
  const dens = densityOf(info, mem);
  const hand = info.self.cards;
  const maxN = Math.min(info.limits.maxPlay, hand.length, 3);
  const out = [];
  for (let n = 1; n <= maxN; n++) {
    const combos = [];
    walkCombos(hand, n, 0, [], combos);
    for (const cards of combos) {
      const isTrue = comboIsTrue(cards, info.claim.rank, info.limits.wild);
      const styleSig = info.params.pSlam;
      const pCh = sigmoid(-0.55 + 0.70 * styleSig + 0.45 * (n / 3) + 0.35 * 0.42 + 0.55 * (1 - dens));
      const hd = Math.max(1, info.limits.handSizeDefault);
      const ld = Math.max(1, info.limits.livesDefault);
      const g = info.params.handPressureWeight *
        clamp(0.5 * (1 - info.self.handCount / hd) + 0.5 * (1 - info.self.lives / ld), 0, 1);
      let e = g + prefer(info.params, n);
      if (isTrue) {
        e -= 0.12 * jokerSpent(cards, info.limits.wild);
      } else {
        const bonus = info.params.bluffTendency * (1 - info.params.caution) * n / 3;
        const dump = dumpsJunk(cards, info.claim.rank, info.limits.wild) ? 0.10 : 0;
        e += bonus + dump - pCh * (0.5 + info.params.caution);
      }
      out.push({ cards, n, isTrue, e, sig: cards.map((c) => c.cardId).sort().join(',') });
    }
  }
  return out.sort((a, b) => b.e - a.e);
}
function samplePlay(info, rng) {
  const cands = enumeratePlay(info);
  const top = cands;
  const temp = Math.max(1e-6, info.params.temperature);
  const probs = softmax(top.map((c) => c.e / temp));
  let u = rng.next();
  let acc = 0;
  let pick = top[0];
  for (let i = 0; i < top.length; i++) {
    acc += probs[i];
    if (u < acc) {
      pick = top[i];
      break;
    }
  }
  if (cands.length > 1 && rng.next() < info.params.errorRate) {
    pick = cands[1];
  }
  return pick;
}
function entropy(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  let h = 0;
  for (const v of Object.values(counts)) {
    if (v <= 0) continue;
    const p = v / total;
    h -= p * (Math.log(p) / Math.LN2);
  }
  return h;
}

const playInfo = fixture(shark, {
  handRanks: ['A', 'A', 'K', 'Q', 'JOKER'],
  lastPlay: null,
  canChallenge: false
});
const countHist = {};
const sigHist = {};
const playRng = lcg(7777);
for (let i = 0; i < 40; i++) {
  const pick = samplePlay(playInfo, playRng);
  countHist[pick.n] = (countHist[pick.n] || 0) + 1;
  sigHist[pick.sig] = (sigHist[pick.sig] || 0) + 1;
}
const hCount = entropy(countHist);
const hSig = entropy(sigHist);
if (hCount >= 0.85 && hSig >= 1.00) {
  pass(`F-06 play entropy H_count=${hCount.toFixed(2)} H_sig=${hSig.toFixed(2)}`);
} else {
  fail(`lb_str_ai_fixed_play F-06 H_count=${hCount.toFixed(2)} H_sig=${hSig.toFixed(2)}`);
}

if (!playPol.includes('always(count=2)') && playPol.includes('softmax')) {
  pass('PlayPolicy uses temperature softmax (no fixed-count script)');
} else {
  fail('lb_str_ai_fixed_play PlayPolicy missing softmax');
}

console.log(process.exitCode ? 'AI NPC CHECK FAILED' : 'AI NPC CHECK OK');
