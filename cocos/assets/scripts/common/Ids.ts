/**
 * Locked UI / route / overlay ids. Engine 仅依赖 ChallengeBeatIds；
 * 其余类保留与 entry 对齐，供后续场景/桥使用。
 */

export class ScreenIds {
  static readonly LOBBY: string = 'lb_scr_lobby';
  static readonly TABLE: string = 'lb_scr_table';
  static readonly CHALLENGE: string = 'lb_scr_challenge';
  static readonly REPORT: string = 'lb_scr_report';
}

export class ChallengeBeatIds {
  static readonly WINDUP: string = 'lb_challenge_windup';
  static readonly STANDOFF: string = 'lb_challenge_standoff';
  static readonly REVEAL: string = 'lb_challenge_reveal';
  static readonly RESULT: string = 'lb_challenge_result';
}
