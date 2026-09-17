import { SeatModel } from './MatchTypes';
import { SeatStatus } from './Phase';

export function aliveCount(seats: SeatModel[]): number {
  let n: number = 0;
  for (let i = 0; i < seats.length; i++) {
    if (seats[i].status === SeatStatus.ALIVE) {
      n++;
    }
  }
  return n;
}

/** Clockwise next ALIVE seat, skipping ghosts. */
export function nextAlive(seats: SeatModel[], fromSeatId: number): number {
  const n: number = seats.length;
  if (n === 0) {
    return 0;
  }
  for (let step = 1; step <= n; step++) {
    const idx: number = (fromSeatId + step) % n;
    if (seats[idx].status === SeatStatus.ALIVE) {
      return seats[idx].seatId;
    }
  }
  return fromSeatId;
}

export function seatById(seats: SeatModel[], seatId: number): SeatModel | null {
  for (let i = 0; i < seats.length; i++) {
    if (seats[i].seatId === seatId) {
      return seats[i];
    }
  }
  return null;
}

export function nicknameOf(seats: SeatModel[], seatId: number): string {
  const s = seatById(seats, seatId);
  if (s === null) {
    return '';
  }
  return s.nickname;
}
