import { AppRuntime } from '../common/AppRuntime';
import { ControlIds, ScreenIds } from '../common/Ids';
import { LbRouter } from '../common/LbRouter';
import { Logger } from '../common/Logger';
import { ConfigRepository } from '../config/ConfigRepository';
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
  @State peekOpen: boolean = false;
  @State quickstartPressed: boolean = false;

  aboutToAppear(): void {
    this.hydrate();
  }

  build() {
    Stack() {
      Image($r('app.media.art_lobby_bg'))
        .width('100%')
        .height('100%')
        .objectFit(ImageFit.Cover)

      Column() {
        Scroll() {
          Column() {
            Text($r('app.string.lb_str_app_title'))
              .fontColor($r('app.color.tavern_candle'))
              .fontSize($r('app.float.title_text_size'))
              .fontWeight(FontWeight.Bold)
              .margin({ top: 20, bottom: 8 })

            Image($r('app.media.art_dealer_bust_idle'))
              .id(ControlIds.DEALER)
              .width($r('app.float.dealer_bust_w'))
              .height($r('app.float.dealer_bust_h'))
              .objectFit(ImageFit.Contain)
              .margin({ top: 4, bottom: 8 })

            Text($r('app.string.lb_str_dlr_lobby_full'))
              .fontColor($r('app.color.tavern_paper'))
              .fontSize($r('app.float.page_text_size'))
              .margin({ bottom: 16 })

            LobbyPanel({
              nickname: $nickname,
              playerCount: $playerCount,
              silent: $silent,
              onFillLast: () => {
                this.doFillLast();
              }
            })

            if (this.fillHint.length > 0) {
              Text(this.fillHint)
                .fontColor($r('app.color.tavern_candle'))
                .fontSize($r('app.float.caption_text_size'))
                .margin({ top: 8 })
            }

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
                .onTouch((event: TouchEvent) => {
                  if (event.type === TouchType.Down) {
                    this.quickstartPressed = true;
                  }
                  if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                    this.quickstartPressed = false;
                  }
                })
                .onClick(() => {
                  this.doQuickStart();
                })
            }
            .width('100%')
            .height($r('app.float.cta_height'))
            .margin({ top: 20 })
          }
          .width('100%')
          .alignItems(HorizontalAlign.Center)
        }
        .scrollBar(BarState.Off)
        .width('100%')
        .layoutWeight(1)

        Column({ space: 8 }) {
          Text($r('app.string.lb_str_nav_peek'))
            .fontColor($r('app.color.tavern_mute'))
            .fontSize($r('app.float.caption_text_size'))
            .padding({ top: 16, bottom: 4 })
            .onClick(() => {
              this.peekOpen = !this.peekOpen;
            })

          if (this.peekOpen) {
            Column({ space: 8 }) {
              Text($r('app.string.lb_str_nav_table'))
                .fontColor($r('app.color.tavern_mute'))
                .fontSize($r('app.float.subtitle_text_size'))
                .padding({ top: 4, bottom: 4 })
                .onClick(() => {
                  LbRouter.toTable();
                })
              Text($r('app.string.lb_str_nav_challenge'))
                .fontColor($r('app.color.tavern_mute'))
                .fontSize($r('app.float.subtitle_text_size'))
                .padding({ top: 4, bottom: 4 })
                .onClick(() => {
                  LbRouter.toChallenge();
                })
              Text($r('app.string.lb_str_nav_report'))
                .fontColor($r('app.color.tavern_mute'))
                .fontSize($r('app.float.subtitle_text_size'))
                .padding({ top: 4, bottom: 4 })
                .onClick(() => {
                  LbRouter.toReport();
                })
            }
            .alignItems(HorizontalAlign.Center)
          }
        }
        .width('100%')
        .alignItems(HorizontalAlign.Center)
      }
      .width('100%')
      .height('100%')
      .padding({ left: 20, right: 20, top: 8, bottom: 20 })
      .alignItems(HorizontalAlign.Center)
    }
    .id(ScreenIds.LOBBY)
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.tavern_bg'))
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
    this.fillHint = `已填上次：${last.playerCount} 人 · ${last.lives} 命`;
  }

  private async doQuickStart(): Promise<void> {
    if (!ConfigRepository.isReady()) {
      Logger.warn(TAG, 'quickstart ignored: config not loaded');
      return;
    }
    await LocalStore.saveNickname(this.nickname);
    const lives: number = ConfigRepository.match().lives_default;
    await LocalStore.saveLastTable({
      playerCount: this.playerCount,
      lives: lives,
      silent: this.silent
    });
    await LocalStore.bumpLocalPlay();
    AppRuntime.bootDirector();
    const started: boolean = AppRuntime.engine.startMatch({
      nickname: this.nickname,
      playerCount: this.playerCount,
      silent: this.silent
    });
    if (!started) {
      Logger.warn(TAG, 'quickstart ignored: START_MATCH rejected');
      return;
    }
    AppRuntime.director.start();
    Logger.info(TAG, 'quickstart → START_MATCH → table (1 human + AI fill)');
    LbRouter.toTable();
  }
}
