/**
 * HandEmptyGate + CollectRedeal API surface for Table hooks.
 * SUPERSEDED name: historically "revolver"; primary path is now
 * 对局-状态机 v2.0.0 — PenaltyExtinguish1 (no RevolverGun).
 *
 * Public API (Table):
 * - chooseEmptyYou() — ≥3 质疑你 → RevealEmptyLast
 * - chooseEmptyShangjia() — ≥3 不质疑你 → RoundSafeWait + continue
 * - collectRedeal() — after PenaltyExtinguish1 / RoundSafeWait settle (不绑枪)
 * Snapshot: emptySafePending, forceChallengeEmpty, emptyHandSeatId,
 *   roundSafeWaitSeats, lastPenalizedSeatId
 * Frozen: chamberIndex / lastShotLive / RevolverGun (not primary)
 * Deprecated: beginRoundWin / redealAll (RoundWin path abolished)
 */
export const REVOLVER_RULES_API = 'v2-no-revolver';
