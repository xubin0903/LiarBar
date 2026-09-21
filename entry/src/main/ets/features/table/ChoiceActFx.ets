/**
 * 质疑/相信桌槌 (#243 v0.2 Rebuild).
 * 四座头像旁常驻搁置；锤头朝荷官分向；相信静置；质疑 2.5D P0 加深砸。
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

  /** 抬起（须 animateTo EaseOut，禁瞬间赋值） */
  static readonly LIFT_MS: number = 140;
  /** 砸下 EaseIn */
  static readonly SMASH_MS: number = 180;
  /** 短震（朝向微抖，禁横向主移） */
  static readonly SHAKE_MS: number = 80;
  /** 砸后 SMASH_SCALE 持面，再回 REST */
  static readonly CONTACT_HOLD_MS: number = 220;
  /** 砸后回搁置 */
  static readonly REST_MS: number = 140;
  static readonly FADE_MS: number = 80;
  /** Smash-pose readable hold (0.8～1.2s). Not a reveal gate. */
  static readonly HOLD_MS: number = 1000;

  /** 2.5D P0：抬高 Y（屏上为负）；禁侧座 XY 横滑主轨. */
  static readonly LIFT_VP: number = 52;
  static readonly SHAKE_VP: number = 2;
  /** Raise near/big → smash far/flat（禁只拧两数交差；须配抬插值+影连续+持面）. */
  static readonly RAISE_SCALE: number = 1.35;
  static readonly SMASH_SCALE: number = 0.88;
  static readonly REST_SCALE: number = 1.0;
  /** 接触瞬间极短 squash（Y） */
  static readonly SQUASH_SCALE_Y: number = 0.82;
  /** Relative to restRot: pull-back / impact. */
  static readonly RAISE_DELTA: number = -52;
  static readonly DOWN_DELTA: number = 10;

  /**
   * Rebuild 朝向锁：锤头朝荷官（仅四向）；砸轨按座分；SELF 金框右空.
   * 美术主轴：rest/up/hit 槌头朝 +X（右）。旋出：
   * LEFT→=0 / TOP↓=90 / RIGHT←=180 / SELF↑=270.
   * 负责人「0=朝上」表 SELF=0/LEFT=90/TOP=180/RIGHT=270 ≡ 本表各+90；
   * 轴统一票若改主轴，只调 ART_HEAD_OFFSET（现 0）。
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
    return ChoiceActFx.LIFT_MS + ChoiceActFx.SMASH_MS + ChoiceActFx.CONTACT_HOLD_MS +
      ChoiceActFx.SHAKE_MS;
  }

  /** Art head=+X offset. 轴统一票改主轴时只动这里. */
  static readonly ART_HEAD_OFFSET: number = 0;

  /** Rest rot: hammer head toward dealer. Compass B=0 R=1 T=2 L=3. */
  static restRotOf(seatId: number): number {
    let deg: number = 0;
    if (seatId === 0) {
      deg = 270;
    } else if (seatId === 1) {
      deg = 180;
    } else if (seatId === 2) {
      deg = 90;
    } else {
      deg = 0;
    }
    return deg + ChoiceActFx.ART_HEAD_OFFSET;
  }

  /**
   * 2.5D depth lift is always screen-up (-Y) for all seats.
   * Facing/smash direction is rotation-only (restRot + deltas).
   */
}
