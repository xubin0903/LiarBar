import { ControlIds } from '../../../common/Ids';
import { ChallengeFx } from '../ChallengeFx';

/**
 * lb_cmp_challenge_entry / lb_cmp_challenge_await
 * BottomEnd overlay family (same as confirm bar). Not inside handPin.
 * 真 / 假 same-layer two buttons + 过. Optional countdown ring.
 * Does not change padB / HAND_RING_GAP. Does not cover claim / pile heart.
 */
@Component
export struct ChallengeEntry {
  @Prop visible: boolean = false;
  @Prop remainSec: number = 10;
  onTrue: () => void = () => {};
  onFalse: () => void = () => {};
  onPass: () => void = () => {};

  build() {
    if (this.visible) {
      Column({ space: 8 }) {
        this.timerRing()
        Row({ space: 12 }) {
          Button('真')
            .id(ControlIds.CHALLENGE_TRUE)
            .type(ButtonType.Normal)
            .width(ChallengeFx.BTN_VP)
            .height(ChallengeFx.BTN_VP)
            .fontSize($r('app.float.page_text_size'))
            .fontWeight(FontWeight.Medium)
            .backgroundColor($r('app.color.tavern_settle_ok'))
            .fontColor($r('app.color.tavern_paper'))
            .borderRadius(ChallengeFx.BTN_VP / 2)
            .onClick(() => {
              this.onTrue();
            })
          Button('假')
            .id(ControlIds.CHALLENGE_FALSE)
            .type(ButtonType.Normal)
            .width(ChallengeFx.BTN_VP)
            .height(ChallengeFx.BTN_VP)
            .fontSize($r('app.float.page_text_size'))
            .fontWeight(FontWeight.Medium)
            .backgroundColor($r('app.color.tavern_danger'))
            .fontColor($r('app.color.tavern_paper'))
            .borderRadius(ChallengeFx.BTN_VP / 2)
            .onClick(() => {
              this.onFalse();
            })
        }
        Button('过')
          .id(ControlIds.CHALLENGE_PASS)
          .type(ButtonType.Normal)
          .width(ChallengeFx.PASS_VP)
          .height(ChallengeFx.PASS_VP)
          .fontSize($r('app.float.caption_text_size'))
          .backgroundColor($r('app.color.tavern_felt'))
          .fontColor($r('app.color.tavern_mute'))
          .borderRadius(ChallengeFx.PASS_VP / 2)
          .onClick(() => {
            this.onPass();
          })
      }
      .id(ControlIds.CHALLENGE_ENTRY)
      .padding({
        left: 10,
        right: 10,
        top: 8,
        bottom: 8
      })
      .backgroundColor($r('app.color.tavern_panel'))
      .borderRadius($r('app.float.panel_radius'))
      .border({
        width: 1,
        color: $r('app.color.tavern_brass')
      })
      .margin({
        right: 8,
        bottom: 8
      })
      .alignItems(HorizontalAlign.Center)
    }
  }

  @Builder
  timerRing() {
    Stack({ alignContent: Alignment.Center }) {
      Column()
        .id(ControlIds.CHALLENGE_RING)
        .width(ChallengeFx.RING_VP)
        .height(ChallengeFx.RING_VP)
        .borderRadius(ChallengeFx.RING_VP / 2)
        .border({
          width: 3,
          color: $r('app.color.tavern_accent')
        })
      Text(`${this.remainSec}`)
        .fontColor($r('app.color.tavern_candle'))
        .fontSize($r('app.float.caption_text_size'))
    }
    .id(ControlIds.CHALLENGE_TIMER)
    .width(ChallengeFx.RING_VP)
    .height(ChallengeFx.RING_VP)
    .hitTestBehavior(HitTestMode.None)
  }

}
