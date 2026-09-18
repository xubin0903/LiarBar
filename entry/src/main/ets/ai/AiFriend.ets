import { ConfigRepository } from '../config/ConfigRepository';
import { PersonaRow } from '../config/AiPersonasConfig';
import { CardModel, MatchSnapshot } from '../engine/MatchTypes';
import { isLegal } from '../engine/Judge';
import { PlayStyle, SeatRole, TurnWindow } from '../engine/Phase';
import { SeededRng } from '../engine/SeededRng';
import { PersonaId } from './PersonaId';

export interface AiDecision {
  kind: string;
  cardIds: string[];
  style: PlayStyle;
  namedSeatId: number;
  speech: string;
}

/**
 * Table-driven AI. Reads ai_personas.json. Never judges truth — that is Judge.ets.
 */
export class AiFriend {
  row(id: string): PersonaRow {
    const table = ConfigRepository.aiPersonas().personas;
    if (id === PersonaId.SHARK) {
      return table.SHARK;
    }
    if (id === PersonaId.KAREN) {
      return table.KAREN;
    }
    return table.TIMID;
  }

  thinkDelayMs(id: string, rng: SeededRng): number {
    const cfg = ConfigRepository.match();
    const span: number = cfg.ai_think_ms_max - cfg.ai_think_ms_min;
    let lo: number = 0;
    let hi: number = 1;
    if (id === PersonaId.TIMID) {
      lo = 0.55;
      hi = 1;
    } else if (id === PersonaId.KAREN) {
      lo = 0;
      hi = 0.4;
    } else {
      lo = 0.3;
      hi = 0.7;
    }
    const t: number = cfg.ai_think_ms_min + span * (lo + rng.next() * (hi - lo));
    const cap: number = cfg.turn_seconds * 1000 - cfg.ai_think_ms_min;
    if (t > cap && cap > cfg.ai_think_ms_min) {
      return cap;
    }
    return Math.floor(t);
  }

  decide(snap: MatchSnapshot, hand: CardModel[], rng: SeededRng): AiDecision {
    const empty: AiDecision = {
      kind: 'SKIP',
      cardIds: [],
      style: PlayStyle.SOFT,
      namedSeatId: -1,
      speech: ''
    };
    let persona: string = PersonaId.TIMID;
    for (let i = 0; i < snap.seats.length; i++) {
      if (snap.seats[i].seatId === snap.currentSeatId) {
        persona = snap.seats[i].aiPersona;
      }
    }
    const row: PersonaRow = this.row(persona);
    if (snap.turnWindow === TurnWindow.CHALLENGE_ONLY) {
      if (snap.canChallenge && this.rollChallenge(snap, hand, row, rng)) {
        return this.asChallenge();
      }
      return empty;
    }
    if (snap.canChallenge && this.rollChallenge(snap, hand, row, rng)) {
      return this.asChallenge();
    }
    if (hand.length === 0) {
      return empty;
    }
    return this.pickPlay(snap, hand, row, rng);
  }

  private asChallenge(): AiDecision {
    return {
      kind: 'CHALLENGE',
      cardIds: [],
      style: PlayStyle.SOFT,
      namedSeatId: -1,
      speech: ''
    };
  }

  private rollChallenge(snap: MatchSnapshot, hand: CardModel[], row: PersonaRow, rng: SeededRng): boolean {
    if (!snap.canChallenge) {
      return false;
    }
    const personas = ConfigRepository.aiPersonas();
    let p: number = row.base_p_challenge;
    if (snap.playIndexInRound >= 2) {
      p = p + row.bonus_after_consecutive_play;
    }
    if (snap.lastPlay !== null && snap.lastPlay.style === PlayStyle.SLAM) {
      p = p + row.bonus_on_slam;
    }
    if (snap.currentClaim !== null) {
      let truth: number = 0;
      for (let i = 0; i < hand.length; i++) {
        if (isLegal(hand[i].rank, snap.currentClaim.rank)) {
          truth++;
        }
      }
      if (truth >= personas.strong_hand_min_truth) {
        p = p + row.penalty_strong_hand;
      }
    }
    if (p < personas.challenge_p_min) {
      p = personas.challenge_p_min;
    }
    if (p > personas.challenge_p_max) {
      p = personas.challenge_p_max;
    }
    return rng.nextBool(p);
  }

