/**
 * Section 2 AwaitChallenge numbers (17 / 02 / C2).
 * UI beat only — not a new engine Phase.
 *
 * C2 gates (implementation notes; 合入 ≠ 终验):
 *   C2-1 开局尚无上家牌禁质疑 — lastPlay==null / !canChallenge；禁 isFirstOfRound 粘性禁窗
 *   C2-2 质疑|相信同层二选 — lb_btn_challenge_doubt / _believe one layer; 相信 silent
 *   C2-3 只打上家本手 — targetPlayId = lastPlay.playId
 *   C2-4 打光禁入口 — hand==0 / emptyOrder / RankSettle → no entry
 *   C2-5 飞中禁钮 — PlayLaunch / confirmBusy → no entry
 *   C2-6 单轨 — no lb_scr_challenge push / no weak lb_btn_challenge CTA
 *   C2-7 先 ack 再揭 — 质疑 = ChallengeCommit + intentChallenge ACK;
 *                      reject → lb_str_challenge_reject. 质疑 ≠ 相信.
 *   C2-8 超时交权 — 10s (8～12) → 相信 (Trust/Pass), leave AwaitChallenge
 *
 * Hard locks: padB / HAND_RING_GAP=24% / candle lives primary / MAX_PLAY=3 unchanged.
 * Entry ABOLISH: true/false/pass as primary. true/false strings kept for reveal only.
 */
export class ChallengeFx {
  static readonly AWAIT_MS: number = 10000;
  static readonly AWAIT_MS_MIN: number = 8000;
  static readonly AWAIT_MS_MAX: number = 12000;
  static readonly TICK_MS: number = 200;
  static readonly BTN_VP: number = 48;
  static readonly PASS_VP: number = 44;
  static readonly RING_VP: number = 36;
  /** 17 · NPC 质疑|相信气泡时长（F2 全员层）。 */
  static readonly NPC_BUBBLE_MS: number = 1000;
}
