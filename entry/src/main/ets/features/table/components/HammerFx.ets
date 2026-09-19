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
        .position({ x: this.x + this.shake, y: this.y + this.lift })
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
      if (this.shake !== 0 || this.lift > -ChoiceActFx.LIFT_VP) {
        return $r('app.media.art_fx_mallet_hit');
      }
      return $r('app.media.art_fx_mallet_up');
    }
    return $r('app.media.art_fx_mallet');
  }

  /** Rest frame is already horizontal. Doubt uses RAISE/DOWN rot as driven. */
  private displayRot(): number {
    return this.rot;
  }
}
