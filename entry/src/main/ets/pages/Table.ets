import { common } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { AppRuntime } from '../common/AppRuntime';
import { ControlIds, ScreenIds } from '../common/Ids';
import { LbRouter } from '../common/LbRouter';
import { Logger } from '../common/Logger';
import { CardFace } from '../features/table/CardFace';
import { DealAudio } from '../features/table/DealAudio';
import { DealBeat, DealFx } from '../features/table/DealFx';
import { TableAudio } from '../features/table/TableAudio';
import { TableBreakpoints, TableCompass } from '../features/table/TableLayout';
import { PeekMaskOverlay, PlaySheetOverlay } from '../features/table/TableOverlays';
import { PeekPrivacyAdapter } from '../harmony/PeekPrivacyAdapter';
import { SafeInsets, WindowOrientation } from '../harmony/WindowOrientation';
import { CardModel, MatchSnapshot, SeatModel } from '../engine/MatchTypes';
import { Phase, PlayStyle, SeatRole, SeatStatus, TurnWindow } from '../engine/Phase';

const TAG = 'Table';
/** HUD poll floor: 200ms @State spam flickered the page. Skip writes if stamp unchanged. */
const SNAP_POLL_MS: number = 800;

/**
 * lb_scr_table landscape ring (docs 11/12 R-LAND-1～5). Lobby stays portrait.
 * #58 locked fail sentences this page must not trip:
 * R-LAND-3 手牌几乎贴中堆；或手牌裁半 / 半张出屏
 * R-LAND-5 环位错（老千不见 / self 跑到中上）
 * R-LAND-2 荷官没了 / 只剩空槽；或池旁张数落到手牌下
 * #66 / 11 v0.2.5 hangpoints (UI confirmed):
 * 1. selfDock left independent slot; must NOT cover leftmost cards
 *    (no BottomStart overlay on hand).
 * 2. Larger pile gap via ring layoutWeight / heart compression —
 *    do NOT increase padB to fake sink (that lifts cards).
 */

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
  @State phaseText: string = '';
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
  @State flyX: number = 0;
  @State flyY: number = 0;
  @State flyScale: number = 0.72;
  @State flyRot: number = -16;
  @State flyZ: number = 1000;
  @State landed0: number = 0;
  @State landed1: number = 0;
  @State landed2: number = 0;
  @State landed3: number = 0;
  @State pileOn: boolean = false;
  @State padL: number = 0;
  @State padT: number = 0;
  @State padR: number = 0;
  @State padB: number = 0;
  @State dealerBustPct: number = TableBreakpoints.BUST_MAX_PCT;
  @State heartPadPct: number = 0;
  private pollId: number = -1;
  private lastHudStamp: string = '';
  private pushedChallenge: boolean = false;
  private dealToken: string = '';
  private dealTimers: number[] = [];
  private stackGX: number = 0;
  private stackGY: number = 0;
  private stackW: number = 0;
  private stackH: number = 0;
  private pileX: number = 0;
  private pileY: number = 0;
  private pileW: number = DealFx.PILE_SLOT_W;
  private pileH: number = DealFx.PILE_SLOT_H;
  private pileGX: number = 0;
  private pileGY: number = 0;
  private pileMeasured: boolean = false;
  private handX: number = 0;
  private handY: number = 0;
  private handW: number = 0;
  private seatXs: number[] = [0, 0, 0, 0];
  private seatYs: number[] = [0, 0, 0, 0];
  private winRef: window.Window | null = null;
  private avoidBound: boolean = false;
  private heardPlayId: string = '';

  aboutToAppear(): void {
    const ctx: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
    DealAudio.bind(ctx);
    DealAudio.prepare();
    TableAudio.bind(ctx);
    TableAudio.prepare();
    const boot: MatchSnapshot | null = AppRuntime.engine.current();
    if (boot !== null) {
      DealAudio.setSilent(boot.silentMode);
      TableAudio.setSilent(boot.silentMode);
    }
    TableAudio.startBgm(TableAudio.BGM_FADE_IN_MS);
    this.lockTableWindow();
    this.pull();
    this.pollId = setInterval((): void => {
      this.pull();
    }, SNAP_POLL_MS);
    Logger.info(TAG, 'table listening to engine snapshot');
  }

  aboutToDisappear(): void {
    if (this.pollId >= 0) {
      clearInterval(this.pollId);
      this.pollId = -1;
    }
    this.cancelDealTimers();
    DealAudio.release();
    this.unbindAvoid();
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Image($r('app.media.art_table_bg'))
        .width('100%')
        .height('100%')
        .objectFit(ImageFit.Cover)
        .expandSafeArea([SafeAreaType.SYSTEM, SafeAreaType.CUTOUT],
          [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM, SafeAreaEdge.START, SafeAreaEdge.END])

      Column() {
        this.topBar()
        Column() {
          this.seatRing()
        }
        .layoutWeight(1)
        .width('100%')
        Column() {
          Blank()
            .layoutWeight(1)
        }
        .width('100%')
        .height(`${TableBreakpoints.HAND_RING_GAP_PCT}%`)
        this.bottomBand()
      }
      .width('100%')
      .height('100%')
      .padding({
        left: this.padL,
        top: this.padT,
        right: this.padR,
        bottom: this.padB
      })

      PeekMaskOverlay({
        visible: $showPeek
      })

      if (this.showPlay) {
        Row() {
          Column()
            .layoutWeight(1)
            .height('100%')
            .onClick(() => {
              this.cancelPlaySheet();
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
              this.cancelPlaySheet();
            }
          })
            .width('36%')
            .height('100%')
            .constraintSize({ maxWidth: '36%' })
        }
        .width('100%')
        .height('88%')
        .margin({ top: '12%' })
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
      const w: number = Number(area.width);
      const h: number = Number(area.height);
      this.stackW = w;
      this.stackH = h;
      this.applyBreakpoint(w, h);
    })
  }

  @Builder
  topBar() {
    Column({ space: 2 }) {
      Row() {
        Text(this.claimText)
          .id('lb_txt_claim')
          .fontColor($r('app.color.tavern_candle'))
          .fontSize($r('app.float.page_text_size'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .layoutWeight(1)
        Text(this.timerText)
          .id('lb_txt_timer')
          .fontColor($r('app.color.tavern_accent'))
          .fontSize($r('app.float.page_text_size'))
          .margin({ left: 8, right: 8 })
        this.weakCta()
      }
      .width('100%')
      Row() {
        Text(this.dealerLine)
          .id(ControlIds.DEALER_LINE)
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.caption_text_size'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .layoutWeight(1)
          .visibility(this.dealerLine.length > 0 ? Visibility.Visible : Visibility.None)
        Text($r('app.string.lb_str_home'))
          .id(ControlIds.HOME)
          .fontColor($r('app.color.tavern_mute'))
          .fontSize($r('app.float.caption_text_size'))
          .onClick(() => {
            this.goHome();
          })
      }
      .id(ControlIds.DEALER_BANNER)
      .width('100%')
    }
    .id(ControlIds.TOPBAR)
    .width('100%')
    .constraintSize({ maxHeight: '12%' })
  }

  /**
   * Compass (12 §3 / R-LAND-5): L karen p3 · T shark p2 · R timid p1 · B self+hand.
   * Column + layoutWeight — do not Stack-align self onto shark (device 裁半 / 环位错).
   */
  @Builder
  seatRing() {
    Row() {
      Column() {
        Blank()
          .layoutWeight(1)
        this.seatBlock(TableCompass.LEFT, this.seat3, this.life3, ControlIds.SEAT_P3)
        Blank()
          .layoutWeight(1)
      }
      .width(`${TableBreakpoints.SIDE_SEAT_PCT}%`)
      .height('100%')

      Column() {
        this.seatBlock(TableCompass.TOP, this.seat2, this.life2, ControlIds.SEAT_P2)
        Column() {
          this.tableHeart()
        }
        .layoutWeight(1)
        .width('100%')
      }
      .layoutWeight(1)
      .height('100%')

      Column() {
        Blank()
          .layoutWeight(1)
        this.seatBlock(TableCompass.RIGHT, this.seat1, this.life1, ControlIds.SEAT_P1)
        Blank()
          .layoutWeight(1)
      }
      .width(`${TableBreakpoints.SIDE_SEAT_PCT}%`)
      .height('100%')
    }
    .width('100%')
    .height('100%')
    .padding({
      left: `${this.heartPadPct}%`,
      right: `${this.heartPadPct}%`
    })
  }

  /** R-LAND-2: bust + pile visible at center; poolText beside the pool, never under lb_cmp_hand. */
  @Builder
  tableHeart() {
    Row({ space: 8 }) {
      Image($r('app.media.art_dealer_bust_announce'))
        .id(ControlIds.DEALER)
        .height('72%')
        .constraintSize({
          maxWidth: `${this.dealerBustPct}%`,
          maxHeight: '100%'
        })
        .objectFit(ImageFit.Contain)
      Stack() {
        Image($r('app.media.art_pool_slot'))
          .id('lb_cmp_pool')
          .width(DealFx.PILE_SLOT_W)
          .height(DealFx.PILE_SLOT_H)
        if (this.pileOn) {
          this.dealPileStack()
        }
      }
      .id('dealPileAnchor')
      .width(DealFx.PILE_SLOT_W)
      .height(DealFx.PILE_SLOT_H)
      .onAreaChange((_old: Area, area: Area) => {
        this.capturePile(area);
      })
      Text(this.poolText)
        .fontColor($r('app.color.tavern_paper'))
        .fontSize($r('app.float.caption_text_size'))
        .maxLines(1)
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(VerticalAlign.Center)
  }

  /**
   * Hangpoint 1: selfDock is a left independent slot. Matching right inset
   * keeps lb_cmp_hand on the desktop mid-line. No BottomStart overlay on cards.
   */
  @Builder
  bottomBand() {
    Row() {
      Row() {
        this.selfDock()
      }
      .width(`${TableBreakpoints.SELF_SLOT_PCT}%`)
      .justifyContent(FlexAlign.Start)
      .alignItems(VerticalAlign.Bottom)

      this.handRow()

      Blank()
        .width(`${TableBreakpoints.SELF_SLOT_PCT}%`)
    }
    .width('100%')
    .alignItems(VerticalAlign.Bottom)
  }

  /** Full mid-band hand: count stretches L/R only. Sits on safe-area top edge. */
  @Builder
  handRow() {
    Stack({ alignContent: Alignment.Bottom }) {
      Row({ space: 6 }) {
        ForEach(this.cardBacks, (idx: number) => {
          CardFace({
            rank: this.rankAt(idx),
            faceUp: this.showPeek,
            compact: true,
            instanceId: `lb_cmp_card_${idx}`
          })
            .gesture(
              LongPressGesture()
                .onAction(() => {
                  this.openPeek();
                })
                .onActionEnd(() => {
                  this.closePeek();
                })
                .onActionCancel(() => {
                  this.closePeek();
                })
            )
        }, (idx: number) => `${idx}`)
      }
      .id(ControlIds.HAND)
      .width('100%')
      .height($r('app.float.card_h'))
      .justifyContent(FlexAlign.Center)
      .alignItems(VerticalAlign.Center)
      .onAreaChange((_old: Area, area: Area) => {
        this.captureHand(area);
      })

      if (this.handEmpty) {
        Text($r('app.string.lb_str_hand_empty'))
          .fontColor($r('app.color.tavern_mute'))
          .fontSize($r('app.float.caption_text_size'))
          .align(Alignment.BottomEnd)
          .margin({ right: 8 })
      }
      if (this.showFirstHint) {
        Text($r('app.string.lb_str_challenge_disabled_first'))
          .fontColor($r('app.color.tavern_mute'))
          .fontSize($r('app.float.caption_text_size'))
          .align(Alignment.BottomEnd)
          .margin({ right: 8 })
      }
    }
    .layoutWeight(1)
    .width('100%')
  }

  /** 下手 self: art_player_idle + Cover + round crop (same as AI seatAvatar). Left independent slot. Not over cards. */
  @Builder
  selfDock() {
    Row({ space: 4 }) {
      Stack() {
        Image($r('app.media.art_player_idle'))
          .width(40)
          .height(40)
          .objectFit(ImageFit.Cover)
      }
      .id(ControlIds.SEAT_SELF)
      .width(40)
      .height(40)
      .borderRadius(20)
      .clip(true)
      Column({ space: 1 }) {
        Text(this.seat0)
          .fontColor(this.turnSeat === TableCompass.BOTTOM ? $r('app.color.tavern_accent') : $r('app.color.tavern_paper'))
          .fontSize($r('app.float.caption_text_size'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(this.life0)
          .fontColor(this.calledSeat === TableCompass.BOTTOM ? $r('app.color.tavern_accent') : $r('app.color.tavern_mute'))
          .fontSize($r('app.float.caption_text_size'))
      }
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Start)
    }
    .padding(2)
    .width('100%')
    .constraintSize({ maxWidth: '100%' })
    .border({
      width: this.turnSeat === TableCompass.BOTTOM ? 2 : 0,
      color: $r('app.color.tavern_accent')
    })
    .borderRadius(8)
    .onAreaChange((_old: Area, area: Area) => {
      this.captureSeat(TableCompass.BOTTOM, area);
    })
  }

  /** R-LAND-4: lock-name play/challenge stay as caption links, not a dual bottom bar. */
  @Builder
  weakCta() {
    Row({ space: 8 }) {
      Text($r('app.string.lb_str_challenge'))
        .id(ControlIds.CHALLENGE)
        .fontColor(this.challengeEnabled ? $r('app.color.tavern_paper') : $r('app.color.tavern_mute'))
        .fontSize($r('app.float.caption_text_size'))
        .onClick(() => {
          if (!this.challengeEnabled) {
            return;
          }
          AppRuntime.engine.intentChallenge();
          this.pull();
        })
      if (this.skipEnabled) {
        Text($r('app.string.lb_str_skip'))
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.caption_text_size'))
          .onClick(() => {
            AppRuntime.engine.skip();
            this.pull();
          })
      } else if (!this.showPlay) {
        Text($r('app.string.lb_str_play'))
          .id(ControlIds.PLAY)
          .fontColor(this.playEnabled ? $r('app.color.tavern_candle') : $r('app.color.tavern_mute'))
          .fontSize($r('app.float.caption_text_size'))
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
    .margin({ right: 8 })
  }

  @Builder
  dealPileStack() {
    Stack() {
      Image($r('app.media.art_card_back'))
        .width(DealFx.PILE_CARD_W)
        .height(DealFx.PILE_CARD_H)
        .objectFit(ImageFit.Cover)
        .offset({ x: DealFx.pileNudgeX(0), y: DealFx.pileNudgeY(0) })
      Image($r('app.media.art_card_back'))
        .width(DealFx.PILE_CARD_W)
        .height(DealFx.PILE_CARD_H)
        .objectFit(ImageFit.Cover)
        .offset({ x: DealFx.pileNudgeX(1), y: DealFx.pileNudgeY(1) })
      Image($r('app.media.art_card_back'))
        .width(DealFx.PILE_CARD_W)
        .height(DealFx.PILE_CARD_H)
        .objectFit(ImageFit.Cover)
        .offset({ x: DealFx.pileNudgeX(2), y: DealFx.pileNudgeY(2) })
      Image($r('app.media.art_card_back'))
        .width(DealFx.PILE_CARD_W)
        .height(DealFx.PILE_CARD_H)
        .objectFit(ImageFit.Cover)
        .offset({ x: DealFx.pileNudgeX(3), y: DealFx.pileNudgeY(3) })
      Image($r('app.media.art_card_back'))
        .width(DealFx.PILE_CARD_W)
        .height(DealFx.PILE_CARD_H)
        .objectFit(ImageFit.Cover)
        .offset({ x: DealFx.pileNudgeX(4), y: DealFx.pileNudgeY(4) })
    }
    .width(DealFx.PILE_SLOT_W)
    .height(DealFx.PILE_SLOT_H)
  }

  @Builder
  seatBlock(seatId: number, name: string, life: string, id: string) {
    if (TableCompass.isTop(seatId)) {
      Row({ space: 6 }) {
        this.seatAvatar(seatId, id)
        Column({ space: 1 }) {
          Text(name)
            .fontColor(this.turnSeat === seatId ? $r('app.color.tavern_accent') : $r('app.color.tavern_paper'))
            .fontSize($r('app.float.caption_text_size'))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(life)
            .fontColor(this.calledSeat === seatId ? $r('app.color.tavern_accent') : $r('app.color.tavern_mute'))
            .fontSize($r('app.float.caption_text_size'))
          this.oppBacks(seatId)
        }
        .alignItems(HorizontalAlign.Start)
      }
      .padding(4)
      .justifyContent(FlexAlign.Center)
      .border({
        width: this.turnSeat === seatId ? 2 : 0,
        color: $r('app.color.tavern_accent')
      })
      .borderRadius(8)
      .onAreaChange((_old: Area, area: Area) => {
        this.captureSeat(seatId, area);
      })
    } else {
      Column({ space: 2 }) {
        this.seatAvatar(seatId, id)
        Text(name)
          .fontColor(this.turnSeat === seatId ? $r('app.color.tavern_accent') : $r('app.color.tavern_paper'))
          .fontSize($r('app.float.caption_text_size'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(life)
          .fontColor(this.calledSeat === seatId ? $r('app.color.tavern_accent') : $r('app.color.tavern_mute'))
          .fontSize($r('app.float.caption_text_size'))
        this.oppBacks(seatId)
      }
      .padding(4)
      .border({
        width: this.turnSeat === seatId ? 2 : 0,
        color: $r('app.color.tavern_accent')
      })
      .borderRadius(8)
      .onAreaChange((_old: Area, area: Area) => {
        this.captureSeat(seatId, area);
      })
    }
  }

  @Builder
  seatAvatar(seatId: number, id: string) {
    Stack() {
      if (seatId === TableCompass.RIGHT) {
        Image($r('app.media.art_ai_timid_idle'))
          .width(44)
          .height(44)
          .objectFit(ImageFit.Cover)
      } else if (seatId === TableCompass.TOP) {
        Image($r('app.media.art_ai_shark_idle'))
          .width(44)
          .height(44)
          .objectFit(ImageFit.Cover)
      } else {
        Image($r('app.media.art_ai_karen_idle'))
          .width(44)
          .height(44)
          .objectFit(ImageFit.Cover)
      }
    }
    .id(id)
    .width(44)
    .height(44)
    .borderRadius(22)
    .clip(true)
  }

  @Builder
  oppBacks(seatId: number) {
    Row({ space: -10 }) {
      if (seatId > 0 && this.stackOf(seatId) > 0) {
        ForEach(this.indexes(this.stackOf(seatId)), (idx: number) => {
          Image($r('app.media.art_card_back'))
            .width(18)
            .height(24)
        }, (idx: number) => `stk_${seatId}_${idx}`)
      }
    }
  }

  /** Bind avoid-area. Landscape itself is locked once at L-0; this call is a no-op if already LANDSCAPE. */
  private async lockTableWindow(): Promise<void> {
    Logger.info(TAG, 'lockTableWindow enter');
    try {
      const ctx: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
      await WindowOrientation.lockLandscape(ctx);
      Logger.info(TAG, 'lockTableWindow after landscape lock');
      const win: window.Window | null = await WindowOrientation.mainWindow(ctx);
      this.winRef = win;
      this.applyInsets(WindowOrientation.readSafeInsets(win));
      if (win !== null && !this.avoidBound) {
        win.on('avoidAreaChange', (): void => {
          this.applyInsets(WindowOrientation.readSafeInsets(this.winRef));
        });
        this.avoidBound = true;
      }
    } catch (err) {
      Logger.warn(TAG, 'landscape/safe-area fail-soft');
    }
  }

  private unbindAvoid(): void {
    if (this.winRef !== null && this.avoidBound) {
      try {
        this.winRef.off('avoidAreaChange');
      } catch (err) {
        Logger.warn(TAG, 'avoidArea off fail-soft');
      }
    }
    this.avoidBound = false;
    this.winRef = null;
  }

  private applyInsets(box: SafeInsets): void {
    const nextL: number = TableBreakpoints.floorNotchPad(this.insetVp(box.left), this.stackW);
    const nextT: number = this.insetVp(box.top);
    const nextR: number = TableBreakpoints.floorNotchPad(this.insetVp(box.right), this.stackW);
    // Hangpoint 2: padB is avoidArea inset only — do not floorHandPad-inflate.
    const nextB: number = this.insetVp(box.bottom);
    this.commitPads(nextL, nextT, nextR, nextB);
  }

  private applyInsetFloors(): void {
    const nextL: number = TableBreakpoints.floorNotchPad(this.padL, this.stackW);
    const nextR: number = TableBreakpoints.floorNotchPad(this.padR, this.stackW);
    // Hangpoint 2: padB is avoidArea inset only. Do not floor/raise it.
    this.commitPads(nextL, this.padT, nextR, this.padB);
  }

  /** avoidAreaChange jitter: do not write @State pad* when values are unchanged. */
  private commitPads(l: number, t: number, r: number, b: number): void {
    if (this.padL !== l) {
      this.padL = l;
    }
    if (this.padT !== t) {
      this.padT = t;
    }
    if (this.padR !== r) {
      this.padR = r;
    }
    if (this.padB !== b) {
      this.padB = b;
    }
  }

  private insetVp(px: number): number {
    return Math.round(this.pxToVp(px));
  }

  private pxToVp(px: number): number {
    if (px <= 0) {
      return 0;
    }
    try {
      return this.getUIContext().px2vp(px);
    } catch (err) {
      return px;
    }
  }

  private applyBreakpoint(w: number, h: number): void {
    const nextBust: number = TableBreakpoints.dealerBustMaxPct(w, h);
    const nextHeart: number = TableBreakpoints.heartPadPct(w, h);
    if (this.dealerBustPct !== nextBust) {
      this.dealerBustPct = nextBust;
    }
    if (this.heartPadPct !== nextHeart) {
      this.heartPadPct = nextHeart;
    }
    this.applyInsetFloors();
  }

  private goHome(): void {
    AppRuntime.director.stop();
    AppRuntime.engine.toLobby();
    LbRouter.toLobby();
  }

  private cancelPlaySheet(): void {
    AppRuntime.engine.cancelPlay();
    this.showPlay = false;
    this.selectedIds = [];
    this.pull();
  }

  private rankAt(idx: number): string {
    if (idx >= 0 && idx < this.peekRanks.length) {
      return this.peekRanks[idx];
    }
    return '';
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
    const stamp: string = this.hudStamp(snap);
    DealAudio.setSilent(snap.silentMode);
    TableAudio.setSilent(snap.silentMode);
    if (snap.phase === Phase.DEAL) {
      if (stamp !== this.lastHudStamp) {
        this.lastHudStamp = stamp;
        this.applyDealHud(snap);
      }
      this.ensureDealShow(snap);
      return;
    }
    this.applyTimer(snap);
    if (stamp === this.lastHudStamp) {
      return;
    }
    this.lastHudStamp = stamp;
    if (this.dealerLine !== snap.dealerLine) {
      this.dealerLine = snap.dealerLine;
    }
    if (this.phaseText !== snap.phase) {
      this.phaseText = snap.phase;
    }
    if (this.pileOn) {
      this.pileOn = false;
    }
    if (this.flyOn) {
      this.flyOn = false;
    }
    if (this.dealPlaying) {
      this.dealPlaying = false;
    }
    let nextClaim: string = '';
    if (snap.currentClaim !== null) {
      nextClaim = `本轮出 ${snap.currentClaim.rank}`;
    }
    if (this.claimText !== nextClaim) {
      this.claimText = nextClaim;
      if (nextClaim !== '') {
        TableAudio.playClaimSet();
      }
    }
    this.takeSelfHand(snap.selfHand);
    this.takePeekRanks(this.ranksOf(snap.selfHand));
    this.takeCardBacks(snap.selfHand.length);
    const emptyHand: boolean = snap.selfHand.length === 0;
    if (this.handEmpty !== emptyHand) {
      this.handEmpty = emptyHand;
    }
    if (this.turnSeat !== snap.currentSeatId) {
      this.turnSeat = snap.currentSeatId;
      if (this.turnSeat >= 0 && snap.phase === Phase.TURN) {
        TableAudio.playTurnTick();
      }
    }
    this.hearLastPlay(snap);
    const called: number = snap.lastPlay === null ? -1 : snap.lastPlay.namedSeatId;
    if (this.calledSeat !== called) {
      this.calledSeat = called;
    }
    let nextPool: string = '';
    if (snap.lastPlay !== null) {
      nextPool = `${snap.lastPlay.count}`;
    }
    if (this.poolText !== nextPool) {
      this.poolText = nextPool;
    }
    this.fillSeats(snap.seats);
    this.syncOppStacks(snap.seats);
    const humanTurn: boolean = this.isHumanTurn(snap);
    const nextChallenge: boolean = humanTurn && snap.canChallenge && snap.phase === Phase.TURN;
    if (this.challengeEnabled !== nextChallenge) {
      this.challengeEnabled = nextChallenge;
    }
    const nextHint: boolean = !snap.canChallenge && snap.playIndexInRound === 0 && humanTurn;
    if (this.showFirstHint !== nextHint) {
      this.showFirstHint = nextHint;
    }
    const nextPlay: boolean = humanTurn && snap.hasCards && snap.phase === Phase.TURN &&
      snap.turnWindow !== TurnWindow.CHALLENGE_ONLY;
    if (this.playEnabled !== nextPlay) {
      this.playEnabled = nextPlay;
    }
    const nextSkip: boolean = humanTurn && snap.phase === Phase.TURN &&
      (snap.turnWindow === TurnWindow.CHALLENGE_ONLY || !snap.hasCards);
    if (this.skipEnabled !== nextSkip) {
      this.skipEnabled = nextSkip;
    }
    const nextSheet: boolean = snap.phase === Phase.PLAY_REVEAL_SELF && humanTurn;
    if (this.showPlay !== nextSheet) {
      this.showPlay = nextSheet;
    }
    this.refreshPlayMeta(snap);
  }

  /** HUD fields Table writes. Clock is applied separately so a second tick cannot churn card arrays. */
  private hudStamp(snap: MatchSnapshot): string {
    let claim: string = '';
    if (snap.currentClaim !== null) {
      claim = snap.currentClaim.rank;
    }
    let pool: string = '';
    let called: number = -1;
    if (snap.lastPlay !== null) {
      pool = `${snap.lastPlay.count}`;
      called = snap.lastPlay.namedSeatId;
    }
    let hand: string = '';
    for (let i = 0; i < snap.selfHand.length; i++) {
      hand = `${hand}${snap.selfHand[i].cardId}:${snap.selfHand[i].rank},`;
    }
    let seats: string = '';
    for (let i = 0; i < snap.seats.length; i++) {
      const s: SeatModel = snap.seats[i];
      seats = `${seats}${s.seatId}:${s.nickname}:${s.status}:${s.lives}:${s.handCount};`;
    }
    const human: boolean = this.isHumanTurn(snap);
    return `${snap.phase}|${snap.turnWindow}|${snap.roundIndex}|${snap.playIndexInRound}|` +
      `${snap.currentSeatId}|${snap.canChallenge}|${snap.hasCards}|${snap.silentMode}|` +
      `${snap.dealerLine}|${snap.dealerKey}|${claim}|${pool}|${called}|${human}|${hand}|${seats}`;
  }

  private applyTimer(snap: MatchSnapshot): void {
    const humanTurn: boolean = this.isHumanTurn(snap);
    let next: string = '--';
    if (!(humanTurn && (snap.phase === Phase.TURN || snap.phase === Phase.PLAY_REVEAL_SELF))) {
      next = `${Math.ceil(snap.turnRemainMs / 1000)}`;
    }
    if (this.timerText !== next) {
      this.timerText = next;
    }
  }

  private takeSelfHand(next: CardModel[]): void {
    if (this.selfCards.length === next.length) {
      let same: boolean = true;
      for (let i = 0; i < next.length; i++) {
        if (this.selfCards[i].cardId !== next[i].cardId || this.selfCards[i].rank !== next[i].rank) {
          same = false;
          break;
        }
      }
      if (same) {
        return;
      }
    }
    this.selfCards = next;
  }

  private takePeekRanks(next: string[]): void {
    if (this.peekRanks.length === next.length) {
      let same: boolean = true;
      for (let i = 0; i < next.length; i++) {
        if (this.peekRanks[i] !== next[i]) {
          same = false;
          break;
        }
      }
      if (same) {
        return;
      }
    }
    this.peekRanks = next;
  }

  private takeCardBacks(n: number): void {
    if (this.cardBacks.length === n) {
      return;
    }
    this.cardBacks = this.indexes(n);
  }

  private fillSeats(seats: SeatModel[]): void {
    const s0: string = this.seatLabel(seats, 0);
    const s1: string = this.seatLabel(seats, 1);
    const s2: string = this.seatLabel(seats, 2);
    const s3: string = this.seatLabel(seats, 3);
    if (this.seat0 !== s0) {
      this.seat0 = s0;
    }
    if (this.seat1 !== s1) {
      this.seat1 = s1;
    }
    if (this.seat2 !== s2) {
      this.seat2 = s2;
    }
    if (this.seat3 !== s3) {
      this.seat3 = s3;
    }
    const l0: string = this.lifeLabel(seats, 0);
    const l1: string = this.lifeLabel(seats, 1);
    const l2: string = this.lifeLabel(seats, 2);
    const l3: string = this.lifeLabel(seats, 3);
    if (this.life0 !== l0) {
      this.life0 = l0;
    }
    if (this.life1 !== l1) {
      this.life1 = l1;
    }
    if (this.life2 !== l2) {
      this.life2 = l2;
    }
    if (this.life3 !== l3) {
      this.life3 = l3;
    }
    const n1: string = this.nickOf(seats, 1);
    const n2: string = this.nickOf(seats, 2);
    const n3: string = this.nickOf(seats, 3);
    if (this.nameP1 !== n1) {
      this.nameP1 = n1;
    }
    if (this.nameP2 !== n2) {
      this.nameP2 = n2;
    }
    if (this.nameP3 !== n3) {
      this.nameP3 = n3;
    }
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
    const count: string = `${this.selectedIds.length}`;
    if (this.playCountText !== count) {
      this.playCountText = count;
    }
    const ok: boolean = this.selectedIds.length >= snap.config.min_play_cards &&
      this.selectedIds.length <= snap.config.max_play_cards;
    if (this.confirmEnabled !== ok) {
      this.confirmEnabled = ok;
    }
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
    if (this.claimText !== '') {
      this.claimText = '';
    }
    if (this.poolText !== '') {
      this.poolText = '';
    }
    if (this.timerText !== '--') {
      this.timerText = '--';
    }
    if (this.challengeEnabled) {
      this.challengeEnabled = false;
    }
    if (this.playEnabled) {
      this.playEnabled = false;
    }
    if (this.skipEnabled) {
      this.skipEnabled = false;
    }
    if (this.showPlay) {
      this.showPlay = false;
    }
    if (this.showPeek) {
      this.showPeek = false;
    }
    if (this.showFirstHint) {
      this.showFirstHint = false;
    }
    if (this.handEmpty) {
      this.handEmpty = false;
    }
    this.takeSelfHand([]);
    this.takePeekRanks([]);
    this.takeCardBacks(this.landed0);
    if (!this.pileOn) {
      this.pileOn = true;
    }
    this.fillSeats(snap.seats);
    if (this.turnSeat !== -1) {
      this.turnSeat = -1;
    }
    if (this.calledSeat !== -1) {
      this.calledSeat = -1;
    }
    this.heardPlayId = '';
  }

  /** 13 §5.2: play-style peak + named stare when a new lastPlay lands in the pool. */
  private hearLastPlay(snap: MatchSnapshot): void {
    if (snap.lastPlay === null || snap.playIndexInRound <= 0) {
      return;
    }
    if (snap.lastPlay.playId === this.heardPlayId) {
      return;
    }
    this.heardPlayId = snap.lastPlay.playId;
    TableAudio.playStyleAtPeak(snap.lastPlay.style);
    if (snap.lastPlay.namedSeatId >= 0) {
      TableAudio.playNamedStare();
    }
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
    const origin: number[] = this.flyFromPile();
    this.flyX = origin[0];
    this.flyY = origin[1];
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
    const n1: number = this.handCountOf(seats, 1);
    const n2: number = this.handCountOf(seats, 2);
    const n3: number = this.handCountOf(seats, 3);
    if (this.landed1 !== n1) {
      this.landed1 = n1;
    }
    if (this.landed2 !== n2) {
      this.landed2 = n2;
    }
    if (this.landed3 !== n3) {
      this.landed3 = n3;
    }
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
      let centerX: number = TableBreakpoints.handBandCenterX(this.padL, this.padR, this.stackW);
      if (centerX <= 0 && this.handW > 0) {
        centerX = this.handX + this.handW / 2;
      }
      let slots: number = this.landed0 + 1;
      if (slots < 1) {
        slots = 1;
      }
      if (slots > DealFx.HAND_SLOTS) {
        slots = DealFx.HAND_SLOTS;
      }
      const x: number = TableBreakpoints.handSlotX(
        centerX, slot, DealFx.FLY_CARD_W, 6, slots);
      return [x, this.handY];
    }
    const x: number = this.seatXs[seatId] + slot * 4;
    const y: number = this.seatYs[seatId] + 36;
    return [x, y];
  }

  private capturePile(area: Area): void {
    this.pileGX = Number(area.globalPosition.x);
    this.pileGY = Number(area.globalPosition.y);
    const w: number = Number(area.width);
    const h: number = Number(area.height);
    if (w > 0) {
      this.pileW = w;
    }
    if (h > 0) {
      this.pileH = h;
    }
    const loc: number[] = this.localOf(area);
    this.pileX = loc[0];
    this.pileY = loc[1];
    this.pileMeasured = true;
  }

  /** Fly takeoff = remaining-pile center = dealPileAnchor (08 §2.1 / #48). */
  private flyFromPile(): number[] {
    let x: number = this.pileX;
    let y: number = this.pileY;
    if (this.pileMeasured) {
      x = this.pileGX - this.stackGX;
      y = this.pileGY - this.stackGY;
    } else if (this.stackW > 0 && this.stackH > 0) {
      x = this.stackW * 0.5 - this.pileW / 2;
      y = this.stackH * 0.42 - this.pileH / 2;
    }
    return DealFx.flyOriginFromPile(x, y, this.pileW, this.pileH);
  }

  private captureHand(area: Area): void {
    const loc: number[] = this.localOf(area);
    this.handX = loc[0];
    this.handY = loc[1];
    const w: number = Number(area.width);
    if (w > 0) {
      this.handW = w;
    }
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
