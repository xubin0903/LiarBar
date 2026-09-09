/**
 * Open-table load axis on lb_scr_lobby (docs/04-设计/08 + 09).
 * Default 1100ms, clamp 800–1500, MVP not skippable.
 * Engine stays LOBBY until the axis ends, then T01.
 */
export class MatchLoad {
  static readonly MATCH_LOAD_MS_DEFAULT: number = 1100;
  static readonly MATCH_LOAD_MS_MIN: number = 800;
  static readonly MATCH_LOAD_MS_MAX: number = 1500;
  /** L-1 felt expand. */
  static readonly L1_FELT_MS: number = 200;
  /** L-2 pile stack window start. */
  static readonly L2_AT: number = 200;
  static readonly L2_CARD_GAP_MS: number = 80;
  static readonly L2_CARD_FLY_MS: number = 140;
  /** L-3 dealer nod / overlay yield. */
  static readonly L3_AT: number = 750;
  static readonly L3_NOD_MS: number = 280;
  static readonly VOL_MATCH_OPEN: number = 0.46;

  static clamp(ms: number): number {
    if (ms < MatchLoad.MATCH_LOAD_MS_MIN) {
      return MatchLoad.MATCH_LOAD_MS_MIN;
    }
    if (ms > MatchLoad.MATCH_LOAD_MS_MAX) {
      return MatchLoad.MATCH_LOAD_MS_MAX;
    }
    return ms;
  }

  static axisMs(): number {
    return MatchLoad.clamp(MatchLoad.MATCH_LOAD_MS_DEFAULT);
  }
}
