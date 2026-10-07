import { common } from '@kit.AbilityKit';
import { AppRuntime } from '../common/AppRuntime';
import { ControlIds, ScreenIds } from '../common/Ids';
import { LbRouter } from '../common/LbRouter';
import { Logger } from '../common/Logger';
import { ReportPanel } from '../features/report/ReportPanel';
import { TableAudio } from '../features/table/TableAudio';
import { MatchSnapshot } from '../engine/MatchTypes';
import { Phase, SeatRole } from '../engine/Phase';
import { WindowOrientation } from '../harmony/WindowOrientation';
import { RecordCommit, RecordStore } from '../persist/RecordStore';

const TAG = 'Report';

/**
 * PR-A 结算/战绩页。
 * - 赛后（Table → replaceReport，phase=RECAP/END）：结算模式，沿用横屏（不在结算页再拧一次），
 *   内容整体包 Scroll，横屏底部「再来一局 / 回开桌」始终可滚到；离开时先锁回竖屏再回大厅。
 * - 大厅「战绩」（Lobby push，phase=LOBBY）：战绩空态，竖屏，不放输赢音效；返回 = router.back()。
 */
@Entry
@Component
struct Report {
  @State winnerText: string = '';
  @State highlight: string = '';
  @State recapText: string = '';
  @State humanWon: boolean = false;
  /** true = 大厅「战绩」入口（无对局结算）；战绩列表 PR-B 后接 RecordStore。 */
  @State recordsMode: boolean = true;
  private leaving: boolean = false;

  aboutToAppear(): void {
    const snap: MatchSnapshot | null = AppRuntime.engine.current();
    if (snap === null || (snap.phase !== Phase.RECAP && snap.phase !== Phase.END)) {
      // 大厅入口：没有刚结束的对局 → 空态，禁止 playResult(false) 输音效。
      this.recordsMode = true;
      return;
    }
    this.recordsMode = false;
    if (snap.phase === Phase.RECAP) {
      // PR-B 战绩兜底（负责人 #10）：RECAP 后立刻切到结算页、导演 RECAP tick 还没跑时也要记上；
      // 与导演同一口径，commitOnce 按 last_match_id 幂等（已写过 / 演示局 = 不再写）。
      const recapCommit: RecordCommit = {
        quit: false,
        isDemo: AppRuntime.engine.isDemoMatch(),
        ff: false,
        pausedMs: AppRuntime.engine.pausedTotalAt(snap.endedAt > 0 ? snap.endedAt : Date.now())
      };
      RecordStore.commitOnce(snap, recapCommit);
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
    TableAudio.setSilent(snap.silentMode);
    TableAudio.playResult(this.humanWon);
    TableAudio.fadeBgmOut(TableAudio.BGM_FADE_OUT_MS);
  }

  /** 结算模式：系统返回键 = 回开桌（重置引擎 + 竖屏）；战绩模式：默认 back。 */
  onBackPress(): boolean {
    if (this.recordsMode) {
      return false;
    }
    this.leaveMatchReport(false);
    return true;
  }

  build() {
    Scroll() {
      Column() {
        Text($r('app.string.lb_str_app_title'))
          .fontColor($r('app.color.tavern_candle'))
          .fontSize($r('app.float.title_text_size'))
          .margin({ top: 24, bottom: 12 })

        if (this.recordsMode) {
          this.recordsEmpty()
        } else {
          ReportPanel({
            winnerText: this.winnerText,
            highlight: this.highlight,
            recapText: this.recapText,
            humanWon: this.humanWon,
            onAgain: () => {
              this.leaveMatchReport(true);
            },
            onHome: () => {
              this.leaveMatchReport(false);
            }
          })
        }
      }
      .width('100%')
      .padding(20)
      .alignItems(HorizontalAlign.Center)
    }
    .id(ScreenIds.REPORT)
    .width('100%')
    .height('100%')
    .scrollable(ScrollDirection.Vertical)
    .scrollBar(BarState.Auto)
    .edgeEffect(EdgeEffect.Spring)
    .align(Alignment.Top)
    .backgroundColor($r('app.color.tavern_bg'))
  }

  @Builder
  recordsEmpty() {
    Column({ space: 16 }) {
      Text($r('app.string.lb_str_records'))
        .fontColor($r('app.color.tavern_paper'))
        .fontSize($r('app.float.page_text_size'))
      Text($r('app.string.lb_str_records_empty'))
        .fontColor($r('app.color.tavern_mute'))
        .fontSize($r('app.float.subtitle_text_size'))
        .textAlign(TextAlign.Center)
        .margin({ top: 24, bottom: 24 })
      Button($r('app.string.lb_str_report_lobby'))
        .id(ControlIds.REPORT_LOBBY)
        .width('100%')
        .height($r('app.float.btn_height'))
        .backgroundColor($r('app.color.tavern_panel'))
        .fontColor($r('app.color.tavern_paper'))
        .onClick(() => {
          LbRouter.back();
        })
    }
    .width('100%')
  }

  private leaveMatchReport(again: boolean): void {
    if (this.leaving) {
      return;
    }
    this.leaving = true;
    AppRuntime.director.stop();
    if (again) {
      AppRuntime.engine.playAgain();
    } else {
      AppRuntime.engine.toLobby();
    }
    void this.portraitThenLobby();
  }

  /** Same order as Table.unlockLobbyThenRoute: portrait first so lobby never flashes landscape. */
  private async portraitThenLobby(): Promise<void> {
    try {
      const ctx: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
      await WindowOrientation.lockPortrait(ctx);
    } catch (err) {
      Logger.warn(TAG, 'report → lobby portrait lock fail-soft');
    }
    LbRouter.toLobby();
  }
}
