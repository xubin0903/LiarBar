import { common } from '@kit.AbilityKit';
import { AppRuntime } from '../common/AppRuntime';
import { ControlIds, ScreenIds } from '../common/Ids';
import { LbRouter } from '../common/LbRouter';
import { Logger } from '../common/Logger';
import { ConfigRepository } from '../config/ConfigRepository';
import { StartMatchOpts } from '../engine/MatchEngine';
import { DealerIdleKind, DealerIdleMachine } from '../features/lobby/DealerIdleMachine';
import { LobbyAudio } from '../features/lobby/LobbyAudio';
import { BootMarks, LobbyBoot, LobbySession } from '../features/lobby/LobbyBoot';
import { LobbyPanel } from '../features/lobby/LobbyPanel';
import { SmartFillAdapter } from '../harmony/SmartFillAdapter';
import { LastTable, LocalStore } from '../persist/LocalStore';

const TAG = 'Lobby';

@Entry
@Component
struct Lobby {
  @State nickname: string = '';
  @State playerCount: number = 0;
  @State silent: boolean = false;
  @State fillHint: string = '';
  @State quickstartPressed: boolean = false;
  @State bootReady: boolean = false;
  @State splashOpacity: number = 0;
  @State lobbyBgOpacity: number = 0;
  @State loadOpacity: number = 0;
  @State loadValue: number = 0;
  @State idleOpacity: number = 0;
  @State announceOpacity: number = 0;
  @State blinkOpacity: number = 0;
  @State nodOpacity: number = 0;
  @State cupOpacity: number = 0;
  @State maskOpacity: number = 0;
  @State greetOpacity: number = 0;
  @State topbarOpacity: number = 0;
  @State topbarY: number = 12;
  @State topbarScale: number = 0.96;
  @State topbarGlow: number = 1;
  @State cardOpacity: number = 0;
  @State cardY: number = 12;
  @State cardScale: number = 0.96;
  @State ctaOpacity: number = 0;
  @State ctaY: number = 12;
  @State ctaEnterScale: number = 0.96;
  @State ctaPressScale: number = 1;
  @State ctaGlowOpacity: number = 1;
  @State ctaGlowScale: number = 1;
  @State peekOpacity: number = 0;
  @State peekY: number = 12;
  @State peekScale: number = 0.96;
  @State peekPressScale: number = 1;
  @State dealerScale: number = 1;
  @State candleOpacity: number = 0.70;
  @State candleScale: number = 1;
  @State dustOpacity: number = 0.20;
  @State dustY: number = 18;
  private timerIds: number[] = [];
  private loopsAlive: boolean = false;
  private idleLoopAlive: boolean = false;
  private layerMs: number = LobbyBoot.BOOT_MS_LAYER;
  private idleMachine: DealerIdleMachine = new DealerIdleMachine();
  private cupActive: boolean = false;

  aboutToAppear(): void {
    this.begin();
  }

  aboutToDisappear(): void {
    this.loopsAlive = false;
    this.idleLoopAlive = false;
    this.clearTimers();
    LobbyAudio.leaveThenRelease();
  }

  build() {
    Stack() {
      Image($r('app.media.art_lobby_bg'))
        .width('100%')
        .height('100%')
        .objectFit(ImageFit.Cover)
        .opacity(this.lobbyBgOpacity)

      Image($r('app.media.art_splash_still'))
        .width('100%')
        .height('100%')
        .objectFit(ImageFit.Cover)
        .opacity(this.splashOpacity)

      Image($r('app.media.art_fx_dust'))
        .width('100%')
        .height(200)
        .objectFit(ImageFit.Cover)
        .opacity(this.dustOpacity)
        .offset({ x: 0, y: this.dustY })
        .hitTestBehavior(HitTestMode.None)
        .align(Alignment.Top)

      Image($r('app.media.art_fx_candle'))
        .width(72)
        .height(72)
        .objectFit(ImageFit.Contain)
        .opacity(this.candleOpacity)
        .scale({ x: this.candleScale, y: this.candleScale })
        .hitTestBehavior(HitTestMode.None)
        .align(Alignment.BottomStart)
        .margin({ left: 20, bottom: 88 })

      Column() {
        Progress({ value: this.loadValue, total: 100, type: ProgressType.Linear })
          .width('56%')
          .height(4)
          .color($r('app.color.tavern_candle'))
          .backgroundColor($r('app.color.tavern_shadow'))
          .opacity(this.loadOpacity)
      }
      .width('100%')
      .height('100%')
      .justifyContent(FlexAlign.End)
      .padding({ bottom: 72 })
      .hitTestBehavior(HitTestMode.None)

      Scroll() {
        Column() {
          this.topbarLayer()
          this.dealerLayer()
          this.settingsLayer()
          this.ctaLayer()
          this.peekLayer()
        }
        .width('100%')
        .alignItems(HorizontalAlign.Center)
      }
      .scrollBar(BarState.Off)
      .width('100%')
      .height('100%')
      .padding({ left: 20, right: 20, top: 8, bottom: 20 })
    }
    .id(ScreenIds.LOBBY)
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.tavern_bg'))
  }

