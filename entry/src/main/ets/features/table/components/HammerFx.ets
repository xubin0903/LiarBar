import { ControlIds } from '../../../common/Ids';
import { ChoiceActFx } from '../ChoiceActFx';

/**
 * lb_cmp_choice_act mallet sprite.
 * Image+animateTo when art_fx_mallet lands; P0 is warm-wood geometry (no Spine).
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
      Column() {
        // Head (brass hoop) — reserved swap: Image($r('app.media.art_fx_mallet'))
        Column()
          .width(ChoiceActFx.MALLET_W)
          .height(ChoiceActFx.HEAD_H)
          .backgroundColor($r('app.color.tavern_brass'))
          .borderRadius(4)
        // Handle (warm wood)
        Column()
          .width(ChoiceActFx.HANDLE_W)
          .height(ChoiceActFx.MALLET_H - ChoiceActFx.HEAD_H)
          .backgroundColor($r('app.color.tavern_mute'))
          .borderRadius(3)
          .margin({ top: -2 })
      }
      .id(`${ControlIds.CHOICE_ACT}_mallet`)
      .width(ChoiceActFx.MALLET_W)
      .height(ChoiceActFx.MALLET_H)
      .alignItems(HorizontalAlign.Center)
      .position({ x: this.x + this.shake, y: this.y + this.lift })
      .rotate({
        angle: this.rot,
        centerX: ChoiceActFx.MALLET_W / 2,
        centerY: ChoiceActFx.MALLET_H - 4
      })
      .opacity(this.fade)
      .hitTestBehavior(HitTestMode.None)
    }
  }
}
