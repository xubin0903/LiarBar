import { Logger } from '../common/Logger';
import { SeededRng } from '../engine/SeededRng';
import { AiPersonaRegistry } from './AiPersonaRegistry';
import {
  AiCard,
  AiChallengeTrace,
  AiInfoSet,
  AiPersonaParams,
  AiPublicSeat,
  ChallengeAction,
  PlayAction
} from './AiTypes';

const TAG = 'AiSeat';
/** Soft×1 threshold lift. 人机对局AI.md v0.1.2 §4.4 Soft threshold↑. */
const SOFT_T_LIFT: number = 0.08;
/**
 * Baseline (density / pressure / history / named) uses a gentler sensitivity
 * scale so Soft×1 does not explode for Karen. Style+count keep full amp
 * (Slam band stays readable). Signed: Karen 0.72 / Shark 0.42 / Timid 0.18.
 */
const BASE_SENS_SCALE: number = 0.62;

class PlayCandidate {
  cards: AiCard[] = [];
  score: number = 0;
  isFake: boolean = false;
}

/**
 * Per-seat persona controller. 人机对局AI.md v0.1.2 §4.4 / §5 / §6.
 * Score → threshold. Random only for errorRate / ties / style sampling.
 * Soft T↑ + baseline-sensitivity split: Soft×1 majority BELIEVE; Slam×3
 * Karen high / Shark mid / Timid low. No seat-hardcoded intent.
 */
export class AiSeatController {
  seatId: number;
  personaId: string;
  private params: AiPersonaParams;

  constructor(seatId: number, personaId: string, params: AiPersonaParams) {
    this.seatId = seatId;
    this.personaId = AiPersonaRegistry.normalize(personaId);
    this.params = params;
  }

  static create(seatId: number, personaId: string): AiSeatController {
    const id: string = AiPersonaRegistry.normalize(personaId);
    return new AiSeatController(seatId, id, AiPersonaRegistry.params(id));
  }

  updateParams(p: AiPersonaParams): void {
    this.params = p;
  }

  thinkDelayMs(rng: SeededRng, turnSeconds: number): number {
    let lo: number = this.params.thinkMsMin;
    let hi: number = this.params.thinkMsMax;
    if (hi < lo) {
      hi = lo;
    }
    let t: number = lo + rng.next() * (hi - lo);
    let cap: number = (turnSeconds - 2) * 1000;
    if (cap < lo) {
      cap = lo;
    }
    if (t > cap) {
      t = cap;
    }
    return Math.floor(t);
  }

  /** D2 / D3 / D5 / D4 */
  decideChallenge(info: AiInfoSet, rng: SeededRng): ChallengeAction {
    const trace: AiChallengeTrace = this.scoreChallenge(info);
    let intent: string = trace.intent;
    let flipped: boolean = false;
    if (!info.forceChallenge2 && info.canChallenge) {
      if (rng.next() < info.params.errorRate) {
        intent = this.flipIntent(intent, info);
        flipped = true;
      }
    }
    trace.intent = intent;
    trace.noiseFlipped = flipped;
    this.logTrace(trace);
    return { type: intent };
  }

  /** D1 */
  decidePlay(info: AiInfoSet, rng: SeededRng): PlayAction {
    const empty: PlayAction = {
      type: 'PLAY',
      cardIds: [],
      style: 'SOFT',
      namedSeatId: -1,
      speech: ''
    };
    const hand: AiCard[] = info.self.cards;
    if (hand.length === 0) {
      return empty;
    }
    const cands: PlayCandidate[] = this.enumeratePlays(info);
    if (cands.length === 0) {
      empty.cardIds.push(hand[0].cardId);
      return empty;
    }
    this.sortByScore(cands);
    let pick: PlayCandidate = cands[0];
    if (cands.length > 1 && rng.next() < info.params.errorRate) {
      pick = cands[1];
    } else {
      pick = this.breakScoreTies(cands, rng);
    }
    const ids: string[] = [];
    for (let i = 0; i < pick.cards.length; i++) {
      ids.push(pick.cards[i].cardId);
    }
    const style: string = this.sampleStyle(pick.isFake, info, rng);
    const named: number = this.sampleName(info, rng);
    return {
      type: 'PLAY',
      cardIds: ids,
      style: style,
      namedSeatId: named,
      speech: this.speechLine()
    };
  }

