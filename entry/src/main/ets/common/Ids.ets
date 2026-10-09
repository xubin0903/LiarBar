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
  /** 22 §2.1 全部叠层共用全屏遮罩（吃点击）。 */
  static readonly MASK: string = 'lb_cmp_overlay_mask';
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
  /** 22 §7.3：原「进桌看看」位废止，改为规则入口（值原 lb_btn_peek_table）。 */
  static readonly RULES: string = 'lb_btn_rules';
  static readonly RECORDS: string = 'lb_btn_records';
  /** 22 §7.1 战绩大厅叠层。 */
  static readonly RECORDS_PANEL: string = 'lb_cmp_records_panel';
  static readonly RECORDS_BACK: string = 'lb_btn_records_back';
  static readonly RECORDS_SUMMARY: string = 'lb_cmp_records_summary';
  static readonly LIST_RECORDS: string = 'lb_list_records';
  /** + {i}（i 自 0）。 */
  static readonly RECORDS_ROW_PREFIX: string = 'lb_cmp_records_row_';
  /** 22 §7.3 规则说明（大厅入口；设置/暂停入口另票）。 */
  static readonly RULES_PANEL: string = 'lb_cmp_rules_panel';
  static readonly RULES_BACK: string = 'lb_btn_rules_back';
  static readonly RULES_SEC_GOAL: string = 'lb_cmp_rules_sec_goal';
  static readonly RULES_SEC_DEAL: string = 'lb_cmp_rules_sec_deal';
  static readonly RULES_SEC_PLAY: string = 'lb_cmp_rules_sec_play';
  static readonly RULES_SEC_DOUBT: string = 'lb_cmp_rules_sec_doubt';
  static readonly RULES_SEC_EMPTY: string = 'lb_cmp_rules_sec_empty';
  static readonly RULES_SEC_OUT: string = 'lb_cmp_rules_sec_out';
  static readonly RULES_SEC_WIN: string = 'lb_cmp_rules_sec_win';
  static readonly HAND: string = 'lb_cmp_hand';
  static readonly CHALLENGE: string = 'lb_btn_challenge';
  static readonly PLAY: string = 'lb_btn_play';
  static readonly AGAIN: string = 'lb_btn_again';
  /** 局内退出键（homeExitChrome）专用。结算页回大厅不再复用此 id。 */
  static readonly HOME: string = 'lb_btn_home';
  /** 结算页/战绩页「回大厅」（负责人 2026-10-07 拍板，与局内 lb_btn_home 分开）。 */
  static readonly REPORT_LOBBY: string = 'lb_btn_report_lobby';
  static readonly COVER_CHALLENGE: string = 'lb_cover_challenge';
  static readonly BET_BAR: string = 'lb_cmp_bet_bar';
  static readonly REVEAL_ROW: string = 'lb_cmp_reveal_row';
  static readonly DEALER_BANNER: string = 'lb_cmp_dealer_banner';
  static readonly DEALER_LINE: string = 'lb_txt_dealer_line';
  /** F4 · 轮到谁 tip（可复用 dealerLine）；顶栏左上。 */
  static readonly TABLE_TIP: string = 'lb_cmp_table_tip';
  static readonly TXT_CLAIM: string = 'lb_txt_claim';
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
  /** 结算战报版面（22 §4 · 02:324-328 已登记）。 */
  static readonly REPORT_HEAD: string = 'lb_cmp_report_head';
  static readonly REPORT_BODY: string = 'lb_cmp_report_body';
  static readonly REPORT_SCROLL: string = 'lb_cmp_report_scroll';
  static readonly REPORT_BTNBAR: string = 'lb_cmp_report_btnbar';
  static readonly REPORT_HL: string = 'lb_cmp_report_hl';
  static readonly REPORT_HL_BLUFF: string = 'lb_cmp_report_hl_bluff';
  static readonly REPORT_HL_DOUBT: string = 'lb_cmp_report_hl_doubt';
  static readonly REPORT_HL_BURN: string = 'lb_cmp_report_hl_burn';
  static readonly REPORT_HL_FALLBACK: string = 'lb_txt_report_hl_fallback';
  static readonly REPORT_FF_NOTE: string = 'lb_txt_report_ff_note';
  /** + self / p1 / p2 / p3（逐座行 / 三烛组）。 */
  static readonly RECAP_ROW_PREFIX: string = 'lb_cmp_recap_row_';
  static readonly RECAP_CANDLES_PREFIX: string = 'lb_cmp_recap_candles_';
  static readonly SEAT_SELF: string = 'lb_cmp_seat_self';
  static readonly SEAT_P1: string = 'lb_cmp_seat_p1';
  static readonly SEAT_P2: string = 'lb_cmp_seat_p2';
  static readonly SEAT_P3: string = 'lb_cmp_seat_p3';
  static readonly LIFE_SELF: string = 'lb_cmp_life_self';
  /** F5 · self 三烛外框；须包住 body+flame。 */
  static readonly LIFE_SELF_FRAME: string = 'lb_cmp_life_self_frame';
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
  /** #236 · 全员桌槌层；HitTest None. */
  static readonly CHOICE_ACT: string = 'lb_cmp_choice_act';
  /** #236 · 局内调试：只播本地座位锤，零业务. */
  static readonly DEBUG_HAMMER_DOUBT: string = 'lb_btn_debug_hammer_doubt';
  static readonly DEBUG_HAMMER_BELIEVE: string = 'lb_btn_debug_hammer_believe';
  /** PR-B 调试暂停入口（仅 DebugBuild）。 */
  static readonly DEBUG_PAUSE: string = 'lb_btn_debug_pause';
  /** 22 §3.2 / §6：局内暂停键 + 暂停层五项 + 待停条 + 确认框。 */
  static readonly PAUSE: string = 'lb_btn_pause';
  static readonly PAUSE_ICO: string = 'lb_ico_pause';
  static readonly PAUSE_LAYER: string = 'lb_cmp_pause_layer';
  static readonly PAUSE_RESUME: string = 'lb_btn_pause_resume';
  static readonly PAUSE_SETTINGS: string = 'lb_btn_pause_settings';
  static readonly PAUSE_RULES: string = 'lb_btn_pause_rules';
  static readonly PAUSE_END: string = 'lb_btn_pause_end';
  static readonly PAUSE_LOBBY: string = 'lb_btn_pause_lobby';
  static readonly PAUSE_BG_NOTE: string = 'lb_txt_pause_bg_note';
  static readonly PAUSE_PENDING: string = 'lb_txt_pause_pending';
  static readonly CONFIRM_END: string = 'lb_cmp_confirm_end';
  static readonly CONFIRM_END_OK: string = 'lb_btn_confirm_end_ok';
  static readonly CONFIRM_END_CANCEL: string = 'lb_btn_confirm_end_cancel';
  static readonly CONFIRM_LOBBY: string = 'lb_cmp_confirm_lobby';
  static readonly CONFIRM_LOBBY_OK: string = 'lb_btn_confirm_lobby_ok';
  static readonly CONFIRM_LOBBY_CANCEL: string = 'lb_btn_confirm_lobby_cancel';
  /** 2b · 21 §1.7 / 22 §5：人类出局二选一面板 + 两键（右主「直接看结算」/ 左次「继续观战」）。02:329 已登记。 */
  static readonly ELIM_CHOICE: string = 'lb_cmp_elim_choice';
  static readonly ELIM_REPORT: string = 'lb_btn_elim_report';
  static readonly ELIM_SPECTATE: string = 'lb_btn_elim_spectate';
  /** 2b · 22 §5.1：快进罩 + 唯一一行「快进中」。02:330 已登记。 */
  static readonly FF_OVERLAY: string = 'lb_cmp_ff_overlay';
  static readonly FF_RUNNING: string = 'lb_txt_ff_running';
  /** 2b · 22 §3.2：「观战中」角标（不吃点击）。02:331 已登记。 */
  static readonly SPECTATE_BADGE: string = 'lb_cmp_spectate_badge';
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
  /** #236 · 质疑砸槌. Disk optional: sfx_hammer_hit.wav. Never flip/launch/land. */
  static readonly HAMMER_HIT: string = 'lb_sfx_hammer_hit';
  /** #236 · 相信搁槌. Disk optional: sfx_hammer_rest.wav. Never flip/launch/land. */
  static readonly HAMMER_REST: string = 'lb_sfx_hammer_rest';
}

/** Media file names. #238 mallet frames. */
export class ArtIds {
  static readonly FX_MALLET: string = 'art_fx_mallet';
  static readonly FX_MALLET_UP: string = 'art_fx_mallet_up';
  static readonly FX_MALLET_HIT: string = 'art_fx_mallet_hit';
}

export class PersistNs {
  static readonly PROFILE: string = 'lb.profile';
  static readonly LAST_TABLE: string = 'lb.last_table';
  static readonly STATS: string = 'lb.stats';
  static readonly MATCH_LOG: string = 'lb.match_log';
  /** PR-B 音量设置（BGM/音效/静音），21 §4.2：Preferences `lb.settings`。 */
  static readonly AUDIO: string = 'lb.settings';
  /** PR-B 战绩（最近 20 局 + 累计）。 */
  static readonly RECORDS: string = 'lb.records';
}