  private pickPlay(snap: MatchSnapshot, hand: CardModel[], row: PersonaRow, rng: SeededRng): AiDecision {
    const cfg = snap.config;
    let count: number = Math.round(row.avg_play_count_bias);
    if (count < cfg.min_play_cards) {
      count = cfg.min_play_cards;
    }
    if (count > cfg.max_play_cards) {
      count = cfg.max_play_cards;
    }
    if (count > hand.length) {
      count = hand.length;
    }
    const claim: string = snap.currentClaim === null ? '' : snap.currentClaim.rank;
    const legal: CardModel[] = [];
    const fake: CardModel[] = [];
    for (let i = 0; i < hand.length; i++) {
      if (isLegal(hand[i].rank, claim)) {
        legal.push(hand[i]);
      } else {
        fake.push(hand[i]);
      }
    }
    let wantTruth: boolean = legal.length >= count && rng.nextBool(row.p_play_truth_when_can);
    const picked: CardModel[] = [];
    if (wantTruth) {
      this.takeUpTo(legal, count, picked);
    } else {
      this.takeUpTo(fake, count, picked);
      if (picked.length < count) {
        const leftover: CardModel[] = [];
        for (let i = 0; i < legal.length; i++) {
          if (legal[i].rank !== ConfigRepository.deck().wild) {
            leftover.push(legal[i]);
          }
        }
        for (let i = 0; i < legal.length; i++) {
          if (legal[i].rank === ConfigRepository.deck().wild) {
            leftover.push(legal[i]);
          }
        }
        this.takeUpTo(leftover, count - picked.length, picked);
      }
    }
    const bluff: boolean = !wantTruth;
    let style: PlayStyle = PlayStyle.SOFT;
    if (rng.nextBool(row.p_prefer_slam)) {
      style = PlayStyle.SLAM;
    } else if (bluff && rng.nextBool(row.p_prefer_hesitate_bluff)) {
      style = PlayStyle.HESITATE;
    }
    let named: number = -1;
    if (rng.nextBool(row.p_name)) {
      named = this.pickNameTarget(snap, rng);
    }
    let speech: string = '';
    if (row.persona_id === 'AI_TIMID') {
      speech = '就…一张。';
    } else if (row.persona_id === 'AI_SHARK') {
      speech = '整整齐齐';
    } else {
      speech = '看着办。';
    }
    const ids: string[] = [];
    for (let i = 0; i < picked.length; i++) {
      ids.push(picked[i].cardId);
    }
    return {
      kind: 'PLAY',
      cardIds: ids,
      style: style,
      namedSeatId: named,
      speech: speech
    };
  }

  private takeUpTo(src: CardModel[], n: number, dest: CardModel[]): void {
    for (let i = 0; i < src.length && dest.length < n; i++) {
      dest.push(src[i]);
    }
  }

  private pickNameTarget(snap: MatchSnapshot, rng: SeededRng): number {
    const ids: number[] = [];
    for (let i = 0; i < snap.seats.length; i++) {
      if (snap.seats[i].seatId !== snap.currentSeatId && snap.seats[i].role === SeatRole.HUMAN) {
        ids.push(snap.seats[i].seatId);
      }
    }
    if (ids.length === 0) {
      for (let i = 0; i < snap.seats.length; i++) {
        if (snap.seats[i].seatId !== snap.currentSeatId) {
          ids.push(snap.seats[i].seatId);
        }
      }
    }
    if (ids.length === 0) {
      return -1;
    }
    return ids[rng.nextInt(ids.length)];
  }
}
