import { ControlIds } from '../../../common/Ids';

/**
 * #166 / 20 EmptySafe3 · ≥3 二选：你 / 上家.
 * Locked container: lb_cmp_empty_target_choice.
 * Locked buttons: lb_btn_challenge_you / lb_btn_challenge_prev.
 * Chrome: art_btn_challenge_you/prev ±_on (#168) — same Image+_on / pressed
 * pattern as PlayConfirmBar (true/false chrome not yet wired).
 * =2 ForceChallenge: caller must NOT show this entry.
 * Does not change padB / HAND_RING_GAP.
 */
/** 360×144 media → ≥44vp touch; aspect kept. Not padB / GAP. */
class EmptySafeFx {
  static readonly BTN_W: number = 120;
  static readonly BTN_H: number = 48;
}

@Component
export struct EmptySafeEntry {
  @Prop visible: boolean = false;
  onYou: () => void = () => {};
  onPrev: () => void = () => {};
  @State youPressed: boolean = false;
  @State prevPressed: boolean = false;

  build() {
    Row({ space: 12 }) {
      this.youChrome()
      this.prevChrome()
    }
    .id(ControlIds.EMPTY_TARGET_CHOICE)
    .justifyContent(FlexAlign.Center)
    .width('100%')
    .visibility(this.visible ? Visibility.Visible : Visibility.None)
  }

  @Builder
  youChrome() {
    Stack() {
      if (this.youPressed) {
        Image($r('app.media.art_btn_challenge_you_on'))
          .width('100%')
          .height('100%')
          .objectFit(ImageFit.Fill)
      } else {
        Image($r('app.media.art_btn_challenge_you'))
          .width('100%')
          .height('100%')
          .objectFit(ImageFit.Fill)
      }
      Button($r('app.string.lb_str_challenge_you'))
        .id(ControlIds.CHALLENGE_YOU)
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
            this.youPressed = true;
          } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
            this.youPressed = false;
          }
        })
        .onClick(() => {
          this.onYou();
        })
    }
    .width(EmptySafeFx.BTN_W)
    .height(EmptySafeFx.BTN_H)
    .clip(true)
  }

  @Builder
  prevChrome() {
    Stack() {
      if (this.prevPressed) {
        Image($r('app.media.art_btn_challenge_prev_on'))
          .width('100%')
          .height('100%')
          .objectFit(ImageFit.Fill)
      } else {
        Image($r('app.media.art_btn_challenge_prev'))
          .width('100%')
          .height('100%')
          .objectFit(ImageFit.Fill)
      }
      Button($r('app.string.lb_str_challenge_prev'))
        .id(ControlIds.CHALLENGE_PREV)
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
            this.prevPressed = true;
          } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
            this.prevPressed = false;
          }
        })
        .onClick(() => {
          this.onPrev();
        })
    }
    .width(EmptySafeFx.BTN_W)
    .height(EmptySafeFx.BTN_H)
    .clip(true)
  }
}
