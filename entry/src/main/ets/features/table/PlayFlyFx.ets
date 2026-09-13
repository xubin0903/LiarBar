import { TableCompass } from './TableLayout';

/**
 * 16 §2 play-fly numbers (v0.1.3). Separate from DealFx — never reuse flyOn/pull().
 * PlayLaunch / PlayLanded are UI beats, not a new engine phase.
 */
export class PlayFlyFx {
  static readonly FLY_MS: number = 320;
  static readonly FLY_MS_MIN: number = 280;
  static readonly FLY_MS_MAX: number = 400;
  static readonly EDGE_VP: number = 10;
  static readonly CARD_W: number = 56;
  static readonly CARD_H: number = 78;
  static readonly ANG_TWO: number = 8;
  static readonly ANG_THREE: number = 12;
  static readonly MAX_CARDS: number = 3;
  /** Sit in the ring–hand gap above lb_cmp_hand. Not a padB lift. */
  static readonly SELF_GAP_VP: number = 8;
  static readonly INSET_VP: number = 8;

  static clampCount(n: number): number {
    if (n < 1) {
      return 1;
    }
    if (n > PlayFlyFx.MAX_CARDS) {
      return PlayFlyFx.MAX_CARDS;
    }
    return n;
  }

  /** 1: 0°. 2: ±8°. 3: −12 / 0 / +12. */
  static fanAngle(count: number, index: number): number {
    const n: number = PlayFlyFx.clampCount(count);
    if (n === 1) {
      return 0;
    }
    if (n === 2) {
      if (index === 0) {
        return -PlayFlyFx.ANG_TWO;
      }
      return PlayFlyFx.ANG_TWO;
    }
    if (index === 0) {
      return -PlayFlyFx.ANG_THREE;
    }
    if (index === 2) {
      return PlayFlyFx.ANG_THREE;
    }
    return 0;
  }

  /** Neighbor edge ≥10vp. Centers are EDGE_VP apart. */
  static fanOffset(count: number, index: number): number {
    const n: number = PlayFlyFx.clampCount(count);
    if (n === 1) {
      return 0;
    }
    const mid: number = (n - 1) / 2;
    return (index - mid) * PlayFlyFx.EDGE_VP;
  }

  static pileWidth(count: number): number {
    const n: number = PlayFlyFx.clampCount(count);
    if (n === 1) {
      return PlayFlyFx.CARD_W;
    }
    return PlayFlyFx.CARD_W + (n - 1) * PlayFlyFx.EDGE_VP;
  }

  static pileHeight(): number {
    return PlayFlyFx.CARD_H;
  }

  /**
   * Whole-fan twist so leaves open toward the table heart.
   * Self 0 · right −90 · top 180 · left +90.
   */
  static seatTwist(seatId: number): number {
    if (seatId === TableCompass.RIGHT) {
      return -90;
    }
    if (seatId === TableCompass.TOP) {
      return 180;
    }
    if (seatId === TableCompass.LEFT) {
      return 90;
    }
    return 0;
  }
}
