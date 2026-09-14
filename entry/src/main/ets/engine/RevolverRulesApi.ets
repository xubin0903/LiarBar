/**
 * Revolver MatchEngine patch notes + API surface for Table hooks.
 * Full wiring lives in MatchEngine.ets (same PR).
 *
 * Public API (Table):
 * - chooseEmptyYou() — ≥3 质疑你 → RevealEmptyLast
 * - chooseEmptyShangjia() — ≥3 不质疑你 → RoundSafeWait + continue
 * - collectRedeal() — after any shot / RoundSafeWait settle
 * Snapshot: emptySafePending, forceChallengeEmpty, emptyHandSeatId,
 *   roundSafeWaitSeats, chamberIndex, lastShotLive, lastShooterSeatId
 * Deprecated: beginRoundWin / redealAll (RoundWin path abolished)
 */
export const REVOLVER_RULES_API = 'v1';