  @Builder
  topbarLayer() {
    Row() {
      Text($r('app.string.lb_str_app_title'))
        .fontColor($r('app.color.tavern_candle'))
        .fontSize($r('app.float.title_text_size'))
        .fontWeight(FontWeight.Bold)
      Blank()
      Text($r('app.string.lb_str_records'))
        .id(ControlIds.RECORDS)
        .fontColor($r('app.color.tavern_mute'))
        .fontSize($r('app.float.caption_text_size'))
        .onClick(() => {
          if (!this.bootReady) {
            return;
          }
          LbRouter.toReport();
        })
    }
    .width('100%')
    .padding({ top: 12, bottom: 4 })
    .opacity(this.topbarOpacity * this.topbarGlow)
    .offset({ x: 0, y: this.topbarY })
    .scale({ x: this.topbarScale, y: this.topbarScale })
  }

  @Builder
  dealerLayer() {
    Column() {
      Stack() {
        Image($r('app.media.art_dealer_bust_idle'))
          .width($r('app.float.dealer_bust_w'))
          .height($r('app.float.dealer_bust_h'))
          .objectFit(ImageFit.Contain)
          .opacity(this.idleOpacity)
        Image($r('app.media.art_dealer_idle_blink'))
          .width($r('app.float.dealer_bust_w'))
          .height($r('app.float.dealer_bust_h'))
          .objectFit(ImageFit.Contain)
          .opacity(this.blinkOpacity)
        Image($r('app.media.art_dealer_idle_nod'))
          .width($r('app.float.dealer_bust_w'))
          .height($r('app.float.dealer_bust_h'))
          .objectFit(ImageFit.Contain)
          .opacity(this.nodOpacity)
        Image($r('app.media.art_dealer_idle_cup'))
          .width($r('app.float.dealer_bust_w'))
          .height($r('app.float.dealer_bust_h'))
          .objectFit(ImageFit.Contain)
          .opacity(this.cupOpacity)
        Image($r('app.media.art_dealer_idle_mask'))
          .width($r('app.float.dealer_bust_w'))
          .height($r('app.float.dealer_bust_h'))
          .objectFit(ImageFit.Contain)
          .opacity(this.maskOpacity)
        Image($r('app.media.art_dealer_bust_announce'))
          .width($r('app.float.dealer_bust_w'))
          .height($r('app.float.dealer_bust_h'))
          .objectFit(ImageFit.Contain)
          .opacity(this.announceOpacity)
      }
      .id(ControlIds.DEALER)
      .width($r('app.float.dealer_bust_w'))
      .height($r('app.float.dealer_bust_h'))
      .scale({ x: this.dealerScale, y: this.dealerScale })
      .margin({ top: 8, bottom: 8 })

      Text($r('app.string.lb_str_dlr_lobby_greet'))
        .fontColor($r('app.color.tavern_paper'))
        .fontSize($r('app.float.page_text_size'))
        .opacity(this.greetOpacity)
        .margin({ bottom: 12 })
    }
    .alignItems(HorizontalAlign.Center)
  }

