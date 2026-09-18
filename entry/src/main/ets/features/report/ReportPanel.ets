import { ControlIds } from '../../common/Ids';

@Component
export struct ReportPanel {
  winnerText: string = '';
  highlight: string = '';
  recapText: string = '';
  humanWon: boolean = false;
  onAgain: () => void = () => {};
  onHome: () => void = () => {};

  build() {
    Column({ space: 14 }) {
      if (this.humanWon) {
        Image($r('app.media.art_result_bar_win'))
          .width('100%')
          .height(48)
      } else {
        Image($r('app.media.art_result_bar_lose'))
          .width('100%')
          .height(48)
      }
      Text(this.winnerText)
        .id(ControlIds.WINNER)
        .fontColor($r('app.color.tavern_paper'))
        .fontSize($r('app.float.page_text_size'))
      Text(this.highlight)
        .id(ControlIds.HIGHLIGHT)
        .fontColor($r('app.color.tavern_candle'))
      Text(this.recapText)
        .id(ControlIds.RECAP_LIST)
        .fontColor($r('app.color.tavern_paper'))
        .fontSize($r('app.float.subtitle_text_size'))
      Row({ space: 10 }) {
        Image($r('app.media.art_hl_long_bluff')).width(36).height(36)
        Image($r('app.media.art_hl_best_challenge')).width(36).height(36)
        Image($r('app.media.art_hl_worst_break')).width(36).height(36)
      }
      Button($r('app.string.lb_str_again'))
        .id(ControlIds.AGAIN)
        .width('100%')
        .height($r('app.float.btn_height'))
        .backgroundColor($r('app.color.tavern_accent'))
        .fontColor($r('app.color.tavern_bg'))
        .onClick(() => {
          this.onAgain();
        })
      Button($r('app.string.lb_str_home'))
        .id(ControlIds.HOME)
        .width('100%')
        .height($r('app.float.btn_height'))
        .backgroundColor($r('app.color.tavern_panel'))
        .fontColor($r('app.color.tavern_paper'))
        .onClick(() => {
          this.onHome();
        })
    }
    .width('100%')
  }
}
