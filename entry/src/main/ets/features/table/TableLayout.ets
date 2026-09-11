/**
 * Landscape table breakpoints + compass (docs 11 §2.2 / 12 §3 R-LAND-2～5).
 * Window W/H, never device names. L-small shrinks bust — never hides it.
 *
 * Player ids stay p1 timid / p2 shark / p3 karen.
 * Landscape compass is L/T/R/B — not a top-row of faces.
 * #58 R-LAND-5: 左 p3 karen · 上 p2 shark · 右 p1 timid · 下手 self.
 * #59 / #66 / #78 / #83 / 11 v0.2.9 §2.1.2 / §2.1.3:
 * hand sits on the bottom safe-area top edge (inset + 极小约束缝);
 * lb_cmp_hand mid-line; selfDock is a left independent slot.
 * Ring–hand gap is 24% Blank (HAND_RING_GAP_PCT; number frozen).
 * That Blank sits ABOVE lb_cmp_hand — never a spacer under the hand.
 * bottomBand is Stack-Bottom on padB (not last Column child: Start + % Blank
 * + layoutWeight left leftover under the hand on device).
 * Compress leftover under the ring; tableHeart (bust+pile) is centered on
 * the padded screen heart (not inside the leftover — that shifts up/left).
 * padB is inset only — never a lift (禁加大 padB 顶高手牌).
 * Steady table does not hang first-hand empty tip.
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
  /**
   * Left selfDock slot + matching right inset so lb_cmp_hand stays on the
   * desktop mid-line (11 v0.2.5 闸 2 / hangpoint 8). Not a layoutWeight chain.
   */
  static readonly SELF_SLOT_PCT: number = 16;
  /**
   * Fixed 24% gap between the seat ring and lb_cmp_hand (11 v0.2.9 /
   * HAND_RING_GAP). Number must not change. Percent of the padded column —
   * no hard px. Lives ABOVE the hand band (never under lb_cmp_hand) and
   * compresses leftover under the ring. bottomBand is Stack-Bottom on padB
   * so Column leftover cannot open an empty band under the cards.
   * tableHeart stays on the padded screen heart; must not be faked by
   * inflating padB (禁加大 padB 顶高手牌). padB is never a lift.
   */
  static readonly HAND_RING_GAP_PCT: number = 24;
  /** When avoidArea left/right is 0, keep a % so the notch cannot crop p3. */
  static readonly NOTCH_FLOOR_PCT: number = 4;
  /**
   * Kept for reference only. Hangpoint 2 forbids using this to inflate padB
   * and fake a sink (加大 padB 顶高手牌). Gap is HAND_RING_GAP_PCT (24%).
   */
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

  /**
   * Do not call this to manufacture the pile gap (hangpoint 2 / 11 v0.2.8 / #83).
   * padB must stay the avoidArea inset; gap is HAND_RING_GAP_PCT (24%) + ring weight.
   * padB must NOT be used to fake sink (禁加大 padB 顶高手牌). padB is never a lift.
   */
  static floorHandPad(current: number, height: number): number {
    return TableBreakpoints.floorPad(current, height, TableBreakpoints.HAND_SAFE_FLOOR_PCT);
  }

  /** Desktop content mid-line (padded column), not the selfDock leftover. */
  static handBandCenterX(padL: number, padR: number, width: number): number {
    if (width <= 0) {
      return 0;
    }
    return padL + (width - padL - padR) / 2;
  }

  /** Slot x on a 5-card row whose center stays on the desktop mid-line. */
  static handSlotX(centerX: number, slot: number, cardW: number, gap: number, slots: number): number {
    const rowW: number = slots * cardW + (slots - 1) * gap;
    return centerX - rowW / 2 + slot * (cardW + gap);
  }
}
