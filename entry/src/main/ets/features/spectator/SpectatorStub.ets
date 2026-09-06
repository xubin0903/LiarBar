import { AppRuntime } from '../../common/AppRuntime';
import { ControlIds } from '../../common/Ids';

@Component
export struct SpectatorStub {
  build() {
    Row({ space: 10 }) {
      Text($r('app.string.lb_str_spectator_stub'))
        .fontColor($r('app.color.tavern_mute'))
        .fontSize($r('app.float.subtitle_text_size'))
      Image($r('app.media.art_sign_knock'))
        .id(ControlIds.KNOCK)
        .width(28)
        .height(28)
        .onClick(() => {
          AppRuntime.engine.tableAct(0, 'KNOCK');
        })
      Image($r('app.media.art_sign_ok'))
        .id(ControlIds.SIGN_OK)
        .width(28)
        .height(28)
        .onClick(() => {
          AppRuntime.engine.tableAct(0, 'SIGN_OK');
        })
      Image($r('app.media.art_sign_no'))
        .id(ControlIds.SIGN_NO)
        .width(28)
        .height(28)
        .onClick(() => {
          AppRuntime.engine.tableAct(0, 'SIGN_NO');
        })
    }
    .width('100%')
  }
}
