/**
 * 质疑/相信桌槌 (#243 v0.2 Rebuild).
 * 四座头像旁常驻搁置；锤头朝荷官分向；相信静置；质疑按座向砸。
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
  /** Relative to restRot: pull-back / impact (art rest = head-right horizontal). */
  static readonly RAISE_DELTA: number = -52;
  static readonly DOWN_DELTA: number = 10;

  /**
   * Rebuild 朝向锁：锤头朝荷官（仅四向）；砸轨按座分；SELF 金框右空.
   * Art rest @0° = 柄左锤右. TOP↓ SELF↑ LEFT→ RIGHT←.
   */
  /** self: 金框右侧空地（seatW 外）；禁压头像/烛. */
  static readonly SELF_OUT_GAP: number = 8;
  static readonly SELF_ANCHOR_DY: number = 0;
  static readonly SELF_FALLBACK_X: number = 120;
  static readonly SELF_FALLBACK_DY: number = -40;

  /** p3 左座: 头像右侧空（朝桌）. */
  static readonly LEFT_ANCHOR_DX: number = 52;
  static readonly LEFT_ANCHOR_DY: number = 4;
  static readonly LEFT_FALLBACK_X: number = 64;
  static readonly LEFT_FALLBACK_Y: number = 110;

  /** p1 右座: 头像左侧空朝桌. */
  static readonly RIGHT_SIDE_GAP: number = 8;
  static readonly RIGHT_ANCHOR_DY: number = 4;
  static readonly RIGHT_FALLBACK_DX: number = -120;
  static readonly RIGHT_FALLBACK_Y: number = 120;

  /** p2 对家: 头像左侧旁空整槌离脸. */
  static readonly TOP_SIDE_GAP: number = 12;
  static readonly TOP_ANCHOR_DY: number = 4;
  static readonly TOP_FALLBACK_X: number = 160;
  static readonly TOP_FALLBACK_Y: number = 16;

  static smashTotalMs(): number {
    return ChoiceActFx.LIFT_MS + ChoiceActFx.SMASH_MS + ChoiceActFx.SHAKE_MS;
  }

  /** Rest rot: hammer head toward dealer. Compass B=0 R=1 T=2 L=3. */
  static restRotOf(seatId: number): number {
    if (seatId === 0) {
      return -90;
    }
    if (seatId === 1) {
      return 180;
    }
    if (seatId === 2) {
      return 90;
    }
    return 0;
  }

  /** Raise offset sign along smash axis (away from dealer). */
  static raiseLiftSign(seatId: number): number {
    if (seatId === 0 || seatId === 1) {
      return 1;
    }
    return -1;
  }

  /** Smash axis uses X for LEFT/RIGHT; Y for TOP/SELF. */
  static smashAxisX(seatId: number): boolean {
    return seatId === 1 || seatId === 3;
  }
}
