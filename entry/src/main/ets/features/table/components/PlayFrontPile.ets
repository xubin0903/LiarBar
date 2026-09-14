import { ControlIds } from '../../../common/Ids';
import { PlayFlyFx } from '../PlayFlyFx';

/**
 * lb_cmp_play_front_pile / lb_cmp_pool_hand — PlayLanded fan.
 * Pool mount: anchored=true sits in dealPileAnchor (stack-local on lb_cmp_pool).
 * Overlay mount: anchored=false uses absolute x/y in playFlyLayer.
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
  /** When true, parent Stack centers this fan (pool slot). No .position(). */
  @Prop anchored: boolean = false;

  build() {
    if (this.visible) {
      if (this.anchored) {
        this.fanStack()
      } else {
        this.fanStackedAt()
      }
    }
  }

  @Builder
  fanStack() {
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
    .rotate({ angle: PlayFlyFx.seatTwist(this.seatId) })
    .hitTestBehavior(HitTestMode.None)
  }

  @Builder
  fanStackedAt() {
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

  private indexes(): number[] {
    const n: number = PlayFlyFx.clampCount(this.count);
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      out.push(i);
    }
    return out;
  }
}
