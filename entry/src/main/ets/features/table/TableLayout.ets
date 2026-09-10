/**
 * Landscape table breakpoints (docs 11 §4.2 / R-LAND-2).
 * Window W/H, never device names. L-small shrinks bust — never hides it.
 */
export class TableBreakpoints {
  static readonly L_PHONE_RATIO: number = 1.60;
  static readonly L_FOLD_RATIO: number = 1.20;
  static readonly L_SMALL_SHORT_VP: number = 320;
  static readonly L_FOLD_SHORT_VP: number = 360;
  static readonly FOLD_PAD_PCT: number = 8;
  static readonly BUST_MAX_PCT: number = 28;
  static readonly BUST_MAX_PCT_SMALL: number = 18;

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
}