  @Builder
  settingsLayer() {
    Column() {
      LobbyPanel({
        nickname: $nickname,
        playerCount: $playerCount,
        silent: $silent,
        onFillLast: () => {
          this.doFillLast();
        },
        onSilentChange: (on: boolean) => {
          this.onSilentChanged(on);
        }
      })

      if (this.fillHint.length > 0) {
        Text(this.fillHint)
          .fontColor($r('app.color.tavern_candle'))
          .fontSize($r('app.float.caption_text_size'))
          .margin({ top: 8 })
      }
    }
    .width('86%')
    .opacity(this.cardOpacity)
    .offset({ x: 0, y: this.cardY })
    .scale({ x: this.cardScale, y: this.cardScale })
  }

  @Builder
  ctaLayer() {
    Stack() {
      if (this.quickstartPressed) {
        Image($r('app.media.art_btn_primary_on'))
          .width('100%')
          .height($r('app.float.cta_height'))
          .objectFit(ImageFit.Fill)
      } else {
        Image($r('app.media.art_btn_primary'))
          .width('100%')
          .height($r('app.float.cta_height'))
          .objectFit(ImageFit.Fill)
      }
      Button($r('app.string.lb_str_quickstart'))
        .id(ControlIds.QUICKSTART)
        .type(ButtonType.Normal)
        .width('100%')
        .height($r('app.float.cta_height'))
        .fontSize($r('app.float.page_text_size'))
        .fontWeight(FontWeight.Medium)
        .backgroundColor(Color.Transparent)
        .fontColor($r('app.color.tavern_bg'))
        .stateEffect(false)
        .enabled(this.bootReady)
        .onTouch((event: TouchEvent) => {
          this.onCtaTouch(event);
        })
        .onClick(() => {
          this.doQuickStart();
        })
    }
    .width('100%')
    .height($r('app.float.cta_height'))
    .margin({ top: 20 })
    .opacity(this.ctaOpacity * this.ctaGlowOpacity)
    .offset({ x: 0, y: this.ctaY })
    .scale({
      x: this.ctaEnterScale * this.ctaPressScale * this.ctaGlowScale,
      y: this.ctaEnterScale * this.ctaPressScale * this.ctaGlowScale
    })
  }

  @Builder
  peekLayer() {
    Text($r('app.string.lb_str_nav_peek'))
      .id(ControlIds.PEEK_TABLE)
      .fontColor($r('app.color.tavern_mute'))
      .fontSize($r('app.float.caption_text_size'))
      .padding({ top: 16, bottom: 8 })
      .opacity(this.peekOpacity)
      .offset({ x: 0, y: this.peekY })
      .scale({ x: this.peekScale * this.peekPressScale, y: this.peekScale * this.peekPressScale })
      .onTouch((event: TouchEvent) => {
        this.onPeekTouch(event);
      })
      .onClick(() => {
        if (!this.bootReady) {
          return;
        }
        LbRouter.toTable();
      })
  }

  private async begin(): Promise<void> {
    const ctx: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
    LobbyAudio.bind(ctx);
    await this.hydrate();
    LobbyAudio.setSilent(this.silent);
    LobbyAudio.prepare();
    const cold: boolean = LobbySession.takeColdStart();
    if (cold) {
      this.startColdBoot();
    } else {
      this.startReturnEnter();
    }
  }

