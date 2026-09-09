import { common } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { AppRuntime } from '../common/AppRuntime';
import { ControlIds, ScreenIds } from '../common/Ids';
import { LbRouter } from '../common/LbRouter';
import { Logger } from '../common/Logger';
import { SpectatorStub } from '../features/spectator/SpectatorStub';
import { DealAudio } from '../features/table/DealAudio';
import { DealBeat, DealFx } from '../features/table/DealFx';
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
  @State dealPlaying: boolean = false;
  @State flyOn: boolean = false;
  @State flyX: number = 152;
  @State flyY: number = 210;
  @State flyScale: number = 0.72;
  @State flyRot: number = -16;
  @State flyZ: number = 1000;
  @State landed0: number = 0;
  @State landed1: number = 0;
  @State landed2: number = 0;
  @State landed3: number = 0;
  @State pileOn: boolean = false;
  private pollId: number = -1;
  private pushedChallenge: boolean = false;
  private dealToken: string = '';
  private dealTimers: number[] = [];
  private stackGX: number = 0;
  private stackGY: number = 0;
  private pileX: number = 152;
  private pileY: number = 210;
  private handX: number = 16;
  private handY: number = 340;
  private seatXs: number[] = [24, 108, 192, 276];
  private seatYs: number[] = [128, 128, 128, 128];

  aboutToAppear(): void {
    const ctx: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
    DealAudio.bind(ctx);
    DealAudio.prepare();
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
    this.cancelDealTimers();
    DealAudio.release();
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
          .onAreaChange((_old: Area, area: Area) => {
            this.capturePile(area);
          })
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
        .onAreaChange((_old: Area, area: Area) => {
          this.captureHand(area);
        })

        if (this.handEmpty) {
          Text($r('app.string.lb_str_hand_empty'))
            .fontColor($r('app.color.tavern_mute'))
            .fontSize($r('app.float.subtitle_text_size'))
        }

        if (this.showFirstHint) {
          Text($r('app.string.lb_str_challenge_disabled_first'))
            .fontColor($r('app.color.tavern_mute'))
            .fontSize($r('app.float.subtitle_text_size'))
            .margin({ top: 8 })
        }

        SpectatorStub()
        TutorialStub()

        Row({ space: 10 }) {
          Button($r('app.string.lb_str_challenge'))
            .id(ControlIds.CHALLENGE)
            .layoutWeight(1)
            .height($r('app.float.cta_height'))
            .fontSize($r('app.float.page_text_size'))
            .enabled(this.challengeEnabled)
            .backgroundColor($r('app.color.tavern_panel'))
            .fontColor(this.challengeEnabled ? $r('app.color.tavern_paper') : $r('app.color.tavern_mute'))
            .onClick(() => {
              if (!this.challengeEnabled) {
                return;
              }
              AppRuntime.engine.intentChallenge();
              this.pull();
            })
          if (this.skipEnabled) {
            Button($r('app.string.lb_str_skip'))
              .layoutWeight(1)
              .height($r('app.float.cta_height'))
              .fontSize($r('app.float.page_text_size'))
              .backgroundColor($r('app.color.tavern_panel'))
              .fontColor($r('app.color.tavern_paper'))
              .onClick(() => {
                AppRuntime.engine.skip();
                this.pull();
              })
          } else {
            Button($r('app.string.lb_str_play'))
              .layoutWeight(1)
              .height($r('app.float.cta_height'))
              .fontSize($r('app.float.page_text_size'))
              .enabled(this.playEnabled)
              .backgroundColor($r('app.color.tavern_accent'))
              .fontColor(this.playEnabled ? $r('app.color.tavern_bg') : $r('app.color.tavern_mute'))
              .onClick(() => {
                if (!this.playEnabled) {
                  return;
                }
                AppRuntime.engine.intentPlay();
                this.showPlay = true;
                this.pull();
              })
          }
        }
        .width('100%')
        .margin({ top: 12 })

        Button($r('app.string.lb_str_home'))
          .width('100%')
          .margin({ top: 10 })
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

      if (this.pileOn) {
        Image($r('app.media.art_card_back'))
          .id('dealPileAnchor')
          .width(40)
          .height(56)
          .position({ x: this.pileX + 8, y: this.pileY - 4 })
          .zIndex(900)
      }
      if (this.flyOn) {
        Image($r('app.media.art_card_back'))
          .width($r('app.float.card_w'))
          .height($r('app.float.card_h'))
          .position({ x: this.flyX, y: this.flyY })
          .scale({ x: this.flyScale, y: this.flyScale })
          .rotate({ angle: this.flyRot })
          .zIndex(this.flyZ)
      }
    }
    .id(ScreenIds.TABLE)
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.tavern_bg'))
    .onAreaChange((_old: Area, area: Area) => {
      this.stackGX = Number(area.globalPosition.x);
      this.stackGY = Number(area.globalPosition.y);
    })
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
      if (seatId > 0 && this.stackOf(seatId) > 0) {
        Row({ space: -10 }) {
          ForEach(this.indexes(this.stackOf(seatId)), (idx: number) => {
            Image($r('app.media.art_card_back'))
              .width(22)
              .height(30)
          }, (idx: number) => `stk_${seatId}_${idx}`)
        }
      }
    }
    .onAreaChange((_old: Area, area: Area) => {
      this.captureSeat(seatId, area);
    })
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
    DealAudio.setSilent(snap.silentMode);
    if (snap.phase === Phase.DEAL) {
      this.applyDealHud(snap);
      this.ensureDealShow(snap);
      return;
    }
    this.pileOn = false;
    this.flyOn = false;
    this.dealPlaying = false;
    if (snap.currentClaim !== null) {
      this.claimText = `本轮出 ${snap.currentClaim.rank}`;
    } else {
      this.claimText = '';
    }
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
    this.syncOppStacks(snap.seats);
    const humanTurn: boolean = this.isHumanTurn(snap);
    if (humanTurn && (snap.phase === Phase.TURN || snap.phase === Phase.PLAY_REVEAL_SELF)) {
      this.timerText = '--';
    } else {
      const sec: number = Math.ceil(snap.turnRemainMs / 1000);
      this.timerText = `${sec}`;
    }
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

  private applyDealHud(snap: MatchSnapshot): void {
    this.claimText = '';
    this.poolText = '';
    this.timerText = '--';
    this.challengeEnabled = false;
    this.playEnabled = false;
    this.skipEnabled = false;
    this.showPlay = false;
    this.showPeek = false;
    this.showFirstHint = false;
    this.handEmpty = false;
    this.selfCards = [];
    this.peekRanks = [];
    this.cardBacks = this.indexes(this.landed0);
    this.pileOn = true;
    this.fillSeats(snap.seats);
    this.turnSeat = -1;
    this.calledSeat = -1;
  }

  private ensureDealShow(snap: MatchSnapshot): void {
    const token: string = `${snap.matchId}:${snap.roundIndex}`;
    if (this.dealToken === token) {
      return;
    }
    this.startDealShow(snap, token);
  }

  private startDealShow(snap: MatchSnapshot, token: string): void {
    this.cancelDealTimers();
    this.dealToken = token;
    this.dealPlaying = true;
    this.landed0 = 0;
    this.landed1 = 0;
    this.landed2 = 0;
    this.landed3 = 0;
    this.cardBacks = [];
    this.flyOn = false;
    DealAudio.setSilent(snap.silentMode);
    const rebuild: boolean = this.isRebuildDeal(snap);
    const cardMs: number = DealFx.cardMs(rebuild);
    const staggerMs: number = DealFx.staggerMs(rebuild);
    const alive: number[] = DealFx.aliveClockwiseFromSelf(snap.seats);
    const beats: DealBeat[] = DealFx.planBeats(alive, snap.config.hand_size_default);
    const total: number = DealFx.totalMs(beats.length, cardMs, staggerMs);
    Logger.info(TAG,
      `DealFx ${rebuild ? 'rebuild' : 'opening'} n=${beats.length} T_card=${cardMs} T_stagger=${staggerMs} T_deal=${total}`);
    this.armDeal(16, (): void => {
      this.playBeat(beats, 0, cardMs, staggerMs);
    });
  }

  private isRebuildDeal(snap: MatchSnapshot): boolean {
    if (snap.dealerKey === 'lb_str_dlr_redeal') {
      return true;
    }
    return snap.roundIndex > 1;
  }

  private playBeat(beats: DealBeat[], i: number, cardMs: number, staggerMs: number): void {
    if (i >= beats.length) {
      this.flyOn = false;
      this.armDeal(DealFx.DEAL_DONE_SETTLE_MS, (): void => {
        AppRuntime.engine.dealDone();
        this.dealPlaying = false;
        this.pileOn = false;
        this.pull();
      });
      return;
    }
    const beat: DealBeat = beats[i];
    this.flyX = this.pileX;
    this.flyY = this.pileY;
    this.flyScale = 0.72;
    this.flyRot = -16;
    this.flyZ = 1000 + beat.index;
    this.flyOn = true;
    DealAudio.playDealCard();
    const dest: number[] = this.destOf(beat.seatId, beat.slot);
    const opt: AnimateParam = {
      duration: cardMs,
      curve: Curve.EaseInOut
    };
    animateTo(opt, (): void => {
      this.flyX = dest[0];
      this.flyY = dest[1];
      if (beat.seatId === 0) {
        this.flyScale = 1;
      } else {
        this.flyScale = 0.55;
      }
      this.flyRot = 0;
    });
    this.armDeal(cardMs, (): void => {
      this.markLanded(beat.seatId);
      this.flyOn = false;
      if (i + 1 >= beats.length) {
        this.playBeat(beats, i + 1, cardMs, staggerMs);
      } else {
        this.armDeal(staggerMs, (): void => {
          this.playBeat(beats, i + 1, cardMs, staggerMs);
        });
      }
    });
  }

  private markLanded(seatId: number): void {
    if (seatId === 0) {
      this.landed0 = this.landed0 + 1;
      this.cardBacks = this.indexes(this.landed0);
    } else if (seatId === 1) {
      this.landed1 = this.landed1 + 1;
    } else if (seatId === 2) {
      this.landed2 = this.landed2 + 1;
    } else if (seatId === 3) {
      this.landed3 = this.landed3 + 1;
    }
  }

  private stackOf(seatId: number): number {
    if (seatId === 1) {
      return this.landed1;
    }
    if (seatId === 2) {
      return this.landed2;
    }
    if (seatId === 3) {
      return this.landed3;
    }
    return 0;
  }

  private syncOppStacks(seats: SeatModel[]): void {
    this.landed1 = this.handCountOf(seats, 1);
    this.landed2 = this.handCountOf(seats, 2);
    this.landed3 = this.handCountOf(seats, 3);
  }

  private handCountOf(seats: SeatModel[], id: number): number {
    for (let i = 0; i < seats.length; i++) {
      if (seats[i].seatId === id) {
        return seats[i].handCount;
      }
    }
    return 0;
  }

  private destOf(seatId: number, slot: number): number[] {
    if (seatId === 0) {
      return [this.handX + slot * 62, this.handY];
    }
    const x: number = this.seatXs[seatId] + slot * 4;
    const y: number = this.seatYs[seatId] + 36;
    return [x, y];
  }

  private capturePile(area: Area): void {
    const loc: number[] = this.localOf(area);
    this.pileX = loc[0];
    this.pileY = loc[1];
  }

  private captureHand(area: Area): void {
    const loc: number[] = this.localOf(area);
    this.handX = loc[0];
    this.handY = loc[1];
  }

  private captureSeat(seatId: number, area: Area): void {
    const loc: number[] = this.localOf(area);
    this.seatXs[seatId] = loc[0];
    this.seatYs[seatId] = loc[1];
  }

  private localOf(area: Area): number[] {
    return [Number(area.globalPosition.x) - this.stackGX, Number(area.globalPosition.y) - this.stackGY];
  }

  private armDeal(ms: number, fn: () => void): void {
    const id: number = setTimeout((): void => {
      fn();
    }, ms);
    this.dealTimers.push(id);
  }

  private cancelDealTimers(): void {
    for (let i = 0; i < this.dealTimers.length; i++) {
      clearTimeout(this.dealTimers[i]);
    }
    this.dealTimers = [];
  }

  private async openPeek(): Promise<void> {
    const snap: MatchSnapshot | null = AppRuntime.engine.current();
    if (snap === null || snap.phase === Phase.DEAL || snap.phase === Phase.CLAIM) {
      return;
    }
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
