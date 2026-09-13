import { ControlIds } from '../../../common/Ids';
import { PlayFlyFx } from '../PlayFlyFx';

/**
 * lb_cmp_play_front_pile — PlayLanded fan. This seat's current hand only.
 * Backs only. No count Text / Badge. HitTest None so it cannot eat the hand.
 */
@Component
export struct PlayFrontPile {
  @Prop visible: boolean = false;
  @Prop count: number = 1;
  @Prop seatId: number = 0;
  @Prop x: number = 0;
  @Prop y: number = 0;
  @Prop instanceId: string = ControlIds.PLAY_FRONT_PILE;

  build() {
    if (this.visible) {
      Stack({ alignContent: Alignment.Center }) {
        ForEach(this.indexes(), (idx: number) => {
          Image($r('app.media.art_card_back'))
            .width(PlayFlyFx.CARD_W)
            .height(PlayFlyFx.CARD_H)
            .objectFit(ImageFit.Cover)
            .offset({ x: PlayFlyFx.fanOffset(this.count, idx), y: 0 })
            .rotate({ angle: PlayFlyFx.fanAngle(this.count, idx) })
        }, (idx: number) => `pile_${this.seatId}_${idx}`)
      }
      .id(this.instanceId)
      .width(PlayFlyFx.pileWidth(this.count))
      .height(PlayFlyFx.pileHeight())
      .position({ x: this.x, y: this.y })
      .rotate({ angle: PlayFlyFx.seatTwist(this.seatId) })
      .hitTestBehavior(HitTestMode.None)
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
