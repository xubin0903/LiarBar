@Component
export struct SpectatorStub {
  build() {
    Row({ space: 10 }) {
      Text($r('app.string.lb_str_spectator_stub'))
        .fontColor($r('app.color.tavern_mute'))
        .fontSize($r('app.float.subtitle_text_size'))
      Image($r('app.media.art_sign_knock')).width(28).height(28)
      Image($r('app.media.art_sign_ok')).width(28).height(28)
      Image($r('app.media.art_sign_no')).width(28).height(28)
    }
    .width('100%')
  }
}
