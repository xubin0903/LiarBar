import { ControlIds } from '../../../common/Ids';
import { ChallengeFx } from '../ChallengeFx';

/**
 * lb_cmp_challenge_entry / lb_cmp_challenge_await
 * Self-front overlay in ring–hand HAND_RING_GAP band (above lb_cmp_hand).
 * Same overlay family as confirm bar, but NOT BottomEnd-only corner (17 v0.3.0).
 * Not inside handPin. 质疑|相信 same-layer two buttons (abolish 真/假/过 entry).
 * Chrome: art_btn_challenge_doubt/believe ±_on — wordless; client overlays text.
 * Optional countdown ring. Does not change padB / HAND_RING_GAP.
 * Does not cover claim / pile heart / hand row.
 */
/** 360×144 media → ≥44vp touch; aspect kept. Not padB / GAP. */
class ChallengeEntryFx {
  static readonly BTN_W: number = 120;
  static readonly BTN_H: number = 48;
}

@Component
export struct ChallengeEntry {
  @Prop visible: boolean = false;
  @Prop remainSec: number = 10;
  onDoubt: () => void = () => {};
  onBelieve: () => void = () => {};
  @State doubtPressed: boolean = false;
  @State believePressed: boolean = false;

  build() {
    if (this.visible) {
      Column({ space: 8 }) {
        this.timerRing()
        Row({ space: 12 }) {
          this.doubtChrome()
          this.believeChrome()
        }
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
      .alignItems(HorizontalAlign.Center)
    }
  }

  @Builder
  doubtChrome() {
    Stack() {
      if (this.doubtPressed) {
        Image($r('app.media.art_btn_challenge_doubt_on'))
          .width('100%')
          .height('100%')
          .objectFit(ImageFit.Fill)
      } else {
        Image($r('app.media.art_btn_challenge_doubt'))
          .width('100%')
          .height('100%')
          .objectFit(ImageFit.Fill)
      }
      Button($r('app.string.lb_str_challenge_doubt'))
        .id(ControlIds.CHALLENGE_DOUBT)
        .type(ButtonType.Normal)
        .width('100%')
        .height('100%')
        .constraintSize({ minWidth: 44, minHeight: 44 })
        .fontSize($r('app.float.caption_text_size'))
        .fontWeight(FontWeight.Medium)
        .backgroundColor(Color.Transparent)
        .fontColor($r('app.color.tavern_paper'))
        .stateEffect(false)
        .onTouch((event: TouchEvent) => {
          if (event.type === TouchType.Down) {
            this.doubtPressed = true;
          } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
            this.doubtPressed = false;
          }
        })
        .onClick(() => {
          this.onDoubt();
        })
    }
    .width(ChallengeEntryFx.BTN_W)
    .height(ChallengeEntryFx.BTN_H)
    .clip(true)
  }

  @Builder
  believeChrome() {
    Stack() {
      if (this.believePressed) {
        Image($r('app.media.art_btn_challenge_believe_on'))
          .width('100%')
          .height('100%')
          .objectFit(ImageFit.Fill)
      } else {
        Image($r('app.media.art_btn_challenge_believe'))
          .width('100%')
          .height('100%')
          .objectFit(ImageFit.Fill)
      }
      Button($r('app.string.lb_str_challenge_believe'))
        .id(ControlIds.CHALLENGE_BELIEVE)
        .type(ButtonType.Normal)
        .width('100%')
        .height('100%')
        .constraintSize({ minWidth: 44, minHeight: 44 })
        .fontSize($r('app.float.caption_text_size'))
        .fontWeight(FontWeight.Medium)
        .backgroundColor(Color.Transparent)
        .fontColor($r('app.color.tavern_paper'))
        .stateEffect(false)
        .onTouch((event: TouchEvent) => {
          if (event.type === TouchType.Down) {
            this.believePressed = true;
          } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
            this.believePressed = false;
          }
        })
        .onClick(() => {
          this.onBelieve();
        })
    }
    .width(ChallengeEntryFx.BTN_W)
    .height(ChallengeEntryFx.BTN_H)
    .clip(true)
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
