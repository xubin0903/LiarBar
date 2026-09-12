/**
 * 14b R-LIFE timing + #108 real media.
 * Extinguish_0..3: 4 × 70ms = 280ms ∈ 180～320. Per-frame 60～110. Not 0ms.
 * Full-state loop extras: flame_full_0..3 @ 160ms (optional strip, files exist).
 * Does not change lives_default / padB / challenge.
 */
export class LifeFx {
  static readonly EXTINGUISH_FRAME_MS: number = 70;
  static readonly EXTINGUISH_MAX_FRAMES: number = 4;
  static readonly EXTINGUISH_FRAMES: number = 4;
  static readonly EXTINGUISH_TOTAL_MS: number = 280;
  static readonly FLAME_FULL_MS: number = 640;
  static readonly FLAME_FULL_FRAME_MS: number = 160;
  static readonly FLAME_FULL_LOOP: number = 4;
  static readonly FLAME_HURT_MS: number = 700;
  static readonly FLAME_DYING_MS: number = 560;
  /**
   * #108 layered files are on disk. Set false only if body/flame/extinguish are stripped.
   */
  static readonly LAYERED: boolean = true;
}
