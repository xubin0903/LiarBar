import { ControlIds, OverlayIds } from '../../common/Ids';

@Component
export struct PeekMaskOverlay {
  @Link visible: boolean;
  onClose: () => void = () => {};

  build() {
    if (this.visible) {
      Column({ space: 10 }) {
        Text($r('app.string.lb_str_overlay_peek'))
          .fontColor($r('app.color.tavern_paper'))
        Text($r('app.string.lb_str_peek_hint'))
          .fontColor($r('app.color.tavern_candle'))
        Image($r('app.media.art_card_privacy_mask'))
          .width($r('app.float.card_w'))
          .height($r('app.float.card_h'))
        Button($r('app.string.lb_str_skip'))
          .onClick(() => {
            this.onClose();
          })
      }
      .id(OverlayIds.PEEK_MASK)
      .width('100%')
      .padding(16)
      .backgroundColor($r('app.color.tavern_shadow'))
    }
  }
}

@Component
export struct PlaySheetOverlay {
  @Link visible: boolean;
  onClose: () => void = () => {};

  build() {
    if (this.visible) {
      Column({ space: 10 }) {
        Text($r('app.string.lb_str_overlay_play'))
          .fontColor($r('app.color.tavern_paper'))
        Row({ space: 12 }) {
          Image($r('app.media.art_play_soft')).width(40).height(40)
          Image($r('app.media.art_play_slam')).width(40).height(40)
          Image($r('app.media.art_play_hesitate')).width(40).height(40)
        }
        Button($r('app.string.lb_str_play'))
          .id(ControlIds.PLAY)
          .enabled(false)
        Button($r('app.string.lb_str_skip'))
          .onClick(() => {
            this.onClose();
          })
      }
      .id(OverlayIds.SHEET_PLAY)
      .width('100%')
      .padding(16)
      .backgroundColor($r('app.color.tavern_panel'))
    }
  }
}