  private startColdBoot(): void {
    const marks: BootMarks = LobbyBoot.plan(LobbyBoot.BOOT_MS_TOTAL);
    this.layerMs = marks.layerMs;
    Logger.info(TAG, `boot axis ${marks.clickableAt}ms (clamp ${LobbyBoot.BOOT_MS_MIN}-${LobbyBoot.BOOT_MS_MAX})`);

    this.arm(marks.t1At, (): void => {
      const splashOpt: AnimateParam = {
        duration: marks.t1Ms,
        curve: Curve.EaseOut
      };
      animateTo(splashOpt, (): void => {
        this.splashOpacity = 1;
      });
    });

    this.arm(marks.hitAt, (): void => {
      LobbyAudio.playBootHit();
    });

    this.arm(marks.t2At, (): void => {
      this.loadOpacity = 1;
      const loadOpt: AnimateParam = {
        duration: marks.t2Ms,
        curve: Curve.Linear
      };
      animateTo(loadOpt, (): void => {
        this.loadValue = 100;
      });
    });

    this.arm(marks.ambAt, (): void => {
      LobbyAudio.startAmb(marks.ambFadeMs);
    });

    this.arm(marks.bgmAt, (): void => {
      LobbyAudio.startBgm(marks.bgmFadeMs, false);
    });

    this.arm(marks.t3At, (): void => {
      this.revealDealerIdle(marks.t3Ms);
      const bgOpt: AnimateParam = {
        duration: marks.t3Ms,
        curve: Curve.EaseInOut
      };
      animateTo(bgOpt, (): void => {
        this.lobbyBgOpacity = 1;
        this.splashOpacity = 0;
      });
      const fadeLoad: AnimateParam = {
        duration: LobbyBoot.BOOT_MS_LOAD_FADE,
        curve: Curve.EaseOut
      };
      animateTo(fadeLoad, (): void => {
        this.loadOpacity = 0;
      });
      this.loopsAlive = true;
      this.pulseBreath();
      this.pulseCandle();
      this.pulseDust();
    });

    const voMs: number = LobbyBoot.voClockMs(this.silent);
    this.arm(marks.t4At, (): void => {
      this.crossToAnnounce();
      this.showGreet();
      LobbyAudio.playVoGreet();
      LobbyAudio.duckBgmForVo();
    }); // HARD2: vo_dealer_greet + subtitle same callback (±40ms)

    this.arm(marks.t4At + voMs, (): void => {
      LobbyAudio.unduckBgmToSteady();
    });

    this.arm(marks.t4At + voMs + LobbyBoot.BOOT_MS_ANNOUNCE_HOLD, (): void => {
      this.crossBackIdle();
    });

    this.arm(LobbyBoot.greetHideAt(marks.t4At, voMs), (): void => {
      const fadeOpt: AnimateParam = {
        duration: LobbyBoot.BOOT_MS_GREET_FADE,
        curve: Curve.EaseOut
      };
      animateTo(fadeOpt, (): void => {
        this.greetOpacity = 0;
      });
    });

    this.arm(marks.t5At, (): void => {
      this.playStagger(marks.gapMs);
    });

    this.arm(marks.clickableAt, (): void => {
      this.enableCta();
    });

    const loopAt: number = LobbyBoot.idleLoopStart(marks.clickableAt, marks.t4At, voMs);
    this.arm(loopAt, (): void => {
      this.startIdleLoop();
    });
  }

  private startReturnEnter(): void {
    Logger.info(TAG, `return enter ${LobbyBoot.BOOT_MS_RETURN_ENTER}ms — no cold axis / no greet VO`);
    this.lobbyBgOpacity = 1;
    this.idleOpacity = 1;
    this.announceOpacity = 0;
    this.greetOpacity = 0;
    this.splashOpacity = 0;
    this.loadOpacity = 0;
    this.loopsAlive = true;
    this.pulseBreath();
    this.pulseCandle();
    this.pulseDust();
    LobbyAudio.startReturnBeds(LobbyBoot.BOOT_MS_RETURN_ENTER);
    const enterOpt: AnimateParam = {
      duration: LobbyBoot.BOOT_MS_RETURN_ENTER,
      curve: Curve.EaseOut
    };
    animateTo(enterOpt, (): void => {
      this.topbarOpacity = 1;
      this.topbarY = 0;
      this.topbarScale = 1;
      this.cardOpacity = 1;
      this.cardY = 0;
      this.cardScale = 1;
      this.ctaOpacity = 1;
      this.ctaY = 0;
      this.ctaEnterScale = 1;
      this.peekOpacity = 1;
      this.peekY = 0;
      this.peekScale = 1;
    });
    this.arm(LobbyBoot.BOOT_MS_RETURN_ENTER, (): void => {
      this.enableCta();
      this.startIdleLoop();
      this.pulseCtaGlow();
      this.pulseTopbar();
    });
  }

  private revealDealerIdle(dealerMs: number): void {
    const inOpt: AnimateParam = {
      duration: dealerMs,
      curve: Curve.EaseOut
    };
    animateTo(inOpt, (): void => {
      this.idleOpacity = 1;
    });
  }

