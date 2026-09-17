/**
 * Deterministic LCG. Shared by shuffle / claim / AI dice when Match.seed is set.
 * Not a rule number source.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Half-open [0, 1). */
  next(): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  nextInt(n: number): number {
    if (n <= 0) {
      return 0;
    }
    return Math.floor(this.next() * n);
  }

  nextBool(p: number): boolean {
    return this.next() < p;
  }
}

export function shuffleInPlace(items: string[], rng: SeededRng): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j: number = rng.nextInt(i + 1);
    const tmp: string = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
}
