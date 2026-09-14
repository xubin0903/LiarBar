import { ControlIds } from '../../../common/Ids';

/**
 * ≥3 hand-empty: 你 / 上家 (EmptySafe3).
 * Overlay in ring–hand GAP. Does not raise padB / GAP.
 */
@Component
export struct EmptySafeEntry {
  @Prop visible: boolean = false;
  @Prop onYou: () => void = () => {};
  @Prop onShangjia: () => void = () => {};

  build() {
    Row({ space: 12 }) {
      Text($r('app.string.lb_str_empty_safe_you'))
        .id(ControlIds.EMPTY_SAFE_YOU)
        .fontColor($r('app.color.tavern_shadow'))
        .fontSize($r('app.float.page_text_size'))
        .padding({ left: 16, right: 16, top: 8, bottom: 8 })
        .backgroundColor($r('app.color.tavern_accent'))
        .borderRadius(8)
        .onClick(() => {
          this.onYou();
        })
      Text($r('app.string.lb_str_empty_safe_shangjia'))
        .id(ControlIds.EMPTY_SAFE_SHANGJIA)
        .fontColor($r('app.color.tavern_paper'))
        .fontSize($r('app.float.page_text_size'))
        .padding({ left: 16, right: 16, top: 8, bottom: 8 })
        .backgroundColor($r('app.color.tavern_panel'))
        .borderRadius(8)
        .onClick(() => {
          this.onShangjia();
        })
    }
    .id(ControlIds.EMPTY_SAFE_ENTRY)
    .justifyContent(FlexAlign.Center)
    .width('100%')
    .visibility(this.visible ? Visibility.Visible : Visibility.None)
  }
}