  private crossToAnnounce(): void {
    this.blinkOpacity = 0;
    this.nodOpacity = 0;
    this.cupOpacity = 0;
    this.maskOpacity = 0;
    const crossOpt: AnimateParam = {
      duration: LobbyBoot.BOOT_MS_ANNOUNCE_CROSS,
      curve: Curve.EaseInOut
    };
    animateTo(crossOpt, (): void => {
      this.idleOpacity = 0;
      this.announceOpacity = 1;
    });
  }

  private crossBackIdle(): void {
    const crossOpt: AnimateParam = {
      duration: LobbyBoot.BOOT_MS_IDLE_BACK,
      curve: Curve.EaseInOut
    };
    animateTo(crossOpt, (): void => {
      this.announceOpacity = 0;
      this.idleOpacity = 1;
    });
  }

  private showGreet(): void {
    const greetOpt: AnimateParam = {
      duration: LobbyBoot.BOOT_MS_GREET_FADE,
      curve: Curve.EaseOut
    };
    animateTo(greetOpt, (): void => {
      this.greetOpacity = 1;
    });
  }

  private playStagger(gapMs: number): void {
    this.arm(0, (): void => {
      this.enterLayer((): void => {
        this.topbarOpacity = 1;
        this.topbarY = 0;
        this.topbarScale = 1;
      });
    });
    this.arm(gapMs, (): void => {
      if (this.greetOpacity < 1) {
        this.showGreet();
      }
    });
    this.arm(gapMs * 2, (): void => {
      this.enterLayer((): void => {
        this.cardOpacity = 1;
        this.cardY = 0;
        this.cardScale = 1;
      });
    });
    this.arm(gapMs * 3, (): void => {
      this.enterLayer((): void => {
        this.ctaOpacity = 1;
        this.ctaY = 0;
        this.ctaEnterScale = 1;
      });
    });
    this.arm(gapMs * 4, (): void => {
      this.enterLayer((): void => {
        this.peekOpacity = 1;
        this.peekY = 0;
        this.peekScale = 1;
      });
    });
    this.arm(gapMs * 4 + this.layerMs, (): void => {
      this.pulseCtaGlow();
      this.pulseTopbar();
    });
  }

  private enterLayer(apply: () => void): void {
    const opt: AnimateParam = {
      duration: this.layerMs,
      curve: Curve.EaseOut
    };
    animateTo(opt, apply);
  }

  private enableCta(): void {
    this.bootReady = true;
    Logger.info(TAG, 'boot steady — lb_btn_quickstart enabled');
  }

  private startIdleLoop(): void {
    this.idleLoopAlive = true;
    this.idleMachine.reset(Date.now());
    this.arm(1200, (): void => {
      const kind: string = this.idleMachine.pickFirst(Date.now());
      this.playIdleAction(kind);
    });
  }

  private playIdleAction(kind: string): void {
    if (!this.idleLoopAlive) {
      return;
    }
    if (kind === DealerIdleKind.IDLE) {
      this.arm(400, (): void => {
        this.playIdleAction(this.nextIdleKind());
      });
      return;
    }
    const duration: number = this.idleMachine.durationOf(kind);
    const cross: number = this.crossMs(duration);
    this.cupActive = kind === DealerIdleKind.CUP;
    this.crossIdleLayer(kind, 1, cross);
    if (kind === DealerIdleKind.NOD || kind === DealerIdleKind.CUP) {
      this.arm(Math.round(duration * 0.4), (): void => {
        this.overlayBlink();
      });
    }
    this.arm(Math.max(0, duration - cross), (): void => {
      this.crossIdleLayer(kind, 0, cross);
    });
    this.arm(duration, (): void => {
      this.cupActive = false;
      this.idleMachine.markPlayed(kind, Date.now());
      this.arm(600, (): void => {
        this.playIdleAction(this.nextIdleKind());
      });
    });
  }

  private nextIdleKind(): string {
    if (!this.idleMachine.hasAccent()) {
      return this.idleMachine.pickGuaranteedAccent(Date.now(), this.cupActive);
    }
    return this.idleMachine.pick(Date.now(), this.cupActive);
  }

