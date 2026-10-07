/**
 * 恢复时间平移（策划 21 §3.4，负责人 2026-10-07 统一口径）：
 * 所有挂起的 deadline 统一平移同一个量 shift = max(暂停时长 Δ, 使最早 deadline ≥ now + grace 所需量)。
 * 不再各自 max(old + Δ, now + grace)：同一个 shift 保证暂停前后到期顺序不变、最早一项距恢复 ≥ grace。
 * 纯函数、无依赖：导演算一次，引擎 / 导演 thinkUntil / 页面倒计时与一次性定时器都用这同一个 shift。
 */
export class ResumeShift {
  /** deadlines = 暂停前的绝对到期时刻（ms，>0 才算挂起）。返回 shift ≥ Δ。 */
  static compute(pausedAtMs: number, nowMs: number, graceMs: number, deadlines: number[]): number {
    let delta: number = nowMs - pausedAtMs;
    if (delta < 0) {
      delta = 0;
    }
    let earliest: number = 0;
    for (let i = 0; i < deadlines.length; i++) {
      const d: number = deadlines[i];
      if (d > 0 && (earliest === 0 || d < earliest)) {
        earliest = d;
      }
    }
    if (earliest === 0) {
      return delta;
    }
    const grace: number = graceMs > 0 ? graceMs : 0;
    const need: number = nowMs + grace - earliest;
    return need > delta ? need : delta;
  }
}
