import { common } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { AppRuntime } from '../common/AppRuntime';
import { ControlIds, ScreenIds } from '../common/Ids';
import { LbRouter } from '../common/LbRouter';
import { Logger } from '../common/Logger';
import { SpectatorStub } from '../features/spectator/SpectatorStub';
import { PeekMaskOverlay, PlaySheetOverlay } from '../features/table/TableOverlays';
import { TutorialStub } from '../features/tutorial/TutorialStub';
import { PeekPrivacyAdapter } from '../harmony/PeekPrivacyAdapter';
import { CardModel, MatchSnapshot, SeatModel } from '../engine/MatchTypes';
import { Phase, PlayStyle, SeatRole, SeatStatus, TurnWindow } from '../engine/Phase';

const TAG = 'Table';

@Entry
@Component
struct Table {
  @State showPeek: boolean = false;
  @State showPlay: boolean = false;
  @State peekRanks: string[] = [];
  @State selfCards: CardModel[] = [];
  @State selectedIds: string[] = [];
  @State styleName: string = PlayStyle.SOFT;
  @State namedSeatId: number = -1;
  @State playCountText: string = '';
  @State confirmEnabled: boolean = false;
  @State nameP1: string = '';
  @State nameP2: string = '';
  @State nameP3: string = '';
  @State dealerLine: string = '';
  @State claimText: string = '';
  @State timerText: string = '--';
  @State challengeEnabled: boolean = false;
  @State showFirstHint: boolean = false;
  @State playEnabled: boolean = false;
  @State skipEnabled: boolean = false;
  @State handEmpty: boolean = false;
  @State poolText: string = '';
  @State seat0: string = '';
  @State seat1: string = '';
  @State seat2: string = '';
  @State seat3: string = '';
  @State life0: string = '';
  @State life1: string = '';
  @State life2: string = '';
  @State life3: string = '';
  @State turnSeat: number = -1;
  @State calledSeat: number = -1;
  @State cardBacks: number[] = [];
  private pollId: number = -1;
  private pushedChallenge: boolean = false;

  aboutToAppear(): void {
    this.pull();
    this.pollId = setInterval((): void => {
      this.pull();
    }, 200);
    Logger.info(TAG, 'table listening to engine snapshot');
  }

  aboutToDisappear(): void {
    if (this.pollId >= 0) {
      clearInterval(this.pollId);
      this.pollId = -1;
    }
  }

  build() {
    Stack() {
      Image($r('app.media.art_table_bg'))
        .width('100%')
        .height('100%')
        .objectFit(ImageFit.Cover)

      Column() {
        Row({ space: 10 }) {
          Image($r('app.media.art_dealer_bust_announce'))
            .id(ControlIds.DEALER)
            .width(72)
            .height(96)
          Column({ space: 4 }) {
            Text(this.dealerLine)
              .id(ControlIds.DEALER_LINE)
              .fontColor($r('app.color.tavern_paper'))
              .fontSize($r('app.float.subtitle_text_size'))
            Text(this.claimText)
              .id('lb_txt_claim')
              .fontColor($r('app.color.tavern_candle'))
            Text(this.timerText)
              .id('lb_txt_timer')
              .fontColor($r('app.color.tavern_accent'))
          }
          .id(ControlIds.DEALER_BANNER)
        }
        .id(ControlIds.TOPBAR)

        Row({ space: 12 }) {
          this.seatBlock(0, this.seat0, this.life0, ControlIds.SEAT_SELF)
          this.seatBlock(1, this.seat1, this.life1, ControlIds.SEAT_P1)
          this.seatBlock(2, this.seat2, this.life2, ControlIds.SEAT_P2)
          this.seatBlock(3, this.seat3, this.life3, ControlIds.SEAT_P3)
        }
        .margin({ top: 12 })

        Image($r('app.media.art_pool_slot'))
          .id('lb_cmp_pool')
          .width(56)
          .height(76)
          .margin({ top: 12 })
        Text(this.poolText)
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.subtitle_text_size'))

        Row({ space: 6 }) {
          ForEach(this.cardBacks, (idx: number) => {
            Image($r('app.media.art_card_back'))
              .width($r('app.float.card_w'))
              .height($r('app.float.card_h'))
              .id(`lb_cmp_card_${idx}`)
              .gesture(
                LongPressGesture()
                  .onAction(() => {
                    this.openPeek();
                  })
              )
          }, (idx: number) => `${idx}`)
        }
        .id(ControlIds.HAND)
        .margin({ top: 16 })

        if (this.handEmpty) {
          Text($r('app.string.lb_str_hand_empty'))
            .fontColor($r('app.color.tavern_mute'))
            .fontSize($r('app.float.subtitle_text_size'))
        }

        Button($r('app.string.lb_str_challenge'))
          .id(ControlIds.CHALLENGE)
          .enabled(this.challengeEnabled)
          .backgroundColor($r('app.color.tavern_panel'))
          .fontColor(this.challengeEnabled ? $r('app.color.tavern_paper') : $r('app.color.tavern_mute'))
          .margin({ top: 12 })
          .onClick(() => {
            AppRuntime.engine.intentChallenge();
            this.pull();
          })

        if (this.showFirstHint) {
          Text($r('app.string.lb_str_challenge_disabled_first'))
            .fontColor($r('app.color.tavern_mute'))
            .fontSize($r('app.float.subtitle_text_size'))
        }

        if (this.playEnabled) {
          Button($r('app.string.lb_str_play'))
            .backgroundColor($r('app.color.tavern_accent'))
            .fontColor($r('app.color.tavern_bg'))
            .margin({ top: 10 })
            .onClick(() => {
              AppRuntime.engine.intentPlay();
              this.showPlay = true;
              this.pull();
            })
        }

        if (this.skipEnabled) {
          Button($r('app.string.lb_str_skip'))
            .margin({ top: 8 })
            .onClick(() => {
              AppRuntime.engine.skip();
              this.pull();
            })
        }

        SpectatorStub()
        TutorialStub()

        Button($r('app.string.lb_str_home'))
          .width('100%')
          .margin({ top: 16 })
          .onClick(() => {
            AppRuntime.director.stop();
            AppRuntime.engine.toLobby();
            LbRouter.toLobby();
          })

        PeekMaskOverlay({
          visible: $showPeek,
          ranks: $peekRanks,
          onClose: () => {
            this.closePeek();
          }
        })
        PlaySheetOverlay({
          visible: $showPlay,
          cards: $selfCards,
          selectedIds: $selectedIds,
          styleName: $styleName,
          namedSeatId: $namedSeatId,
          playCountText: $playCountText,
          confirmEnabled: $confirmEnabled,
          nameP1: $nameP1,
          nameP2: $nameP2,
          nameP3: $nameP3,
          onToggleCard: (cardId: string) => {
            this.toggleCard(cardId);
          },
          onStyle: (style: string) => {
            this.styleName = style;
          },
          onName: (seatId: number) => {
            this.namedSeatId = seatId;
          },
          onConfirm: () => {
            this.confirmPlay();
          },
          onClose: () => {
            AppRuntime.engine.cancelPlay();
            this.showPlay = false;
            this.selectedIds = [];
            this.pull();
          }
        })
      }
      .width('100%')
      .height('100%')
      .padding(16)
    }
    .id(ScreenIds.TABLE)
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.tavern_bg'))
  }