  scoreChallenge(info: AiInfoSet): AiChallengeTrace {
    const gate: string = this.gateName(info);
    const skipOrBelieve: string = this.believeOrSkip(info);
    if (info.forceChallenge2) {
      return this.traceOf(info, gate, 1, 0, 0, 1, 0, 'DOUBT', false);
    }
    if (!info.canChallenge) {
      return this.traceOf(info, gate, 0, 0, 0, 0, 1, skipOrBelieve, false);
    }
    const sFake: number = this.scoreFake(info);
    const sNeed: number = this.scoreNeed(info);
    const sRisk: number = this.scoreRisk(info);
    const score: number = sFake + sNeed - sRisk;
    const t: number = this.threshold(info);
    let intent: string = skipOrBelieve;
    if (score >= t) {
      intent = 'DOUBT';
    }
    return this.traceOf(info, gate, sFake, sNeed, sRisk, score, t, intent, false);
  }

  private gateName(info: AiInfoSet): string {
    if (info.forceChallenge2) {
      return 'ForceChallenge2';
    }
    if (info.turnWindow === 'CHALLENGE_ONLY') {
      return 'CHALLENGE_ONLY';
    }
    if (info.turnWindow === 'EMPTY_SAFE') {
      return 'HandEmptyGate';
    }
    return 'TrustOrChallenge';
  }

  private believeOrSkip(info: AiInfoSet): string {
    if (info.turnWindow === 'CHALLENGE_ONLY') {
      return 'SKIP';
    }
    return 'BELIEVE';
  }

  private flipIntent(intent: string, info: AiInfoSet): string {
    if (intent === 'DOUBT') {
      return this.believeOrSkip(info);
    }
    return 'DOUBT';
  }

  private scoreFake(info: AiInfoSet): number {
    const params: AiPersonaParams = info.params;
    const legalSelf: number = this.countLegal(info.self.handRanks, info);
    const revealedLegal: number = this.revealedLegal(info);
    const rawRemain: number = info.limits.deckLegal - revealedLegal - legalSelf;
    let estRemain: number = rawRemain;
    if (estRemain < 0) {
      estRemain = 0;
    }
    const revealedN: number = this.revealedCardCount(info);
    let unseen: number = info.limits.deckTotal - info.self.handCount - revealedN;
    if (unseen < 1) {
      unseen = 1;
    }
    const densityRaw: number = estRemain / unseen;
    let prior: number = info.limits.deckLegal / info.limits.deckTotal;
    if (info.limits.deckTotal < 1) {
      prior = 0.4;
    }
    const density: number = prior * (1 - params.memoryWeight) + densityRaw * params.memoryWeight;
    let sigStyle: number = 0;
    let sigCount: number = 0;
    let sigPressure: number = 0;
    let sigHistory: number = 0;
    let sigNamed: number = 0;
    if (info.lastPlay !== null) {
      if (info.lastPlay.style === 'SLAM') {
        sigStyle = 0.18;
      } else if (info.lastPlay.style === 'HESITATE') {
        sigStyle = 0.10;
      }
      if (info.lastPlay.count === 3) {
        sigCount = 0.12;
      } else if (info.lastPlay.count === 2) {
        sigCount = 0.05;
      }
      const actor: AiPublicSeat | null = this.seatOf(info, info.lastPlay.seatId);
      if (actor !== null && actor.handCount <= 2 && info.lastPlay.count >= 2) {
        sigPressure = 0.08;
      }
      sigHistory = this.falseRate(info, info.lastPlay.seatId) * 0.20;
      if (info.lastPlay.namedSeatId === info.self.seatId) {
        sigNamed = 0.05;
      }
    }
    let densTerm: number = 0.35 * (1 - density);
    const susAmp: number = 0.5 + params.challengeSensitivity;
    const baseAmp: number = 0.5 + params.challengeSensitivity * BASE_SENS_SCALE;
    const sSus: number = (sigStyle + sigCount) * susAmp;
    const sBase: number = (sigPressure + sigHistory + sigNamed + densTerm) * baseAmp;
    return this.clamp(sSus + sBase, 0, 1);
  }

