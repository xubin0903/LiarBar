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
import { ChallengeEntry } from '../features/table/components/ChallengeEntry';
import { EmptySafeEntry } from '../features/table/components/EmptySafeEntry';
import { HammerFx } from '../features/table/components/HammerFx';
import { PlayFly } from '../features/table/components/PlayFly';
import { PlayFrontPile } from '../features/table/components/PlayFrontPile';
import { RevealStage } from '../features/table/components/RevealStage';
import { ChallengeFx } from '../features/table/ChallengeFx';
import { ChoiceActFx } from '../features/table/ChoiceActFx';
import { PlayFlyFx } from '../features/table/PlayFlyFx';
import { PeekMaskOverlay, PlayConfirmBar, PlaySheetOverlay } from '../features/table/TableOverlays';
import { PeekPrivacyAdapter } from '../harmony/PeekPrivacyAdapter';
import { SafeInsets, WindowOrientation } from '../harmony/WindowOrientation';
import { CardModel, MatchSnapshot, SeatModel } from '../engine/MatchTypes';
import { EventKind, Phase, PlayStyle, SeatRole, SeatStatus, TurnWindow } from '../engine/Phase';

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
  /** 17 · in-table AwaitChallenge. Not a new engine phase. */
  @State challengeEntryOn: boolean = false;
  @State challengeCommitBusy: boolean = false;
  /** 20 / #166 · ≥3 EmptySafe3 你/上家. Mutually exclusive with ChallengeEntry. */
  @State emptySafeEntryOn: boolean = false;
  @State challengeRemainSec: number = 10;
  @State challengeTargetPlayId: string = '';
  /** Hang: lb_str_challenge_dealer_enter near dealer banner when AwaitChallenge. */
  @State challengeDealerEnter: string = '';
  /** Hang: lb_str_npc_challenge_thinking/true/false — NPC seat bubble stub. */
  @State npcChallengeBubble: string = '';
  /** 16 · PlayLaunch overlay. Independent of DealFx.flyOn. */
  @State playFlyOn: boolean = false;
  @State playFlyX: number = 0;
  @State playFlyY: number = 0;
  @State playFlyScale: number = 1;
  @State playFlyCount: number = 1;
  @State playFlySeat: number = 0;
  @State pileN0: number = 0;
  @State pileN1: number = 0;
  @State pileN2: number = 0;
  @State pileN3: number = 0;
  @State pileX0: number = 0;
  @State pileY0: number = 0;
  @State pileX1: number = 0;
  @State pileY1: number = 0;
  @State pileX2: number = 0;
  @State pileY2: number = 0;
  @State pileX3: number = 0;
  @State pileY3: number = 0;
  @State hiddenCardIds: string[] = [];
  /** U03b RoundWin tip (hand==0). Not whole-match RankSettle. */
  @State roundWinOn: boolean = false;
  private roundWinTimer: number = -1;
  /** 18 · reveal stage after challenge ACK. */
  @State revealOn: boolean = false;
  @State revealFaceUp: boolean = false;
  @State revealRanks: string[] = [];
  @State revealX: number = 0;
  @State revealY: number = 0;
  @State hintKind: number = 0;
  @State failIdx: number = -1;
  @State failGen: number = 0;
  /** 14b R-LIFE-5: which seat the debug −1 hits. Default self. */
  @State debugSeatId: number = 0;
  /** 14b R-LIFE-5: panel closed = only lb_btn_debug_open. */
  @State debugLifeOpen: boolean = false;
  /** EXP 1: debug panel BGM mute (table AVPlayer only; SFX stay). */
  @State debugBgmMuted: boolean = false;
  /** EXP 3: debug panel renderer vs SoundPool A/B. */
  @State debugSfxRenderer: boolean = true;
  /** EXP 5: debug panel touch-down earlier arm vs playFlip-only. */
  @State debugSfxArm: boolean = true;
  /** #243 · 四座常驻桌槌；choiceActOn = 该座正在抬砸. */
  @State choiceActOn: boolean = false;
  @State choiceActKind: number = 0;
  @State choiceActRot: number = 0;
  @State choiceActLift: number = 0;
  @State choiceActScale: number = 1;
  @State choiceActShake: number = 0;
  @State choiceActFade: number = 1;
  @State malletPosTick: number = 0;
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
  /** Frozen · was revolver eventLog cursor; unused after 废左轮. */
  private heardEventCount: number = 0;
  private heardMatchId: string = '';
  private playFlyPlayId: string = '';
  private playFlyTimer: number = -1;
  private revealTimer: number = -1;
  /** R1′: empty-ranks defer attempts; cap avoids infinite wait. */
  private revealDeferTries: number = 0;
  private challengeTickId: number = -1;
  private challengeDeadlineMs: number = 0;
  private challengeEnterPlayId: string = '';
  private challengeResolvedPlayId: string = '';
  /** F2: one RevealStage run per challengeId (AI+human; ban restart flash). */
  private revealForChallengeId: string = '';
  private npcBubbleTimer: number = -1;
  private challengeDebugReject: boolean = false;
  private choiceActTimer: number = -1;
  private choiceActHideTimer: number = -1;
  private choiceActGen: number = 0;
  private choiceActSeat: number = 0;
  private choiceAwaitSeat: number = -1;
  private choiceAwaitPlayId: string = '';
  private choiceActForChallengeId: string = '';
  private rollbackHand: CardModel[] = [];
  private rollbackSelected: string[] = [];
  private queuedPlayId: string = '';
  private seatWs: number[] = [0, 0, 0, 0];
  private seatHs: number[] = [0, 0, 0, 0];
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
    this.debugBgmMuted = TableAudio.isBgmMuted();
    this.debugSfxRenderer = SoundPlayer.usesRenderer() || SoundPlayer.EXP_USE_RENDERER;
    this.debugSfxArm = SoundPlayer.isArmFlipTouchDown();
    const boot: MatchSnapshot | null = AppRuntime.engine.current();
    if (boot !== null) {
      DealAudio.setSilent(boot.silentMode);
      TableAudio.setSilent(boot.silentMode);
      SoundPlayer.setSilent(boot.silentMode);
    }
    TableAudio.startBgm(TableAudio.BGM_FADE_IN_MS);
    Logger.info('SfxDiag',
      `SfxDiag bgmMute enter-table runtime=${TableAudio.isBgmMuted()} ` +
        `exp=${TableAudio.EXP_MUTE_BGM}`);
    Logger.info('SfxDiag',
      `SfxDiag path enter-table renderer=${SoundPlayer.EXP_USE_RENDERER} ` +
        `runtime=${this.debugSfxRenderer}`);
    Logger.info('SfxDiag',
      `SfxDiag floor enter-table bufMs=93 nativeFast=${SoundPlayer.EXP_USE_NATIVE_OHAUDIO} ` +
        `armFlip=${SoundPlayer.isArmFlipTouchDown()} volFlip=${SoundPlayer.VOL_FLIP}`);
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
    this.debugSfxRenderer = SoundPlayer.usesRenderer();
    this.debugSfxArm = SoundPlayer.isArmFlipTouchDown();
    Logger.info('SfxReady',
      `SfxReady enter-table warm=${SoundPlayer.isWarm()} pending=false deferred=false t=${Date.now()}`);
  }

  aboutToDisappear(): void {
    if (this.pollId >= 0) {
      clearInterval(this.pollId);
      this.pollId = -1;
    }
    this.cancelDealTimers();
    this.cancelPlayFlyTimer();
    this.cancelRoundWinTimer();
    this.cancelRevealTimer();
    this.cancelChallengeTimer();
    this.cancelNpcBubbleTimer();
    this.cancelChoiceActTimer();
    AppRuntime.director.playBusy = false;
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
            .onClick(() => {
              this.clearHandSelect();
            })
          }
          .width('100%')
          .height('100%')
          .justifyContent(FlexAlign.Start)

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

        // 16 play fly + pool hand. Above heart, below confirm bar.
        // Separate from DealFx.flyOn. Do not raise padB / GAP.
        this.playFlyLayer()

        // #243 四座常驻桌槌：头像旁空位；HitTest None；禁挡手牌/确认条/池.
        this.choiceActLayer()

        // 18 reveal dim (bg only) + stage. Same overlay band as play fly.
        this.revealLayer()

        // 15 confirm bar: sibling overlay, BottomEnd, tappable only.
        // Must NOT live in handPin (that would grow the hug and lift cards).
        // Does not change padB / HAND_RING_GAP.
        Stack({ alignContent: Alignment.BottomEnd }) {
          PlayConfirmBar({
            visible: this.confirmBarOn && !this.challengeEntryOn && !this.emptySafeEntryOn,
            confirmEnabled: this.confirmEnabled && !this.confirmBusy,
            onConfirm: () => {
              this.confirmTablePlay();
            }
          })
        }
        .width('100%')
        .height('100%')
        .hitTestBehavior(HitTestMode.Transparent)

        // 17 AwaitChallenge: self-front band (ring–hand HAND_RING_GAP), overlay ≠ handPin.
        // Above lb_cmp_hand inside GAP; NOT BottomEnd-only corner. Align 17 v0.2.1.
        // Must NOT live in handPin (would grow hug / lift cards / raise padB).
        Stack({ alignContent: Alignment.Bottom }) {
          ChallengeEntry({
            visible: this.challengeEntryOn && !this.challengeCommitBusy,
            remainSec: this.challengeRemainSec,
            onDoubt: () => {
              this.onChallengeDoubt();
            },
            onBelieve: () => {
              this.onChallengeBelieve(false);
            }
          })
            .margin({ bottom: this.challengeFrontLiftVp() })
        }
        .id(ControlIds.CHALLENGE_AWAIT)
        .width('100%')
        .height('100%')
        .hitTestBehavior(HitTestMode.Transparent)
        .visibility(this.challengeEntryOn && !this.challengeCommitBusy ?
          Visibility.Visible : Visibility.None)

        // 20 / #166 EmptySafe3: self-front band (same family as ChallengeEntry).
        // Overlay ≠ handPin. ≥3 only; =2 ForceChallenge hides this.
        Stack({ alignContent: Alignment.Bottom }) {
          EmptySafeEntry({
            visible: this.emptySafeEntryOn,
            onYou: () => {
              this.onChooseEmptyYou();
            },
            onPrev: () => {
              this.onChooseEmptyShangjia();
            }
          })
            .margin({ bottom: this.challengeFrontLiftVp() })
        }
        .width('100%')
        .height('100%')
        .hitTestBehavior(HitTestMode.Transparent)
        .visibility(this.emptySafeEntryOn ? Visibility.Visible : Visibility.None)

        // F2: NPC challenge bubble — table-wide shared layer (HitTest None; 自位不用).
        if (this.npcChallengeBubble.length > 0) {
          Text(this.npcChallengeBubble)
            .id(ControlIds.NPC_CHALLENGE_BUBBLE)
            .fontColor($r('app.color.tavern_paper'))
            .fontSize($r('app.float.caption_text_size'))
            .padding({ left: 8, right: 8, top: 4, bottom: 4 })
            .backgroundColor($r('app.color.tavern_panel'))
            .borderRadius(8)
            .align(Alignment.TopEnd)
            .margin({ top: 56, right: 12 })
            .hitTestBehavior(HitTestMode.None)
        }

        if (this.hintKind > 0) {
          this.playHintToast()
        }

        if (this.roundWinOn) {
          this.roundWinBanner()
        }

        if (DebugBuild.lifeDecShown()) {
          this.debugLifeChrome()
        }

        // F3: home exit above fly/reveal/debug chrome so mid-match return works.
        this.homeExitChrome()
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
    // F4 + R6: ALL judge/global announcements → 顶栏左上 TopStart（禁叠桌心/中顶）.
    // claim / whose-turn / challenge-enter / verdict dealerLine → TopStart.
    // Center-top ONLY countdown (lb_txt_timer / challenge ring). F3 home 仍在 homeExitChrome.
    Stack({ alignContent: Alignment.TopStart }) {
      Row() {
        Column({ space: 2 }) {
          Column({ space: 2 }) {
            Text(this.claimText)
              .id(ControlIds.TXT_CLAIM)
              .fontColor($r('app.color.tavern_candle'))
              .fontSize($r('app.float.page_text_size'))
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
              .visibility(this.claimText.length > 0 ? Visibility.Visible : Visibility.None)
            Text(this.dealerLine)
              .id(ControlIds.DEALER_LINE)
              .fontColor($r('app.color.tavern_paper'))
              .fontSize($r('app.float.caption_text_size'))
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
              .visibility(this.dealerLine.length > 0 ? Visibility.Visible : Visibility.None)
            // R6: challenge-enter cue moved off tableHeart (was center) → TopStart.
            Text(this.challengeDealerEnter)
              .id(ControlIds.CHALLENGE_DEALER_ENTER)
              .fontColor($r('app.color.tavern_accent'))
              .fontSize($r('app.float.caption_text_size'))
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
              .visibility(this.challengeDealerEnter.length > 0 ? Visibility.Visible : Visibility.None)
          }
          .id(ControlIds.TABLE_TIP)
          .alignItems(HorizontalAlign.Start)
        }
        .id(ControlIds.DEALER_BANNER)
        .alignItems(HorizontalAlign.Start)
        .constraintSize({ maxWidth: '42%' })
        .layoutWeight(1)

        Blank()
          .layoutWeight(1)

        this.weakCta()
        // F3: lb_btn_home in homeExitChrome (above overlays). Spacer keeps balance.
        Blank()
          .width(48)
          .height(1)
          .margin({ left: 8 })
      }
      .width('100%')
      .alignItems(VerticalAlign.Top)

      // R6: center-top ONLY countdown — turn seconds or AwaitChallenge ring/seconds.
      // Ban stacking announcement text here.
      Column({ space: 2 }) {
        if (this.challengeEntryOn && !this.challengeCommitBusy) {
          this.challengeCenterTopTimer()
        } else {
          Text(this.timerText)
            .id('lb_txt_timer')
            .fontColor($r('app.color.tavern_accent'))
            .fontSize($r('app.float.page_text_size'))
        }
      }
      .width('100%')
      .alignItems(HorizontalAlign.Center)
      .hitTestBehavior(HitTestMode.None)
    }
    .id(ControlIds.TOPBAR)
    .width('100%')
    .constraintSize({ maxHeight: '12%' })
  }

  /** R6 · AwaitChallenge 10s ring/seconds at screen center-top only. */
  @Builder
  challengeCenterTopTimer() {
    Stack({ alignContent: Alignment.Center }) {
      Column()
        .id(ControlIds.CHALLENGE_RING)
        .width(ChallengeFx.RING_VP)
        .height(ChallengeFx.RING_VP)
        .borderRadius(ChallengeFx.RING_VP / 2)
        .border({
          width: 3,
          color: $r('app.color.tavern_accent')
        })
      Text(`${this.challengeRemainSec}`)
        .id('lb_txt_timer')
        .fontColor($r('app.color.tavern_candle'))
        .fontSize($r('app.float.caption_text_size'))
    }
    .id(ControlIds.CHALLENGE_TIMER)
    .width(ChallengeFx.RING_VP)
    .height(ChallengeFx.RING_VP)
    .hitTestBehavior(HitTestMode.None)
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
        this.seatBlock(TableCompass.LEFT, this.seat3, ControlIds.SEAT_P3)
      }
      .width(`${TableBreakpoints.SIDE_SEAT_PCT}%`)
      .height('100%')
      .justifyContent(FlexAlign.Center)

      Column() {
        this.seatBlock(TableCompass.TOP, this.seat2, ControlIds.SEAT_P2)
        Blank()
          .layoutWeight(1)
      }
      .layoutWeight(1)
      .height('100%')

      Column() {
        this.seatBlock(TableCompass.RIGHT, this.seat1, ControlIds.SEAT_P1)
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
    Column({ space: 6 }) {
      // F4+R6: claim / whose-turn / challenge-enter / judge lines → topBar TopStart.
      // Ban announcement text at center (covers pool / stacks on center-top timer).
      // Pool hand (PLAY_POOL_HAND) stays visible during AwaitChallenge (R5).
      Row({ space: 8 }) {
        Image($r('app.media.art_dealer_bust_announce'))
          .id(ControlIds.DEALER)
          .height(`${this.dealerBustPct}%`)
          .constraintSize({
            maxWidth: `${this.dealerBustPct}%`,
            maxHeight: `${this.dealerBustPct}%`
          })
          .objectFit(ImageFit.Contain)
        Stack({ alignContent: Alignment.Center }) {
          Image($r('app.media.art_pool_slot'))
            .id('lb_cmp_pool')
            .width(DealFx.PILE_SLOT_W)
            .height(DealFx.PILE_SLOT_H)
          if (this.pileOn) {
            this.dealPileStack()
          }
          // 16 v0.2.0: pool round-hand stack-local on lb_cmp_pool (not overlay abs).
          // Edge ≥10vp via PlayFlyFx.fanOffset. Persists until challenge/reveal clears.
          PlayFrontPile({
            visible: this.pileN0 > 0,
            count: this.pileN0,
            seatId: TableCompass.BOTTOM,
            x: 0,
            y: 0,
            instanceId: ControlIds.PLAY_POOL_HAND,
            anchored: true
          })
        }
        .id('dealPileAnchor')
        .width(DealFx.PILE_SLOT_W)
        .height(DealFx.PILE_SLOT_H)
        .onAreaChange((_old: Area, area: Area) => {
          this.capturePile(area);
        })
        // F16-2: ban count digits next to pool (edge-fan reads 1/2/3).
      }
      .justifyContent(FlexAlign.Center)
      .alignItems(VerticalAlign.Center)
      .layoutWeight(1)
      .width('100%')
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
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
          if (this.cardHiddenAt(idx)) {
            Blank()
              .width($r('app.float.card_w'))
              .height($r('app.float.card_h'))
          } else {
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
              .onTouch((event: TouchEvent) => {
                this.onCardFlipTouch(idx, event);
              })
          }
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
        // F5: lb_cmp_life_self_frame must fully enclose 3 candles incl. flames.
        Column() {
          LifeCandles({
            lives: this.life0,
            groupId: ControlIds.LIFE_SELF,
            compact: false,
            small: this.compactLife
          })
        }
        .id(ControlIds.LIFE_SELF_FRAME)
        .padding({ left: 4, right: 4, top: 8, bottom: 3 })
        .border({
          width: 1,
          color: $r('app.color.tavern_paper')
        })
        .borderRadius(6)
        .clip(false)
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
      } else if (this.hintKind === 4) {
        Text($r('app.string.lb_str_play_rollback'))
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.caption_text_size'))
      } else if (this.hintKind === 5) {
        Text($r('app.string.lb_str_challenge_reject'))
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
    .align(Alignment.Center)
    .margin({ top: 48 })
    .hitTestBehavior(HitTestMode.None)
  }

  /**
   * F3: mid-match return. Dedicated TopEnd chrome above fly/reveal/debug (zIndex 40).
   * Do not leave lb_btn_home under full-screen Transparent/Default overlays.
   * Does not change padB / HAND_RING_GAP.
   */
  @Builder
  homeExitChrome() {
    Stack({ alignContent: Alignment.TopEnd }) {
      Text($r('app.string.lb_str_home'))
        .id(ControlIds.HOME)
        .fontColor($r('app.color.tavern_mute'))
        .fontSize($r('app.float.caption_text_size'))
        .padding({
          left: 12,
          right: 12,
          top: 8,
          bottom: 8
        })
        .margin({ top: 2, right: 4 })
        .onClick(() => {
          this.goHome();
        })
    }
    .width('100%')
    .height(44)
    .hitTestBehavior(HitTestMode.Transparent)
    .zIndex(40)
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
      // Below topBar / homeExitChrome so debug open does not eat lb_btn_home (F3).
      .margin({ top: 40, right: 4 })
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
      Text(this.debugBgmMuted ? $r('app.string.lb_str_debug_bgm_on') :
        $r('app.string.lb_str_debug_bgm_mute'))
        .id(ControlIds.DEBUG_BGM_MUTE)
        .fontColor($r('app.color.tavern_shadow'))
        .fontSize($r('app.float.caption_text_size'))
        .padding({
          left: 10,
          right: 10,
          top: 4,
          bottom: 4
        })
        .backgroundColor(this.debugBgmMuted ? $r('app.color.tavern_accent') :
          $r('app.color.tavern_mute'))
        .borderRadius(6)
        .onClick(() => {
          this.onDebugBgmMute();
        })
      Text(this.debugSfxRenderer ? $r('app.string.lb_str_debug_sfx_pool') :
        $r('app.string.lb_str_debug_sfx_renderer'))
        .id(ControlIds.DEBUG_SFX_PATH)
        .fontColor($r('app.color.tavern_shadow'))
        .fontSize($r('app.float.caption_text_size'))
        .padding({
          left: 10,
          right: 10,
          top: 4,
          bottom: 4
        })
        .backgroundColor(this.debugSfxRenderer ? $r('app.color.tavern_accent') :
          $r('app.color.tavern_mute'))
        .borderRadius(6)
        .onClick(() => {
          this.onDebugSfxPath();
        })
      Text(this.debugSfxArm ? $r('app.string.lb_str_debug_sfx_arm_off') :
        $r('app.string.lb_str_debug_sfx_arm_on'))
        .id(ControlIds.DEBUG_SFX_ARM)
        .fontColor($r('app.color.tavern_shadow'))
        .fontSize($r('app.float.caption_text_size'))
        .padding({
          left: 10,
          right: 10,
          top: 4,
          bottom: 4
        })
        .backgroundColor(this.debugSfxArm ? $r('app.color.tavern_accent') :
          $r('app.color.tavern_mute'))
        .borderRadius(6)
        .onClick(() => {
          this.onDebugSfxArm();
        })
      Text($r('app.string.lb_str_debug_play_reject'))
        .id(ControlIds.DEBUG_PLAY_REJECT)
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
          this.onDebugPlayReject();
        })
      Text($r('app.string.lb_str_challenge_reject'))
        .id(ControlIds.DEBUG_CHALLENGE_REJECT)
        .fontColor($r('app.color.tavern_shadow'))
        .fontSize($r('app.float.caption_text_size'))
        .padding({
          left: 10,
          right: 10,
          top: 4,
          bottom: 4
        })
        .backgroundColor($r('app.color.tavern_danger'))
        .borderRadius(6)
        .onClick(() => {
          this.onDebugChallengeReject();
        })
      Text($r('app.string.lb_str_debug_hammer_doubt'))
        .id(ControlIds.DEBUG_HAMMER_DOUBT)
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
          this.onDebugHammerDoubt();
        })
      Text($r('app.string.lb_str_debug_hammer_believe'))
        .id(ControlIds.DEBUG_HAMMER_BELIEVE)
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
          this.onDebugHammerBelieve();
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
      .id(`lb_btn_debug_seat_${seatId}`)
      .fontColor(this.debugSeatId === seatId ? $r('app.color.tavern_shadow') : $r('app.color.tavern_paper'))
      .fontSize($r('app.float.caption_text_size'))
      .padding({
        left: 8,
        right: 8,
        top: 4,
        bottom: 4
      })
      .backgroundColor(this.debugSeatId === seatId ? $r('app.color.tavern_accent') :
        $r('app.color.tavern_mute'))
      .borderRadius(6)
      .onClick(() => {
        this.debugSeatId = seatId;
      })
  }

  /** R-LAND-4: no dual bottom bar. Old lb_btn_challenge weak CTA deleted (C2-6). */
  @Builder
  weakCta() {
    Row({ space: 8 }) {
      if (this.skipEnabled) {
        Text($r('app.string.lb_str_skip'))
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.caption_text_size'))
          .onClick(() => {
            AppRuntime.engine.skip();
            this.pull();
          })
      } else if (!this.showPlay && !this.challengeEntryOn && !this.emptySafeEntryOn) {
        Text($r('app.string.lb_str_play'))
          .id(ControlIds.PLAY)
          .fontColor($r('app.color.tavern_mute'))
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
  seatBlock(seatId: number, name: string, id: string) {
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
              // F1: bind parent @State directly — @Builder param `life` did not
              // refresh lb_cmp_life_seat_p* / extinguish Watch (self-only deduct).
              lives: seatId === TableCompass.RIGHT ? this.life1 :
                (seatId === TableCompass.TOP ? this.life2 :
                  (seatId === TableCompass.LEFT ? this.life3 : this.life0)),
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
            // F1: bind parent @State directly — @Builder param `life` did not
            // refresh lb_cmp_life_seat_p* / extinguish Watch (self-only deduct).
            lives: seatId === TableCompass.RIGHT ? this.life1 :
                (seatId === TableCompass.TOP ? this.life2 :
                  (seatId === TableCompass.LEFT ? this.life3 : this.life0)),
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

  /**
   * 17 v0.2.1 · lift lb_cmp_challenge_entry into self-front ring–hand GAP band.
   * Bottom of overlay = hand bottom; marginBottom clears lb_cmp_hand so entry
   * sits above the hand row (body-front readable). Does not raise padB / change GAP.
   * Fallback 78vp = card_h when hand not yet measured.
   */
  private challengeFrontLiftVp(): number {
    const handH: number = this.flushHandH > 0 ? this.flushHandH : 78;
    return handH + 8;
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

  private onDebugBgmMute(): void {
    if (!DebugBuild.lifeDecShown()) {
      return;
    }
    const next: boolean = !TableAudio.isBgmMuted();
    TableAudio.setBgmMuted(next);
    this.debugBgmMuted = next;
  }

  /** EXP 3 A/B: AudioRenderer (低延迟) vs SoundPool (池播). Hang points stay. */
  private onDebugSfxPath(): void {
    if (!DebugBuild.lifeDecShown()) {
      return;
    }
    const next: boolean = !this.debugSfxRenderer;
    SoundPlayer.setUseRenderer(next);
    this.debugSfxRenderer = next;
  }

  /** EXP 5 A/B: touch-down earlier arm (早起) vs playFlip-only (同起). Flip only. */
  private onDebugSfxArm(): void {
    if (!DebugBuild.lifeDecShown()) {
      return;
    }
    const next: boolean = !this.debugSfxArm;
    SoundPlayer.setArmFlipTouchDown(next);
    this.debugSfxArm = next;
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

  /** F3: system back → same as lb_btn_home. */
  onBackPress(): boolean {
    this.goHome();
    return true;
  }

  private goHome(): void {
    this.resetPlayFlyUi();
    this.resetRevealUi();
    this.revealForChallengeId = '';
    this.retractChoiceAct();
    this.clearChoiceAwait();
    this.choiceActForChallengeId = '';
    this.closeChallengeEntry(false);
    AppRuntime.director.stop();
    AppRuntime.engine.toLobby();
    // Portrait before replace so lobby is not stuck landscape (R-LAND return).
    void this.unlockLobbyThenRoute();
  }

  private async unlockLobbyThenRoute(): Promise<void> {
    try {
      const ctx: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
      await WindowOrientation.lockPortrait(ctx);
    } catch (err) {
      Logger.warn(TAG, 'goHome portrait lock fail-soft');
    }
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
      // C2-6 / C2-7: stay on table. No lb_scr_challenge. No local pile flip.
      // F2: close entry chrome only — do NOT wipe dealer/NPC/reveal broadcast.
      this.closeChallengeEntryChrome();
      this.pushedChallenge = false;
      // F1: still sync seat.lives → candles (AI/human ritual must not freeze HUD).
      this.fillSeats(snap.seats);
      // F2: table-wide dealer announce + NPC doubt bubble + shared RevealStage.
      this.syncChallengeRitualBroadcast(snap);
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
    // 废左轮: no sfx_revolver_* on challenge/penalty/CollectRedeal primary path.
    if (snap.phase === Phase.DEAL) {
      if (stamp !== this.lastHudStamp) {
        this.lastHudStamp = stamp;
        this.applyDealHud(snap);
      }
      this.ensureDealShow(snap);
      return;
    }
    this.applyTimer(snap);
    // Land may share the in-flight stamp; still (re)gate AwaitChallenge / EmptySafe.
    if (snap.phase === Phase.TURN) {
      this.maybePlayChoiceActTrust(snap);
      this.syncEmptySafeEntry(snap);
      this.syncChallengeEntry(snap);
      // F2: AI TrustOrChallenge — dealer enter + thinking bubble table-wide.
      this.syncNpcChallengeAwaitBroadcast(snap);
      this.maybeClearChallengeBroadcast(snap);
    }
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
    // Pool round-hand persists across seat rotation until challenge/reveal
    // clears it. Do NOT clear on playIndexInRound===0 alone (fires too early).
    if (snap.lastPlay === null && !this.playFlyOn && !this.revealOn && !this.roundWinOn) {
      this.clearAllPiles();
      this.challengeResolvedPlayId = '';
      this.challengeEnterPlayId = '';
      this.revealForChallengeId = '';
      this.choiceActForChallengeId = '';
      this.clearChoiceAwait();
      this.clearChallengeBroadcast();
      if (this.hiddenCardIds.length > 0) {
        this.hiddenCardIds = [];
      }
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
    if (this.hiddenCardIds.length === 0 && !this.playFlyOn) {
      this.takeSelfHand(snap.selfHand);
      this.takePeekRanks(this.ranksOf(snap.selfHand));
      this.takeCardBacks(snap.selfHand.length);
    }
    const emptyHand: boolean = snap.selfHand.length === 0 && !this.roundWinOn;
    if (this.handEmpty !== emptyHand) {
      this.handEmpty = emptyHand;
    }
    if (this.turnSeat !== snap.currentSeatId) {
      this.turnSeat = snap.currentSeatId;
      if (this.turnSeat >= 0 && snap.phase === Phase.TURN) {
        TableAudio.playTurnTick();
      }
    }
    const called: number = snap.lastPlay === null ? -1 : snap.lastPlay.namedSeatId;
    if (this.calledSeat !== called) {
      this.calledSeat = called;
    }
    // F16-2: never bind count digits to poolText.
    const nextPool: string = '';
    if (this.poolText !== nextPool) {
      this.poolText = nextPool;
    }
    this.fillSeats(snap.seats);
    this.syncOppStacks(snap.seats);
    this.maybeOtherPlayFly(snap);
    const humanTurn: boolean = this.isHumanTurn(snap);
    // Old weak CTA stays dead. New entry is syncChallengeEntry (C2-6).
    if (this.challengeEnabled) {
      this.challengeEnabled = false;
    }
    const nextPlay: boolean = humanTurn && snap.hasCards &&
      (snap.phase === Phase.TURN || snap.phase === Phase.PLAY_REVEAL_SELF) &&
      snap.turnWindow !== TurnWindow.CHALLENGE_ONLY &&
      snap.turnWindow !== TurnWindow.EMPTY_SAFE &&
      snap.turnWindow !== TurnWindow.FORCE_CHALLENGE &&
      !this.challengeEntryOn && !this.challengeCommitBusy &&
      !this.emptySafeEntryOn;
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
    const emptySafe: string = snap.emptySafePending === true ? '1' : '0';
    const forceEmpty: string = snap.forceChallengeEmpty === true ? '1' : '0';
    return `${snap.phase}|${snap.turnWindow}|${snap.roundIndex}|${snap.playIndexInRound}|` +
      `${snap.currentSeatId}|${snap.canChallenge}|${snap.hasCards}|${snap.silentMode}|` +
      `${snap.dealerLine}|${snap.dealerKey}|${claim}|${pool}|${called}|${human}|` +
      `${emptySafe}|${forceEmpty}|${hand}|${seats}`;
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
      !this.challengeEntryOn && !this.challengeCommitBusy &&
      !this.emptySafeEntryOn &&
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
    this.beginHumanPlay(style, this.namedSeatId);
    this.showPlay = false;
  }

  /** 15 primary submit: table confirm bar. Default SOFT. Does not open sheet. */
  private confirmTablePlay(): void {
    this.beginHumanPlay(PlayStyle.SOFT, -1);
  }

  /**
   * 16 U01: confirm → instant PlayLaunch + launch SFX + SUBMIT_PLAY same frame.
   * Land does not submit. confirmBusy swallows a second confirm.
   */
  private beginHumanPlay(style: PlayStyle, namedSeatId: number): void {
    const snap: MatchSnapshot | null = AppRuntime.engine.current();
    if (snap === null || this.confirmBusy || this.challengeEntryOn || this.challengeCommitBusy ||
      this.emptySafeEntryOn) {
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
    AppRuntime.director.playBusy = true;
    this.confirmBarOn = false;
    this.cancelRoundWinTimer();
    this.roundWinOn = false;
    this.rollbackHand = this.copyCards(this.selfCards);
    this.rollbackSelected = this.copyIds(this.selectedIds);
    this.hiddenCardIds = this.copyIds(this.selectedIds);
    this.playFlyCount = this.selectedIds.length;
    this.playFlySeat = TableCompass.BOTTOM;
    this.noteSfx(SfxIds.PLAY_CONFIRM);
    TableAudio.playPlayLaunch();
    this.kickPlayFly(TableCompass.BOTTOM, this.selectedIds.length);
    const ok: boolean = AppRuntime.engine.submitPlay(this.selectedIds, style, '', namedSeatId);
    if (!ok) {
      this.onPlayRollback();
      return;
    }
    const after: MatchSnapshot | null = AppRuntime.engine.current();
    if (after !== null && after.lastPlay !== null) {
      this.playFlyPlayId = after.lastPlay.playId;
    }
    this.selectedIds = [];
    this.namedSeatId = -1;
  }

  private openSecondaryPlaySheet(): void {
    if (!this.playEnabled || this.challengeEntryOn || this.challengeCommitBusy ||
      this.emptySafeEntryOn) {
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
    if (this.dealPlaying || this.showPeek || this.confirmBusy ||
      this.challengeEntryOn || this.challengeCommitBusy || this.emptySafeEntryOn) {
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
    // Visual still CardFace.playFlip. Audio may already be armed from Down.
    this.noteSfx(SfxIds.CARD_SELECT);
    this.refreshPlayMeta(snap);
  }

  /**
   * EXP 5: arm flip SFX on Down when this press will become a tap-select flip.
   * Overlaps bufMs≈93 with press→Watch/animateTo. Deselect / over-select /
   * peek-already-open / not-your-turn do not arm. LongPress peek also starts
   * at Down on an unselected card — 92ms punch may fire; peek opens at 200ms.
   * T0=touchDown; playFlip stays the visual kickoff (T2 from visual).
   */
  private onCardFlipTouch(idx: number, event: TouchEvent): void {
    if (event.type !== TouchType.Down) {
      return;
    }
    if (!this.canArmFlipTouch(idx)) {
      return;
    }
    SoundPlayer.armCardFlipTouchDown();
  }

  private canArmFlipTouch(idx: number): boolean {
    if (!SoundPlayer.isArmFlipTouchDown()) {
      return false;
    }
    if (this.dealPlaying || this.showPeek || this.confirmBusy ||
      this.challengeEntryOn || this.challengeCommitBusy || this.emptySafeEntryOn) {
      return false;
    }
    const snap: MatchSnapshot | null = AppRuntime.engine.current();
    if (snap === null || snap.phase === Phase.DEAL || snap.phase === Phase.CLAIM) {
      return false;
    }
    if (!this.playEnabled) {
      return false;
    }
    if (idx < 0 || idx >= this.selfCards.length) {
      return false;
    }
    const cardId: string = this.selfCards[idx].cardId;
    if (this.hasSelected(cardId)) {
      return false;
    }
    if (this.selectedIds.length >= snap.config.max_play_cards) {
      return false;
    }
    return true;
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

  /** 1=非己回合 2=超选 3=张数不符 4=出牌未生效 / 张数已纠正 5=质疑未生效 */
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
    this.closeChallengeEntry(false);
    if (this.emptySafeEntryOn) {
      this.emptySafeEntryOn = false;
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
    this.resetPlayFlyUi();
  }

  /**
   * 13 §5.2 rebound: style peak + named stare on PlayLanded, not commit.
   * Call from onPlayLanded only — pull() must not fire this on submit.
   */
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

  /**
   * Frozen · 废左轮 (#176/#177): do not play sfx_revolver_* on SHOOT/COLLECT_REDEAL.
   * Assets may remain unused; candle extinguish is lives primary SFX.
   */
  private hearRevolverEvents(snap: MatchSnapshot): void {
    // Frozen · 废左轮: intentionally unused; keep signature for bisect.
    if (snap.matchId.length < 0) {
      return;
    }
  }

  @Builder
  choiceActLayer() {
    Stack() {
      this.residentMallet(TableCompass.BOTTOM)
      this.residentMallet(TableCompass.RIGHT)
      this.residentMallet(TableCompass.TOP)
      this.residentMallet(TableCompass.LEFT)
    }
    .id(ControlIds.CHOICE_ACT)
    .width('100%')
    .height('100%')
    .hitTestBehavior(HitTestMode.None)
  }

  @Builder
  residentMallet(seatId: number) {
    HammerFx({
      visible: true,
      seatId: seatId,
      kind: this.malletKindOf(seatId),
      x: this.malletXOf(seatId),
      y: this.malletYOf(seatId),
      rot: this.malletRotOf(seatId),
      lift: this.malletLiftOf(seatId),
      scale: this.malletScaleOf(seatId),
      shake: this.malletShakeOf(seatId),
      fade: 1
    })
  }

  @Builder
  playFlyLayer() {
    Stack() {
      // Pool hand lives on dealPileAnchor (stack-local). Fly only here.
      PlayFly({
        visible: this.playFlyOn,
        count: this.playFlyCount,
        x: this.playFlyX,
        y: this.playFlyY,
        flyScale: this.playFlyScale
      })
    }
    .width('100%')
    .height('100%')
    // F3: always Transparent — Default while flying ate lb_btn_home taps.
    .hitTestBehavior(HitTestMode.Transparent)
  }

  @Builder
  revealLayer() {
    // F2 / 18: lb_cmp_reveal_stage = table-wide shared overlay (ban actor-only flash).
    Stack() {
      if (this.revealOn) {
        // Dim + blur BACKGROUND only — not applied to RevealStage cards.
        Column()
          .width('100%')
          .height('100%')
          .backgroundColor('rgba(0, 0, 0, 0.40)')
          .blur(PlayFlyFx.REVEAL_BLUR_VP)
          .hitTestBehavior(HitTestMode.None)
        RevealStage({
          visible: this.revealOn,
          ranks: this.revealRanks,
          faceUp: this.revealFaceUp,
          x: this.revealX,
          y: this.revealY,
          revealScale: PlayFlyFx.REVEAL_SCALE
        })
      }
    }
    .width('100%')
    .height('100%')
    .hitTestBehavior(HitTestMode.Transparent)
  }

  @Builder
  roundWinBanner() {
    Column() {
      Text($r('app.string.lb_str_round_win'))
        .fontColor($r('app.color.tavern_candle'))
        .fontSize($r('app.float.page_text_size'))
    }
    .id(ControlIds.ROUND_WIN)
    .padding({
      left: 16,
      right: 16,
      top: 8,
      bottom: 8
    })
    .backgroundColor($r('app.color.tavern_panel'))
    .borderRadius(8)
    .align(Alignment.Center)
    .hitTestBehavior(HitTestMode.None)
  }

  private kickPlayFly(seatId: number, count: number): void {
    this.cancelPlayFlyTimer();
    // Pool = this-round this-hand only; clear prior fan before new launch.
    this.pileN0 = 0;
    const start: number[] = this.playOriginOf(seatId);
    const dest: number[] = this.playDestOf(seatId, count);
    this.playFlySeat = seatId;
    this.playFlyCount = count;
    this.playFlyX = start[0];
    this.playFlyY = start[1];
    this.playFlyScale = 1;
    this.playFlyOn = true;
    const opt: AnimateParam = {
      duration: PlayFlyFx.FLY_MS,
      curve: Curve.EaseOut
    };
    animateTo(opt, (): void => {
      this.playFlyX = dest[0];
      this.playFlyY = dest[1];
    });
    this.playFlyTimer = setTimeout((): void => {
      this.playFlyTimer = -1;
      this.onPlayLanded();
    }, PlayFlyFx.FLY_MS);
  }

  private onPlayLanded(): void {
    this.playFlyOn = false;
    const dest: number[] = this.playDestOf(this.playFlySeat, this.playFlyCount);
    this.setPile(this.playFlySeat, this.playFlyCount, dest[0], dest[1]);
    TableAudio.playPlayLand();
    const snap: MatchSnapshot | null = AppRuntime.engine.current();
    if (snap !== null) {
      this.hearLastPlay(snap);
    }
    this.confirmBusy = false;
    AppRuntime.director.playBusy = false;
    if (snap !== null) {
      const left: number = this.handCountOf(snap.seats, this.playFlySeat);
      if (left === 0) {
        // HandEmptyGate primary: EmptySafeEntry (≥3) / FORCE_CHALLENGE (=2).
        // RoundWin→RedealAll is NOT primary (废旧 L7 / #164).
        this.closeChallengeEntry(false);
        this.syncEmptySafeEntry(snap);
        if (this.isForceChallengeEmpty(snap)) {
          this.syncChallengeEntry(snap);
        }
      } else {
        this.refreshPlayMeta(snap);
        // Challenger seat front: self = ChallengeEntry in ring–hand GAP when canChallenge.
        this.syncChallengeEntry(snap);
      }
    }
    this.pull();
    if (!this.roundWinOn && !this.emptySafeEntryOn) {
      this.flushQueuedPlay();
    }
  }

  /** 16 onPlayRollback: drop fly + pile, restore hand, one key toast. */
  private onPlayRollback(): void {
    this.cancelPlayFlyTimer();
    this.playFlyOn = false;
    this.clearPile(this.playFlySeat);
    this.cancelRoundWinTimer();
    this.roundWinOn = false;
    this.takeSelfHand(this.rollbackHand);
    this.takePeekRanks(this.ranksOf(this.rollbackHand));
    this.takeCardBacks(this.rollbackHand.length);
    this.hiddenCardIds = [];
    this.selectedIds = this.copyIds(this.rollbackSelected);
    this.confirmBusy = false;
    AppRuntime.director.playBusy = false;
    this.playFlyPlayId = '';
    AppRuntime.engine.rollbackLastPlay();
    this.flashHint(4);
    const snap: MatchSnapshot | null = AppRuntime.engine.current();
    if (snap !== null) {
      this.refreshPlayMeta(snap);
    }
    this.pull();
  }

  private maybeOtherPlayFly(snap: MatchSnapshot): void {
    if (snap.lastPlay === null || snap.playIndexInRound <= 0) {
      return;
    }
    const playId: string = snap.lastPlay.playId;
    if (playId === this.playFlyPlayId || playId === this.heardPlayId) {
      return;
    }
    if (this.playFlyOn || this.confirmBusy) {
      this.queuedPlayId = playId;
      return;
    }
    this.beginOtherPlay(snap);
  }

  private beginOtherPlay(snap: MatchSnapshot): void {
    if (snap.lastPlay === null) {
      return;
    }
    this.confirmBusy = true;
    AppRuntime.director.playBusy = true;
    this.playFlyPlayId = snap.lastPlay.playId;
    this.playFlyCount = snap.lastPlay.count;
    this.playFlySeat = snap.lastPlay.actorSeatId;
    this.cancelRoundWinTimer();
    this.roundWinOn = false;
    TableAudio.playPlayLaunch();
    this.kickPlayFly(snap.lastPlay.actorSeatId, snap.lastPlay.count);
  }

  private flushQueuedPlay(): void {
    if (this.queuedPlayId.length === 0) {
      return;
    }
    const snap: MatchSnapshot | null = AppRuntime.engine.current();
    if (snap === null || snap.lastPlay === null || snap.lastPlay.playId !== this.queuedPlayId) {
      this.queuedPlayId = '';
      return;
    }
    this.queuedPlayId = '';
    this.beginOtherPlay(snap);
  }

  private playOriginOf(seatId: number): number[] {
    if (seatId === TableCompass.BOTTOM) {
      let slot: number = 0;
      for (let i = 0; i < this.selfCards.length; i++) {
        if (this.hasHidden(this.selfCards[i].cardId)) {
          slot = i;
          break;
        }
      }
      let x: number = this.handX + slot * (PlayFlyFx.CARD_W + 6);
      if (this.handW <= 0) {
        x = TableBreakpoints.handBandCenterX(this.padL, this.padR, this.stackW) - PlayFlyFx.CARD_W / 2;
      }
      return this.toPlayOverlay(x, this.handY);
    }
    return this.toPlayOverlay(this.seatXs[seatId], this.seatYs[seatId]);
  }

  /**
   * 16 v0.2.0: land at lb_cmp_pool center. Ignore seat front destinations.
   * playFlyLayer sits in the padded playfield — convert stack-local → overlay-local.
   */
  private playDestOf(_seatId: number, count: number): number[] {
    const w: number = PlayFlyFx.pileWidth(count);
    const h: number = PlayFlyFx.pileHeight();
    const mid: number[] = this.poolCenterOverlay();
    return [mid[0] - w / 2, mid[1] - h / 2];
  }

  /** Pool center in playFlyLayer / revealLayer coords (padded overlay). */
  private poolCenterOverlay(): number[] {
    let cx: number = this.pileX + this.pileW / 2;
    let cy: number = this.pileY + this.pileH / 2;
    if (this.pileMeasured) {
      cx = this.pileGX - this.stackGX + this.pileW / 2;
      cy = this.pileGY - this.stackGY + this.pileH / 2;
    }
    return [cx - this.padL, cy - this.padT];
  }

  /** Seat / hand stack-local → padded overlay local. */
  private toPlayOverlay(stackX: number, stackY: number): number[] {
    return [stackX - this.padL, stackY - this.padT];
  }

  /** 16 v0.2.0: single pool hand at pileN0; zero seat piles. */
  private setPile(_seatId: number, count: number, x: number, y: number): void {
    this.pileN0 = count;
    this.pileX0 = x;
    this.pileY0 = y;
    this.pileN1 = 0;
    this.pileN2 = 0;
    this.pileN3 = 0;
  }

  private clearPile(_seatId: number): void {
    this.clearAllPiles();
  }

  private clearAllPiles(): void {
    this.pileN0 = 0;
    this.pileN1 = 0;
    this.pileN2 = 0;
    this.pileN3 = 0;
    this.pileX0 = 0;
    this.pileY0 = 0;
  }

  private resetPlayFlyUi(): void {
    this.cancelPlayFlyTimer();
    this.cancelRevealTimer();
    this.playFlyOn = false;
    this.clearAllPiles();
    this.hiddenCardIds = [];
    this.cancelRoundWinTimer();
    this.roundWinOn = false;
    this.emptySafeEntryOn = false;
    this.playFlyPlayId = '';
    this.queuedPlayId = '';
    this.confirmBusy = false;
    AppRuntime.director.playBusy = false;
    this.resetRevealUi();
    this.retractChoiceAct();
    this.closeChallengeEntry(false);
  }

  private cancelPlayFlyTimer(): void {
    if (this.playFlyTimer >= 0) {
      clearTimeout(this.playFlyTimer);
      this.playFlyTimer = -1;
    }
  }

  private cancelRoundWinTimer(): void {
    if (this.roundWinTimer >= 0) {
      clearTimeout(this.roundWinTimer);
      this.roundWinTimer = -1;
    }
  }

  /** U03b: visible RoundWin tip (1.0s, not skippable) then RedealAll. */
  private startRoundWin(): void {
    this.cancelRoundWinTimer();
    this.roundWinOn = true;
    this.queuedPlayId = '';
    this.closeChallengeEntry(false);
    AppRuntime.engine.beginRoundWin();
    Logger.info(TAG, `RoundWin tip ${PlayFlyFx.ROUND_WIN_MS}ms`);
    this.roundWinTimer = setTimeout((): void => {
      this.roundWinTimer = -1;
      this.finishRoundWin();
    }, PlayFlyFx.ROUND_WIN_MS);
  }

  private finishRoundWin(): void {
    this.roundWinOn = false;
    // Clear pool hand + fly UI before RedealAll deal show.
    this.resetPlayFlyUi();
    AppRuntime.engine.redealAll();
    this.pull();
  }

  private cancelRevealTimer(): void {
    if (this.revealTimer >= 0) {
      clearTimeout(this.revealTimer);
      this.revealTimer = -1;
    }
  }

  private resetRevealUi(): void {
    this.cancelRevealTimer();
    this.revealOn = false;
    this.revealFaceUp = false;
    this.revealRanks = [];
    this.revealX = 0;
    this.revealY = 0;
    this.revealDeferTries = 0;
  }

  private cardHiddenAt(idx: number): boolean {
    if (idx < 0 || idx >= this.selfCards.length) {
      return false;
    }
    return this.hasHidden(this.selfCards[idx].cardId);
  }

  private hasHidden(cardId: string): boolean {
    for (let i = 0; i < this.hiddenCardIds.length; i++) {
      if (this.hiddenCardIds[i] === cardId) {
        return true;
      }
    }
    return false;
  }

  private copyIds(src: string[]): string[] {
    const out: string[] = [];
    for (let i = 0; i < src.length; i++) {
      out.push(src[i]);
    }
    return out;
  }

  private copyCards(src: CardModel[]): CardModel[] {
    const out: CardModel[] = [];
    for (let i = 0; i < src.length; i++) {
      out.push({ cardId: src[i].cardId, rank: src[i].rank });
    }
    return out;
  }

  private onDebugPlayReject(): void {
    if (!DebugBuild.lifeDecShown()) {
      return;
    }
    if (!this.playFlyOn && this.pileN0 === 0 && this.pileN1 === 0 &&
      this.pileN2 === 0 && this.pileN3 === 0) {
      return;
    }
    this.onPlayRollback();
  }

  /** C2-7: next 假 is authority NACK — toast 质疑未生效, restore entry, no flip. */
  private onDebugChallengeReject(): void {
    if (!DebugBuild.lifeDecShown()) {
      return;
    }
    this.challengeDebugReject = true;
    Logger.info(TAG, 'debug challenge reject armed');
  }

  /**
   * #243 debug · 质疑锤. Local self seat only. Zero engine / reveal / lives.
   */
  private onDebugHammerDoubt(): void {
    if (!DebugBuild.lifeDecShown()) {
      return;
    }
    this.playChoiceAct(TableCompass.BOTTOM, ChoiceActFx.KIND_DOUBT);
    Logger.info(TAG, 'debug hammer doubt localSeat=0 zero-logic');
  }

  /**
   * #243 debug · 相信锤. Confirm resident rest. Zero motion / engine / reveal.
   */
  private onDebugHammerBelieve(): void {
    if (!DebugBuild.lifeDecShown()) {
      return;
    }
    Logger.info(TAG, 'debug hammer believe no-anim rest-visible localSeat=0 zero-logic');
  }

  private noteChoiceAwait(seatId: number, playId: string): void {
    this.choiceAwaitSeat = seatId;
    this.choiceAwaitPlayId = playId;
  }

  private clearChoiceAwait(): void {
    this.choiceAwaitSeat = -1;
    this.choiceAwaitPlayId = '';
  }

  /**
   * AI Trust: await seat played or skipped without CHALLENGE_RITUAL.
   * #243: believe = resident rest, no hammer motion (S19-8).
   */
  private maybePlayChoiceActTrust(snap: MatchSnapshot): void {
    if (this.choiceAwaitSeat < 0) {
      return;
    }
    if (snap.lastPlay === null) {
      this.clearChoiceAwait();
      return;
    }
    if (snap.lastPlay.playId === this.choiceAwaitPlayId && snap.currentSeatId === this.choiceAwaitSeat) {
      return;
    }
    if (snap.challenge !== null) {
      this.clearChoiceAwait();
      return;
    }
    this.clearChoiceAwait();
  }

  private playChoiceActForChallenge(snap: MatchSnapshot): void {
    if (snap.challenge === null) {
      return;
    }
    const chId: string = snap.challenge.challengeId;
    if (this.choiceActForChallengeId === chId) {
      return;
    }
    this.choiceActForChallengeId = chId;
    this.clearChoiceAwait();
    this.playChoiceAct(snap.challenge.challengerSeatId, ChoiceActFx.KIND_DOUBT);
  }

  /** Formal + debug share this smash. Believe/Trust never calls it. No engine. */
  private playChoiceAct(seatId: number, kind: number): void {
    if (kind !== ChoiceActFx.KIND_DOUBT) {
      return;
    }
    this.cancelChoiceActTimer();
    this.choiceActGen = this.choiceActGen + 1;
    const gen: number = this.choiceActGen;
    this.choiceActSeat = seatId;
    this.choiceActKind = ChoiceActFx.KIND_DOUBT;
    this.choiceActShake = 0;
    this.choiceActFade = 1;
    this.choiceActOn = true;
    const restRot: number = ChoiceActFx.restRotOf(seatId);
    this.choiceActRot = restRot + ChoiceActFx.RAISE_DELTA;
    // 2.5D：抬 = 放大 + 屏上抬高；禁侧座横滑主轨.
    this.choiceActLift = -ChoiceActFx.LIFT_VP;
    this.choiceActScale = ChoiceActFx.RAISE_SCALE;
    this.choiceActTimer = setTimeout((): void => {
      this.choiceActTimer = -1;
      if (gen !== this.choiceActGen) {
        return;
      }
      const smash: AnimateParam = {
        duration: ChoiceActFx.SMASH_MS,
        curve: Curve.EaseIn
      };
      animateTo(smash, (): void => {
        this.choiceActRot = restRot + ChoiceActFx.DOWN_DELTA;
        this.choiceActLift = 0;
        this.choiceActScale = ChoiceActFx.SMASH_SCALE;
      });
      TableAudio.playHammerHit();
      this.choiceActTimer = setTimeout((): void => {
        this.choiceActTimer = -1;
        if (gen !== this.choiceActGen) {
          return;
        }
        const shakeOn: AnimateParam = {
          duration: ChoiceActFx.SHAKE_MS / 2,
          curve: Curve.EaseOut
        };
        animateTo(shakeOn, (): void => {
          this.choiceActShake = ChoiceActFx.SHAKE_VP;
        });
        this.choiceActTimer = setTimeout((): void => {
          this.choiceActTimer = -1;
          if (gen !== this.choiceActGen) {
            return;
          }
          const shakeOff: AnimateParam = {
            duration: ChoiceActFx.SHAKE_MS / 2,
            curve: Curve.EaseIn
          };
          animateTo(shakeOff, (): void => {
            this.choiceActShake = 0;
          });
          this.choiceActTimer = setTimeout((): void => {
            this.choiceActTimer = -1;
            if (gen !== this.choiceActGen) {
              return;
            }
            this.choiceActTimer = setTimeout((): void => {
              this.choiceActTimer = -1;
              if (gen !== this.choiceActGen) {
                return;
              }
              const rest: AnimateParam = {
                duration: ChoiceActFx.REST_MS,
                curve: Curve.EaseOut
              };
              animateTo(rest, (): void => {
                this.choiceActRot = ChoiceActFx.restRotOf(seatId);
                this.choiceActLift = 0;
                this.choiceActScale = ChoiceActFx.REST_SCALE;
              });
              this.choiceActTimer = setTimeout((): void => {
                this.choiceActTimer = -1;
                if (gen !== this.choiceActGen) {
                  return;
                }
                this.choiceActOn = false;
                this.choiceActKind = ChoiceActFx.KIND_NONE;
              }, ChoiceActFx.REST_MS);
            }, ChoiceActFx.HOLD_MS);
          }, ChoiceActFx.SHAKE_MS / 2);
        }, ChoiceActFx.SHAKE_MS / 2);
      }, ChoiceActFx.SMASH_MS);
    }, ChoiceActFx.LIFT_MS);
  }

  private retractChoiceAct(): void {
    if (this.choiceActTimer >= 0) {
      clearTimeout(this.choiceActTimer);
      this.choiceActTimer = -1;
    }
    if (this.choiceActHideTimer >= 0) {
      clearTimeout(this.choiceActHideTimer);
      this.choiceActHideTimer = -1;
    }
    this.choiceActGen = this.choiceActGen + 1;
    this.choiceActOn = false;
    this.choiceActFade = 1;
    this.choiceActShake = 0;
    this.choiceActLift = 0;
    this.choiceActScale = ChoiceActFx.REST_SCALE;
    this.choiceActRot = 0;
    this.choiceActKind = ChoiceActFx.KIND_NONE;
  }

  private cancelChoiceActTimer(): void {
    this.choiceActGen = this.choiceActGen + 1;
    if (this.choiceActTimer >= 0) {
      clearTimeout(this.choiceActTimer);
      this.choiceActTimer = -1;
    }
    if (this.choiceActHideTimer >= 0) {
      clearTimeout(this.choiceActHideTimer);
      this.choiceActHideTimer = -1;
    }
  }

  private malletKindOf(seatId: number): number {
    if (this.choiceActOn && this.choiceActSeat === seatId &&
      this.choiceActKind === ChoiceActFx.KIND_DOUBT) {
      return ChoiceActFx.KIND_DOUBT;
    }
    return ChoiceActFx.KIND_NONE;
  }

  private malletXOf(seatId: number): number {
    if (this.malletPosTick < 0) {
      return 0;
    }
    return this.choiceActPosOf(seatId)[0];
  }

  private malletYOf(seatId: number): number {
    if (this.malletPosTick < 0) {
      return 0;
    }
    return this.choiceActPosOf(seatId)[1];
  }

  private malletRotOf(seatId: number): number {
    if (this.choiceActOn && this.choiceActSeat === seatId) {
      return this.choiceActRot;
    }
    return ChoiceActFx.restRotOf(seatId);
  }

  private malletLiftOf(seatId: number): number {
    if (this.choiceActOn && this.choiceActSeat === seatId) {
      return this.choiceActLift;
    }
    return 0;
  }

  private malletScaleOf(seatId: number): number {
    if (this.choiceActOn && this.choiceActSeat === seatId) {
      return this.choiceActScale;
    }
    return ChoiceActFx.REST_SCALE;
  }

  private malletShakeOf(seatId: number): number {
    if (this.choiceActOn && this.choiceActSeat === seatId) {
      return this.choiceActShake;
    }
    return 0;
  }

  /**
   * Rebuild 朝向锁：旁空朝桌 + 锤头朝荷官.
   * LEFT 右空 · RIGHT 左空 · TOP 左旁空离脸 · self 金框右空.
   * Smash = same placement. Never lb_cmp_hand / pool / face (S19-10/12).
   */
  private choiceActPosOf(seatId: number): number[] {
    const origin: number[] = this.toPlayOverlay(this.seatXs[seatId], this.seatYs[seatId]);
    const measured: boolean = this.seatWs[seatId] > 0 && this.seatHs[seatId] > 0;
    if (seatId === TableCompass.BOTTOM) {
      // self: 金框右侧空地；禁压头像/烛 / 禁飘荷官旁.
      if (!measured) {
        return [ChoiceActFx.SELF_FALLBACK_X,
          this.choiceActFallbackPlayH() + ChoiceActFx.SELF_FALLBACK_DY];
      }
      return [origin[0] + this.seatWs[seatId] + ChoiceActFx.SELF_OUT_GAP,
        origin[1] + ChoiceActFx.SELF_ANCHOR_DY];
    }
    if (seatId === TableCompass.LEFT) {
      // p3: 头像右侧空（朝桌）。禁负 DX 贴左缘/刘海.
      if (!measured) {
        return [ChoiceActFx.LEFT_FALLBACK_X, ChoiceActFx.LEFT_FALLBACK_Y];
      }
      return [origin[0] + ChoiceActFx.LEFT_ANCHOR_DX,
        origin[1] + ChoiceActFx.LEFT_ANCHOR_DY];
    }
    if (seatId === TableCompass.RIGHT) {
      // p1: 头像左侧空朝桌；禁 seat 右缘外侧.
      if (!measured) {
        return [this.choiceActFallbackPlayW() + ChoiceActFx.RIGHT_FALLBACK_DX,
          ChoiceActFx.RIGHT_FALLBACK_Y];
      }
      return [origin[0] - ChoiceActFx.MALLET_W - ChoiceActFx.RIGHT_SIDE_GAP,
        origin[1] + ChoiceActFx.RIGHT_ANCHOR_DY];
    }
    // p2: 头像左侧旁空 = 整槌在头像左外，禁压脸.
    if (!measured) {
      return [ChoiceActFx.TOP_FALLBACK_X, ChoiceActFx.TOP_FALLBACK_Y];
    }
    return [origin[0] - ChoiceActFx.MALLET_W - ChoiceActFx.TOP_SIDE_GAP,
      origin[1] + ChoiceActFx.TOP_ANCHOR_DY];
  }

  private choiceActFallbackPlayH(): number {
    if (this.playH > 0) {
      return this.playH;
    }
    return 220;
  }

  private choiceActFallbackPlayW(): number {
    if (this.stackW > 0) {
      return this.stackW - this.padL;
    }
    return 320;
  }

  private isEmptySafePending(snap: MatchSnapshot): boolean {
    return snap.emptySafePending === true;
  }

  private isForceChallengeEmpty(snap: MatchSnapshot): boolean {
    return snap.forceChallengeEmpty === true;
  }

  /**
   * F2: AI sits TrustOrChallenge — dealer enter + thinking bubble table-wide.
   * Human entry uses openChallengeEntry (自位不用 NPC bubble).
   */
  private syncNpcChallengeAwaitBroadcast(snap: MatchSnapshot): void {
    if (!this.shouldShowNpcAwait(snap)) {
      return;
    }
    if (snap.lastPlay === null) {
      return;
    }
    const playId: string = snap.lastPlay.playId;
    if (this.challengeEnterPlayId === playId && this.challengeDealerEnter.length > 0) {
      return;
    }
    this.challengeEnterPlayId = playId;
    this.noteChoiceAwait(snap.currentSeatId, playId);
    // R5: NPC await must also keep pool hand count = lastPlay.count visible.
    this.ensurePoolHandFromLastPlay(snap);
    this.challengeDealerEnter = this.readChallengeDealerEnter();
    this.setNpcChallengeBubble(this.readNpcChallengeThinking());
    TableAudio.playChallengeEnter();
    Logger.info(TAG, `${SfxIds.CHALLENGE_ENTER} F2 NPC AwaitChallenge broadcast`);
  }

  private shouldShowNpcAwait(snap: MatchSnapshot): boolean {
    if (snap.phase !== Phase.TURN || this.revealOn || this.roundWinOn || this.playFlyOn) {
      return false;
    }
    if (this.isHumanTurn(snap) || this.challengeEntryOn) {
      return false;
    }
    if (this.isEmptySafePending(snap)) {
      return false;
    }
    // R2: after first play lands, next seat (incl. NPC await) must see Trust|Challenge.
    if (snap.lastPlay === null || !snap.canChallenge) {
      return false;
    }
    return true;
  }

  private maybeClearChallengeBroadcast(snap: MatchSnapshot): void {
    if (this.challengeEntryOn) {
      return;
    }
    if (this.shouldShowNpcAwait(snap)) {
      return;
    }
    if (snap.phase === Phase.CHALLENGE_RITUAL || snap.phase === Phase.JUDGE) {
      return;
    }
    this.clearChallengeBroadcast();
  }

  /**
   * F2: CHALLENGE_RITUAL / JUDGE — sync dealer announce, NPC doubt bubble, shared RevealStage.
   * Ban action-seat-only flash; AI challenge must also open lb_cmp_reveal_stage.
   */
  private syncChallengeRitualBroadcast(snap: MatchSnapshot): void {
    if (this.dealerLine !== snap.dealerLine) {
      this.dealerLine = snap.dealerLine;
    }
    // AwaitChallenge enter prompt yields to ritual dealer announce (top-left F4 tip).
    if (this.challengeDealerEnter.length > 0) {
      this.challengeDealerEnter = '';
    }
    if (snap.challenge === null) {
      return;
    }
    const chId: string = snap.challenge.challengeId;
    const challenger: number = snap.challenge.challengerSeatId;
    this.challengeResolvedPlayId = snap.challenge.targetPlayId;
    if (this.revealForChallengeId !== chId) {
      this.revealForChallengeId = chId;
      if (this.isAiSeatId(snap, challenger)) {
        this.setNpcChallengeBubble(this.readNpcChallengeDoubt());
        TableAudio.playChallengeCommit();
        Logger.info(TAG, `${SfxIds.CHALLENGE_COMMIT} F2 AI challenge broadcast`);
      }
      this.playChoiceActForChallenge(snap);
      this.beginRevealAfterAck(snap);
    } else {
      this.playChoiceActForChallenge(snap);
    }
  }

  private isAiSeatId(snap: MatchSnapshot, seatId: number): boolean {
    for (let i = 0; i < snap.seats.length; i++) {
      if (snap.seats[i].seatId === seatId) {
        return snap.seats[i].role === SeatRole.AI;
      }
    }
    return false;
  }

  private setNpcChallengeBubble(text: string): void {
    this.cancelNpcBubbleTimer();
    this.npcChallengeBubble = text;
    if (text.length === 0) {
      return;
    }
    this.npcBubbleTimer = setTimeout((): void => {
      this.npcBubbleTimer = -1;
      if (this.npcChallengeBubble === text) {
        this.npcChallengeBubble = '';
      }
    }, ChallengeFx.NPC_BUBBLE_MS);
  }

  private cancelNpcBubbleTimer(): void {
    if (this.npcBubbleTimer >= 0) {
      clearTimeout(this.npcBubbleTimer);
      this.npcBubbleTimer = -1;
    }
  }

  /**
   * 20 / #166: mount EmptySafeEntry when ≥3 emptySafePending ∧ human chooser.
   * Mutually exclusive with ChallengeEntry 质疑|相信. =2 must NOT show this.
   */
  private syncEmptySafeEntry(snap: MatchSnapshot): void {
    const want: boolean = this.isEmptySafePending(snap) &&
      !this.isForceChallengeEmpty(snap) &&
      this.isHumanTurn(snap) &&
      snap.phase === Phase.TURN &&
      !this.playFlyOn &&
      !this.confirmBusy &&
      !this.revealOn &&
      !this.roundWinOn;
    if (this.emptySafeEntryOn !== want) {
      this.emptySafeEntryOn = want;
    }
    if (want && this.challengeEntryOn) {
      this.closeChallengeEntry(false);
    }
    if (want && this.confirmBarOn) {
      this.confirmBarOn = false;
    }
    if (want && this.playEnabled) {
      this.playEnabled = false;
    }
  }

  /** ≥3 · 质疑你 → engine chooseEmptyYou → RevealEmptyLast. */
  private onChooseEmptyYou(): void {
    if (!this.emptySafeEntryOn) {
      return;
    }
    this.emptySafeEntryOn = false;
    // 废左轮: EmptySafe you/prev must NOT play revolver click as narrative.
    const ok: boolean = AppRuntime.engine.chooseEmptyYou();
    if (!ok) {
      Logger.warn(TAG, 'chooseEmptyYou rejected');
      this.pull();
      return;
    }
    Logger.info(TAG, 'EmptySafe3 chooseEmptyYou');
    const after: MatchSnapshot | null = AppRuntime.engine.current();
    if (after !== null &&
      (after.phase === Phase.CHALLENGE_RITUAL || after.phase === Phase.JUDGE)) {
      // Stay on table; reveal after ACK (same as ChallengeCommit).
      if (after.challenge !== null) {
        this.revealForChallengeId = after.challenge.challengeId;
      }
      this.beginRevealAfterAck(after);
      return;
    }
    this.pull();
  }

  /** ≥3 · 上家 / 不质疑你 → engine chooseEmptyShangjia → RoundSafeWait. */
  private onChooseEmptyShangjia(): void {
    if (!this.emptySafeEntryOn) {
      return;
    }
    this.emptySafeEntryOn = false;
    // 废左轮: EmptySafe you/prev must NOT play revolver click as narrative.
    const ok: boolean = AppRuntime.engine.chooseEmptyShangjia();
    if (!ok) {
      Logger.warn(TAG, 'chooseEmptyShangjia rejected');
    } else {
      Logger.info(TAG, 'EmptySafe3 chooseEmptyShangjia');
    }
    this.pull();
  }

  /**
   * Q03: PlayLanded ∧ hand>0 ∧ canChallenge ∧ human.
   * Zero entry during PlayLaunch / confirmBusy / RoundWin / before any play (no lastPlay).
   * R2: after every play (incl. first of round), next seat enters 质疑|相信.
   * ForceChallenge2 (=2 empty): allow even when actor emptied.
   */
  private shouldShowChallengeEntry(snap: MatchSnapshot): boolean {
    if (this.playFlyOn || this.confirmBusy || this.roundWinOn || this.challengeCommitBusy ||
      this.revealOn || this.emptySafeEntryOn) {
      return false;
    }
    // ≥3 EmptySafe3: you/prev entry owns the gate — hide 17 真/假.
    if (this.isEmptySafePending(snap)) {
      return false;
    }
    if (snap.phase !== Phase.TURN) {
      return false;
    }
    const force2: boolean = this.isForceChallengeEmpty(snap);
    // =2 ForceChallenge: must challenge emptier last hand even if actor emptied.
    // Normal: need cards; force2 may still have cards.
    if (!this.isHumanTurn(snap)) {
      return false;
    }
    if (!force2 && !snap.hasCards) {
      return false;
    }
    // R2: do NOT ban via sticky first-of-round flag on the play object.
    // Hide only when no lastPlay yet; engine canChallengeNow allows playIndexInRound>=1.
    if (snap.lastPlay === null) {
      return false;
    }
    if (!snap.canChallenge) {
      return false;
    }
    if (!force2 && this.actorEmptied(snap)) {
      return false;
    }
    if (snap.lastPlay.playId === this.challengeResolvedPlayId) {
      return false;
    }
    return true;
  }

  private actorEmptied(snap: MatchSnapshot): boolean {
    if (snap.lastPlay === null) {
      return true;
    }
    const actor: number = snap.lastPlay.actorSeatId;
    for (let i = 0; i < snap.emptyOrder.length; i++) {
      if (snap.emptyOrder[i] === actor) {
        return true;
      }
    }
    return this.handCountOf(snap.seats, actor) === 0;
  }

  private syncChallengeEntry(snap: MatchSnapshot): void {
    const want: boolean = this.shouldShowChallengeEntry(snap);
    if (!want) {
      if (this.challengeEntryOn && !this.challengeCommitBusy) {
        this.closeChallengeEntry(false);
      }
      return;
    }
    const playId: string = snap.lastPlay === null ? '' : snap.lastPlay.playId;
    if (this.challengeEntryOn && this.challengeTargetPlayId === playId) {
      // R5: re-assert pool hand count while await stays open.
      this.ensurePoolHandFromLastPlay(snap);
      return;
    }
    this.openChallengeEntry(snap);
  }

  /**
   * R5: During AwaitChallenge, pool hand card-back pile stays visible;
   * count = lastPlay.count. Ban entry covering/clearing pool stack.
   */
  private ensurePoolHandFromLastPlay(snap: MatchSnapshot): void {
    if (snap.lastPlay === null) {
      return;
    }
    const n: number = PlayFlyFx.clampCount(snap.lastPlay.count);
    if (this.pileN0 !== n) {
      this.pileN0 = n;
    }
    if (this.pileN1 !== 0) {
      this.pileN1 = 0;
    }
    if (this.pileN2 !== 0) {
      this.pileN2 = 0;
    }
    if (this.pileN3 !== 0) {
      this.pileN3 = 0;
    }
  }

  private openChallengeEntry(snap: MatchSnapshot): void {
    if (snap.lastPlay === null) {
      return;
    }
    this.challengeTargetPlayId = snap.lastPlay.playId;
    this.noteChoiceAwait(snap.currentSeatId, this.challengeTargetPlayId);
    this.challengeEntryOn = true;
    this.challengeCommitBusy = false;
    this.challengeRemainSec = Math.round(ChallengeFx.AWAIT_MS / 1000);
    this.confirmBarOn = false;
    // R5: keep PLAY_POOL_HAND readable (= lastPlay.count); never clear on entry open.
    this.ensurePoolHandFromLastPlay(snap);
    // #158 / F2 / R6: lb_str_challenge_dealer_enter → topBar TopStart (not heart).
    this.challengeDealerEnter = this.readChallengeDealerEnter();
    // F2 / 17: NPC thinking bubble is for AI await only（自位不用）.
    if (this.playEnabled) {
      this.playEnabled = false;
    }
    if (this.selectedIds.length > 0) {
      this.selectedIds = [];
    }
    if (this.challengeEnterPlayId !== this.challengeTargetPlayId) {
      this.challengeEnterPlayId = this.challengeTargetPlayId;
      TableAudio.playChallengeEnter();
      Logger.info(TAG, `${SfxIds.CHALLENGE_ENTER} AwaitChallenge target=${this.challengeTargetPlayId}`);
    }
    this.armChallengeTimer();
  }

  /** Bind lb_str_challenge_dealer_enter from string.json (#158 / 11b). */
  private readChallengeDealerEnter(): string {
    return this.readLbString('lb_str_challenge_dealer_enter');
  }

  /** Bind lb_str_npc_challenge_thinking from string.json (#158 / 11b). */
  private readNpcChallengeThinking(): string {
    return this.readLbString('lb_str_npc_challenge_thinking');
  }

  /** Bind lb_str_npc_challenge_true from string.json (#158 / 11b). Reveal/judgment only. */
  private readNpcChallengeTrue(): string {
    return this.readLbString('lb_str_npc_challenge_true');
  }

  /** Bind lb_str_npc_challenge_false from string.json (#158 / 11b). Reveal/judgment only. */
  private readNpcChallengeFalse(): string {
    return this.readLbString('lb_str_npc_challenge_false');
  }

  /** Bind lb_str_npc_challenge_doubt from string.json (17 v0.3.0 entry). */
  private readNpcChallengeDoubt(): string {
    return this.readLbString('lb_str_npc_challenge_doubt');
  }

  /** Bind lb_str_npc_challenge_believe from string.json (17 v0.3.0 entry). */
  private readNpcChallengeBelieve(): string {
    return this.readLbString('lb_str_npc_challenge_believe');
  }

  /** Load app.string.* by name into @State string (Resource cannot assign to string State). */
  private readLbString(name: string): string {
    try {
      const ctx: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
      return ctx.resourceManager.getStringByNameSync(name);
    } catch (err) {
      Logger.warn(TAG, `readLbString miss ${name}`);
      return '';
    }
  }

  /** Entry chrome only — F2 broadcast (dealer enter / NPC bubble) stays until clearChallengeBroadcast. */
  private closeChallengeEntryChrome(): void {
    this.cancelChallengeTimer();
    if (this.challengeEntryOn) {
      this.challengeEntryOn = false;
    }
    if (this.challengeCommitBusy) {
      this.challengeCommitBusy = false;
    }
  }

  private clearChallengeBroadcast(): void {
    this.cancelNpcBubbleTimer();
    if (this.challengeDealerEnter.length > 0) {
      this.challengeDealerEnter = '';
    }
    if (this.npcChallengeBubble.length > 0) {
      this.npcChallengeBubble = '';
    }
  }

  private closeChallengeEntry(allowPlay: boolean): void {
    this.closeChallengeEntryChrome();
    // Believe / leave-await: clear F2 cues. Ritual path uses chrome-only.
    this.clearChallengeBroadcast();
    if (!allowPlay) {
      return;
    }
    const snap: MatchSnapshot | null = AppRuntime.engine.current();
    if (snap === null) {
      return;
    }
    const humanTurn: boolean = this.isHumanTurn(snap);
    const nextPlay: boolean = humanTurn && snap.hasCards &&
      (snap.phase === Phase.TURN || snap.phase === Phase.PLAY_REVEAL_SELF) &&
      snap.turnWindow !== TurnWindow.CHALLENGE_ONLY &&
      snap.turnWindow !== TurnWindow.EMPTY_SAFE &&
      snap.turnWindow !== TurnWindow.FORCE_CHALLENGE &&
      !this.emptySafeEntryOn;
    if (this.playEnabled !== nextPlay) {
      this.playEnabled = nextPlay;
    }
    this.refreshPlayMeta(snap);
  }

  private armChallengeTimer(): void {
    this.cancelChallengeTimer();
    this.challengeDeadlineMs = Date.now() + ChallengeFx.AWAIT_MS;
    this.challengeRemainSec = Math.round(ChallengeFx.AWAIT_MS / 1000);
    this.challengeTickId = setInterval((): void => {
      const left: number = this.challengeDeadlineMs - Date.now();
      let sec: number = Math.ceil(left / 1000);
      if (sec < 0) {
        sec = 0;
      }
      if (this.challengeRemainSec !== sec) {
        this.challengeRemainSec = sec;
      }
      if (left <= 0) {
        this.onChallengeBelieve(true);
      }
    }, ChallengeFx.TICK_MS);
  }

  private cancelChallengeTimer(): void {
    if (this.challengeTickId >= 0) {
      clearInterval(this.challengeTickId);
      this.challengeTickId = -1;
    }
  }

  /** 质疑 = ChallengeCommit → intentChallenge ACK → reveal. Not Trust/Pass. */
  private onChallengeDoubt(): void {
    this.commitChallenge();
  }

  /**
   * Q04 / 17 v0.3.0: 质疑 = ChallengeCommit + lb_sfx_challenge_commit.
   * Wait authority ACK before reveal (C2-7 / #141).
   * ACK → beginRevealAfterAck (18). Full life/judge = Section 3 minimal stub.
   * Commit SFX only on 质疑 (believe/Trust is silent).
   */
  private commitChallenge(): void {
    if (!this.challengeEntryOn || this.challengeCommitBusy) {
      return;
    }
    TableAudio.playChallengeCommit();
    this.challengeCommitBusy = true;
    this.cancelChallengeTimer();
    const snap: MatchSnapshot | null = AppRuntime.engine.current();
    let target: string = this.challengeTargetPlayId;
    if (snap !== null && snap.lastPlay !== null) {
      target = snap.lastPlay.playId;
      this.challengeTargetPlayId = target;
    }
    Logger.info(TAG, `${SfxIds.CHALLENGE_COMMIT} doubt target=${target}`);
    if (this.challengeDebugReject) {
      this.challengeDebugReject = false;
      this.rejectChallengeRestore();
      return;
    }
    if (snap === null || snap.lastPlay === null || snap.lastPlay.playId !== target) {
      this.rejectChallengeRestore();
      return;
    }
    const ok: boolean = AppRuntime.engine.intentChallenge();
    if (!ok) {
      this.rejectChallengeRestore();
      return;
    }
    // ACK accepted. Open 18 reveal stage (not old lb_scr_challenge).
    this.challengeResolvedPlayId = target;
    // F2: chrome-only — keep dealer enter briefly; ritual sync owns announce + reveal.
    this.closeChallengeEntryChrome();
    const after: MatchSnapshot | null = AppRuntime.engine.current();
    if (after !== null) {
      if (after.challenge !== null) {
        this.revealForChallengeId = after.challenge.challengeId;
      }
      this.playChoiceActForChallenge(after);
      // Human challenger: 自位不用 NPC bubble; table-wide RevealStage is the cue.
      this.beginRevealAfterAck(after);
    } else {
      this.pull();
    }
  }

  /**
   * 18: after challenge ACK — lift pool hand to reveal stage, draw→flip SFX.
   * Stage center = pool center + (0, REVEAL_DOWN_VP). Dim/blur on bg only.
   * R4: draw→flip DRAW_TO_FLIP_MS(1000) then face-up REVEAL_HOLD_MS(5000); ban instant cut /
   * resetRevealUi / next pull beat before hold done. SUPERSEDE R3 500/2000.
   * Life/judge stub: hold after flip then pull(). Do not open Challenge page.
   */
  private beginRevealAfterAck(snap: MatchSnapshot): void {
    this.cancelRevealTimer();
    // Cards lift off pool → clear pool hand fan.
    this.pileN0 = 0;
    const ranks: string[] = this.ranksForReveal(snap);
    let claim: string = '';
    if (snap.currentClaim !== null) {
      claim = snap.currentClaim.rank;
    }
    const picked: string[] = AppRuntime.engine.peekLastPickedRanks();
    let playCount: number = 0;
    let playId: string = '';
    if (snap.lastPlay !== null) {
      playCount = snap.lastPlay.count;
      playId = snap.lastPlay.playId;
    }
    // R1′ HiLog keys: claim / lastPlayRanks / lastPicked / lastPlay.count / playId
    Logger.info(TAG,
      `beginRevealAfterAck claim=${claim} lastPlayRanks=${this.ranksCsv(ranks)} ` +
      `lastPicked=${this.ranksCsv(picked)} lastPlay.count=${playCount} playId=${playId}`);
    // R1′: empty ranks → FORBIDDEN claim fill / n=1 fake show. Wait for trusted ranks.
    if (ranks.length === 0) {
      this.revealDeferTries = this.revealDeferTries + 1;
      Logger.warn(TAG,
        `beginRevealAfterAck ranks empty — defer try=${this.revealDeferTries} (no claim fill)`);
      this.revealOn = false;
      this.revealFaceUp = false;
      this.revealRanks = [];
      if (this.revealDeferTries > 25) {
        Logger.warn(TAG, 'beginRevealAfterAck ranks still empty — abort reveal (no claim fill)');
        this.revealDeferTries = 0;
        return;
      }
      this.revealTimer = setTimeout((): void => {
        this.revealTimer = -1;
        const again: MatchSnapshot | null = AppRuntime.engine.current();
        if (again !== null &&
          (again.phase === Phase.CHALLENGE_RITUAL || again.phase === Phase.JUDGE)) {
          this.beginRevealAfterAck(again);
        } else {
          this.revealDeferTries = 0;
        }
      }, 80);
      return;
    }
    this.revealDeferTries = 0;
    // Reveal 起势：四槌常驻回搁，不改 DRAW_TO_FLIP_MS / REVEAL_HOLD_MS.
    const n: number = PlayFlyFx.clampCount(ranks.length);
    const w: number = PlayFlyFx.pileWidth(n);
    const h: number = PlayFlyFx.pileHeight();
    const mid: number[] = this.poolCenterOverlay();
    const cx: number = mid[0];
    const cy: number = mid[1] + PlayFlyFx.REVEAL_DOWN_VP;
    this.revealX = cx - w / 2;
    this.revealY = cy - h / 2;
    this.revealRanks = ranks;
    this.revealFaceUp = false;
    this.revealOn = true;
    TableAudio.playRevealDraw();
    Logger.info(TAG, `${SfxIds.REVEAL_DRAW} beginRevealAfterAck n=${ranks.length}`);
    this.revealTimer = setTimeout((): void => {
      this.revealTimer = -1;
      // R4: only flip after DRAW_TO_FLIP_MS; never skip to face-up instantly.
      this.revealFaceUp = true;
      TableAudio.playRevealFlip();
      Logger.info(TAG, `${SfxIds.REVEAL_FLIP} faceUp`);
      this.revealTimer = setTimeout((): void => {
        this.revealTimer = -1;
        // R4: hold full REVEAL_HOLD_MS before resetRevealUi / pull. Ban early cut.
        this.resetRevealUi();
        this.pull();
      }, PlayFlyFx.REVEAL_HOLD_MS);
    }, PlayFlyFx.DRAW_TO_FLIP_MS);
  }

  private ranksCsv(ranks: string[]): string {
    let s: string = '';
    for (let i = 0; i < ranks.length; i++) {
      if (i > 0) {
        s = `${s},`;
      }
      s = `${s}${ranks[i]}`;
    }
    return s;
  }

  /**
   * R1′: faceUp ranks MUST be engine lastPlayRanks (= lastPicked).
   * FORBID claim/currentClaim.rank fill. If snapshot empty, read trusted peek.
   * Empty after peek → caller must wait; never fabricate claim / n=1 fake.
   */
  private ranksForReveal(snap: MatchSnapshot): string[] {
    const out: string[] = [];
    for (let i = 0; i < snap.lastPlayRanks.length; i++) {
      out.push(snap.lastPlayRanks[i]);
    }
    if (out.length > 0) {
      return out;
    }
    const trusted: string[] = AppRuntime.engine.peekLastPlayRanks();
    for (let i = 0; i < trusted.length; i++) {
      out.push(trusted[i]);
    }
    if (out.length > 0) {
      return out;
    }
    const picked: string[] = AppRuntime.engine.peekLastPickedRanks();
    for (let i = 0; i < picked.length; i++) {
      out.push(picked[i]);
    }
    return out;
  }

  private rejectChallengeRestore(): void {
    this.flashHint(5);
    this.challengeCommitBusy = false;
    const left: number = this.challengeDeadlineMs - Date.now();
    if (left <= 0) {
      this.closeChallengeEntry(true);
      return;
    }
    this.challengeEntryOn = true;
    this.armChallengeTimerFromRemain(left);
    Logger.info(TAG, `lb_str_challenge_reject restore entry target=${this.challengeTargetPlayId}`);
  }

  private armChallengeTimerFromRemain(leftMs: number): void {
    this.cancelChallengeTimer();
    this.challengeDeadlineMs = Date.now() + leftMs;
    this.challengeRemainSec = Math.ceil(leftMs / 1000);
    this.challengeTickId = setInterval((): void => {
      const left: number = this.challengeDeadlineMs - Date.now();
      let sec: number = Math.ceil(left / 1000);
      if (sec < 0) {
        sec = 0;
      }
      if (this.challengeRemainSec !== sec) {
        this.challengeRemainSec = sec;
      }
      if (left <= 0) {
        this.onChallengeBelieve(true);
      }
    }, ChallengeFx.TICK_MS);
  }

  /** 相信 / timeout: Trust/Pass silent. No enter / commit / flip / launch / land. No reveal. */
  private onChallengeBelieve(fromTimeout: boolean): void {
    if (!this.challengeEntryOn && !fromTimeout) {
      return;
    }
    if (this.challengeCommitBusy) {
      return;
    }
    const snap: MatchSnapshot | null = AppRuntime.engine.current();
    // =2 ForceChallenge: no Pass / Trust — timeout forces commit (质疑) instead.
    if (snap !== null && this.isForceChallengeEmpty(snap)) {
      Logger.info(TAG, 'ForceChallenge2: Believe/Pass banned → commit');
      this.commitChallenge();
      return;
    }
    Logger.info(TAG, fromTimeout ? 'AwaitChallenge timeout Believe' : 'AwaitChallenge Believe');
    this.challengeResolvedPlayId = this.challengeTargetPlayId;
    this.clearChoiceAwait();
    this.closeChallengeEntry(true);
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
    const w: number = Number(area.width);
    const h: number = Number(area.height);
    if (w > 0) {
      this.seatWs[seatId] = w;
    }
    if (h > 0) {
      this.seatHs[seatId] = h;
    }
    this.malletPosTick = this.malletPosTick + 1;
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
