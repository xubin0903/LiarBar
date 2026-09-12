import { common } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { AppRuntime } from '../common/AppRuntime';
import { ControlIds, ScreenIds, SfxIds } from '../common/Ids';
import { LbRouter } from '../common/LbRouter';
import { Logger } from '../common/Logger';
import { CardFace } from '../features/table/CardFace';
import { DealAudio } from '../features/table/DealAudio';
import { DealBeat, DealFx } from '../features/table/DealFx';
import { DebugBuild } from '../common/DebugBuild';
import { LifeCandles } from '../features/table/LifeCandles';
import { SoundPlayer } from '../features/table/SoundPlayer';
import { TableAudio } from '../features/table/TableAudio';
import { TableBreakpoints, TableCompass } from '../features/table/TableLayout';
import { PeekMaskOverlay, PlayConfirmBar, PlaySheetOverlay } from '../features/table/TableOverlays';
import { PeekPrivacyAdapter } from '../harmony/PeekPrivacyAdapter';
import { SafeInsets, WindowOrientation } from '../harmony/WindowOrientation';
import { CardModel, MatchSnapshot, SeatModel } from '../engine/MatchTypes';
import { Phase, PlayStyle, SeatRole, SeatStatus, TurnWindow } from '../engine/Phase';

const TAG = 'Table';
/**
 * Temporary flush-gate diagnosis (11 / Harmony+UI joint memo).
 * Rebuild testers fill padB / stack / playH / pin / hand bottomGY into the memo.
 * Not product telemetry — do not add unrelated logs under this TAG.
 */