  private scoreNeed(info: AiInfoSet): number {
    const params: AiPersonaParams = info.params;
    return params.aggression * 0.3 + params.handPressureWeight * this.pressure(info);
  }

  private scoreRisk(info: AiInfoSet): number {
    const params: AiPersonaParams = info.params;
    let extra: number = 0;
    if (info.self.lives === 1) {
      extra = extra + 0.25;
    }
    if (info.aliveCount === 2) {
      extra = extra + 0.15;
    }
    return params.caution * 0.4 + extra;
  }

  private threshold(info: AiInfoSet): number {
    const params: AiPersonaParams = info.params;
    const tBase: number = this.lerp(0.62, 0.28, params.challengeSensitivity);
    let t: number = tBase + 0.10 * params.caution - 0.08 * params.aggression;
    if (info.lastPlay !== null && info.lastPlay.style === 'SOFT') {
      t = t + SOFT_T_LIFT;
    }
    return this.clamp(t, 0.22, 0.75);
  }

  private pressure(info: AiInfoSet): number {
    let handDen: number = info.limits.handSizeDefault;
    if (handDen < 1) {
      handDen = 1;
    }
    let lifeDen: number = info.limits.livesDefault;
    if (lifeDen < 1) {
      lifeDen = 1;
    }
    const handP: number = 1 - info.self.handCount / handDen;
    const lifeP: number = 1 - info.self.lives / lifeDen;
    return this.clamp(0.5 * handP + 0.5 * lifeP, 0, 1);
  }

  private enumeratePlays(info: AiInfoSet): PlayCandidate[] {
    const out: PlayCandidate[] = [];
    const hand: AiCard[] = info.self.cards;
    let maxN: number = info.limits.maxPlay;
    if (maxN > hand.length) {
      maxN = hand.length;
    }
    if (maxN > 3) {
      maxN = 3;
    }
    let minN: number = info.limits.minPlay;
    if (minN < 1) {
      minN = 1;
    }
    if (minN > maxN) {
      minN = maxN;
    }
    for (let n = minN; n <= maxN; n++) {
      const combos: AiCard[][] = [];
      this.walkCombos(hand, n, 0, [], combos);
      for (let i = 0; i < combos.length; i++) {
        const cand: PlayCandidate = new PlayCandidate();
        cand.cards = combos[i];
        cand.isFake = this.comboIsFake(combos[i], info);
        cand.score = this.scorePlay(combos[i], cand.isFake, info);
        out.push(cand);
      }
    }
    return out;
  }

  private scorePlay(cards: AiCard[], isFake: boolean, info: AiInfoSet): number {
    const params: AiPersonaParams = info.params;
    const n: number = cards.length;
    let base: number = 0;
    if (isFake) {
      base = 0.15 + 0.50 * params.bluffTendency;
    } else {
      base = 0.40 + 0.25 * params.caution;
    }
    const countFit: number = AiPersonaRegistry.preferWeight(params, n);
    let keepJoker: number = 0;
    const handHasJoker: boolean = this.hasRank(info.self.handRanks, info.limits.wild);
    const comboHasJoker: boolean = this.comboHasWild(cards, info.limits.wild);
    if (!isFake && handHasJoker && !comboHasJoker) {
      keepJoker = 0.08 * params.caution;
    }
    if (isFake && this.dumpsJunk(cards, info)) {
      keepJoker = 0.10;
    }
    let aggressionN: number = 0;
    if (n >= 2) {
      aggressionN = 0.05 * params.aggression;
    }
    if (n === 3) {
      aggressionN = aggressionN + 0.05 * params.aggression;
    }
    let threat: number = 0;
    if (isFake) {
      const proj: number = this.selfProject(n, info);
      if (proj > 0.12) {
        threat = -0.12 * params.caution;
      }
    }
    return this.clamp(base + countFit + keepJoker + aggressionN + threat, 0, 1.5);
  }

