import { common } from '@kit.AbilityKit';
import { AppRuntime } from '../common/AppRuntime';
import { ControlIds, ScreenIds } from '../common/Ids';
import { LbRouter } from '../common/LbRouter';
import { Logger } from '../common/Logger';
import { ConfigRepository } from '../config/ConfigRepository';
import { StartMatchOpts } from '../engine/MatchEngine';
import { LobbyAudio } from '../features/lobby/LobbyAudio';
import { BootMarks, LobbyBoot } from '../features/lobby/LobbyBoot';
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
  @State greetOpacity: number = 0;
  @State topbarOpacity: number = 0;
  @State topbarY: number = 12;
  @State topbarScale: number = 0.96;
  @State cardOpacity: number = 0;
  @State cardY: number = 12;
  @State cardScale: number = 0.96;
  @State ctaOpacity: number = 0;
  @State ctaY: number = 12;
  @State ctaEnterScale: number = 0.96;
  @State ctaPressScale: number = 1;
  @State peekOpacity: number = 0;
  @State peekY: number = 12;
  @State peekScale: number = 0.96;
  @State dealerScale: number = 1;
  @State candleOpacity: number = 0.72;
  private timerIds: number[] = [];
  private loopsAlive: boolean = false;
  private layerMs: number = LobbyBoot.BOOT_MS_LAYER;

  aboutToAppear(): void {
    this.begin();
  }

  aboutToDisappear(): void {
    this.loopsAlive = false;
    this.clearTimers();
    LobbyAudio.release();
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

      Column() {
        Blank()
      }
      .width('100%')
      .height(96)
      .backgroundColor($r('app.color.tavern_candle'))
      .opacity(this.candleOpacity * 0.14)
      .hitTestBehavior(HitTestMode.None)
      .align(Alignment.Bottom)

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
    .opacity(this.topbarOpacity)
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
    .opacity(this.ctaOpacity)
    .offset({ x: 0, y: this.ctaY })
    .scale({ x: this.ctaEnterScale * this.ctaPressScale, y: this.ctaEnterScale * this.ctaPressScale })
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
      .scale({ x: this.peekScale, y: this.peekScale })
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
    this.startBoot();
  }

  private startBoot(): void {
    const marks: BootMarks = LobbyBoot.plan(LobbyBoot.BOOT_MS_TOTAL);
    this.layerMs = marks.layerMs;
    Logger.info(TAG, `boot axis ${marks.steadyAt}ms (clamp ${LobbyBoot.BOOT_MS_MIN}-${LobbyBoot.BOOT_MS_MAX})`);
    LobbyAudio.playBoot();

    const splashOpt: AnimateParam = {
      duration: marks.splashMs,
      curve: Curve.EaseOut
    };
    animateTo(splashOpt, (): void => {
      this.splashOpacity = 1;
    });

    this.arm(marks.loadAt, (): void => {
      this.loadOpacity = 1;
      const loadOpt: AnimateParam = {
        duration: marks.loadMs,
        curve: Curve.Linear
      };
      animateTo(loadOpt, (): void => {
        this.loadValue = 100;
      });
    });

    this.arm(marks.dealerAt, (): void => {
      this.revealDealer(marks.dealerMs);
      const bgOpt: AnimateParam = {
        duration: marks.dealerMs + marks.staggerMs,
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
    });

    this.arm(marks.staggerAt, (): void => {
      this.playStagger(marks.gapMs);
    });

    this.arm(marks.steadyAt, (): void => {
      this.enterSteady();
    });
  }

  private revealDealer(dealerMs: number): void {
    const half: number = Math.max(1, Math.round(dealerMs / 2));
    const inOpt: AnimateParam = {
      duration: half,
      curve: Curve.EaseOut
    };
    animateTo(inOpt, (): void => {
      this.idleOpacity = 1;
    });
    this.arm(half, (): void => {
      const crossOpt: AnimateParam = {
        duration: half,
        curve: Curve.EaseInOut
      };
      animateTo(crossOpt, (): void => {
        this.idleOpacity = 0;
        this.announceOpacity = 1;
      });
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
      const greetOpt: AnimateParam = {
        duration: LobbyBoot.BOOT_MS_GREET,
        curve: Curve.EaseOut
      };
      animateTo(greetOpt, (): void => {
        this.greetOpacity = 1;
      });
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
  }

  private enterLayer(apply: () => void): void {
    const opt: AnimateParam = {
      duration: this.layerMs,
      curve: Curve.EaseOut
    };
    animateTo(opt, apply);
  }

  private enterSteady(): void {
    this.bootReady = true;
    this.loopsAlive = true;
    LobbyAudio.startAmbient();
    this.pulseBreath();
    this.pulseCandle();
    Logger.info(TAG, 'boot steady — lb_btn_quickstart enabled');
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
    const next: number = this.candleOpacity > 0.86 ? 0.72 : 1.0;
    const opt: AnimateParam = {
      duration: Math.round(LobbyBoot.BOOT_MS_CANDLE / 2),
      curve: Curve.EaseInOut,
      onFinish: (): void => {
        this.pulseCandle();
      }
    };
    animateTo(opt, (): void => {
      this.candleOpacity = next;
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
      LobbyAudio.playCta();
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
    Logger.info(TAG, 'cold start lobby ready');
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
