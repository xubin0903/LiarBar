/**
 * 14b R-LIFE timing + #108/PM: extinguish_0..3 (≤4 frames).
 * 4 × 70ms = 280ms ∈ 180～320. Per-frame 60～110. Not 0ms.
 * Does not change lives_default / padB / challenge.
 */
export class LifeFx {
  static readonly EXTINGUISH_FRAME_MS: number = 70;
  static readonly EXTINGUISH_MAX_FRAMES: number = 4;
  static readonly EXTINGUISH_FRAMES: number = 4;
  static readonly EXTINGUISH_TOTAL_MS: number = 280;
  static readonly FLAME_FULL_MS: number = 520;
  static readonly FLAME_HURT_MS: number = 440;
  static readonly FLAME_DYING_MS: number = 280;
  /**
   * Compile-safe fallback switch. Layered $r slots ship in this PR.
   * Set false only if body/flame/extinguish media are stripped.
   */
  static readonly LAYERED: boolean = true;
}
