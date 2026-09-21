/**
 * 质疑/相信桌槌 (#243 v0.2 Rebuild).
 * 四座头像旁常驻搁置；相信静置不播；质疑就地抬砸回搁。
 * Visual/SFX only. Does not change open-card 1000/3000 gates
 * or Trust|Challenge rule semantics.
 *
 * Art: 已换绑 #238/#244/#251 art_fx_mallet*（512² 道具级；显示 112vp）.
 * SFX slots: lb_sfx_hammer_hit / lb_sfx_hammer_rest. Never flip / launch / land.
 *
 * S19-7 锤压在牌上 / S19-8 相信还在动 / S19-9 砸点贴牌心.
 * Anchors are avatar-side empty slots — never lb_cmp_hand / pool / confirm.
 */
export class ChoiceActFx {
  static readonly KIND_NONE: number = 0;
  static readonly KIND_DOUBT: number = 1;
  static readonly KIND_BELIEVE: number = 2;

  static readonly MALLET_W: number = 112;
  static readonly MALLET_H: number = 112;
  static readonly HEAD_H: number = 14;
  static readonly HANDLE_W: number = 8;

  /** 抬起 */
  static readonly LIFT_MS: number = 80;
  /** 砸下 */
  static readonly SMASH_MS: number = 120;
  /** 短震 */
  static readonly SHAKE_MS: number = 80;
  /** 砸后回搁置 */
  static readonly REST_MS: number = 140;
  static readonly FADE_MS: number = 80;
  /** Smash-pose readable hold (0.8～1.2s). Not a reveal gate. */
  static readonly HOLD_MS: number = 1000;

  static readonly LIFT_VP: number = 36;
  static readonly SHAKE_VP: number = 3;
  static readonly RAISE_ROT: number = -52;
  static readonly DOWN_ROT: number = 10;
  /** Rest frame is already horizontal; resident pose uses rot=0. */
  static readonly REST_ROT: number = 82;

  /**
   * Aron Rebuild 再打回：旁空朝桌 ≠ 硬外偏；禁压脸 / 禁飘桌心.
   * LEFT 头像右空朝桌 · RIGHT 头像左空朝桌 · TOP 头像左侧旁空离脸 · self 底座旁空不压手.
   */
  /** self: 贴 40 头像右旁缝；DY 只轻抬，禁 -96 飘到荷官旁. */
  static readonly SELF_ANCHOR_DX: number = 44;
  static readonly SELF_ANCHOR_DY: number = -24;
  static readonly SELF_FALLBACK_X: number = 48;
  static readonly SELF_FALLBACK_DY: number = -48;

  /** p3 左座: 头像右侧空（朝桌）。禁负 DX 贴左缘/刘海. */
  static readonly LEFT_ANCHOR_DX: number = 52;
  static readonly LEFT_ANCHOR_DY: number = 4;
  static readonly LEFT_FALLBACK_X: number = 64;
  static readonly LEFT_FALLBACK_Y: number = 110;

  /** p1 右座: 头像左侧空朝桌；origin - MALLET_W - SIDE_GAP。禁 seat 右缘外侧. */
  static readonly RIGHT_SIDE_GAP: number = 8;
  static readonly RIGHT_ANCHOR_DY: number = 4;
  static readonly RIGHT_FALLBACK_DX: number = -120;
  static readonly RIGHT_FALLBACK_Y: number = 120;

  /** p2 对家: 头像左侧旁空 = origin - MALLET_W - GAP（整槌离脸，禁压脸）. */
  static readonly TOP_SIDE_GAP: number = 12;
  static readonly TOP_ANCHOR_DY: number = 4;
  static readonly TOP_FALLBACK_X: number = 160;
  static readonly TOP_FALLBACK_Y: number = 16;

  static smashTotalMs(): number {
    return ChoiceActFx.LIFT_MS + ChoiceActFx.SMASH_MS + ChoiceActFx.SHAKE_MS;
  }
}
