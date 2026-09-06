import { ScreenIds } from '../common/Ids';
import { LbRouter } from '../common/LbRouter';
import { ReportPanel } from '../features/report/ReportPanel';

@Entry
@Component
struct Report {
  build() {
    Column() {
      Text($r('app.string.lb_str_app_title'))
        .fontColor($r('app.color.tavern_candle'))
        .fontSize($r('app.float.title_text_size'))
        .margin({ top: 24, bottom: 12 })

      ReportPanel({
        onAgain: () => {
          LbRouter.toLobby();
        },
        onHome: () => {
          LbRouter.toLobby();
        }
      })
    }
    .id(ScreenIds.REPORT)
    .width('100%')
    .height('100%')
    .padding(20)
    .backgroundColor($r('app.color.tavern_bg'))
    .alignItems(HorizontalAlign.Center)
  }
}
