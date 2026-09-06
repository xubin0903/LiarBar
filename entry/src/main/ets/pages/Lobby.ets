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

  aboutToAppear(): void {
    this.hydrate();
  }

  build() {
    Column() {
      Text($r('app.string.lb_str_app_title'))
        .fontColor($r('app.color.tavern_candle'))
        .fontSize($r('app.float.title_text_size'))
        .fontWeight(FontWeight.Bold)
        .margin({ top: 24, bottom: 10 })

      Text($r('app.string.lb_str_scaffold_banner'))
        .fontColor($r('app.color.tavern_mute'))
        .fontSize($r('app.float.subtitle_text_size'))
        .margin({ bottom: 16 })

      Image($r('app.media.art_dealer_bust_idle'))
        .id(ControlIds.DEALER)
        .width(96)
        .height(128)

      LobbyPanel({
        nickname: $nickname,
        playerCount: $playerCount,
        silent: $silent,
        onFillLast: () => {
          this.doFillLast();
        },
        onQuickStart: () => {
          this.doQuickStart();
        }
      })
        .margin({ top: 16 })

      if (this.fillHint.length > 0) {
        Text(this.fillHint)
          .fontColor($r('app.color.tavern_candle'))
          .fontSize($r('app.float.subtitle_text_size'))
      }

      Column({ space: 10 }) {
        Button($r('app.string.lb_str_nav_table'))
          .width('100%')
          .backgroundColor($r('app.color.tavern_panel'))
          .fontColor($r('app.color.tavern_paper'))
          .onClick(() => {
            LbRouter.toTable();
          })
        Button($r('app.string.lb_str_nav_challenge'))
          .width('100%')
          .backgroundColor($r('app.color.tavern_panel'))
          .fontColor($r('app.color.tavern_paper'))
          .onClick(() => {
            LbRouter.toChallenge();
          })
        Button($r('app.string.lb_str_nav_report'))
          .width('100%')
          .backgroundColor($r('app.color.tavern_panel'))
          .fontColor($r('app.color.tavern_paper'))
          .onClick(() => {
            LbRouter.toReport();
          })
      }
      .margin({ top: 20 })
      .width('100%')
    }
    .id(ScreenIds.LOBBY)
    .width('100%')
    .height('100%')
    .padding(20)
    .backgroundColor($r('app.color.tavern_bg'))
    .alignItems(HorizontalAlign.Center)
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
    Logger.info(TAG, 'quickstart stub → table (no START_MATCH)');
    LbRouter.toTable();
  }
}
