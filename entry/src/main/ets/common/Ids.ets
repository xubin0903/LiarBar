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
  static readonly DEALER_BANNER: string = 'lb_cmp_dealer_banner';
  static readonly DEALER_LINE: string = 'lb_txt_dealer_line';
  static readonly PACKET: string = 'lb_cmp_packet';
  static readonly PLAY_CANCEL: string = 'lb_btn_play_cancel';
  static readonly STYLE_SOFT: string = 'lb_btn_style_soft';
  static readonly STYLE_SLAM: string = 'lb_btn_style_slam';
  static readonly STYLE_HESITATE: string = 'lb_btn_style_hesitate';
  static readonly PLAY_COUNT: string = 'lb_txt_play_count';
  static readonly CHALLENGE_SKIP: string = 'lb_btn_challenge_skip';
  static readonly BET_TRUE: string = 'lb_btn_bet_true';
  static readonly BET_FAKE: string = 'lb_btn_bet_fake';
  static readonly WINNER: string = 'lb_txt_winner';
  static readonly HIGHLIGHT: string = 'lb_txt_highlight';
  static readonly RECAP_LIST: string = 'lb_list_recap';
  static readonly SEAT_SELF: string = 'lb_cmp_seat_self';
  static readonly SEAT_P1: string = 'lb_cmp_seat_p1';
  static readonly SEAT_P2: string = 'lb_cmp_seat_p2';
  static readonly SEAT_P3: string = 'lb_cmp_seat_p3';
  static readonly KNOCK: string = 'lb_cmp_table_hit';
  static readonly SIGN_OK: string = 'lb_btn_sign_ok';
  static readonly SIGN_NO: string = 'lb_btn_sign_no';
}

export class PersistNs {
  static readonly PROFILE: string = 'lb.profile';
  static readonly LAST_TABLE: string = 'lb.last_table';
  static readonly STATS: string = 'lb.stats';
  static readonly MATCH_LOG: string = 'lb.match_log';
}
