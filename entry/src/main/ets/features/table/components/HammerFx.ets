import { ControlIds } from '../../../common/Ids';
import { ChoiceActFx } from '../ChoiceActFx';

/**
 * lb_cmp_choice_act mallet sprite. One instance per seat (resident rest).
 * #238/#244 frames: rest / raise / smash. No Spine.
 * HitTest None — never covers pool / hand / candles.
 */
@Component
export struct HammerFx {
  @Prop visible: boolean = true;
  @Prop seatId: number = 0;
  @Prop kind: number = 0;
  @Prop x: number = 0;
  @Prop y: number = 0;
  @Prop rot: number = 0;
  @Prop lift: number = 0;
  @Prop shake: number = 0;
  @Prop fade: number = 1;

  build() {
    if (this.visible) {
      Image(this.malletSrc())
        .id(`${ControlIds.CHOICE_ACT}_mallet_${this.seatId}`)
        .width(ChoiceActFx.MALLET_W)
        .height(ChoiceActFx.MALLET_H)
        .objectFit(ImageFit.Contain)
        .position({ x: this.posX(), y: this.posY() })
        .rotate({
          angle: this.displayRot(),
          centerX: ChoiceActFx.MALLET_W / 2,
          centerY: ChoiceActFx.MALLET_H / 2
        })
        .opacity(this.fade)
        .hitTestBehavior(HitTestMode.None)
    }
  }

  /** 质疑抬起 → up；砸下/短震 → hit；常驻搁置 / 相信静置 → rest. */
  private malletSrc(): Resource {
    if (this.kind === ChoiceActFx.KIND_DOUBT) {
      if (this.shake !== 0 || this.lift === 0) {
        return $r('app.media.art_fx_mallet_hit');
      }
      return $r('app.media.art_fx_mallet_up');
    }
    return $r('app.media.art_fx_mallet');
  }

  /** Absolute rot: restRot(seat) or smash deltas driven by Table. */
  private displayRot(): number {
    return this.rot;
  }

  /** LEFT/RIGHT: lift along X toward/away dealer; TOP/SELF along Y. */
  private posX(): number {
    if (ChoiceActFx.smashAxisX(this.seatId)) {
      return this.x + this.lift + this.shake;
    }
    return this.x + this.shake;
  }

  private posY(): number {
    if (ChoiceActFx.smashAxisX(this.seatId)) {
      return this.y;
    }
    return this.y + this.lift;
  }
}
