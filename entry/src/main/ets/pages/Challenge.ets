import { AppRuntime } from '../common/AppRuntime';
import { ChallengeBeatIds, ControlIds, ScreenIds } from '../common/Ids';
import { LbRouter } from '../common/LbRouter';
import { ChallengeBeats } from '../features/challenge/ChallengeBeats';
import { MatchSnapshot } from '../engine/MatchTypes';
import { BetPick, Phase } from '../engine/Phase';

@Entry
@Component
struct Challenge {
  @State beatId: string = ChallengeBeatIds.WINDUP;
  @State dealerLine: string = '';
  @State resultLine: string = '';
  @State revealRanks: string[] = [];
  @State showBet: boolean = false;
  private pollId: number = -1;
  private left: boolean = false;

  aboutToAppear(): void {
    this.pull();
    this.pollId = setInterval((): void => {
      this.pull();
    }, 200);
  }

  aboutToDisappear(): void {
    if (this.pollId >= 0) {
      clearInterval(this.pollId);
      this.pollId = -1;
    }
  }

  build() {
    Column() {
      Text(this.dealerLine)
        .id(ControlIds.DEALER_LINE)
        .fontColor($r('app.color.tavern_candle'))
        .fontSize($r('app.float.subtitle_text_size'))
        .margin({ top: 20, bottom: 12 })

      ChallengeBeats({
        beatId: $beatId,
        showBet: $showBet,
        resultLine: $resultLine,
        revealRanks: $revealRanks,
        onBetTrue: () => {
          AppRuntime.engine.placeBet(0, BetPick.TRUE);
        },
        onBetFake: () => {
          AppRuntime.engine.placeBet(0, BetPick.FAKE);
        }
      })

      Button($r('app.string.lb_str_skip'))
        .id(ControlIds.CHALLENGE_SKIP)
        .margin({ top: 10 })
        .onClick(() => {
          AppRuntime.engine.skipRitual();
          this.pull();
        })

      Button($r('app.string.lb_str_home'))
        .margin({ top: 16 })
        .onClick(() => {
          AppRuntime.director.stop();
          AppRuntime.engine.toLobby();
          LbRouter.toLobby();
        })
    }
    .id(ScreenIds.CHALLENGE)
    .width('100%')
    .height('100%')
    .padding(16)
    .backgroundColor($r('app.color.tavern_bg'))
    .alignItems(HorizontalAlign.Center)
  }

  private pull(): void {
    const snap: MatchSnapshot | null = AppRuntime.engine.current();
    if (snap === null || this.left) {
      return;
    }
    if (snap.phase === Phase.RECAP || snap.phase === Phase.END) {
      this.left = true;
      LbRouter.replaceReport();
      return;
    }
    if (snap.phase === Phase.TURN || snap.phase === Phase.CLAIM || snap.phase === Phase.DEAL ||
      snap.phase === Phase.LOBBY) {
      this.left = true;
      LbRouter.back();
      return;
    }
    this.dealerLine = snap.dealerLine;
    if (snap.ritualBeat.length > 0) {
      this.beatId = snap.ritualBeat;
    } else if (snap.phase === Phase.JUDGE || snap.phase === Phase.PENALTY) {
      this.beatId = ChallengeBeatIds.RESULT;
    }
    this.showBet = this.beatId === ChallengeBeatIds.STANDOFF;
    this.revealRanks = snap.lastPlayRanks;
    if (this.beatId === ChallengeBeatIds.RESULT) {
      this.resultLine = snap.dealerLine;
    }
  }
}
