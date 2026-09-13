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
  /** Locked overlay id (docs 08/09). Not a fifth lb_scr_*. */
  static readonly MATCH_LOAD: string = 'lb_ovl_match_load';
}

/** Reusable card-face layers. Instance .id stays lb_cmp_card_{0-4}. */
export class CardFaceIds {
  static readonly FACE: string = 'lb_card_face';
  static readonly BACK: string = 'lb_card_face_back';
  static readonly FRONT: string = 'lb_card_face_front';
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
  static readonly PEEK_TABLE: string = 'lb_btn_peek_table';
  static readonly RECORDS: string = 'lb_btn_records';
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
  /** 14 / 14b · selfDock 近旁生命组（主读烛；废当面数字） */
  static readonly LIFE_SELF: string = 'lb_cmp_life_self';
  static readonly LIFE_SEAT_P1: string = 'lb_cmp_life_seat_p1';
  static readonly LIFE_SEAT_P2: string = 'lb_cmp_life_seat_p2';
  static readonly LIFE_SEAT_P3: string = 'lb_cmp_life_seat_p3';
  static readonly LIFE_PIP_0: string = 'lb_cmp_life_pip_0';
  static readonly LIFE_PIP_1: string = 'lb_cmp_life_pip_1';
  static readonly LIFE_PIP_2: string = 'lb_cmp_life_pip_2';
  /** 14b · 废主路径。当面不得挂可见 Text。 */
  static readonly TXT_LIFE_SELF: string = 'lb_txt_life_self';
  /** 14b R-LIFE-5 · debug/dev only. Release hides via DebugBuild. */
  static readonly DEBUG_OPEN: string = 'lb_btn_debug_open';
  static readonly DEBUG_LIFE: string = 'lb_cmp_debug_life';
  static readonly DEBUG_LIFE_DEC: string = 'lb_btn_debug_life_dec';
  /** EXP 1 · debug/dev only. Mute/restore table AVPlayer BGM (SFX stay). */
  static readonly DEBUG_BGM_MUTE: string = 'lb_btn_debug_bgm_mute';
  /** 15 · 桌上确认条（合法选中才出；主提交） */
  static readonly PLAY_CONFIRM_BAR: string = 'lb_cmp_play_confirm_bar';
  static readonly PLAY_CONFIRM: string = 'lb_btn_play_confirm';
  static readonly KNOCK: string = 'lb_cmp_table_hit';
  static readonly SIGN_OK: string = 'lb_btn_sign_ok';
  static readonly SIGN_NO: string = 'lb_btn_sign_no';
}

/** Program call-site ids. Audio files live under rawfile/audio/, not art_*. */
export class SfxIds {
  static readonly BGM_LOBBY_NIGHT: string = 'lb_bgm_lobby_night';
  static readonly AMB_TAVERN: string = 'lb_sfx_amb_tavern';
  static readonly BOOT_HIT: string = 'lb_sfx_boot_hit';
  static readonly CTA_TAP: string = 'lb_sfx_cta_tap';
  static readonly VO_DEALER_GREET: string = 'lb_vo_dealer_greet';
  static readonly MATCH_OPEN: string = 'lb_sfx_match_open';
  static readonly DEAL_CARD: string = 'lb_sfx_deal_card';
  static readonly BGM_TABLE_BLUFF: string = 'lb_bgm_table_bluff';
  static readonly CLAIM_SET: string = 'lb_sfx_claim_set';
  static readonly PLAY_SOFT: string = 'lb_sfx_play_soft';
  static readonly PLAY_SLAM: string = 'lb_sfx_play_slam';
  static readonly PLAY_HESITATE: string = 'lb_sfx_play_hesitate';
  static readonly TURN_TICK: string = 'lb_sfx_turn_tick';
  static readonly NAMED_STARE: string = 'lb_sfx_named_stare';
  static readonly RESULT_WIN: string = 'lb_sfx_result_win';
  static readonly RESULT_LOSE: string = 'lb_sfx_result_lose';
  /** Call slot. Disk file may be sfx_card_flip.wav — do not rename this id. */
  static readonly CARD_FLIP: string = 'lb_sfx_card_flip';
  static readonly CARD_SELECT: string = 'lb_sfx_card_select';
  static readonly PLAY_CONFIRM: string = 'lb_sfx_play_confirm';
  /** Call slot. Disk file may be sfx_life_extinguish.wav — do not rename this id. */
  static readonly LIFE_EXTINGUISH: string = 'lb_sfx_life_extinguish';
}

export class PersistNs {
  static readonly PROFILE: string = 'lb.profile';
  static readonly LAST_TABLE: string = 'lb.last_table';
  static readonly STATS: string = 'lb.stats';
  static readonly MATCH_LOG: string = 'lb.match_log';
}
