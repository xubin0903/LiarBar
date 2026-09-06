import { AppRuntime } from '../common/AppRuntime';
import { ScreenIds } from '../common/Ids';
import { LbRouter } from '../common/LbRouter';
import { ReportPanel } from '../features/report/ReportPanel';
import { MatchSnapshot } from '../engine/MatchTypes';
import { SeatRole } from '../engine/Phase';

@Entry
@Component
struct Report {
  @State winnerText: string = '';
  @State highlight: string = '';
  @State recapText: string = '';
  @State humanWon: boolean = false;

  aboutToAppear(): void {
    const snap: MatchSnapshot | null = AppRuntime.engine.current();
    if (snap === null) {
      return;
    }
    let winner: string = '';
    for (let i = 0; i < snap.seats.length; i++) {
      if (snap.seats[i].seatId === snap.winnerSeatId) {
        winner = snap.seats[i].nickname;
        this.humanWon = snap.seats[i].role === SeatRole.HUMAN;
      }
    }
    this.winnerText = winner;
    this.highlight = snap.highlightLine;
    if (this.highlight.length === 0) {
      this.highlight = snap.dealerLine;
    }
    let lines: string = '';
    for (let i = 0; i < snap.recap.length; i++) {
      const row = snap.recap[i];
      lines = `${lines}${row.nickname} 出${row.playCount} 假${row.fakeHandCount} 疑${row.challengeCount} 中${row.challengeHits}\n`;
    }
    this.recapText = lines;
  }

  build() {
    Column() {
      Text($r('app.string.lb_str_app_title'))
        .fontColor($r('app.color.tavern_candle'))
        .fontSize($r('app.float.title_text_size'))
        .margin({ top: 24, bottom: 12 })

      ReportPanel({
        winnerText: this.winnerText,
        highlight: this.highlight,
        recapText: this.recapText,
        humanWon: this.humanWon,
        onAgain: () => {
          AppRuntime.director.stop();
          AppRuntime.engine.playAgain();
          LbRouter.toLobby();
        },
        onHome: () => {
          AppRuntime.director.stop();
          AppRuntime.engine.toLobby();
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
