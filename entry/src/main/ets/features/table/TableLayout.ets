/**
 * Landscape table breakpoints + compass (docs 11 §2.2 / 12 §3 R-LAND-2～5).
 * Window W/H, never device names. L-small shrinks bust — never hides it.
 *
 * Player ids stay p1 timid / p2 shark / p3 karen.
 * Landscape compass is L/T/R/B — not a top-row of faces.
 */

/** Locked landscape ring. Bottom is the self dock + hand, not a mid-stack avatar. */
export class TableCompass {
  static readonly BOTTOM: number = 0;
  static readonly RIGHT: number = 1;
  static readonly TOP: number = 2;
  static readonly LEFT: number = 3;

  static isTop(seatId: number): boolean {
    return seatId === TableCompass.TOP;
  }

  static isSelf(seatId: number): boolean {
    return seatId === TableCompass.BOTTOM;
  }
}

export class TableBreakpoints {
  static readonly L_PHONE_RATIO: number = 1.60;
  static readonly L_FOLD_RATIO: number = 1.20;
  static readonly L_SMALL_SHORT_VP: number = 320;
  static readonly L_FOLD_SHORT_VP: number = 360;
  static readonly FOLD_PAD_PCT: number = 8;
  static readonly BUST_MAX_PCT: number = 28;
  static readonly BUST_MAX_PCT_SMALL: number = 18;
  static readonly HAND_MAX_PCT: number = 28;
  static readonly SIDE_SEAT_PCT: number = 14;
  /** When avoidArea left/right is 0, keep a % so the notch cannot crop p3. */
  static readonly NOTCH_FLOOR_PCT: number = 4;
  /** When avoidArea bottom is 0, keep a % so the hand is not 裁半. */
  static readonly HAND_SAFE_FLOOR_PCT: number = 3;

  static shortSide(w: number, h: number): number {
    if (w < h) {
      return w;
    }
    return h;
  }

  static ratio(w: number, h: number): number {
    if (h <= 0) {
      return 0;
    }
    return w / h;
  }

  static isLSmall(w: number, h: number): boolean {
    const r: number = TableBreakpoints.ratio(w, h);
    const short: number = TableBreakpoints.shortSide(w, h);
    return r >= TableBreakpoints.L_PHONE_RATIO && short < TableBreakpoints.L_SMALL_SHORT_VP;
  }

  /** Bust stays mounted. L-small only lowers constraintSize (R-LAND-2). */
  static dealerBustMaxPct(w: number, h: number): number {
    if (TableBreakpoints.isLSmall(w, h)) {
      return TableBreakpoints.BUST_MAX_PCT_SMALL;
    }
    return TableBreakpoints.BUST_MAX_PCT;
  }

  /** L-fold inner screen: percentage inset on the seat ring. */
  static heartPadPct(w: number, h: number): number {
    const r: number = TableBreakpoints.ratio(w, h);
    const short: number = TableBreakpoints.shortSide(w, h);
    if (r >= TableBreakpoints.L_FOLD_RATIO && r < TableBreakpoints.L_PHONE_RATIO &&
      short >= TableBreakpoints.L_FOLD_SHORT_VP) {
      return TableBreakpoints.FOLD_PAD_PCT;
    }
    return 0;
  }

  static floorPad(current: number, span: number, pct: number): number {
    if (span <= 0 || pct <= 0) {
      return current;
    }
    const floor: number = span * pct / 100;
    if (current >= floor) {
      return current;
    }
    return floor;
  }

  static floorNotchPad(current: number, width: number): number {
    return TableBreakpoints.floorPad(current, width, TableBreakpoints.NOTCH_FLOOR_PCT);
  }

  static floorHandPad(current: number, height: number): number {
    return TableBreakpoints.floorPad(current, height, TableBreakpoints.HAND_SAFE_FLOOR_PCT);
  }
}
