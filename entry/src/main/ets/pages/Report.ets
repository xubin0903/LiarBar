import { common } from '@kit.AbilityKit';
import { AppRuntime } from '../common/AppRuntime';
import { ScreenIds } from '../common/Ids';
import { LbRouter } from '../common/LbRouter';
import { Logger } from '../common/Logger';
import { ReportPanel } from '../features/report/ReportPanel';
import { REPORT_TEXT_KEYS, ReportInput, ReportModel, ReportView } from '../features/report/ReportModel';
import { TableAudio } from '../features/table/TableAudio';
import { StartMatchOpts } from '../engine/MatchEngine';
import { MatchSnapshot } from '../engine/MatchTypes';
import { Phase, SeatRole } from '../engine/Phase';
import { WindowOrientation } from '../harmony/WindowOrientation';
import { RecordCommit, RecordStore } from '../persist/RecordStore';

const TAG = 'Report';

/**
 * 结算战报（21 §1 · 22 §4）。只承接 Table → replaceReport（phase=RECAP/END）。
 * 页面一出现就 commitOnce（RPT-11 · 21:298 / :305）；顶区与按钮条固定，只有中间主体在 Scroll 内（S21-28）。
 * 「再来一局」= 同设置直接开新局 → replaceTable（不经大厅、不转屏，21 §1.6）；「回大厅」/ 返回键 = 先竖屏再 toLobby。
 * 大厅战绩已改 `lb_cmp_records_panel` 浮层（22 §7.1），本页不再有 recordsMode。
 */
@Entry
@Component
struct Report {
  @State view: ReportView = new ReportView();
  private leaving: boolean = false;
  /** 再来一局用的同一组开局参数（本局人类昵称 / 座数 / 静默局）。 */
  private againOpts: StartMatchOpts | null = null;

  aboutToAppear(): void {
    const snap: MatchSnapshot | null = AppRuntime.engine.current();
    if (snap === null || (snap.phase !== Phase.RECAP && snap.phase !== Phase.END)) {
      // 非结算入口（战绩已改大厅浮层）：不播结算音、不画战报。
      Logger.warn(TAG, 'Report opened without RECAP/END — skip playResult');
      return;
    }
    // 2b：暂停总时长只取一次，战绩与战报同一个值（不各算一遍）。
    const pausedMs: number = AppRuntime.engine.pausedTotalAt(snap.endedAt > 0 ? snap.endedAt : Date.now());
    // 21 §1.7：快进局 ff=true（导演记的本局标记），战绩与战报快进附注同源。
    const ff: boolean = AppRuntime.director.isFastForwardMatch();
    if (snap.phase === Phase.RECAP) {
      // RPT-11：结算页一出现就写（不等玩家点任何键）；与导演 RECAP 回调同一口径，commitOnce 按 last_match_id 幂等。
      const recapCommit: RecordCommit = {
        quit: false,
        isDemo: AppRuntime.engine.isDemoMatch(),
        ff: ff,
        pausedMs: pausedMs
      };
      RecordStore.commitOnce(snap, recapCommit);
    }
    const input: ReportInput = {
      seats: snap.seats,
      recap: snap.recap,
      eventLog: snap.eventLog,
      playLog: AppRuntime.engine.recapPlayLog(),
      winnerSeatId: snap.winnerSeatId,
      roundIndex: snap.roundIndex,
      startedAt: snap.startedAt,
      endedAt: snap.endedAt > 0 ? snap.endedAt : Date.now(),
      pausedMs: pausedMs,
      livesDefault: snap.config.lives_default > 0 ? snap.config.lives_default : 3,
      quit: false,
      ff: ff
    };
    this.view = ReportModel.build(input, this.readTexts());
    let nick: string = '';
    for (let i = 0; i < snap.seats.length; i++) {
      if (snap.seats[i].role === SeatRole.HUMAN) {
        nick = snap.seats[i].nickname;
      }
    }
    const again: StartMatchOpts = { nickname: nick, playerCount: snap.seats.length, silent: snap.silentMode };
    this.againOpts = again;
    TableAudio.setSilent(snap.silentMode);
    TableAudio.playResult(this.view.humanWon);
    TableAudio.fadeBgmOut(TableAudio.BGM_FADE_OUT_MS);
  }

  /** 系统返回键 = 回大厅（不弹确认，21 §1.6）。 */
  onBackPress(): boolean {
    this.leaveMatchReport(false);
    return true;
  }

  build() {
    Column() {
      ReportPanel({
        view: this.view,
        onAgain: () => {
          this.leaveMatchReport(true);
        },
        onHome: () => {
          this.leaveMatchReport(false);
        }
      })
    }
    .id(ScreenIds.REPORT)
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.tavern_bg'))
  }

  /** 结算句模板按键名读 string.json（显式传参填充，不走 DealerLines fill）。 */
  private readTexts(): Map<string, string> {
    const texts: Map<string, string> = new Map<string, string>();
    try {
      const ctx: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
      for (let i = 0; i < REPORT_TEXT_KEYS.length; i++) {
        try {
          texts.set(REPORT_TEXT_KEYS[i], ctx.resourceManager.getStringByNameSync(REPORT_TEXT_KEYS[i]));
        } catch (err) {
          Logger.warn(TAG, `report text miss ${REPORT_TEXT_KEYS[i]}`);
        }
      }
    } catch (err) {
      Logger.warn(TAG, 'report texts: no context');
    }
    return texts;
  }

  private leaveMatchReport(again: boolean): void {
    if (this.leaving) {
      return;
    }
    this.leaving = true;
    AppRuntime.director.stop();
    if (again && this.restartMatch()) {
      return;
    }
    AppRuntime.engine.toLobby();
    void this.portraitThenLobby();
  }

  /**
   * 21 §1.6 再来一局：同 nickname / playerCount / silent → startMatch → director.start → replaceTable。
   * 保持横屏、不经大厅（S21-29）；结算页被新桌替换，栈深不变。开局被拒 → 回落「回大厅」路径。
   */
  private restartMatch(): boolean {
    const opts: StartMatchOpts | null = this.againOpts;
    if (opts === null) {
      return false;
    }
    AppRuntime.bootDirector();
    if (!AppRuntime.engine.startMatch(opts)) {
      Logger.warn(TAG, 'again: START_MATCH rejected → lobby');
      return false;
    }
    AppRuntime.director.start();
    // 新桌 aboutToAppear 重新 prepare / startBgm；先放掉本局桌音（含 resultPlayed），避免 prepare 早退复用旧池。
    TableAudio.release();
    LbRouter.replaceTable();
    return true;
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