  @Builder
  seatBlock(seatId: number, name: string, life: string, id: string) {
    Column({ space: 2 }) {
      if (seatId === 0) {
        Image($r('app.media.art_frame_player_idle')).width(48).height(48).id(id)
      } else if (seatId === 1) {
        Image($r('app.media.art_ai_timid_idle')).width(48).height(48).id(id)
      } else if (seatId === 2) {
        Image($r('app.media.art_ai_shark_idle')).width(48).height(48).id(id)
      } else {
        Image($r('app.media.art_ai_karen_idle')).width(48).height(48).id(id)
      }
      Text(name)
        .fontColor(this.turnSeat === seatId ? $r('app.color.tavern_accent') : $r('app.color.tavern_paper'))
        .fontSize($r('app.float.subtitle_text_size'))
      Text(life)
        .fontColor(this.calledSeat === seatId ? $r('app.color.tavern_accent') : $r('app.color.tavern_mute'))
        .fontSize($r('app.float.subtitle_text_size'))
    }
  }

  private pull(): void {
    const snap: MatchSnapshot | null = AppRuntime.engine.current();
    if (snap === null || snap.phase === Phase.LOBBY) {
      return;
    }
    if (snap.phase === Phase.CHALLENGE_RITUAL || snap.phase === Phase.JUDGE) {
      if (!this.pushedChallenge) {
        this.pushedChallenge = true;
        LbRouter.toChallenge();
      }
      return;
    }
    if (snap.phase === Phase.RECAP || snap.phase === Phase.END) {
      LbRouter.replaceReport();
      return;
    }
    this.pushedChallenge = false;
    this.dealerLine = snap.dealerLine;
    if (snap.currentClaim !== null) {
      this.claimText = `本轮出 ${snap.currentClaim.rank}`;
    } else {
      this.claimText = '';
    }
    const sec: number = Math.ceil(snap.turnRemainMs / 1000);
    this.timerText = `${sec}`;
    this.selfCards = snap.selfHand;
    this.peekRanks = this.ranksOf(snap.selfHand);
    this.cardBacks = this.indexes(snap.selfHand.length);
    this.handEmpty = snap.selfHand.length === 0;
    this.turnSeat = snap.currentSeatId;
    this.calledSeat = snap.lastPlay === null ? -1 : snap.lastPlay.namedSeatId;
    if (snap.lastPlay !== null) {
      this.poolText = `${snap.lastPlay.count}`;
    } else {
      this.poolText = '';
    }
    this.fillSeats(snap.seats);
    const humanTurn: boolean = this.isHumanTurn(snap);
    this.challengeEnabled = humanTurn && snap.canChallenge && snap.phase === Phase.TURN;
    this.showFirstHint = !snap.canChallenge && snap.playIndexInRound === 0 && humanTurn;
    this.playEnabled = humanTurn && snap.hasCards && snap.phase === Phase.TURN &&
      snap.turnWindow !== TurnWindow.CHALLENGE_ONLY;
    this.skipEnabled = humanTurn && snap.phase === Phase.TURN &&
      (snap.turnWindow === TurnWindow.CHALLENGE_ONLY || !snap.hasCards);
    this.showPlay = snap.phase === Phase.PLAY_REVEAL_SELF && humanTurn;
    this.refreshPlayMeta(snap);
  }

