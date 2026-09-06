import { ControlIds } from '../../common/Ids';
import { ConfigRepository } from '../../config/ConfigRepository';

@Component
export struct LobbyPanel {
  @Link nickname: string;
  @Link playerCount: number;
  @Link silent: boolean;
  onFillLast: () => void = () => {};
  onQuickStart: () => void = () => {};

  build() {
    Column({ space: 12 }) {
      Text($r('app.string.lb_str_autofill_hint'))
        .fontColor($r('app.color.tavern_mute'))
        .fontSize($r('app.float.subtitle_text_size'))
        .alignSelf(ItemAlign.Start)

      TextInput({ text: this.nickname, placeholder: $r('app.string.lb_str_nick_ph') })
        .id(ControlIds.NICK_FIELD)
        .width('100%')
        .backgroundColor($r('app.color.tavern_felt'))
        .placeholderColor($r('app.color.tavern_mute'))
        .fontColor($r('app.color.tavern_paper'))
        .onChange((value: string) => {
          this.nickname = value;
        })

      Row({ space: 12 }) {
        Text(`人数 ${this.playerCount}`)
          .id(ControlIds.PLAYERCOUNT)
          .fontColor($r('app.color.tavern_paper'))
        if (ConfigRepository.isReady()) {
          Text(`命 ${ConfigRepository.match().lives_default}`)
            .fontColor($r('app.color.tavern_candle'))
        }
      }
      .width('100%')

      Row() {
        Text($r('app.string.lb_str_silent_hint'))
          .fontColor($r('app.color.tavern_mute'))
          .fontSize($r('app.float.subtitle_text_size'))
          .layoutWeight(1)
        Toggle({ type: ToggleType.Switch, isOn: this.silent })
          .id(ControlIds.SILENT)
          .onChange((on: boolean) => {
            this.silent = on;
          })
      }
      .width('100%')

      Button($r('app.string.lb_str_fill_last'))
        .width('100%')
        .height($r('app.float.btn_height'))
        .backgroundColor($r('app.color.tavern_felt'))
        .fontColor($r('app.color.tavern_paper'))
        .onClick(() => {
          this.onFillLast();
        })

      Button($r('app.string.lb_str_quickstart'))
        .id(ControlIds.QUICKSTART)
        .width('100%')
        .height($r('app.float.btn_height'))
        .backgroundColor($r('app.color.tavern_accent'))
        .fontColor($r('app.color.tavern_bg'))
        .onClick(() => {
          this.onQuickStart();
        })
    }
    .width('100%')
  }
}
