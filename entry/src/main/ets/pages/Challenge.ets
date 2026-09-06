import { ChallengeBeatIds, ScreenIds } from '../common/Ids';
import { LbRouter } from '../common/LbRouter';
import { ChallengeBeats } from '../features/challenge/ChallengeBeats';

@Entry
@Component
struct Challenge {
  @State beatId: string = ChallengeBeatIds.WINDUP;

  build() {
    Column() {
      Text($r('app.string.lb_str_challenge_placeholder'))
        .fontColor($r('app.color.tavern_candle'))
        .fontSize($r('app.float.subtitle_text_size'))
        .margin({ top: 20, bottom: 12 })

      ChallengeBeats({ beatId: $beatId })

      Row({ space: 10 }) {
        Button($r('app.string.lb_str_beat_windup'))
          .onClick(() => {
            this.beatId = ChallengeBeatIds.WINDUP;
          })
        Button($r('app.string.lb_str_beat_standoff'))
          .onClick(() => {
            this.beatId = ChallengeBeatIds.STANDOFF;
          })
        Button($r('app.string.lb_str_beat_reveal'))
          .onClick(() => {
            this.beatId = ChallengeBeatIds.REVEAL;
          })
        Button($r('app.string.lb_str_beat_result'))
          .onClick(() => {
            this.beatId = ChallengeBeatIds.RESULT;
          })
      }
      .margin({ top: 16 })

      Button($r('app.string.lb_str_skip'))
        .id('lb_btn_challenge_skip')
        .margin({ top: 10 })
        .onClick(() => {
          this.beatId = ChallengeBeatIds.RESULT;
        })

      Button($r('app.string.lb_str_home'))
        .margin({ top: 16 })
        .onClick(() => {
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
}
