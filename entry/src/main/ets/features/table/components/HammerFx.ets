import { ControlIds } from '../../../common/Ids';
import { ChoiceActFx } from '../ChoiceActFx';

/**
 * lb_cmp_choice_act mallet sprite. One instance per seat (resident rest).
 * 2.5D smash: scale+Y depth (抬大→砸小)；朝向靠 rot. HitTest None.
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
  @Prop scale: number = 1;
  @Prop shake: number = 0;
  @Prop fade: number = 1;

  build() {
    if (this.visible) {
      Stack() {
        // Soft shadow under mallet — bigger/lighter when raised.
        Column()
          .width(ChoiceActFx.MALLET_W * 0.55)
          .height(ChoiceActFx.MALLET_H * 0.18)
          .borderRadius(99)
          .backgroundColor('#000000')
          .opacity(this.shadowOpacity())
          .scale({ x: this.shadowScale(), y: this.shadowScale() })
          .offset({ x: 0, y: ChoiceActFx.MALLET_H * 0.38 })
          .hitTestBehavior(HitTestMode.None)
        Image(this.malletSrc())
          .id(`${ControlIds.CHOICE_ACT}_mallet_${this.seatId}`)
          .width(ChoiceActFx.MALLET_W)
          .height(ChoiceActFx.MALLET_H)
          .objectFit(ImageFit.Contain)
          .rotate({
            angle: this.displayRot(),
            centerX: ChoiceActFx.MALLET_W / 2,
            centerY: ChoiceActFx.MALLET_H / 2
          })
          .opacity(this.fade)
          .hitTestBehavior(HitTestMode.None)
      }
      .width(ChoiceActFx.MALLET_W)
      .height(ChoiceActFx.MALLET_H)
      .position({ x: this.x + this.shake, y: this.y + this.lift })
      .scale({ x: this.scale, y: this.scale })
      .hitTestBehavior(HitTestMode.None)
    }
  }

  /** 质疑抬起 → up；砸下/短震 → hit；常驻搁置 / 相信静置 → rest. */
  private malletSrc(): Resource {
    if (this.kind === ChoiceActFx.KIND_DOUBT) {
      if (this.shake !== 0 || this.lift >= 0) {
        return $r('app.media.art_fx_mallet_hit');
      }
      return $r('app.media.art_fx_mallet_up');
    }
    return $r('app.media.art_fx_mallet');
  }

  private displayRot(): number {
    return this.rot;
  }

  private shadowOpacity(): number {
    if (this.kind !== ChoiceActFx.KIND_DOUBT) {
      return 0.22;
    }
    if (this.lift < 0) {
      return 0.12;
    }
    return 0.28;
  }

  private shadowScale(): number {
    if (this.kind !== ChoiceActFx.KIND_DOUBT) {
      return 1.0;
    }
    if (this.lift < 0) {
      return 1.35;
    }
    return 0.85;
  }
}
