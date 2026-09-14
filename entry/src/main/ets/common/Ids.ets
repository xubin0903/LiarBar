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
  static readonly MATCH_LOAD: string = 'lb_ovl_match_load';
}

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
  static readonly LIFE_SELF: string = 'lb_cmp_life_self';
  static readonly LIFE_SEAT_P1: string = 'lb_cmp_life_seat_p1';
  static readonly LIFE_SEAT_P2: string = 'lb_cmp_life_seat_p2';
  static readonly LIFE_SEAT_P3: string = 'lb_cmp_life_seat_p3';
  static readonly LIFE_PIP_0: string = 'lb_cmp_life_pip_0';
  static readonly LIFE_PIP_1: string = 'lb_cmp_life_pip_1';
  static readonly LIFE_PIP_2: string = 'lb_cmp_life_pip_2';
  static readonly TXT_LIFE_SELF: string = 'lb_txt_life_self';
  static readonly DEBUG_OPEN: string = 'lb_btn_debug_open';
  static readonly DEBUG_LIFE: string = 'lb_cmp_debug_life';
  static readonly DEBUG_LIFE_DEC: string = 'lb_btn_debug_life_dec';
  static readonly DEBUG_BGM_MUTE: string = 'lb_btn_debug_bgm_mute';
  static readonly DEBUG_SFX_PATH: string = 'lb_btn_debug_sfx_path';
  static readonly DEBUG_SFX_ARM: string = 'lb_btn_debug_sfx_arm';
  static readonly PLAY_CONFIRM_BAR: string = 'lb_cmp_play_confirm_bar';
  static readonly PLAY_CONFIRM: string = 'lb_btn_play_confirm';
  static readonly PLAY_FLY: string = 'lb_cmp_play_fly';
  static readonly PLAY_FRONT_PILE: string = 'lb_cmp_play_front_pile';
  static readonly PLAY_POOL_HAND: string = 'lb_cmp_pool_hand';
  static readonly REVEAL_STAGE: string = 'lb_cmp_reveal_stage';
  static readonly RANK_SETTLE: string = 'lb_cmp_rank_settle';
  static readonly ROUND_WIN: string = 'lb_cmp_round_win';
  static readonly CHALLENGE_AWAIT: string = 'lb_cmp_challenge_await';
  static readonly CHALLENGE_ENTRY: string = 'lb_cmp_challenge_entry';
  /**
   * 17 v0.3.0 · AwaitChallenge entry = 质疑|相信.
   * Locked: lb_btn_challenge_doubt / lb_btn_challenge_believe.
   * Art: art_btn_challenge_doubt / art_btn_challenge_believe (+ _on).
   * ABOLISH entry use of TRUE/FALSE/PASS (kept below for reveal/judgment only).
   */
  static readonly CHALLENGE_DOUBT: string = 'lb_btn_challenge_doubt';
  static readonly CHALLENGE_BELIEVE: string = 'lb_btn_challenge_believe';
  /** @deprecated entry — reveal/judgment only. Do NOT bind on ChallengeEntry. */
  static readonly CHALLENGE_TRUE: string = 'lb_btn_challenge_true';
  /** @deprecated entry — reveal/judgment only. Do NOT bind on ChallengeEntry. */
  static readonly CHALLENGE_FALSE: string = 'lb_btn_challenge_false';
  /** @deprecated entry — abolished third key. Trust = CHALLENGE_BELIEVE. */
  static readonly CHALLENGE_PASS: string = 'lb_btn_challenge_pass';
  static readonly CHALLENGE_TIMER: string = 'lb_cmp_challenge_timer';
  static readonly CHALLENGE_RING: string = 'lb_cmp_challenge_ring';
  static readonly CHALLENGE_DEALER_ENTER: string = 'lb_txt_challenge_dealer_enter';
  static readonly NPC_CHALLENGE_BUBBLE: string = 'lb_cmp_npc_challenge_bubble';
  /**
   * #166 / 20 EmptySafe3 · ≥3 二选（你 / 上家）。
   * Locked container: lb_cmp_empty_target_choice (NOT lb_cmp_empty_safe_entry).
   * Buttons: lb_btn_challenge_you / lb_btn_challenge_prev — do not invent lb_btn_empty_*.
   * Art: art_btn_challenge_you / art_btn_challenge_prev (+ _on).
   * =2 ForceChallenge: hide this entry.
   */
  static readonly EMPTY_TARGET_CHOICE: string = 'lb_cmp_empty_target_choice';
  static readonly CHALLENGE_YOU: string = 'lb_btn_challenge_you';
  static readonly CHALLENGE_PREV: string = 'lb_btn_challenge_prev';
  static readonly DEBUG_PLAY_REJECT: string = 'lb_btn_debug_play_reject';
  static readonly DEBUG_CHALLENGE_REJECT: string = 'lb_btn_debug_challenge_reject';
  static readonly KNOCK: string = 'lb_cmp_table_hit';
  static readonly SIGN_OK: string = 'lb_btn_sign_ok';
  static readonly SIGN_NO: string = 'lb_btn_sign_no';
}

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
  static readonly CARD_FLIP: string = 'lb_sfx_card_flip';
  static readonly CARD_SELECT: string = 'lb_sfx_card_select';
  static readonly PLAY_CONFIRM: string = 'lb_sfx_play_confirm';
  static readonly PLAY_LAUNCH: string = 'lb_sfx_play_launch';
  static readonly PLAY_LAND: string = 'lb_sfx_play_land';
  static readonly CHALLENGE_ENTER: string = 'lb_sfx_challenge_enter';
  static readonly CHALLENGE_COMMIT: string = 'lb_sfx_challenge_commit';
  static readonly REVEAL_DRAW: string = 'lb_sfx_reveal_draw';
  static readonly REVEAL_FLIP: string = 'lb_sfx_reveal_flip';
  static readonly LIFE_EXTINGUISH: string = 'lb_sfx_life_extinguish';
  /** #168 · EmptySafe you/prev press. Disk: sfx_revolver_click.wav. Never flip/launch/land. */
  static readonly REVOLVER_CLICK: string = 'lb_sfx_revolver_click';
  /** #168 · Engine applyShoot. Disk: sfx_revolver_shot.wav. Never flip/launch/land. */
  static readonly REVOLVER_SHOT: string = 'lb_sfx_revolver_shot';
  /** #168 · CollectRedeal / chamber advance. Disk: sfx_revolver_spin.wav. Never flip/launch/land. */
  static readonly REVOLVER_SPIN: string = 'lb_sfx_revolver_spin';
}

export class PersistNs {
  static readonly PROFILE: string = 'lb.profile';
  static readonly LAST_TABLE: string = 'lb.last_table';
  static readonly STATS: string = 'lb.stats';
  static readonly MATCH_LOG: string = 'lb.match_log';
}
