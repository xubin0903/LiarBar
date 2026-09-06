import { ChallengeBeatIds, ControlIds } from '../../common/Ids';

@Component
export struct ChallengeBeats {
  @Link beatId: string;

  build() {
    Column({ space: 12 }) {
      this.beatBlock(ChallengeBeatIds.WINDUP, $r('app.string.lb_str_beat_windup'),
        $r('app.string.lb_str_dlr_windup'), $r('app.media.art_challenge_pose_point'))
      this.beatBlock(ChallengeBeatIds.STANDOFF, $r('app.string.lb_str_beat_standoff'),
        $r('app.string.lb_str_dlr_standoff'), $r('app.media.art_ai_shark_hold'))
      if (this.beatId === ChallengeBeatIds.STANDOFF) {
        Row({ space: 12 }) {
          Button($r('app.string.lb_str_bet_true'))
          Button($r('app.string.lb_str_bet_fake'))
        }
        .id(ControlIds.BET_BAR)
      }
      this.beatBlock(ChallengeBeatIds.REVEAL, $r('app.string.lb_str_beat_reveal'),
        $r('app.string.lb_str_dlr_reveal'), $r('app.media.art_card_glow'))
      this.beatBlock(ChallengeBeatIds.RESULT, $r('app.string.lb_str_beat_result'),
        $r('app.string.lb_str_dlr_judge_success'), $r('app.media.art_fx_wine_splash'))
    }
    .id(ControlIds.COVER_CHALLENGE)
    .width('100%')
  }

  @Builder
  beatBlock(id: string, title: Resource, line: Resource, art: Resource) {
    Column({ space: 6 }) {
      Text(title)
        .fontColor(this.beatId === id ? $r('app.color.tavern_accent') : $r('app.color.tavern_mute'))
        .fontSize($r('app.float.page_text_size'))
      Text(line)
        .fontColor($r('app.color.tavern_paper'))
        .fontSize($r('app.float.subtitle_text_size'))
      Image(art)
        .width(72)
        .height(72)
    }
    .id(id)
    .width('100%')
    .padding(10)
    .backgroundColor(this.beatId === id ? $r('app.color.tavern_danger_deep') : $r('app.color.tavern_felt'))
    .borderRadius(10)
  }
}
