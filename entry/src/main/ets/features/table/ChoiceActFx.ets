/**
 * 质疑/相信桌槌 (#243 v0.2 Rebuild).
 * 四座头像旁常驻搁置；相信静置不播；质疑就地抬砸回搁。
 * Visual/SFX only. Does not change open-card 1000/3000 gates
 * or Trust|Challenge rule semantics.
 *
 * Art: 已换绑 #238/#244/#248 art_fx_mallet / art_fx_mallet_up / art_fx_mallet_hit.
 * SFX slots: lb_sfx_hammer_hit / lb_sfx_hammer_rest. Never flip / launch / land.
 *
 * S19-7 锤压在牌上 / S19-8 相信还在动 / S19-9 砸点贴牌心.
 * Anchors are avatar-side empty slots — never lb_cmp_hand / pool / confirm.
 */
export class ChoiceActFx {
  static readonly KIND_NONE: number = 0;
  static readonly KIND_DOUBT: number = 1;
  static readonly KIND_BELIEVE: number = 2;

  static readonly MALLET_W: number = 72;
  static readonly MALLET_H: number = 72;
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

  static readonly LIFT_VP: number = 26;
  static readonly SHAKE_VP: number = 3;
  static readonly RAISE_ROT: number = -52;
  static readonly DOWN_ROT: number = 10;
  /** Rest frame is already horizontal; resident pose uses rot=0. */
  static readonly REST_ROT: number = 82;

  /**
   * Per-seat avatar-side anchors (17a v0.2.0 §2). Do not reuse one pair.
   * self / p3 / p2 / p1 each own DX/DY. Outer blank — never toward pool.
   */
  /** self: above left-dock portrait — never lb_cmp_hand / ring–hand belt. */
  static readonly SELF_ANCHOR_DX: number = 4;
  static readonly SELF_ANCHOR_DY: number = -80;
  static readonly SELF_FALLBACK_X: number = 12;
  static readonly SELF_FALLBACK_DY: number = -160;

  /** p3 左座: 头像左侧外侧/下侧空白，不朝池内收. */
  static readonly LEFT_ANCHOR_DX: number = -80;
  static readonly LEFT_ANCHOR_DY: number = 8;
  static readonly LEFT_FALLBACK_X: number = 8;
  static readonly LEFT_FALLBACK_Y: number = 110;

  /** p1 右座: 头像右侧外侧/下侧空白，不朝池内收. */
  static readonly RIGHT_ANCHOR_DX: number = 8;
  static readonly RIGHT_ANCHOR_DY: number = 10;
  static readonly RIGHT_FALLBACK_DX: number = -8;
  static readonly RIGHT_FALLBACK_Y: number = 120;

  /** p2 对家: 头像左侧水平旁缝；DY 不朝下走进池. */
  static readonly TOP_ANCHOR_DX: number = -80;
  static readonly TOP_ANCHOR_DY: number = 0;
  static readonly TOP_FALLBACK_X: number = 200;
  static readonly TOP_FALLBACK_Y: number = 16;

  static smashTotalMs(): number {
    return ChoiceActFx.LIFT_MS + ChoiceActFx.SMASH_MS + ChoiceActFx.SHAKE_MS;
  }
}
