import { ControlIds } from '../../../common/Ids';
import { ChoiceActFx } from '../ChoiceActFx';

/**
 * lb_cmp_choice_act mallet sprite.
 * #238 frames: rest / raise / smash. No Spine.
 * HitTest None — never covers pool / hand / candles.
 */
@Component
export struct HammerFx {
  @Prop visible: boolean = false;
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
        .id(`${ControlIds.CHOICE_ACT}_mallet`)
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

  /** 质疑抬起 → up；砸下/短震 → hit；相信搁置/默认 → rest. */
  private malletSrc(): Resource {
    if (this.kind === ChoiceActFx.KIND_DOUBT) {
      if (this.shake !== 0 || this.lift > -ChoiceActFx.LIFT_VP) {
        return $r('app.media.art_fx_mallet_hit');
      }
      return $r('app.media.art_fx_mallet_up');
    }
    return $r('app.media.art_fx_mallet');
  }

  /**
   * #238 rest frame is already horizontal. Subtract REST_ROT so believe
   * lands on the painted pose while Table still drives this.rot.
   */
  private displayRot(): number {
    if (this.kind === ChoiceActFx.KIND_BELIEVE) {
      return this.rot - ChoiceActFx.REST_ROT;
    }
    return this.rot;
  }
}
