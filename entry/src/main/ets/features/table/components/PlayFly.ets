import { ControlIds } from '../../../common/Ids';
import { PlayFlyFx } from '../PlayFlyFx';

/**
 * lb_cmp_play_fly — PlayLaunch in-flight backs.
 * Not DealFx.flyOn. Hit-test Default while flying (swallows a second confirm).
 */
@Component
export struct PlayFly {
  @Prop visible: boolean = false;
  @Prop count: number = 1;
  @Prop x: number = 0;
  @Prop y: number = 0;
  /** Not `scale` — that name shadows CustomComponent.scale (CompileArkTS). */
  @Prop flyScale: number = 1;

  build() {
    if (this.visible) {
      Stack({ alignContent: Alignment.Center }) {
        ForEach(this.indexes(), (idx: number) => {
          Image($r('app.media.art_card_back'))
            .width(PlayFlyFx.CARD_W)
            .height(PlayFlyFx.CARD_H)
            .objectFit(ImageFit.Cover)
            .offset({ x: PlayFlyFx.fanOffset(this.count, idx) * 0.4, y: 0 })
        }, (idx: number) => `fly_${idx}`)
      }
      .id(ControlIds.PLAY_FLY)
      .width(PlayFlyFx.pileWidth(this.count))
      .height(PlayFlyFx.pileHeight())
      .position({ x: this.x, y: this.y })
      .scale({ x: this.flyScale, y: this.flyScale })
      .hitTestBehavior(HitTestMode.Default)
    }
  }

  private indexes(): number[] {
    const n: number = PlayFlyFx.clampCount(this.count);
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      out.push(i);
    }
    return out;
  }
}
