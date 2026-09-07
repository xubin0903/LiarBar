import { ControlIds } from '../../common/Ids';
import { ConfigRepository } from '../../config/ConfigRepository';

@Component
export struct LobbyPanel {
  @Link nickname: string;
  @Link playerCount: number;
  @Link silent: boolean;
  onFillLast: () => void = () => {};
  onSilentChange: (on: boolean) => void = (_on: boolean) => {};

  build() {
    Column({ space: 12 }) {
      Text($r('app.string.lb_str_autofill_hint'))
        .fontColor($r('app.color.tavern_mute'))
        .fontSize($r('app.float.caption_text_size'))
        .alignSelf(ItemAlign.Start)

      Stack() {
        Image($r('app.media.art_input_field'))
          .width('100%')
          .height($r('app.float.btn_height'))
          .objectFit(ImageFit.Fill)
        TextInput({ text: this.nickname, placeholder: $r('app.string.lb_str_nick_ph') })
          .id(ControlIds.NICK_FIELD)
          .width('100%')
          .height($r('app.float.btn_height'))
          .padding({ left: 20, right: 20 })
          .backgroundColor(Color.Transparent)
          .placeholderColor($r('app.color.tavern_mute'))
          .fontColor($r('app.color.tavern_paper'))
          .onChange((value: string) => {
            this.nickname = value;
          })
      }
      .width('100%')
      .height($r('app.float.btn_height'))

      Row({ space: 12 }) {
        Text(`人数 ${this.playerCount} · 命 ${this.livesText()}`)
          .id(ControlIds.PLAYERCOUNT)
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.page_text_size'))
      }
      .width('100%')

      Row() {
        Text($r('app.string.lb_str_silent_hint'))
          .fontColor($r('app.color.tavern_mute'))
          .fontSize($r('app.float.caption_text_size'))
          .layoutWeight(1)
        Toggle({ type: ToggleType.Switch, isOn: this.silent })
          .id(ControlIds.SILENT)
          .onChange((on: boolean) => {
            this.silent = on;
            this.onSilentChange(on);
          })
      }
      .width('100%')

      Text($r('app.string.lb_str_fill_last'))
        .fontColor($r('app.color.tavern_mute'))
        .fontSize($r('app.float.caption_text_size'))
        .alignSelf(ItemAlign.Start)
        .onClick(() => {
          this.onFillLast();
        })
    }
    .width('100%')
    .padding(16)
    .backgroundColor($r('app.color.tavern_panel'))
    .borderRadius($r('app.float.panel_radius'))
    .borderWidth(1)
    .borderColor($r('app.color.tavern_brass'))
  }

  private livesText(): string {
    if (!ConfigRepository.isReady()) {
      return '--';
    }
    return `${ConfigRepository.match().lives_default}`;
  }
}
