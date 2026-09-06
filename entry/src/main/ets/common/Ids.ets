/**
 * Locked UI / route / overlay ids. Do not invent a second prefix.
 * Controls: lb_* · Media: art_* · Never lb_art_*.
 */

export class ScreenIds {
  static readonly LOBBY: string = 'lb_scr_lobby';
  static readonly TABLE: string = 'lb_scr_table';
  static readonly CHALLENGE: string = 'lb_scr_challenge';
  static readonly REPORT: string = 'lb_scr_report';
}

export class PageUrls {
  static readonly LOBBY: string = 'pages/Lobby';
  static readonly TABLE: string = 'pages/Table';
  static readonly CHALLENGE: string = 'pages/Challenge';
  static readonly REPORT: string = 'pages/Report';
}

export class OverlayIds {
  static readonly PEEK_MASK: string = 'lb_cmp_peek_mask';
  static readonly SHEET_PLAY: string = 'lb_sheet_play';
  static readonly PRIVACY_ON: string = 'lb_privacy_on';
}

export class ChallengeBeatIds {
  static readonly WINDUP: string = 'lb_challenge_windup';
  static readonly STANDOFF: string = 'lb_challenge_standoff';
  static readonly REVEAL: string = 'lb_challenge_reveal';
  static readonly RESULT: string = 'lb_challenge_result';
}

export class ControlIds {
  static readonly QUICKSTART: string = 'lb_btn_quickstart';
  static readonly START: string = 'lb_btn_start';
  static readonly NICK_FIELD: string = 'lb_cmp_nick_field';
  static readonly PLAYERCOUNT: string = 'lb_cmp_playercount';
  static readonly SILENT: string = 'lb_tog_silent';
  static readonly TOPBAR: string = 'lb_cmp_topbar';
  static readonly DEALER: string = 'lb_cmp_dealer';
  static readonly HAND: string = 'lb_cmp_hand';
  static readonly CHALLENGE: string = 'lb_btn_challenge';
  static readonly PLAY: string = 'lb_btn_play';
  static readonly AGAIN: string = 'lb_btn_again';
  static readonly HOME: string = 'lb_btn_home';
  static readonly COVER_CHALLENGE: string = 'lb_cover_challenge';
  static readonly BET_BAR: string = 'lb_cmp_bet_bar';
  static readonly REVEAL_ROW: string = 'lb_cmp_reveal_row';
}

export class PersistNs {
  static readonly PROFILE: string = 'lb.profile';
  static readonly LAST_TABLE: string = 'lb.last_table';
  static readonly STATS: string = 'lb.stats';
  static readonly MATCH_LOG: string = 'lb.match_log';
}
