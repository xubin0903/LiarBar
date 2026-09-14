import { ControlIds } from '../../../common/Ids';

/**
 * #166 / EmptySafe3 · ≥3 二选：你 / 上家.
 * Locked: lb_btn_challenge_you / lb_btn_challenge_prev.
 * Art: art_btn_challenge_you / art_btn_challenge_prev (+ _on).
 * =2 ForceChallenge: caller must NOT show this entry.
 */
@Component
export struct EmptySafeEntry {
  @Prop visible: boolean = false;
  @Prop onYou: () => void = () => {};
  @Prop onPrev: () => void = () => {};

  build() {
    Row({ space: 12 }) {
      Column() {
        Image($r('app.media.art_btn_challenge_you'))
          .width(72)
          .height(40)
          .objectFit(ImageFit.Contain)
        Text($r('app.string.lb_str_challenge_you'))
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.caption_text_size'))
          .margin({ top: 2 })
      }
      .id(ControlIds.CHALLENGE_YOU)
      .padding(6)
      .onClick(() => {
        this.onYou();
      })

      Column() {
        Image($r('app.media.art_btn_challenge_prev'))
          .width(72)
          .height(40)
          .objectFit(ImageFit.Contain)
        Text($r('app.string.lb_str_challenge_prev'))
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.caption_text_size'))
          .margin({ top: 2 })
      }
      .id(ControlIds.CHALLENGE_PREV)
      .padding(6)
      .onClick(() => {
        this.onPrev();
      })
    }
    .id(ControlIds.EMPTY_SAFE_ENTRY)
    .justifyContent(FlexAlign.Center)
    .width('100%')
    .visibility(this.visible ? Visibility.Visible : Visibility.None)
  }
}