  private selfProject(n: number, info: AiInfoSet): number {
    let s: number = 0;
    if (n === 3) {
      s = 0.12;
    } else if (n === 2) {
      s = 0.05;
    }
    if (info.self.handCount - n <= 2 && n >= 2) {
      s = s + 0.08;
    }
    return s;
  }

  private walkCombos(cards: AiCard[], n: number, start: number, acc: AiCard[], out: AiCard[][]): void {
    if (acc.length === n) {
      const copy: AiCard[] = [];
      for (let i = 0; i < acc.length; i++) {
        copy.push(acc[i]);
      }
      out.push(copy);
      return;
    }
    const remainNeed: number = n - acc.length;
    const lastStart: number = cards.length - remainNeed;
    for (let i = start; i <= lastStart; i++) {
      const next: AiCard[] = [];
      for (let j = 0; j < acc.length; j++) {
        next.push(acc[j]);
      }
      next.push(cards[i]);
      this.walkCombos(cards, n, i + 1, next, out);
    }
  }

  private comboIsFake(cards: AiCard[], info: AiInfoSet): boolean {
    for (let i = 0; i < cards.length; i++) {
      if (!this.isLegalRank(cards[i].rank, info)) {
        return true;
      }
    }
    return false;
  }

  private dumpsJunk(cards: AiCard[], info: AiInfoSet): boolean {
    for (let i = 0; i < cards.length; i++) {
      if (!this.isLegalRank(cards[i].rank, info) && cards[i].rank !== info.limits.wild) {
        return true;
      }
    }
    return false;
  }

