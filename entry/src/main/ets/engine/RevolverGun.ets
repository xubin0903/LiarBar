import { SeededRng } from './SeededRng';

/**
 * Shared table revolver (左轮对局 R3/R9).
 * 6 chambers / 1 live; cursor advances after every shot (blank or live).
 */
export class RevolverGun {
  chambers: number = 6;
  liveCount: number = 1;
  /** Next chamber to fire (0..chambers-1). */
  cursor: number = 0;
  /** Live chamber indices. */
  liveSlots: number[] = [];

  reset(chambers: number, liveCount: number, rng: SeededRng): void {
    this.chambers = chambers > 0 ? chambers : 6;
    this.liveCount = liveCount > 0 ? liveCount : 1;
    if (this.liveCount > this.chambers) {
      this.liveCount = this.chambers;
    }
    this.cursor = 0;
    this.liveSlots = [];
    const bag: number[] = [];
    for (let i = 0; i < this.chambers; i++) {
      bag.push(i);
    }
    for (let i = bag.length - 1; i > 0; i--) {
      const j: number = rng.nextInt(i + 1);
      const t: number = bag[i];
      bag[i] = bag[j];
      bag[j] = t;
    }
    for (let i = 0; i < this.liveCount; i++) {
      this.liveSlots.push(bag[i]);
    }
  }

  /** Fire current chamber; advance cursor. Returns true if live. */
  fire(): boolean {
    const slot: number = this.cursor % this.chambers;
    let live: boolean = false;
    for (let i = 0; i < this.liveSlots.length; i++) {
      if (this.liveSlots[i] === slot) {
        live = true;
        break;
      }
    }
    this.cursor = (this.cursor + 1) % this.chambers;
    return live;
  }

  primaryLiveIndex(): number {
    if (this.liveSlots.length === 0) {
      return 0;
    }
    return this.liveSlots[0];
  }
}
