@Component
export struct TutorialStub {
  build() {
    Text($r('app.string.lb_str_tutorial_stub'))
      .fontColor($r('app.color.tavern_mute'))
      .fontSize($r('app.float.subtitle_text_size'))
      .width('100%')
  }
}