  private overlayBlink(): void {
    if (!this.idleLoopAlive || !this.idleMachine.canBlink(Date.now())) {
      return;
    }
    const duration: number = LobbyBoot.BOOT_MS_BLINK;
    const cross: number = this.crossMs(duration);
    this.crossIdleLayer(DealerIdleKind.BLINK, 1, cross);
    this.arm(Math.max(0, duration - cross), (): void => {
      this.crossIdleLayer(DealerIdleKind.BLINK, 0, cross);
    });
    this.arm(duration, (): void => {
      this.idleMachine.markPlayed(DealerIdleKind.BLINK, Date.now());
    });
  }

  private crossMs(duration: number): number {
    const half: number = Math.floor(duration / 2);
    if (DealerIdleMachine.CROSS_MS < half) {
      return DealerIdleMachine.CROSS_MS;
    }
    if (half < 120) {
      return half;
    }
    return half;
  }

  private crossIdleLayer(kind: string, target: number, duration: number): void {
    const opt: AnimateParam = {
      duration: duration,
      curve: Curve.EaseInOut
    };
    animateTo(opt, (): void => {
      if (kind === DealerIdleKind.BLINK) {
        this.blinkOpacity = target;
      } else if (kind === DealerIdleKind.NOD) {
        this.nodOpacity = target;
      } else if (kind === DealerIdleKind.CUP) {
        this.cupOpacity = target;
      } else if (kind === DealerIdleKind.MASK) {
        this.maskOpacity = target;
      }
    });
  }

  private pulseBreath(): void {
    if (!this.loopsAlive) {
      return;
    }
    const next: number = this.dealerScale > 1.01 ? 1.0 : 1.02;
    const opt: AnimateParam = {
      duration: Math.round(LobbyBoot.BOOT_MS_BREATH / 2),
      curve: Curve.EaseInOut,
      onFinish: (): void => {
        this.pulseBreath();
      }
    };
    animateTo(opt, (): void => {
      this.dealerScale = next;
    });
  }

  private pulseCandle(): void {
    if (!this.loopsAlive) {
      return;
    }
    const nextOp: number = this.candleOpacity > 0.85 ? 0.70 : 1.0;
    const nextSc: number = this.candleScale > 1.03 ? 1.0 : 1.06;
    const opt: AnimateParam = {
      duration: Math.round(LobbyBoot.BOOT_MS_CANDLE / 2),
      curve: Curve.EaseInOut,
      onFinish: (): void => {
        this.pulseCandle();
      }
    };
    animateTo(opt, (): void => {
      this.candleOpacity = nextOp;
      this.candleScale = nextSc;
    });
  }

  private pulseDust(): void {
    if (!this.loopsAlive) {
      return;
    }
    const nextOp: number = this.dustOpacity > 0.32 ? 0.20 : 0.45;
    const nextY: number = this.dustY > 0 ? -16 : 18;
    const opt: AnimateParam = {
      duration: Math.round(LobbyBoot.BOOT_MS_DUST / 2),
      curve: Curve.EaseInOut,
      onFinish: (): void => {
        this.pulseDust();
      }
    };
    animateTo(opt, (): void => {
      this.dustOpacity = nextOp;
      this.dustY = nextY;
    });
  }

  private pulseCtaGlow(): void {
    if (!this.loopsAlive) {
      return;
    }
    const nextOp: number = this.ctaGlowOpacity > 0.96 ? 0.92 : 1.0;
    const nextSc: number = this.ctaGlowScale > 1.005 ? 1.0 : 1.01;
    const opt: AnimateParam = {
      duration: Math.round(LobbyBoot.BOOT_MS_CTA_GLOW / 2),
      curve: Curve.EaseInOut,
      onFinish: (): void => {
        this.pulseCtaGlow();
      }
    };
    animateTo(opt, (): void => {
      this.ctaGlowOpacity = nextOp;
      this.ctaGlowScale = nextSc;
    });
  }

  private pulseTopbar(): void {
    if (!this.loopsAlive) {
      return;
    }
    const next: number = this.topbarGlow > 0.98 ? 0.96 : 1.0;
    const opt: AnimateParam = {
      duration: Math.round(LobbyBoot.BOOT_MS_TOPBAR_PULSE / 2),
      curve: Curve.EaseInOut,
      onFinish: (): void => {
        this.pulseTopbar();
      }
    };
    animateTo(opt, (): void => {
      this.topbarGlow = next;
    });
  }

