import { AiInfoSet, AiPublicSeat, AiRevealRec } from './AiTypes';
import { AiMath } from './AiMath';

const SEAT_CAP: number = 8;
const OUTCOME_CAP: number = 16;

class OutcomeRec {
  challenger: number = -1;
  target: number = -1;
  success: boolean = false;
  style: string = 'SOFT';
  count: number = 0;
}

/**
 * Public revealed-history memory. 人机对局AI-核心算法.md v0.2.0 §2.
 * Writes only on Reveal / public ChallengeOutcome — never unrevealed faces.
 */
export class Memory {
  seenA: number = 0;
  seenK: number = 0;
  seenQ: number = 0;
  seenJoker: number = 0;
  revealedLegal: number = 0;
  revealedTotal: number = 0;
  fakeReveals: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  challengedPlays: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  liarRate: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  outcomes: OutcomeRec[] = [];

  static fromInfoSet(info: AiInfoSet): Memory {
    const m: Memory = new Memory();
    const reveals: AiRevealRec[] = info.history.reveals;
    for (let i = 0; i < reveals.length; i++) {
      m.applyReveal(reveals[i], info.claim.rank, info.limits.wild, '');
    }
    for (let i = 0; i < info.history.challengeOutcomes.length; i++) {
      const o = info.history.challengeOutcomes[i];
      m.pushOutcome(o.challenger, o.target, o.success, '', 0);
    }
    return m;
  }

  applyReveal(rev: AiRevealRec, claim: string, wild: string, style: string): void {
    for (let j = 0; j < rev.ranks.length; j++) {
      const r: string = rev.ranks[j];
      this.bumpSeen(r);
      this.revealedTotal = this.revealedTotal + 1;
      if (r === claim || r === wild) {
        this.revealedLegal = this.revealedLegal + 1;
      }
    }
    const seat: number = rev.playSeatId;
    if (seat >= 0 && seat < SEAT_CAP) {
      this.challengedPlays[seat] = this.challengedPlays[seat] + 1;
      if (rev.verdict === 'false') {
        this.fakeReveals[seat] = this.fakeReveals[seat] + 1;
      }
      let den: number = this.challengedPlays[seat];
      if (den < 1) {
        den = 1;
      }
      this.liarRate[seat] = this.fakeReveals[seat] / den;
    }
    this.pushOutcome(-1, seat, rev.verdict === 'false', style, rev.ranks.length);
  }

  density(info: AiInfoSet): number {
    const legalSelf: number = Memory.countLegal(info.self.handRanks, info.claim.rank, info.limits.wild);
    let remain: number = info.limits.deckLegal - this.revealedLegal - legalSelf;
    if (remain < 0) {
      remain = 0;
    }
    let unseen: number = info.limits.deckTotal - this.revealedTotal - info.self.handCount;
    if (unseen < 1) {
      unseen = 1;
    }
    return remain / unseen;
  }

  liarOf(seatId: number): number {
    if (seatId < 0 || seatId >= SEAT_CAP) {
      return 0;
    }
    return this.liarRate[seatId];
  }

  static countLegal(ranks: string[], claim: string, wild: string): number {
    let n: number = 0;
    for (let i = 0; i < ranks.length; i++) {
      if (ranks[i] === claim || ranks[i] === wild) {
        n++;
      }
    }
    return n;
  }

  static pressureOf(seat: AiPublicSeat | null, handDen: number, lifeDen: number): number {
    if (seat === null) {
      return 0;
    }
    let hd: number = handDen;
    if (hd < 1) {
      hd = 1;
    }
    let ld: number = lifeDen;
    if (ld < 1) {
      ld = 1;
    }
    const handP: number = 1 - seat.handCount / hd;
    const lifeP: number = 1 - seat.lives / ld;
    return AiMath.clamp(0.5 * handP + 0.5 * lifeP, 0, 1);
  }

  static seatOf(info: AiInfoSet, seatId: number): AiPublicSeat | null {
    for (let i = 0; i < info.seats.length; i++) {
      if (info.seats[i].seatId === seatId) {
        return info.seats[i];
      }
    }
    return null;
  }

  private bumpSeen(rank: string): void {
    if (rank === 'A') {
      this.seenA++;
    } else if (rank === 'K') {
      this.seenK++;
    } else if (rank === 'Q') {
      this.seenQ++;
    } else if (rank === 'JOKER') {
      this.seenJoker++;
    }
  }

  private pushOutcome(challenger: number, target: number, success: boolean, style: string, count: number): void {
    const rec: OutcomeRec = new OutcomeRec();
    rec.challenger = challenger;
    rec.target = target;
    rec.success = success;
    rec.style = style;
    rec.count = count;
    this.outcomes.push(rec);
    if (this.outcomes.length > OUTCOME_CAP) {
      this.outcomes.shift();
    }
  }
}
