/**
 * 质疑/相信桌槌 timings (docs/02 质疑相信-桌槌表现 · #236).
 * Visual/SFX only. Does not change open-card 1000/3000 gates
 * or Trust|Challenge rule semantics.
 *
 * Art slot reserved: art_fx_mallet (warm wood + brass). P0 = geometry stand-in.
 * SFX slots: lb_sfx_hammer_hit / lb_sfx_hammer_rest. Never flip / launch / land.
 */
export class ChoiceActFx {
  static readonly KIND_NONE: number = 0;
  static readonly KIND_DOUBT: number = 1;
  static readonly KIND_BELIEVE: number = 2;

  static readonly MALLET_W: number = 28;
  static readonly MALLET_H: number = 52;
  static readonly HEAD_H: number = 14;
  static readonly HANDLE_W: number = 8;

  /** 抬起 */
  static readonly LIFT_MS: number = 80;
  /** 砸下 */
  static readonly SMASH_MS: number = 120;
  /** 短震 */
  static readonly SHAKE_MS: number = 80;
  /** 搁置轻顿 */
  static readonly REST_MS: number = 140;
  static readonly FADE_MS: number = 80;
  /** Debug / leftover auto-hide after the beat (not a reveal gate). */
  static readonly HOLD_MS: number = 360;

  static readonly LIFT_VP: number = 26;
  static readonly SHAKE_VP: number = 3;
  static readonly RAISE_ROT: number = -52;
  static readonly DOWN_ROT: number = 10;
  static readonly REST_FROM_ROT: number = 18;
  static readonly REST_ROT: number = 82;
  /** Believe slot is beside the smash slot (S19-4: 砸与搁不可辨). */
  static readonly REST_SLOT_X: number = 36;
  static readonly REST_SLOT_Y: number = 10;
  /** Keep hammer off pool heart (S19-5). */
  static readonly INWARD_PCT: number = 0.16;
  static readonly SELF_SIDE_VP: number = 64;

  static smashTotalMs(): number {
    return ChoiceActFx.LIFT_MS + ChoiceActFx.SMASH_MS + ChoiceActFx.SHAKE_MS;
  }
}
