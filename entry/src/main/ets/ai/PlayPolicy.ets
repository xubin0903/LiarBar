import { Logger } from '../common/Logger';
import { SeededRng } from '../engine/SeededRng';
import { AiCard, AiInfoSet, AiPlayCandidate, AiPublicSeat, PlayAction } from './AiTypes';
import { AiMath } from './AiMath';
import { Memory } from './Memory';
import { PersonaParams } from './PersonaParams';
import { ThinkDelay } from './ThinkDelay';

const TAG = 'PlayPolicy';

/**
 * D1 expectation + entropy floor. 人机对局AI-核心算法.md v0.2.0 §3.
 * temperature Softmax over top-K — no fixed-count script.
 */
export class PlayPolicy {
  static readonly H_FLOOR_COUNT: number = 0.85;
  static readonly H_FLOOR_SIG: number = 1.00;
  static readonly ALPHA0: number = -0.55;
  static readonly ALPHA1: number = 0.70;
  static readonly ALPHA2: number = 0.45;
  static readonly ALPHA3: number = 0.35;
  static readonly ALPHA4: number = 0.55;
  static readonly LAMBDA_KEEP: number = 0.12;
  static readonly DUMP_JUNK: number = 0.10;
  static readonly TOP_K: number = 16;

  static decidePlay(info: AiInfoSet, memory: Memory, rng: SeededRng, log: boolean): PlayAction {
    const empty: PlayAction = {
      type: 'PLAY',
      cardIds: [],
      style: 'SOFT',
      namedSeatId: -1,
      speech: info.params.speechPlay,
      thinkMs: ThinkDelay.play(1, 0, info.params, rng)
    };
    if (info.self.cards.length === 0) {
      return empty;
    }
    const cands: AiPlayCandidate[] = PlayPolicy.enumerateCandidates(info, memory);
    if (cands.length === 0) {
      empty.cardIds.push(info.self.cards[0].cardId);
      return empty;
    }
    PlayPolicy.sortByE(cands);
    const topN: number = cands.length;
    const logits: number[] = [];
    let temp: number = info.params.temperature;
    if (temp < 1e-6) {
      temp = PersonaParams.DEFAULT_TEMP;
    }
    for (let i = 0; i < topN; i++) {
      logits.push(cands[i].expectation / temp);
    }
    const probs: number[] = AiMath.softmax(logits);
    let pick: AiPlayCandidate = cands[AiMath.sampleIndex(probs, rng.next())];
    if (cands.length > 1 && rng.next() < info.params.errorRate) {
      pick = cands[1];
    }
    const style: string = PlayPolicy.sampleStyle(pick.isTrue === false, info, rng);
    const named: number = PlayPolicy.sampleName(info, rng);
    const thinkMs: number = ThinkDelay.play(cands.length, pick.risk, info.params, rng);
    const ids: string[] = [];
    for (let i = 0; i < pick.cards.length; i++) {
      ids.push(pick.cards[i].cardId);
    }
    if (log) {
      Logger.info(TAG,
        'play seat=' + info.self.seatId + ' n=' + pick.n +
          ' E=' + (Math.round(pick.expectation * 1000) / 1000) +
          ' cand=' + cands.length + ' thinkMs=' + thinkMs);
    }
    return {
      type: 'PLAY',
      cardIds: ids,
      style: style,
      namedSeatId: named,
      speech: info.params.speechPlay,
      thinkMs: thinkMs
    };
  }

  static enumerateCandidates(info: AiInfoSet, memory: Memory): AiPlayCandidate[] {
    const out: AiPlayCandidate[] = [];
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
    const density: number = memory.density(info);
    const nextSens: number = PlayPolicy.nextChallengeSens(info);
    for (let n = minN; n <= maxN; n++) {
      const combos: AiCard[][] = [];
      PlayPolicy.walkCombos(hand, n, 0, [], combos);
      for (let i = 0; i < combos.length; i++) {
        out.push(PlayPolicy.scoreOne(combos[i], info, density, nextSens));
      }
    }
    return out;
  }

  private static scoreOne(cards: AiCard[], info: AiInfoSet, density: number, nextSens: number): AiPlayCandidate {
    const n: number = cards.length;
    const isTrue: boolean = PlayPolicy.comboIsTrue(cards, info);
    const pCh: number = PlayPolicy.pChallenged(n, info, density, nextSens);
    const gSurvive: number = info.params.handPressureWeight * PlayPolicy.selfPressure(info);
    const countFit: number = AiMath.preferWeight(
      info.params.preferPlay1, info.params.preferPlay2, info.params.preferPlay3, n);
    let e: number = gSurvive + countFit;
    if (isTrue) {
      e = e - PlayPolicy.LAMBDA_KEEP * PlayPolicy.jokerSpent(cards, info.limits.wild);
    } else {
      const bluffBonus: number = info.params.bluffTendency * (1 - info.params.caution) * n / 3;
      let dump: number = 0;
      if (PlayPolicy.dumpsJunk(cards, info)) {
        dump = PlayPolicy.DUMP_JUNK;
      }
      e = e + bluffBonus + dump - pCh * 1.0 * (0.5 + info.params.caution);
    }
    const lose: number = isTrue ? 0 : 1;
    const cand: AiPlayCandidate = {
      cards: cards,
      n: n,
      isTrue: isTrue,
      expectation: e,
      risk: pCh * lose
    };
    return cand;
  }

