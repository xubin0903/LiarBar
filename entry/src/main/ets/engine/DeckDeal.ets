import { RankCounts } from '../config/DeckConfig';
import { CardModel } from './MatchTypes';
import { SeededRng, shuffleInPlace } from './SeededRng';
import { isLegal } from './Judge';

export function expandRankBag(counts: RankCounts): string[] {
  const bag: string[] = [];
  for (let i = 0; i < counts.A; i++) {
    bag.push('A');
  }
  for (let i = 0; i < counts.K; i++) {
    bag.push('K');
  }
  for (let i = 0; i < counts.Q; i++) {
    bag.push('Q');
  }
  for (let i = 0; i < counts.JOKER; i++) {
    bag.push('JOKER');
  }
  return bag;
}

export function materializeCards(ranks: string[], startSeq: number): CardModel[] {
  const out: CardModel[] = [];
  for (let i = 0; i < ranks.length; i++) {
    out.push({
      cardId: `c-${startSeq + i}`,
      rank: ranks[i]
    });
  }
  return out;
}

export function isFakeRank(rank: string, claim: string): boolean {
  return !isLegal(rank, claim);
}

function countLegal(cards: CardModel[], claim: string): number {
  let n: number = 0;
  for (let i = 0; i < cards.length; i++) {
    if (isLegal(cards[i].rank, claim)) {
      n++;
    }
  }
  return n;
}

function countFake(cards: CardModel[], claim: string): number {
  let n: number = 0;
  for (let i = 0; i < cards.length; i++) {
    if (isFakeRank(cards[i].rank, claim)) {
      n++;
    }
  }
  return n;
}

function takeIndex(cards: CardModel[], wantLegal: boolean, claim: string): number {
  for (let i = 0; i < cards.length; i++) {
    const legal: boolean = isLegal(cards[i].rank, claim);
    if (wantLegal === legal) {
      return i;
    }
  }
  return -1;
}

function swapAt(a: CardModel[], ai: number, b: CardModel[], bi: number): void {
  const tmp: CardModel = a[ai];
  a[ai] = b[bi];
  b[bi] = tmp;
}

/**
 * Demo-seed deal repair (AI spec §3.2): legal events only.
 * Human ≥1 legal + ≥1 fake; Shark ≥1 fake. Uses the same full bag.
 */
export function repairDemoHands(
  hands: CardModel[][],
  discard: CardModel[],
  claim: string,
  humanSeat: number,
  sharkSeat: number
): void {
  if (hands.length === 0) {
    return;
  }
  if (countLegal(hands[humanSeat], claim) < 1) {
    const fromDiscard: number = takeIndex(discard, true, claim);
    const humanFake: number = takeIndex(hands[humanSeat], false, claim);
    if (fromDiscard >= 0 && humanFake >= 0) {
      swapAt(hands[humanSeat], humanFake, discard, fromDiscard);
    } else {
      for (let s = 0; s < hands.length; s++) {
        if (s === humanSeat) {
          continue;
        }
        const otherLegal: number = takeIndex(hands[s], true, claim);
        if (otherLegal >= 0 && humanFake >= 0 && countLegal(hands[s], claim) > 1) {
          swapAt(hands[humanSeat], humanFake, hands[s], otherLegal);
          break;
        }
      }
    }
  }
  if (countFake(hands[humanSeat], claim) < 1) {
    const fromDiscard: number = takeIndex(discard, false, claim);
    const humanLegal: number = takeIndex(hands[humanSeat], true, claim);
    if (fromDiscard >= 0 && humanLegal >= 0 && countLegal(hands[humanSeat], claim) > 1) {
      swapAt(hands[humanSeat], humanLegal, discard, fromDiscard);
    } else {
      for (let s = 0; s < hands.length; s++) {
        if (s === humanSeat) {
          continue;
        }
        const otherFake: number = takeIndex(hands[s], false, claim);
        if (otherFake >= 0 && humanLegal >= 0 && countLegal(hands[humanSeat], claim) > 1) {
          swapAt(hands[humanSeat], humanLegal, hands[s], otherFake);
          break;
        }
      }
    }
  }
  if (sharkSeat >= 0 && sharkSeat < hands.length && countFake(hands[sharkSeat], claim) < 1) {
    const fromDiscard: number = takeIndex(discard, false, claim);
    const sharkLegal: number = takeIndex(hands[sharkSeat], true, claim);
    if (fromDiscard >= 0 && sharkLegal >= 0) {
      swapAt(hands[sharkSeat], sharkLegal, discard, fromDiscard);
    } else if (sharkLegal >= 0) {
      for (let s = 0; s < hands.length; s++) {
        if (s === sharkSeat || s === humanSeat) {
          continue;
        }
        const otherFake: number = takeIndex(hands[s], false, claim);
        if (otherFake >= 0 && countFake(hands[s], claim) > 1) {
          swapAt(hands[sharkSeat], sharkLegal, hands[s], otherFake);
          break;
        }
      }
    }
  }
}

export function dealRound(
  counts: RankCounts,
  aliveSeatIds: number[],
  handSize: number,
  rng: SeededRng,
  cardSeq: number
): DealResult {
  const bag: string[] = expandRankBag(counts);
  shuffleInPlace(bag, rng);
  const cards: CardModel[] = materializeCards(bag, cardSeq);
  const hands: CardModel[][] = [];
  for (let i = 0; i < aliveSeatIds.length; i++) {
    hands.push([]);
  }
  let cursor: number = 0;
  for (let h = 0; h < handSize; h++) {
    for (let s = 0; s < aliveSeatIds.length; s++) {
      if (cursor < cards.length) {
        hands[s].push(cards[cursor]);
        cursor++;
      }
    }
  }
  const discard: CardModel[] = [];
  for (let i = cursor; i < cards.length; i++) {
    discard.push(cards[i]);
  }
  return {
    hands: hands,
    discard: discard,
    nextCardSeq: cardSeq + cards.length
  };
}

export interface DealResult {
  hands: CardModel[][];
  discard: CardModel[];
  nextCardSeq: number;
}
