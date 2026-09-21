import { Logger } from '../common/Logger';
import {
  AiBuilderSource,
  AiCard,
  AiChallengeOutcome,
  AiHistoryView,
  AiInfoSet,
  AiLimitsView,
  AiMemoryView,
  AiPublicLastPlay,
  AiPublicSeat,
  AiRevealRec,
  AiSelfView
} from './AiTypes';

const TAG = 'AiInfoSetBuilder';

/**
 * Project engine authority → allowed InfoSet. 人机对局AI.md v0.1.0 §2.
 * Copies allow-list fields only. Forbidden keys never appear on the result.
 */
export class AiInfoSetBuilder {
  static isForbiddenKey(key: string): boolean {
    if (key === 'trueRanks' || key === 'lastPicked' || key === 'lastPlayRanks') {
      return true;
    }
    if (key === 'peekLastPlayRanks' || key === 'peekLastPickedRanks') {
      return true;
    }
    if (key === 'godView' || key === 'GodView' || key === 'holeCards') {
      return true;
    }
    if (key === 'otherHands' || key === 'handRanksBySeat' || key === 'undealt') {
      return true;
    }
    if (key === 'discardFaces' || key === 'lastPickedRanks') {
      return true;
    }
    return false;
  }

  static build(src: AiBuilderSource): AiInfoSet {
    const cards: AiCard[] = AiInfoSetBuilder.copyCards(src.selfCards);
    const ranks: string[] = [];
    for (let i = 0; i < cards.length; i++) {
      ranks.push(cards[i].rank);
    }
    const self: AiSelfView = {
      seatId: src.selfSeatId,
      handRanks: ranks,
      handCount: cards.length,
      lives: src.selfLives,
      cards: cards
    };
    const lastPlay: AiPublicLastPlay | null = AiInfoSetBuilder.copyLastPlay(src.lastPlay);
    const seats: AiPublicSeat[] = AiInfoSetBuilder.copySeats(src.seats);
    const reveals: AiRevealRec[] = AiInfoSetBuilder.copyReveals(src.reveals);
    const outcomes: AiChallengeOutcome[] = AiInfoSetBuilder.copyOutcomes(src.challengeOutcomes);
    const history: AiHistoryView = {
      reveals: reveals,
      challengeOutcomes: outcomes
    };
    const memory: AiMemoryView = AiInfoSetBuilder.buildMemory(reveals, src.publicPlayTotal);
    const limits: AiLimitsView = {
      maxPlay: src.maxPlay,
      minPlay: src.minPlay,
      handSizeDefault: src.handSizeDefault,
      livesDefault: src.livesDefault,
      deckTotal: src.deckTotal,
      deckLegal: src.deckLegal,
      wild: src.wild
    };
    return {
      self: self,
      claim: { rank: src.claimRank },
      lastPlay: lastPlay,
      seats: seats,
      history: history,
      memory: memory,
      phase: src.phase,
      turnWindow: src.turnWindow,
      canChallenge: src.canChallenge,
      forceChallenge2: src.forceChallenge2,
      aliveCount: src.aliveCount,
      turnSecondsLeft: src.turnSecondsLeft,
      params: src.params,
      limits: limits,
      personaId: src.personaId
    };
  }

  /**
   * Runtime guard: if a leaked key name is offered, treat as peek (S-AI-01/02).
   * Builder never copies these onto AiInfoSet.
   */
  static rejectPeekKeys(keys: string[]): boolean {
    for (let i = 0; i < keys.length; i++) {
      if (AiInfoSetBuilder.isForbiddenKey(keys[i])) {
        Logger.warn(TAG, 'AI偷看');
        return true;
      }
    }
    return false;
  }

  private static copyCards(src: AiCard[]): AiCard[] {
    const out: AiCard[] = [];
    for (let i = 0; i < src.length; i++) {
      out.push({ cardId: src[i].cardId, rank: src[i].rank });
    }
    return out;
  }

  private static copyLastPlay(src: AiPublicLastPlay | null): AiPublicLastPlay | null {
    if (src === null) {
      return null;
    }
    let style: string = 'SOFT';
    if (src.style === 'SLAM') {
      style = 'SLAM';
    } else if (src.style === 'HESITATE') {
      style = 'HESITATE';
    }
    let count: number = src.count;
    if (count < 1) {
      count = 1;
    }
    if (count > 3) {
      count = 3;
    }
    return {
      seatId: src.seatId,
      count: count,
      style: style,
      namedSeatId: src.namedSeatId
    };
  }

  private static copySeats(src: AiPublicSeat[]): AiPublicSeat[] {
    const out: AiPublicSeat[] = [];
    for (let i = 0; i < src.length; i++) {
      out.push({
        seatId: src[i].seatId,
        handCount: src[i].handCount,
        lives: src[i].lives,
        alive: src[i].alive,
        order: src[i].order,
        isHuman: src[i].isHuman
      });
    }
    return out;
  }

  private static copyReveals(src: AiRevealRec[]): AiRevealRec[] {
    const out: AiRevealRec[] = [];
    for (let i = 0; i < src.length; i++) {
      const ranks: string[] = [];
      for (let j = 0; j < src[i].ranks.length; j++) {
        ranks.push(src[i].ranks[j]);
      }
      let verdict: string = 'true';
      if (src[i].verdict === 'false') {
        verdict = 'false';
      }
      out.push({
        playSeatId: src[i].playSeatId,
        ranks: ranks,
        verdict: verdict,
        loserSeatId: src[i].loserSeatId
      });
    }
    return out;
  }

  private static copyOutcomes(src: AiChallengeOutcome[]): AiChallengeOutcome[] {
    const out: AiChallengeOutcome[] = [];
    for (let i = 0; i < src.length; i++) {
      out.push({
        challenger: src[i].challenger,
        target: src[i].target,
        success: src[i].success
      });
    }
    return out;
  }

  private static buildMemory(reveals: AiRevealRec[], publicPlayTotal: number): AiMemoryView {
    let a: number = 0;
    let k: number = 0;
    let q: number = 0;
    let joker: number = 0;
    for (let i = 0; i < reveals.length; i++) {
      for (let j = 0; j < reveals[i].ranks.length; j++) {
        const r: string = reveals[i].ranks[j];
        if (r === 'A') {
          a++;
        } else if (r === 'K') {
          k++;
        } else if (r === 'Q') {
          q++;
        } else if (r === 'JOKER') {
          joker++;
        }
      }
    }
    return {
      revealedA: a,
      revealedK: k,
      revealedQ: q,
      revealedJoker: joker,
      publicPlayTotal: publicPlayTotal
    };
  }
}
