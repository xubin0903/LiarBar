/**
 * Shared numeric helpers. 人机对局AI-核心算法.md v0.2.0.
 * No persona / seat branches.
 */
export class AiMath {
  static clamp(x: number, lo: number, hi: number): number {
    if (x < lo) {
      return lo;
    }
    if (x > hi) {
      return hi;
    }
    return x;
  }

  static lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  static sigmoid(x: number): number {
    let z: number = x;
    if (z > 30) {
      z = 30;
    }
    if (z < -30) {
      z = -30;
    }
    return 1 / (1 + Math.exp(-z));
  }

  static log2(x: number): number {
    if (x <= 0) {
      return 0;
    }
    return Math.log(x) / Math.LN2;
  }

  static softmax(logits: number[]): number[] {
    const out: number[] = [];
    if (logits.length === 0) {
      return out;
    }
    let max: number = logits[0];
    for (let i = 1; i < logits.length; i++) {
      if (logits[i] > max) {
        max = logits[i];
      }
    }
    let sum: number = 0;
    for (let i = 0; i < logits.length; i++) {
      const e: number = Math.exp(logits[i] - max);
      out.push(e);
      sum = sum + e;
    }
    if (sum < 1e-12) {
      const eq: number = 1 / out.length;
      for (let i = 0; i < out.length; i++) {
        out[i] = eq;
      }
      return out;
    }
    for (let i = 0; i < out.length; i++) {
      out[i] = out[i] / sum;
    }
    return out;
  }

  static sampleIndex(probs: number[], u: number): number {
    let acc: number = 0;
    for (let i = 0; i < probs.length; i++) {
      acc = acc + probs[i];
      if (u < acc) {
        return i;
      }
    }
    if (probs.length === 0) {
      return 0;
    }
    return probs.length - 1;
  }

  static preferWeight(p1: number, p2: number, p3: number, n: number): number {
    if (n === 1) {
      return p1;
    }
    if (n === 2) {
      return p2;
    }
    if (n === 3) {
      return p3;
    }
    return 0;
  }
}