const FLUSH_TAG: string = 'TableFlush';
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
 * 11 v0.2.11 flush / #98 Rebuild: 手牌飞到桌心 / 底带消失 —
 *   Joint memo PRIMARY (Harmony+UI): full-height Bottom stack + hug child
 *   WITHOUT child .align(Bottom) fails (TopStart → 手下大空带). #98 only
 *   did half: kept child .align(Bottom), cut pin .height('100%'), and
 *   substituted hug pin + parent .align(Bottom). On device that parent
 *   align does NOT bottom-pin the hug stack → TopStart at y≈0 → 24%
 *   Blank then hand band sits mid-table (blocks dealer); bottom empty;
 *   self floats with the band.
 *   Co-signed fix (BOTH halves): pin Stack is a full-height transparent
 *   overlay (.width/.height 100%, alignContent Bottom) AND hug child
 *   handPin keeps .align(Alignment.Bottom). Do NOT use hug pin + parent
 *   .align(Bottom) as a substitute for the 100% alignment box.
 *   钉层底边 = 底安全区上沿 (padded playfield bottom / padB).
 *   11 flush: 底缘贴底安全区上沿，只留一丢丢缝. 24% only ABOVE the hand.
 *   Never a card_h / HAND_BAND_VP spacer under the hand. 禁加大 padB.
 *   ignoreLayoutSafeArea so layout reaches the physical bottom; padB is
 *   the only inset — pin bottom = safe-area top. Hangpoint: pinBottomGY≈
 *   safeTopGY, slack≈0.
 * 环位偏高 / 左右座贴顶 — L/R columns FlexAlign.Center (side-mid).
 *   Do not move top shark / bottom self.
 * R-LAND-2 荷官离开桌心牌堆（偏上偏左） — bust+pile overlay the padded
 *   playfield at Alignment.Center (true screen heart). Keep #90; do not regress.
 * R-LAND-2 tip 仍在 / 第一手还没人出过牌仍显示 — no first-hand empty tip.
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
  @State playEnabled: boolean = false;
  @State skipEnabled: boolean = false;
  @State handEmpty: boolean = false;
  @State poolText: string = '';
  @State seat0: string = '';
  @State seat1: string = '';
  @State seat2: string = '';
  @State seat3: string = '';
  @State life0: number = 3;
  @State life1: number = 3;
  @State life2: number = 3;
  @State life3: number = 3;
  @State compactLife: boolean = false;
  @State confirmBarOn: boolean = false;
  @State confirmBusy: boolean = false;
  @State hintKind: number = 0;
  @State failIdx: number = -1;
  @State failGen: number = 0;
  /** 14b R-LIFE-5: which seat the debug −1 hits. Default self. */
  @State debugSeatId: number = 0;
  /** 14b R-LIFE-5: panel closed = only lb_btn_debug_open. */
  @State debugLifeOpen: boolean = false;
  @State silentHud: boolean = false;
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
  /** Padded playfield height (vp). 24% Blank cannot % a wrap-content parent. */
  @State playH: number = 0;
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
  /** Flush-gate last line — skip identical onAreaChange spam. */
  private lastFlushLine: string = '';
  private flushPinH: number = 0;
  private flushPinGY: number = 0;
  private flushBandH: number = 0;
  private flushBandGY: number = 0;
  private flushHandH: number = 0;
  private flushHandGY: number = 0;
  private hintTimer: number = -1;

  aboutToAppear(): void {
    const ctx: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
    SoundPlayer.bind(ctx);
    this.warmupTableSfx();
    DealAudio.bind(ctx);
    DealAudio.prepare();
    TableAudio.bind(ctx);
    TableAudio.prepare();
    const boot: MatchSnapshot | null = AppRuntime.engine.current();
    if (boot !== null) {
      DealAudio.setSilent(boot.silentMode);
      TableAudio.setSilent(boot.silentMode);
      SoundPlayer.setSilent(boot.silentMode);
    }
    TableAudio.startBgm(TableAudio.BGM_FADE_IN_MS);
    this.lockTableWindow();
    this.pull();
    this.pollId = setInterval((): void => {
      this.pull();
    }, SNAP_POLL_MS);
    Logger.info(TAG, 'table listening to engine snapshot');
  }

  /** Enter-table: finish SoundPool loadComplete + silent warmup before first tap. */
  private async warmupTableSfx(): Promise<void> {
    await SoundPlayer.prepare();
    Logger.info(TAG,
      `SfxReady enter-table warm=${SoundPlayer.isWarm()} pending=false deferred=false`);
  }

  aboutToDisappear(): void {
    if (this.pollId >= 0) {
      clearInterval(this.pollId);
      this.pollId = -1;
    }
    this.cancelDealTimers();
    if (this.hintTimer >= 0) {
      clearTimeout(this.hintTimer);
      this.hintTimer = -1;
    }
    DealAudio.release();
    SoundPlayer.release();
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

      Stack({ alignContent: Alignment.TopStart }) {
        // Upper playfield: ring + heart. Center overlay stays HERE so its
        // alignment line cannot lift the hand band (#94 sibling Center did).
        Stack({ alignContent: Alignment.TopStart }) {
          Column() {
            this.topBar()
            Column() {
              this.seatRing()
            }
            .layoutWeight(1)
            .width('100%')
          }
          .width('100%')
          .height('100%')
          .justifyContent(FlexAlign.Start)
          .onClick(() => {
            this.clearHandSelect();
          })

          Stack({ alignContent: Alignment.Center }) {
            this.tableHeart()
          }
          .width('100%')
          .height('100%')
          .hitTestBehavior(HitTestMode.Transparent)
        }
        .width('100%')
        .height('100%')
        .onAreaChange((_old: Area, area: Area) => {
          const h: number = Number(area.height);
          if (h > 0 && this.playH !== h) {
            this.playH = h;
          }
          this.logFlushGate('playH');
        })

        // Full-height transparent pin overlay + hug child .align(Bottom).
        // BOTH halves required (joint memo PRIMARY / #98 regression):
        //   1) Stack({ alignContent: Bottom }).width/height 100% = alignment box
        //   2) hug handPin .align(Alignment.Bottom) so the child is not TopStart
        // #98 cut (1) and used hug pin + parent .align(Bottom) instead.
        // Device ignored that parent align → pin at y≈0 → 手牌飞到桌心 / 底带消失.
        // Do NOT substitute hug pin + parent .align(Bottom) for the 100% box.
        // Transparent: hand / selfDock stay tappable; parent None swallows hits.
        Stack({ alignContent: Alignment.Bottom }) {
          this.handPin()
        }
        .width('100%')
        .height('100%')
        .hitTestBehavior(HitTestMode.Transparent)
        .onAreaChange((_old: Area, area: Area) => {
          this.captureFlushPin(area);
        })

        // 15 confirm bar: sibling overlay, BottomEnd, tappable only.
        // Must NOT live in handPin (that would grow the hug and lift cards).
        // Does not change padB / HAND_RING_GAP.
        Stack({ alignContent: Alignment.BottomEnd }) {
          PlayConfirmBar({
            visible: this.confirmBarOn,
            confirmEnabled: this.confirmEnabled && !this.confirmBusy,
            onConfirm: () => {
              this.confirmTablePlay();
            }
          })
        }
        .width('100%')
        .height('100%')
        .hitTestBehavior(HitTestMode.Transparent)

        if (this.hintKind > 0) {
          this.playHintToast()
        }

        if (DebugBuild.lifeDecShown()) {
          this.debugLifeChrome()
        }
      }
      .width('100%')
      .height('100%')
      .expandSafeArea([SafeAreaType.SYSTEM, SafeAreaType.CUTOUT],
        [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM, SafeAreaEdge.START, SafeAreaEdge.END])
      // Layout must reach the physical bottom; padB is then the only inset.
      // expandSafeArea only paints; without ignore, the playfield stays short
      // and the pin sits on a mid-screen content box (joint memo SECONDARY).
      // ignore + padB (not raised) ⇒ pin bottom = 底安全区上沿.
      .ignoreLayoutSafeArea([LayoutSafeAreaType.SYSTEM], [LayoutSafeAreaEdge.ALL])
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
    .expandSafeArea([SafeAreaType.SYSTEM, SafeAreaType.CUTOUT],
      [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM, SafeAreaEdge.START, SafeAreaEdge.END])
    .ignoreLayoutSafeArea([LayoutSafeAreaType.SYSTEM], [LayoutSafeAreaEdge.ALL])
    .backgroundColor($r('app.color.tavern_bg'))
    .onAreaChange((_old: Area, area: Area) => {
      this.stackGX = Number(area.globalPosition.x);
      this.stackGY = Number(area.globalPosition.y);
      const w: number = Number(area.width);
      const h: number = Number(area.height);
      this.stackW = w;
      this.stackH = h;
      this.applyBreakpoint(w, h);
      this.logFlushGate('stack');
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
   * L/R: FlexAlign.Center (side-mid). Blank+weight under Start glued them to the
   * top bar (环位偏高 / 左右座贴顶). Top shark stays Start; self stays in bottomBand.
   */
  @Builder
  seatRing() {
    Row() {
      Column() {
        this.seatBlock(TableCompass.LEFT, this.seat3, this.life3, ControlIds.SEAT_P3)
      }
      .width(`${TableBreakpoints.SIDE_SEAT_PCT}%`)
      .height('100%')
      .justifyContent(FlexAlign.Center)

      Column() {
        this.seatBlock(TableCompass.TOP, this.seat2, this.life2, ControlIds.SEAT_P2)
        Blank()
          .layoutWeight(1)
      }
      .layoutWeight(1)
      .height('100%')

      Column() {
        this.seatBlock(TableCompass.RIGHT, this.seat1, this.life1, ControlIds.SEAT_P1)
      }
      .width(`${TableBreakpoints.SIDE_SEAT_PCT}%`)
      .height('100%')
      .justifyContent(FlexAlign.Center)
    }
    .width('100%')
    .height('100%')
    .padding({
      left: `${this.heartPadPct}%`,
      right: `${this.heartPadPct}%`
    })
  }

  /**
   * R-LAND-2: bust + pile stay a glued pair on dealPileAnchor / lb_cmp_pool.
   * Overlay is the full padded playfield, Alignment.Center — true screen heart
   * (H+V). Must not live in the ring leftover above HAND_RING_GAP (that shifts
   * the pair up/left). Gap compresses leftover under the ring, never the bust.
   */
  @Builder
  tableHeart() {
    Row({ space: 8 }) {
      Image($r('app.media.art_dealer_bust_announce'))
        .id(ControlIds.DEALER)
        .height(`${this.dealerBustPct}%`)
        .constraintSize({
          maxWidth: `${this.dealerBustPct}%`,
          maxHeight: `${this.dealerBustPct}%`
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
    .hitTestBehavior(HitTestMode.Transparent)
  }

  /**
   * Hug pin child of the full-height Bottom overlay (not a hug pin stack).
   * 24% Blank ABOVE the hand, then bottomBand. Child .align(Alignment.Bottom)
   * is required: a 100% Bottom stack WITHOUT this align TopStarts on device
   * (手下大空带 / joint memo PRIMARY). #98 kept this align but cut the
   * parent 100% box — that half-fix flew the band to 桌心. Keep BOTH.
   * FlexAlign.End: if a parent still stretches this Column, leftover stays
   * ABOVE the Blank, never under lb_cmp_hand. Gap is never a spacer under
   * the cards. No HAND_BAND_VP.
   */
  @Builder
  handPin() {
    Column() {
      Blank()
        .width('100%')
        .height(this.handRingGapVp())
        .hitTestBehavior(HitTestMode.Default)
        .onClick(() => {
          this.clearHandSelect();
        })
      this.bottomBand()
    }
    .width('100%')
    .justifyContent(FlexAlign.End)
    .align(Alignment.Bottom)
    .hitTestBehavior(HitTestMode.Transparent)
  }

  /**
   * Hangpoint 1: selfDock is a left independent slot. Matching right inset
   * keeps lb_cmp_hand on the desktop mid-line. No BottomStart overlay on cards.
   * 11 flush / joint memo: 钉层底边 = 底安全区上沿 (padB inset only; 禁加大 padB).
   * HAND_RING_GAP 24% is the sibling above this band — never under lb_cmp_hand.
   * Parent Column hugs content (no HAND_BAND_VP / 100% stretch / Center).
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
    .onAreaChange((_old: Area, area: Area) => {
      this.captureFlushBand(area);
    })
  }

  /** Full mid-band hand: count stretches L/R only. Sits on safe-area top edge. */
  @Builder
  handRow() {
    Stack({ alignContent: Alignment.Bottom }) {
      Row({ space: 6 }) {
        ForEach(this.cardBacks, (idx: number) => {
          CardFace({
            rank: this.rankAt(idx),
            faceUp: this.cardFaceUp(idx),
            selected: this.cardSelected(idx),
            compact: true,
            failTick: this.failTickAt(idx),
            instanceId: `lb_cmp_card_${idx}`
          })
            .gesture(
              GestureGroup(GestureMode.Exclusive,
                TapGesture({ count: 1 })
                  .onAction(() => {
                    this.onCardTap(idx);
                  }),
                LongPressGesture({ duration: 200, repeat: false })
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
    }
    .layoutWeight(1)
    .width('100%')
    .height($r('app.float.card_h'))
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
        LifeCandles({
          lives: this.life0,
          groupId: ControlIds.LIFE_SELF,
          compact: false,
          small: this.compactLife
        })
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

  @Builder
  playHintToast() {
    Column() {
      if (this.hintKind === 1) {
        Text($r('app.string.lb_str_play_not_your_turn'))
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.caption_text_size'))
      } else if (this.hintKind === 2) {
        Text($r('app.string.lb_str_play_over_select'))
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.caption_text_size'))
      } else if (this.hintKind === 3) {
        Text($r('app.string.lb_str_play_illegal_count'))
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.caption_text_size'))
      }
    }
    .padding({
      left: 12,
      right: 12,
      top: 6,
      bottom: 6
    })
    .backgroundColor($r('app.color.tavern_panel'))
    .borderRadius(8)
    .align(Alignment.Bottom)
    .margin({ bottom: 72 })
    .hitTestBehavior(HitTestMode.None)
  }

  /**
   * 14b R-LIFE-5. Debug/dev only (caller gates on DebugBuild.lifeDecShown).
   * Steady state: one 28～32vp lb_btn_debug_open. −1 lives only in the panel.
   * Click entry again or the dim to close. Release: nothing mounted.
   * Does not change padB / HAND_RING_GAP / challenge / lives_default.
   */
  @Builder
  debugLifeChrome() {
    Stack({ alignContent: Alignment.TopEnd }) {
      if (this.debugLifeOpen) {
        Column()
          .width('100%')
          .height('100%')
          .onClick(() => {
            this.debugLifeOpen = false;
          })
      }
      Column({ space: 6 }) {
        Stack({ alignContent: Alignment.Center }) {
          Text($r('app.string.lb_str_debug_open'))
            .fontColor($r('app.color.tavern_paper'))
            .fontSize($r('app.float.caption_text_size'))
        }
        .id(ControlIds.DEBUG_OPEN)
        .width($r('app.float.debug_open_size'))
        .height($r('app.float.debug_open_size'))
        .backgroundColor($r('app.color.tavern_panel'))
        .borderRadius(6)
        .onClick(() => {
          this.debugLifeOpen = !this.debugLifeOpen;
        })
        if (this.debugLifeOpen) {
          this.debugLifePanel()
        }
      }
      .alignItems(HorizontalAlign.End)
      .margin({ top: 2, right: 4 })
    }
    .width('100%')
    .height('100%')
    .hitTestBehavior(this.debugLifeOpen ? HitTestMode.Default : HitTestMode.Transparent)
    .zIndex(20)
  }

  @Builder
  debugLifePanel() {
    Column({ space: 6 }) {
      Row({ space: 6 }) {
        this.debugSeatChip(0, 'self')
        this.debugSeatChip(1, 'p1')
        this.debugSeatChip(2, 'p2')
        this.debugSeatChip(3, 'p3')
      }
      Text($r('app.string.lb_str_debug_life_dec'))
        .id(ControlIds.DEBUG_LIFE_DEC)
        .fontColor($r('app.color.tavern_shadow'))
        .fontSize($r('app.float.caption_text_size'))
        .padding({
          left: 10,
          right: 10,
          top: 4,
          bottom: 4
        })
        .backgroundColor($r('app.color.tavern_accent'))
        .borderRadius(6)
        .onClick(() => {
          this.onDebugLifeDec();
        })
    }
    .id(ControlIds.DEBUG_LIFE)
    .padding(8)
    .backgroundColor($r('app.color.tavern_panel'))
    .borderRadius(8)
  }

  @Builder
  debugSeatChip(seatId: number, label: string) {
    Text(label)
      .fontColor(this.debugSeatId === seatId ? $r('app.color.tavern_accent') : $r('app.color.tavern_mute'))
      .fontSize($r('app.float.caption_text_size'))
      .onClick(() => {
        this.debugSeatId = seatId;
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
          .fontColor(this.playEnabled ? $r('app.color.tavern_mute') : $r('app.color.tavern_mute'))
          .fontSize($r('app.float.caption_text_size'))
          .onClick(() => {
            this.openSecondaryPlaySheet();
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
  seatBlock(seatId: number, name: string, life: number, id: string) {
    if (TableCompass.isTop(seatId)) {
      Row({ space: 6 }) {
        this.seatAvatar(seatId, id)
        Column({ space: 1 }) {
          Text(name)
            .fontColor(this.turnSeat === seatId ? $r('app.color.tavern_accent') : $r('app.color.tavern_paper'))
            .fontSize($r('app.float.caption_text_size'))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          if (name.length > 0) {
            LifeCandles({
              lives: life,
              groupId: this.lifeIdOf(seatId),
              compact: true,
              small: this.compactLife
            })
          }
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
        if (name.length > 0) {
          LifeCandles({
            lives: life,
            groupId: this.lifeIdOf(seatId),
            compact: true,
            small: this.compactLife
          })
        }
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
    this.logFlushGate('pad');
  }

  /** HAND_RING_GAP 24% of the padded playfield. Not % of the hug wrap. */
  private handRingGapVp(): number {
    return TableBreakpoints.handRingGapVp(this.playH, this.stackH, this.padT, this.padB);
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
    const nextSmall: boolean = TableBreakpoints.isLSmall(w, h);
    if (this.dealerBustPct !== nextBust) {
      this.dealerBustPct = nextBust;
    }
    if (this.heartPadPct !== nextHeart) {
      this.heartPadPct = nextHeart;
    }
    if (this.compactLife !== nextSmall) {
      this.compactLife = nextSmall;
    }
    this.applyInsetFloors();
  }

  private onDebugLifeDec(): void {
    if (!DebugBuild.lifeDecShown()) {
      return;
    }
    const ok: boolean = AppRuntime.engine.debugDecLife(this.debugSeatId);
    if (!ok) {
      Logger.info(TAG, `debug life dec skipped seat=${this.debugSeatId}`);
      return;
    }
    this.lastHudStamp = '';
    this.pull();
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
    SoundPlayer.setSilent(snap.silentMode);
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
    const nextPlay: boolean = humanTurn && snap.hasCards &&
      (snap.phase === Phase.TURN || snap.phase === Phase.PLAY_REVEAL_SELF) &&
      snap.turnWindow !== TurnWindow.CHALLENGE_ONLY;
    if (this.playEnabled !== nextPlay) {
      this.playEnabled = nextPlay;
    }
    const nextSkip: boolean = humanTurn && snap.phase === Phase.TURN &&
      (snap.turnWindow === TurnWindow.CHALLENGE_ONLY || !snap.hasCards);
    if (this.skipEnabled !== nextSkip) {
      this.skipEnabled = nextSkip;
    }
    if (this.silentHud !== snap.silentMode) {
      this.silentHud = snap.silentMode;
    }
    const keepSelect: boolean = nextPlay;
    if (!keepSelect && this.selectedIds.length > 0) {
      this.selectedIds = [];
    }
    // 15: sheet is secondary — do not auto-open on PLAY_REVEAL_SELF.
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
    const l0: number = this.lifeOf(seats, 0);
    const l1: number = this.lifeOf(seats, 1);
    const l2: number = this.lifeOf(seats, 2);
    const l3: number = this.lifeOf(seats, 3);
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

  private lifeOf(seats: SeatModel[], id: number): number {
    for (let i = 0; i < seats.length; i++) {
      if (seats[i].seatId === id) {
        return seats[i].lives;
      }
    }
    return 0;
  }

  private lifeIdOf(seatId: number): string {
    if (seatId === TableCompass.RIGHT) {
      return ControlIds.LIFE_SEAT_P1;
    }
    if (seatId === TableCompass.TOP) {
      return ControlIds.LIFE_SEAT_P2;
    }
    if (seatId === TableCompass.LEFT) {
      return ControlIds.LIFE_SEAT_P3;
    }
    return ControlIds.LIFE_SELF;
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
    const ok: boolean = this.playEnabled &&
      this.selectedIds.length >= snap.config.min_play_cards &&
      this.selectedIds.length <= snap.config.max_play_cards;
    if (this.confirmEnabled !== ok) {
      this.confirmEnabled = ok;
    }
    const barOn: boolean = ok && !this.showPlay && !this.confirmBusy &&
      snap.phase === Phase.TURN;
    if (this.confirmBarOn !== barOn) {
      this.confirmBarOn = barOn;
    }
  }

  private confirmPlay(): void {
    let style: PlayStyle = PlayStyle.SOFT;
    if (this.styleName === PlayStyle.SLAM) {
      style = PlayStyle.SLAM;
    } else if (this.styleName === PlayStyle.HESITATE) {
      style = PlayStyle.HESITATE;
    }
    this.noteSfx(SfxIds.PLAY_CONFIRM);
    AppRuntime.engine.submitPlay(this.selectedIds, style, '', this.namedSeatId);
    this.showPlay = false;
    this.selectedIds = [];
    this.namedSeatId = -1;
    this.confirmBusy = false;
    this.pull();
  }

  /** 15 primary submit: table confirm bar. Default SOFT. Does not open sheet. */
  private confirmTablePlay(): void {
    const snap: MatchSnapshot | null = AppRuntime.engine.current();
    if (snap === null || this.confirmBusy) {
      return;
    }
    if (!this.playEnabled) {
      this.flashHint(1);
      return;
    }
    if (this.selectedIds.length < snap.config.min_play_cards ||
      this.selectedIds.length > snap.config.max_play_cards) {
      this.flashHint(3);
      return;
    }
    this.confirmBusy = true;
    this.confirmBarOn = false;
    this.noteSfx(SfxIds.PLAY_CONFIRM);
    AppRuntime.engine.submitPlay(this.selectedIds, PlayStyle.SOFT, '', -1);
    this.selectedIds = [];
    this.confirmBusy = false;
    this.pull();
  }

  private openSecondaryPlaySheet(): void {
    if (!this.playEnabled) {
      return;
    }
    AppRuntime.engine.intentPlay();
    this.showPlay = true;
    const snap: MatchSnapshot | null = AppRuntime.engine.current();
    if (snap !== null) {
      this.refreshPlayMeta(snap);
    }
    this.pull();
  }

  private cardFaceUp(idx: number): boolean {
    if (this.showPeek) {
      return true;
    }
    return this.cardSelected(idx);
  }

  private cardSelected(idx: number): boolean {
    if (idx < 0 || idx >= this.selfCards.length) {
      return false;
    }
    return this.hasSelected(this.selfCards[idx].cardId);
  }

  private failTickAt(idx: number): number {
    if (idx === this.failIdx) {
      return this.failGen;
    }
    return 0;
  }

  private hasSelected(cardId: string): boolean {
    for (let i = 0; i < this.selectedIds.length; i++) {
      if (this.selectedIds[i] === cardId) {
        return true;
      }
    }
    return false;
  }

  private onCardTap(idx: number): void {
    if (this.dealPlaying || this.showPeek || this.confirmBusy) {
      return;
    }
    const snap: MatchSnapshot | null = AppRuntime.engine.current();
    if (snap === null || snap.phase === Phase.DEAL || snap.phase === Phase.CLAIM) {
      return;
    }
    if (!this.playEnabled) {
      this.flashHint(1);
      return;
    }
    if (idx < 0 || idx >= this.selfCards.length) {
      return;
    }
    const cardId: string = this.selfCards[idx].cardId;
    if (this.hasSelected(cardId)) {
      this.removeSelect(cardId);
      this.refreshPlayMeta(snap);
      return;
    }
    if (this.selectedIds.length >= snap.config.max_play_cards) {
      this.failIdx = idx;
      this.failGen = this.failGen + 1;
      this.flashHint(2);
      return;
    }
    const next: string[] = [];
    for (let i = 0; i < this.selectedIds.length; i++) {
      next.push(this.selectedIds[i]);
    }
    next.push(cardId);
    this.selectedIds = next;
    // lb_sfx_card_flip kicks off in CardFace.playFlip (same animateTo), not here.
    this.noteSfx(SfxIds.CARD_SELECT);
    this.refreshPlayMeta(snap);
  }

  private removeSelect(cardId: string): void {
    const next: string[] = [];
    for (let i = 0; i < this.selectedIds.length; i++) {
      if (this.selectedIds[i] !== cardId) {
        next.push(this.selectedIds[i]);
      }
    }
    this.selectedIds = next;
  }

  private clearHandSelect(): void {
    if (this.selectedIds.length === 0) {
      return;
    }
    this.selectedIds = [];
    const snap: MatchSnapshot | null = AppRuntime.engine.current();
    if (snap !== null) {
      this.refreshPlayMeta(snap);
    } else if (this.confirmBarOn) {
      this.confirmBarOn = false;
    }
  }

  /** 1=非己回合 2=超选 3=张数不符 */
  private flashHint(kind: number): void {
    this.hintKind = kind;
    if (this.hintTimer >= 0) {
      clearTimeout(this.hintTimer);
    }
    this.hintTimer = setTimeout((): void => {
      this.hintTimer = -1;
      this.hintKind = 0;
    }, 800);
  }

  private noteSfx(idName: string): void {
    if (idName === SfxIds.CARD_FLIP) {
      SoundPlayer.playCardFlip();
      return;
    }
    if (idName === SfxIds.LIFE_EXTINGUISH) {
      SoundPlayer.playLifeExtinguish();
      return;
    }
    if (this.silentHud) {
      Logger.info(TAG, `${idName} skipped (silent)`);
      return;
    }
    Logger.info(TAG, `${idName} play`);
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
    if (this.selectedIds.length > 0) {
      this.selectedIds = [];
    }
    if (this.confirmBarOn) {
      this.confirmBarOn = false;
    }
    if (this.confirmEnabled) {
      this.confirmEnabled = false;
    }
    if (this.showPeek) {
      this.showPeek = false;
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
    this.flushHandH = Math.round(Number(area.height));
    this.flushHandGY = Math.round(Number(area.globalPosition.y));
    this.logFlushGate('hand');
  }

  private captureFlushPin(area: Area): void {
    this.flushPinH = Math.round(Number(area.height));
    this.flushPinGY = Math.round(Number(area.globalPosition.y));
    this.logFlushGate('handPin');
  }

  private captureFlushBand(area: Area): void {
    this.flushBandH = Math.round(Number(area.height));
    this.flushBandGY = Math.round(Number(area.globalPosition.y));
    this.logFlushGate('bottomBand');
  }

  /**
   * Temporary flush-gate diagnosis (11 / joint memo). One line when values
   * change: padB, stackH/W, playH, handPin (h+globalY), HAND / band bottomGY.
   * Hangpoint (full-height pin box): pinBottomGY≈safeTopGY, slack≈0.
   * slack>0 ⇒ empty under the hand vs 底安全区上沿 (stackGY+stackH-padB).
   */
  private logFlushGate(src: string): void {
    const handBottom: number = this.flushHandGY + this.flushHandH;
    const pinBottom: number = this.flushPinGY + this.flushPinH;
    const bandBottom: number = this.flushBandGY + this.flushBandH;
    const safeTop: number = Math.round(this.stackGY + this.stackH - this.padB);
    const innerH: number = Math.round(this.stackH - this.padT - this.padB);
    const slack: number = safeTop - handBottom;
    const line: string = `padB=${this.padB} padT=${this.padT} ` +
      `stackW=${Math.round(this.stackW)} stackH=${Math.round(this.stackH)} ` +
      `stackGY=${Math.round(this.stackGY)} playH=${Math.round(this.playH)} innerH=${innerH} ` +
      `pinH=${this.flushPinH} pinGY=${this.flushPinGY} pinBottomGY=${pinBottom} ` +
      `bandH=${this.flushBandH} bandGY=${this.flushBandGY} bandBottomGY=${bandBottom} ` +
      `hand=${ControlIds.HAND} handH=${this.flushHandH} handGY=${this.flushHandGY} ` +
      `handBottomGY=${handBottom} safeTopGY=${safeTop} slack=${slack}`;
    if (this.lastFlushLine === line) {
      return;
    }
    this.lastFlushLine = line;
    Logger.info(FLUSH_TAG, `src=${src} ${line}`);
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
