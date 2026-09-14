import { SeatModel } from './MatchTypes';
import { SeatStatus } from './Phase';
import { aliveCount } from './SeatUtil';

/** Hand-empty ≥3/=2 gate kind (左轮 §2.6). */
export type EmptyGateKind = 'none' | 'safe3' | 'force2';

export function classifyEmptyGate(alive: number): EmptyGateKind {
  if (alive >= 3) {
    return 'safe3';
  }
  if (alive === 2) {
    return 'force2';
  }
  return 'none';
}

/** RoundSafeWait settle: all other alive seats hand==0 and no shot yet. */
export function allOtherAliveEmpty(
  seats: SeatModel[],
  hands: number[][],
  waitSeats: number[]
): boolean {
  const alive: number = aliveCount(seats);
  if (alive < 2 || waitSeats.length === 0) {
    return false;
  }
  for (let i = 0; i < seats.length; i++) {
    if (seats[i].status !== SeatStatus.ALIVE) {
      continue;
    }
    const id: number = seats[i].seatId;
    let inWait: boolean = false;
    for (let w = 0; w < waitSeats.length; w++) {
      if (waitSeats[w] === id) {
        inWait = true;
        break;
      }
    }
    if (inWait) {
      continue;
    }
    const hc: number = id >= 0 && id < hands.length ? hands[id].length : 0;
    if (hc > 0) {
      return false;
    }
  }
  return true;
}
