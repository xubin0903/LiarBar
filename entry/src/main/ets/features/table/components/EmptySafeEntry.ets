import { ControlIds } from '../../../common/Ids';

/**
 * #166 / 20 EmptySafe3 · ≥3 二选：你 / 上家.
 * Locked container: lb_cmp_empty_target_choice.
 * Locked buttons: lb_btn_challenge_you / lb_btn_challenge_prev.
 * Text stub OK for engine-first ship; art_btn_challenge_you/prev lands via art PR.
 * =2 ForceChallenge: caller must NOT show this entry.
 */
@Component
export struct EmptySafeEntry {
  @Prop visible: boolean = false;
  onYou: () => void = () => {};
  onPrev: () => void = () => {};

  build() {
    Row({ space: 12 }) {
      Button($r('app.string.lb_str_challenge_you'))
        .id(ControlIds.CHALLENGE_YOU)
        .constraintSize({ minWidth: 44, minHeight: 44 })
        .height(44)
        .padding({ left: 12, right: 12 })
        .fontSize($r('app.float.caption_text_size'))
        .backgroundColor($r('app.color.tavern_accent'))
        .fontColor($r('app.color.tavern_shadow'))
        .onClick(() => {
          this.onYou();
        })

      Button($r('app.string.lb_str_challenge_prev'))
        .id(ControlIds.CHALLENGE_PREV)
        .constraintSize({ minWidth: 44, minHeight: 44 })
        .height(44)
        .padding({ left: 12, right: 12 })
        .fontSize($r('app.float.caption_text_size'))
        .backgroundColor($r('app.color.tavern_panel'))
        .fontColor($r('app.color.tavern_paper'))
        .onClick(() => {
          this.onPrev();
        })
    }
    .id(ControlIds.EMPTY_TARGET_CHOICE)
    .justifyContent(FlexAlign.Center)
    .width('100%')
    .visibility(this.visible ? Visibility.Visible : Visibility.None)
  }
}
