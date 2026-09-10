/**
 * Landscape table breakpoints (docs 11 §4.2). Window W/H, never device names.
 */
export class TableBreakpoints {
  static readonly L_PHONE_RATIO: number = 1.60;
  static readonly L_FOLD_RATIO: number = 1.20;
  static readonly L_SMALL_SHORT_VP: number = 320;
  static readonly L_FOLD_SHORT_VP: number = 360;
  static readonly FOLD_PAD_PCT: number = 8;

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

  /** L-small: hide / shrink dealer bust; keep subtitle in topbar. */
  static showDealerBust(w: number, h: number): boolean {
    const r: number = TableBreakpoints.ratio(w, h);
    const short: number = TableBreakpoints.shortSide(w, h);
    if (r >= TableBreakpoints.L_PHONE_RATIO && short < TableBreakpoints.L_SMALL_SHORT_VP) {
      return false;
    }
    return true;
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