  private onCtaTouch(event: TouchEvent): void {
    if (!this.bootReady) {
      return;
    }
    if (event.type === TouchType.Down) {
      this.quickstartPressed = true;
      const pressOpt: AnimateParam = {
        duration: LobbyBoot.BOOT_MS_CTA_PRESS,
        curve: Curve.EaseOut
      };
      animateTo(pressOpt, (): void => {
        this.ctaPressScale = 0.96;
      });
      LobbyAudio.playCtaTap(false);
    }
    if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
      this.quickstartPressed = false;
      const relOpt: AnimateParam = {
        duration: LobbyBoot.BOOT_MS_CTA_RELEASE,
        curve: Curve.EaseOut
      };
      animateTo(relOpt, (): void => {
        this.ctaPressScale = 1;
      });
    }
  }

  private onPeekTouch(event: TouchEvent): void {
    if (!this.bootReady) {
      return;
    }
    if (event.type === TouchType.Down) {
      const pressOpt: AnimateParam = {
        duration: LobbyBoot.BOOT_MS_CTA_PRESS,
        curve: Curve.EaseOut
      };
      animateTo(pressOpt, (): void => {
        this.peekPressScale = 0.98;
      });
      LobbyAudio.playCtaTap(true);
    }
    if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
      const relOpt: AnimateParam = {
        duration: LobbyBoot.BOOT_MS_CTA_RELEASE,
        curve: Curve.EaseOut
      };
      animateTo(relOpt, (): void => {
        this.peekPressScale = 1;
      });
    }
  }

  private onSilentChanged(on: boolean): void {
    this.silent = on;
    LobbyAudio.setSilent(on);
    this.persistSilent(on);
  }

  private async persistSilent(on: boolean): Promise<void> {
    const last: LastTable = await LocalStore.loadLastTable();
    const next: LastTable = {
      playerCount: last.playerCount,
      lives: last.lives,
      silent: on
    };
    await LocalStore.saveLastTable(next);
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

  private async hydrate(): Promise<void> {
    if (ConfigRepository.isReady()) {
      this.playerCount = ConfigRepository.match().default_players;
    }
    this.nickname = await LocalStore.loadNickname();
    const suggested: string = SmartFillAdapter.systemSuggestion();
    if (this.nickname.length === 0 && suggested.length > 0) {
      this.nickname = suggested;
    }
    const last: LastTable = await LocalStore.loadLastTable();
    this.playerCount = last.playerCount;
    this.silent = last.silent;
    AppRuntime.bootDirector();
    AppRuntime.director.stop();
    AppRuntime.engine.resetToLobby();
    Logger.info(TAG, 'lobby hydrate ready');
  }

  private async doFillLast(): Promise<void> {
    const last: LastTable = await SmartFillAdapter.fillLastTable();
    this.playerCount = last.playerCount;
    this.silent = last.silent;
    LobbyAudio.setSilent(this.silent);
    this.fillHint = `已填上次：${last.playerCount} 人 · ${last.lives} 命`;
  }

  private async doQuickStart(): Promise<void> {
    if (!this.bootReady) {
      Logger.warn(TAG, 'quickstart ignored: boot axis not finished');
      return;
    }
    if (!ConfigRepository.isReady()) {
      Logger.warn(TAG, 'quickstart ignored: config not loaded');
      return;
    }
    await LocalStore.saveNickname(this.nickname);
    const lives: number = ConfigRepository.match().lives_default;
    const table: LastTable = {
      playerCount: this.playerCount,
      lives: lives,
      silent: this.silent
    };
    await LocalStore.saveLastTable(table);
    await LocalStore.bumpLocalPlay();
    AppRuntime.bootDirector();
    const opts: StartMatchOpts = {
      nickname: this.nickname,
      playerCount: this.playerCount,
      silent: this.silent
    };
    const started: boolean = AppRuntime.engine.startMatch(opts);
    if (!started) {
      Logger.warn(TAG, 'quickstart ignored: START_MATCH rejected');
      return;
    }
    AppRuntime.director.start();
    Logger.info(TAG, 'quickstart → START_MATCH → table (1 human + AI fill)');
    LbRouter.toTable();
  }
}
