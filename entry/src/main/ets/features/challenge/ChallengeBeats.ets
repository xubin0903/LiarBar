import { ChallengeBeatIds, ControlIds } from '../../common/Ids';

@Component
export struct ChallengeBeats {
  @Link beatId: string;
  @Link showBet: boolean;
  @Link resultLine: string;
  @Link revealRanks: string[];
  onBetTrue: () => void = () => {};
  onBetFake: () => void = () => {};

  build() {
    Column({ space: 12 }) {
      this.beatBlock(ChallengeBeatIds.WINDUP, $r('app.string.lb_str_beat_windup'),
        $r('app.string.lb_str_dlr_windup'), $r('app.media.art_challenge_pose_point'))
      this.beatBlock(ChallengeBeatIds.STANDOFF, $r('app.string.lb_str_beat_standoff'),
        $r('app.string.lb_str_dlr_standoff'), $r('app.media.art_ai_shark_hold'))
      if (this.showBet && this.beatId === ChallengeBeatIds.STANDOFF) {
        Row({ space: 12 }) {
          Button($r('app.string.lb_str_bet_true'))
            .id(ControlIds.BET_TRUE)
            .onClick(() => {
              this.onBetTrue();
            })
          Button($r('app.string.lb_str_bet_fake'))
            .id(ControlIds.BET_FAKE)
            .onClick(() => {
              this.onBetFake();
            })
        }
        .id(ControlIds.BET_BAR)
      }
      this.beatBlock(ChallengeBeatIds.REVEAL, $r('app.string.lb_str_beat_reveal'),
        $r('app.string.lb_str_dlr_reveal'), $r('app.media.art_card_glow'))
      if (this.beatId === ChallengeBeatIds.REVEAL || this.beatId === ChallengeBeatIds.RESULT) {
        Row({ space: 6 }) {
          ForEach(this.revealRanks, (rank: string, idx: number) => {
            this.revealFace(rank, idx)
          }, (rank: string, idx: number) => `rv_${idx}_${rank}`)
        }
        .id(ControlIds.REVEAL_ROW)
      }
      this.beatBlock(ChallengeBeatIds.RESULT, $r('app.string.lb_str_beat_result'),
        $r('app.string.lb_str_dlr_judge_success'), $r('app.media.art_fx_wine_splash'))
      if (this.beatId === ChallengeBeatIds.RESULT && this.resultLine.length > 0) {
        Text(this.resultLine)
          .id('lb_txt_judge')
          .fontColor($r('app.color.tavern_paper'))
      }
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

  @Builder
  revealFace(rank: string, idx: number) {
    Column() {
      if (rank === 'A') {
        Image($r('app.media.art_card_a')).width(40).height(56)
      } else if (rank === 'K') {
        Image($r('app.media.art_card_k')).width(40).height(56)
      } else if (rank === 'Q') {
        Image($r('app.media.art_card_q')).width(40).height(56)
      } else {
        Image($r('app.media.art_card_joker')).width(40).height(56)
      }
    }
    .id(`lb_cmp_reveal_card_${idx}`)
  }
}
