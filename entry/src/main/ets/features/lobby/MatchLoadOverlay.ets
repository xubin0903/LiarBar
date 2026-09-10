import { OverlayIds } from '../../common/Ids';
import { Logger } from '../../common/Logger';
import { LobbyAudio } from './LobbyAudio';
import { MatchLoad } from './MatchLoad';

const TAG = 'MatchLoad';

/**
 * Full-screen overlay lb_ovl_match_load. Felt + pile semantics, not a spinner.
 * Uses real art_table_bg / art_card_back / art_dealer_idle_nod. Not skippable.
 */
@Component
export struct MatchLoadOverlay {
  @State feltScale: number = 0.28;
  @State feltOpacity: number = 0.62;
  @State pile0Y: number = -56;
  @State pile1Y: number = -56;
  @State pile2Y: number = -56;
  @State pile3Y: number = -56;
  @State pile4Y: number = -56;
  @State pile0Op: number = 0;
  @State pile1Op: number = 0;
  @State pile2Op: number = 0;
  @State pile3Op: number = 0;
  @State pile4Op: number = 0;
  @State dealerOpacity: number = 0;
  @State dealerScale: number = 0.96;
  @State hintValue: number = 0;
  @State tipTick: number = 0;
  private timerIds: number[] = [];
  private tipTimer: number = -1;

  aboutToAppear(): void {
    Logger.info(TAG, `${OverlayIds.MATCH_LOAD} L-0 cover`);
    LobbyAudio.playMatchOpen();
    this.playAxis();
    this.tipTimer = setInterval((): void => {
      this.tipTick = this.tipTick + 1;
    }, MatchLoad.TIP_ROTATE_MS);
  }

  aboutToDisappear(): void {
    this.clearTimers();
    if (this.tipTimer >= 0) {
      clearInterval(this.tipTimer);
      this.tipTimer = -1;
    }
  }

  build() {
    Stack() {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor($r('app.color.tavern_bg'))

      Image($r('app.media.art_table_bg'))
        .width('100%')
        .height('100%')
        .objectFit(ImageFit.Cover)
        .opacity(this.feltOpacity)
        .scale({ x: this.feltScale, y: this.feltScale })
        .hitTestBehavior(HitTestMode.None)

      Column() {
        Image($r('app.media.art_dealer_idle_nod'))
          .width($r('app.float.dealer_bust_w'))
          .height($r('app.float.dealer_bust_h'))
          .objectFit(ImageFit.Contain)
          .opacity(this.dealerOpacity)
          .scale({ x: this.dealerScale, y: this.dealerScale })
          .margin({ bottom: 12 })

        Stack() {
          this.pileCard(this.pile0Y, this.pile0Op, -10)
          this.pileCard(this.pile1Y, this.pile1Op, -5)
          this.pileCard(this.pile2Y, this.pile2Op, 0)
          this.pileCard(this.pile3Y, this.pile3Op, 4)
          this.pileCard(this.pile4Y, this.pile4Op, 8)
        }
        .width(72)
        .height(130)
      }
      .width('100%')
      .height('100%')
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
      .hitTestBehavior(HitTestMode.None)

      Column({ space: 8 }) {
        Text(this.tipText())
          .fontColor($r('app.color.tavern_candle'))
          .fontSize($r('app.float.page_text_size'))
          .fontWeight(FontWeight.Medium)
        Progress({ value: this.hintValue, total: 100, type: ProgressType.Linear })
          .width('48%')
          .height(3)
          .color($r('app.color.tavern_candle'))
          .backgroundColor($r('app.color.tavern_shadow'))
      }
      .width('100%')
      .height('100%')
      .justifyContent(FlexAlign.End)
      .alignItems(HorizontalAlign.Center)
      .padding({ bottom: 40 })
      .hitTestBehavior(HitTestMode.None)
    }
    .id(OverlayIds.MATCH_LOAD)
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.tavern_bg'))
    .onClick(() => {
      Logger.info(TAG, `${OverlayIds.MATCH_LOAD} tap ignored — not skippable`);
    })
  }

  /** Locked open-table semantics (08 L-2 / R-LAND-1). Overlay-local text, no new lb_str_*. */
  private tipText(): string {
    const slot: number = this.tipTick % 3;
    if (slot === 0) {
      return '入座';
    }
    if (slot === 1) {
      return '牌来了';
    }
    return '开桌';
  }

  @Builder
  pileCard(dy: number, op: number, angle: number) {
    Image($r('app.media.art_card_back'))
      .width($r('app.float.card_w'))
      .height($r('app.float.card_h'))
      .objectFit(ImageFit.Cover)
      .borderRadius(10)
      .opacity(op)
      .offset({ x: 0, y: dy })
      .rotate({ angle: angle })
  }

  private playAxis(): void {
    const feltOpt: AnimateParam = {
      duration: MatchLoad.L1_FELT_MS,
      curve: Curve.EaseOut
    };
    animateTo(feltOpt, (): void => {
      this.feltScale = 1;
      this.feltOpacity = 1;
    });

    const hintOpt: AnimateParam = {
      duration: MatchLoad.axisMs(),
      curve: Curve.Linear
    };
    animateTo(hintOpt, (): void => {
      this.hintValue = 100;
    });

    this.dropPile(0, MatchLoad.L2_AT, 0);
    this.dropPile(1, MatchLoad.L2_AT + MatchLoad.L2_CARD_GAP_MS, 6);
    this.dropPile(2, MatchLoad.L2_AT + MatchLoad.L2_CARD_GAP_MS * 2, 12);
    this.dropPile(3, MatchLoad.L2_AT + MatchLoad.L2_CARD_GAP_MS * 3, 18);
    this.dropPile(4, MatchLoad.L2_AT + MatchLoad.L2_CARD_GAP_MS * 4, 24);

    this.arm(MatchLoad.L3_AT, (): void => {
      const nodOpt: AnimateParam = {
        duration: MatchLoad.L3_NOD_MS,
        curve: Curve.EaseInOut
      };
      animateTo(nodOpt, (): void => {
        this.dealerOpacity = 1;
        this.dealerScale = 1;
      });
    });
  }

  private dropPile(index: number, atMs: number, restY: number): void {
    this.arm(atMs, (): void => {
      const flyOpt: AnimateParam = {
        duration: MatchLoad.L2_CARD_FLY_MS,
        curve: Curve.EaseOut
      };
      animateTo(flyOpt, (): void => {
        if (index === 0) {
          this.pile0Y = restY;
          this.pile0Op = 1;
        } else if (index === 1) {
          this.pile1Y = restY;
          this.pile1Op = 1;
        } else if (index === 2) {
          this.pile2Y = restY;
          this.pile2Op = 1;
        } else if (index === 3) {
          this.pile3Y = restY;
          this.pile3Op = 1;
        } else {
          this.pile4Y = restY;
          this.pile4Op = 1;
        }
      });
    });
  }

  private arm(delayMs: number, fn: () => void): void {
    const id: number = setTimeout((): void => {
      fn();
    }, delayMs);
    this.timerIds.push(id);
  }

  private clearTimers(): void {
    for (let i = 0; i < this.timerIds.length; i++) {
      clearTimeout(this.timerIds[i]);
    }
    this.timerIds = [];
  }
}
