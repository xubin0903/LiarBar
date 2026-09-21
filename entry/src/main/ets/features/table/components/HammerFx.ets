import { ControlIds } from '../../../common/Ids';
import { ChoiceActFx } from '../ChoiceActFx';

/**
 * lb_cmp_choice_act mallet. 2.5D P0: scale+Y depth; shadow follows scale.
 * Facing via rot. HitTest None. Ban XY-slide main track.
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
  @Prop depthScale: number = 1;
  @Prop squashY: number = 1;
  @Prop shake: number = 0;
  @Prop fade: number = 1;

  build() {
    if (this.visible) {
      Stack() {
        Column()
          .width(ChoiceActFx.MALLET_W * 0.55)
          .height(ChoiceActFx.MALLET_H * 0.18)
          .borderRadius(99)
          .backgroundColor('#000000')
          .opacity(this.shadowOpacity())
          .scale({ x: this.shadowScale(), y: this.shadowScale() })
          .offset({ x: 0, y: this.shadowOffsetY() })
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
      .scale({ x: this.depthScale, y: this.depthScale * this.squashY })
      .hitTestBehavior(HitTestMode.None)
    }
  }

  private malletSrc(): Resource {
    if (this.kind === ChoiceActFx.KIND_DOUBT) {
      if (this.shake !== 0 || this.lift >= -2) {
        return $r('app.media.art_fx_mallet_hit');
      }
      return $r('app.media.art_fx_mallet_up');
    }
    return $r('app.media.art_fx_mallet');
  }

  private displayRot(): number {
    return this.rot;
  }

  /** scale 1.35→抬淡大影；0.88→落地紧影. 连续跟 scale，禁二分. */
  private depthT(): number {
    const lo: number = ChoiceActFx.SMASH_SCALE;
    const hi: number = ChoiceActFx.RAISE_SCALE;
    if (hi <= lo) {
      return 0;
    }
    let t: number = (this.depthScale - lo) / (hi - lo);
    if (t < 0) {
      t = 0;
    }
    if (t > 1) {
      t = 1;
    }
    return t;
  }

  private shadowOpacity(): number {
    return 0.32 - this.depthT() * 0.22;
  }

  private shadowScale(): number {
    return 0.8 + this.depthT() * 0.65;
  }

  private shadowOffsetY(): number {
    return ChoiceActFx.MALLET_H * (0.28 + this.depthT() * 0.22);
  }
}