  private comboHasWild(cards: AiCard[], wild: string): boolean {
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].rank === wild) {
        return true;
      }
    }
    return false;
  }

  private hasRank(ranks: string[], rank: string): boolean {
    for (let i = 0; i < ranks.length; i++) {
      if (ranks[i] === rank) {
        return true;
      }
    }
    return false;
  }

  private isLegalRank(rank: string, info: AiInfoSet): boolean {
    return rank === info.claim.rank || rank === info.limits.wild;
  }

  private countLegal(ranks: string[], info: AiInfoSet): number {
    let n: number = 0;
    for (let i = 0; i < ranks.length; i++) {
      if (this.isLegalRank(ranks[i], info)) {
        n++;
      }
    }
    return n;
  }

  private revealedLegal(info: AiInfoSet): number {
    let n: number = 0;
    const reveals = info.history.reveals;
    for (let i = 0; i < reveals.length; i++) {
      for (let j = 0; j < reveals[i].ranks.length; j++) {
        if (this.isLegalRank(reveals[i].ranks[j], info)) {
          n++;
        }
      }
    }
    return n;
  }

  private revealedCardCount(info: AiInfoSet): number {
    let n: number = 0;
    const reveals = info.history.reveals;
    for (let i = 0; i < reveals.length; i++) {
      n = n + reveals[i].ranks.length;
    }
    return n;
  }

  private falseRate(info: AiInfoSet, seatId: number): number {
    let seen: number = 0;
    let fake: number = 0;
    const reveals = info.history.reveals;
    const start: number = reveals.length > 5 ? reveals.length - 5 : 0;
    for (let i = start; i < reveals.length; i++) {
      if (reveals[i].playSeatId !== seatId) {
        continue;
      }
      seen++;
      if (reveals[i].verdict === 'false') {
        fake++;
      }
    }
    if (seen === 0) {
      return 0;
    }
    return fake / seen;
  }

  private seatOf(info: AiInfoSet, seatId: number): AiPublicSeat | null {
    for (let i = 0; i < info.seats.length; i++) {
      if (info.seats[i].seatId === seatId) {
        return info.seats[i];
      }
    }
    return null;
  }

  private sortByScore(cands: PlayCandidate[]): void {
    for (let i = 0; i < cands.length; i++) {
      let best: number = i;
      for (let j = i + 1; j < cands.length; j++) {
        if (cands[j].score > cands[best].score) {
          best = j;
        }
      }
      if (best !== i) {
        const tmp: PlayCandidate = cands[i];
        cands[i] = cands[best];
        cands[best] = tmp;
      }
    }
  }

  private breakScoreTies(cands: PlayCandidate[], rng: SeededRng): PlayCandidate {
    const top: number = cands[0].score;
    const ties: PlayCandidate[] = [];
    for (let i = 0; i < cands.length; i++) {
      if (Math.abs(cands[i].score - top) < 0.0001) {
        ties.push(cands[i]);
      }
    }
    if (ties.length <= 1) {
      return cands[0];
    }
    return ties[rng.nextInt(ties.length)];
  }

  private sampleStyle(isFake: boolean, info: AiInfoSet, rng: SeededRng): string {
    if (rng.next() < info.params.pSlam) {
      return 'SLAM';
    }
    if (isFake && rng.next() < info.params.pHesitateOnBluff) {
      return 'HESITATE';
    }
    return 'SOFT';
  }

  private sampleName(info: AiInfoSet, rng: SeededRng): number {
    if (rng.next() >= info.params.pNameCall) {
      return -1;
    }
    const ids: number[] = [];
    let human: number = -1;
    for (let i = 0; i < info.seats.length; i++) {
      const s: AiPublicSeat = info.seats[i];
      if (!s.alive || s.seatId === info.self.seatId) {
        continue;
      }
      ids.push(s.seatId);
      if (s.isHuman) {
        human = s.seatId;
      }
    }
    if (human >= 0) {
      return human;
    }
    if (ids.length === 0) {
      return -1;
    }
    return ids[rng.nextInt(ids.length)];
  }

  private speechLine(): string {
    if (this.personaId === 'AI_TIMID') {
      return '就…一张。';
    }
    if (this.personaId === 'AI_SHARK') {
      return '整整齐齐';
    }
    return '看着办。';
  }

  private clamp(x: number, lo: number, hi: number): number {
    if (x < lo) {
      return lo;
    }
    if (x > hi) {
      return hi;
    }
    return x;
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private traceOf(
    info: AiInfoSet,
    gate: string,
    sFake: number,
    sNeed: number,
    sRisk: number,
    score: number,
    t: number,
    intent: string,
    noise: boolean
  ): AiChallengeTrace {
    return {
      seatId: info.self.seatId,
      persona: this.personaId,
      gate: gate,
      S_fake: sFake,
      S_need: sNeed,
      S_risk: sRisk,
      Score: score,
      T: t,
      intent: intent,
      noiseFlipped: noise
    };
  }

  private logTrace(tr: AiChallengeTrace): void {
    Logger.info(TAG,
      'challenge seat=' + tr.seatId + ' persona=' + tr.persona +
        ' Score=' + this.fmt(tr.Score) + ' T=' + this.fmt(tr.T) +
        ' intent=' + tr.intent + ' gate=' + tr.gate +
        ' S_fake=' + this.fmt(tr.S_fake) + ' S_need=' + this.fmt(tr.S_need) +
        ' S_risk=' + this.fmt(tr.S_risk) + ' noise=' + tr.noiseFlipped);
  }

  private fmt(x: number): string {
    return '' + Math.round(x * 1000) / 1000;
  }
}