  private fillSeats(seats: SeatModel[]): void {
    this.seat0 = this.seatLabel(seats, 0);
    this.seat1 = this.seatLabel(seats, 1);
    this.seat2 = this.seatLabel(seats, 2);
    this.seat3 = this.seatLabel(seats, 3);
    this.life0 = this.lifeLabel(seats, 0);
    this.life1 = this.lifeLabel(seats, 1);
    this.life2 = this.lifeLabel(seats, 2);
    this.life3 = this.lifeLabel(seats, 3);
    this.nameP1 = this.nickOf(seats, 1);
    this.nameP2 = this.nickOf(seats, 2);
    this.nameP3 = this.nickOf(seats, 3);
  }

  private seatLabel(seats: SeatModel[], id: number): string {
    for (let i = 0; i < seats.length; i++) {
      if (seats[i].seatId === id) {
        let extra: string = '';
        if (seats[i].status === SeatStatus.GHOST) {
          extra = ' · 出局';
        }
        return seats[i].nickname + extra;
      }
    }
    return '';
  }

  private lifeLabel(seats: SeatModel[], id: number): string {
    for (let i = 0; i < seats.length; i++) {
      if (seats[i].seatId === id) {
        return `${seats[i].lives}`;
      }
    }
    return '';
  }

  private nickOf(seats: SeatModel[], id: number): string {
    for (let i = 0; i < seats.length; i++) {
      if (seats[i].seatId === id) {
        return seats[i].nickname;
      }
    }
    return '';
  }

  private isHumanTurn(snap: MatchSnapshot): boolean {
    for (let i = 0; i < snap.seats.length; i++) {
      if (snap.seats[i].seatId === snap.currentSeatId) {
        return snap.seats[i].role === SeatRole.HUMAN;
      }
    }
    return false;
  }

  private ranksOf(cards: CardModel[]): string[] {
    const out: string[] = [];
    for (let i = 0; i < cards.length; i++) {
      out.push(cards[i].rank);
    }
    return out;
  }

  private indexes(n: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      out.push(i);
    }
    return out;
  }

  private toggleCard(cardId: string): void {
    const snap: MatchSnapshot | null = AppRuntime.engine.current();
    if (snap === null) {
      return;
    }
    const next: string[] = [];
    let found: boolean = false;
    for (let i = 0; i < this.selectedIds.length; i++) {
      if (this.selectedIds[i] === cardId) {
        found = true;
      } else {
        next.push(this.selectedIds[i]);
      }
    }
    if (!found) {
      if (next.length < snap.config.max_play_cards) {
        next.push(cardId);
      }
    }
    this.selectedIds = next;
    this.refreshPlayMeta(snap);
  }

  private refreshPlayMeta(snap: MatchSnapshot): void {
    this.playCountText = `${this.selectedIds.length}`;
    this.confirmEnabled = this.selectedIds.length >= snap.config.min_play_cards &&
      this.selectedIds.length <= snap.config.max_play_cards;
  }

  private confirmPlay(): void {
    let style: PlayStyle = PlayStyle.SOFT;
    if (this.styleName === PlayStyle.SLAM) {
      style = PlayStyle.SLAM;
    } else if (this.styleName === PlayStyle.HESITATE) {
      style = PlayStyle.HESITATE;
    }
    AppRuntime.engine.submitPlay(this.selectedIds, style, '', this.namedSeatId);
    this.showPlay = false;
    this.selectedIds = [];
    this.namedSeatId = -1;
    this.pull();
  }

  private async openPeek(): Promise<void> {
    this.showPeek = true;
    try {
      const ctx = getContext(this) as common.UIAbilityContext;
      const win: window.Window = await window.getLastWindow(ctx);
      await PeekPrivacyAdapter.setEnabled(win, true);
    } catch (err) {
      Logger.warn(TAG, 'peek privacy fail-soft');
    }
  }

  private async closePeek(): Promise<void> {
    this.showPeek = false;
    try {
      const ctx = getContext(this) as common.UIAbilityContext;
      const win: window.Window = await window.getLastWindow(ctx);
      await PeekPrivacyAdapter.setEnabled(win, false);
    } catch (err) {
      Logger.warn(TAG, 'peek off fail-soft');
    }
  }
}