  private static pChallenged(n: number, info: AiInfoSet, density: number, nextSens: number): number {
    const styleSig: number = info.params.pSlam;
    const z: number = PlayPolicy.ALPHA0 +
      PlayPolicy.ALPHA1 * styleSig +
      PlayPolicy.ALPHA2 * (n / 3) +
      PlayPolicy.ALPHA3 * nextSens +
      PlayPolicy.ALPHA4 * (1 - density);
    return AiMath.sigmoid(z);
  }

  private static nextChallengeSens(info: AiInfoSet): number {
    let next: AiPublicSeat | null = null;
    let bestOrder: number = 999;
    const selfOrder: number = PlayPolicy.ownOrder(info);
    for (let i = 0; i < info.seats.length; i++) {
      const s: AiPublicSeat = info.seats[i];
      if (!s.alive) {
        continue;
      }
      if (s.seatId === info.self.seatId) {
        continue;
      }
      let d: number = s.order - selfOrder;
      if (d <= 0) {
        d = d + info.seats.length;
      }
      if (d < bestOrder) {
        bestOrder = d;
        next = s;
      }
    }
    if (next === null) {
      return 0.42;
    }
    return AiMath.clamp(0.30 + 0.20 * Memory.pressureOf(next, info.limits.handSizeDefault, info.limits.livesDefault),
      0.2, 0.8);
  }

  private static ownOrder(info: AiInfoSet): number {
    for (let i = 0; i < info.seats.length; i++) {
      if (info.seats[i].seatId === info.self.seatId) {
        return info.seats[i].order;
      }
    }
    return 0;
  }

  private static selfPressure(info: AiInfoSet): number {
    const me: AiPublicSeat | null = Memory.seatOf(info, info.self.seatId);
    if (me !== null) {
      return Memory.pressureOf(me, info.limits.handSizeDefault, info.limits.livesDefault);
    }
    let hd: number = info.limits.handSizeDefault;
    if (hd < 1) {
      hd = 1;
    }
    let ld: number = info.limits.livesDefault;
    if (ld < 1) {
      ld = 1;
    }
    return AiMath.clamp(0.5 * (1 - info.self.handCount / hd) + 0.5 * (1 - info.self.lives / ld), 0, 1);
  }

  private static comboIsTrue(cards: AiCard[], info: AiInfoSet): boolean {
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].rank !== info.claim.rank && cards[i].rank !== info.limits.wild) {
        return false;
      }
    }
    return true;
  }

  private static dumpsJunk(cards: AiCard[], info: AiInfoSet): boolean {
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].rank !== info.claim.rank && cards[i].rank !== info.limits.wild) {
        return true;
      }
    }
    return false;
  }

  private static jokerSpent(cards: AiCard[], wild: string): number {
    let n: number = 0;
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].rank === wild) {
        n++;
      }
    }
    return n;
  }

  private static walkCombos(cards: AiCard[], n: number, start: number, acc: AiCard[], out: AiCard[][]): void {
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
      PlayPolicy.walkCombos(cards, n, i + 1, next, out);
    }
  }

  private static sortByE(cands: AiPlayCandidate[]): void {
    for (let i = 0; i < cands.length; i++) {
      let best: number = i;
      for (let j = i + 1; j < cands.length; j++) {
        if (cands[j].expectation > cands[best].expectation) {
          best = j;
        }
      }
      if (best !== i) {
        const tmp: AiPlayCandidate = cands[i];
        cands[i] = cands[best];
        cands[best] = tmp;
      }
    }
  }

  private static sampleStyle(isFake: boolean, info: AiInfoSet, rng: SeededRng): string {
    if (rng.next() < info.params.pSlam) {
      return 'SLAM';
    }
    if (isFake && rng.next() < info.params.pHesitateOnBluff) {
      return 'HESITATE';
    }
    return 'SOFT';
  }

  private static sampleName(info: AiInfoSet, rng: SeededRng): number {
    if (rng.next() >= info.params.pNameCall) {
      return -1;
    }
    const ids: number[] = [];
    let human: number = -1;
    for (let i = 0; i < info.seats.length; i++) {
      const s: AiPublicSeat = info.seats[i];
      if (!s.alive) {
        continue;
      }
      if (s.seatId === info.self.seatId) {
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
}
