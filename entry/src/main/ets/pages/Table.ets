import { common } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { ControlIds, ScreenIds } from '../common/Ids';
import { LbRouter } from '../common/LbRouter';
import { Logger } from '../common/Logger';
import { ConfigRepository } from '../config/ConfigRepository';
import { SpectatorStub } from '../features/spectator/SpectatorStub';
import { PeekMaskOverlay, PlaySheetOverlay } from '../features/table/TableOverlays';
import { TutorialStub } from '../features/tutorial/TutorialStub';
import { PeekPrivacyAdapter } from '../harmony/PeekPrivacyAdapter';

const TAG = 'Table';

@Entry
@Component
struct Table {
  @State showPeek: boolean = false;
  @State showPlay: boolean = false;
  @State cardIndexes: number[] = [];

  aboutToAppear(): void {
    this.cardIndexes = Table.buildCardIndexes();
    Logger.info(TAG, 'table stub (no match running)');
  }

  build() {
    Stack() {
      Image($r('app.media.art_table_bg'))
        .width('100%')
        .height('100%')
        .objectFit(ImageFit.Cover)

      Column() {
        Text($r('app.string.lb_str_table_placeholder'))
          .fontColor($r('app.color.tavern_candle'))
          .fontSize($r('app.float.subtitle_text_size'))
          .margin({ top: 20, bottom: 10 })

        Row({ space: 10 }) {
          Image($r('app.media.art_dealer_bust_announce'))
            .id(ControlIds.DEALER)
            .width(72)
            .height(96)
          Column({ space: 4 }) {
            Text($r('app.string.lb_str_claim_fmt'))
              .id('lb_txt_claim')
              .fontColor($r('app.color.tavern_paper'))
            Text('--')
              .id('lb_txt_timer')
              .fontColor($r('app.color.tavern_accent'))
          }
          .id(ControlIds.TOPBAR)
        }

        Row({ space: 12 }) {
          Image($r('app.media.art_frame_player_idle')).width(48).height(48).id('lb_cmp_seat_self')
          Image($r('app.media.art_ai_timid_idle')).width(48).height(48).id('lb_cmp_seat_p1')
          Image($r('app.media.art_ai_shark_idle')).width(48).height(48).id('lb_cmp_seat_p2')
          Image($r('app.media.art_ai_karen_idle')).width(48).height(48).id('lb_cmp_seat_p3')
        }
        .margin({ top: 12 })

        Image($r('app.media.art_pool_slot'))
          .id('lb_cmp_pool')
          .width(56)
          .height(76)
          .margin({ top: 12 })

        Row({ space: 6 }) {
          ForEach(this.cardIndexes, (idx: number) => {
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

        Button($r('app.string.lb_str_challenge'))
          .id(ControlIds.CHALLENGE)
          .enabled(false)
          .backgroundColor($r('app.color.tavern_panel'))
          .fontColor($r('app.color.tavern_mute'))
          .margin({ top: 12 })

        Text($r('app.string.lb_str_challenge_disabled_first'))
          .fontColor($r('app.color.tavern_mute'))
          .fontSize($r('app.float.subtitle_text_size'))

        Button($r('app.string.lb_str_overlay_play'))
          .backgroundColor($r('app.color.tavern_panel'))
          .fontColor($r('app.color.tavern_paper'))
          .margin({ top: 10 })
          .onClick(() => {
            this.showPlay = true;
          })

        SpectatorStub()
        TutorialStub()

        Column({ space: 10 }) {
          Button($r('app.string.lb_str_nav_challenge'))
            .width('100%')
            .onClick(() => {
              LbRouter.toChallenge();
            })
          Button($r('app.string.lb_str_nav_report'))
            .width('100%')
            .onClick(() => {
              LbRouter.toReport();
            })
          Button($r('app.string.lb_str_home'))
            .width('100%')
            .onClick(() => {
              LbRouter.toLobby();
            })
        }
        .margin({ top: 16 })
        .width('100%')

        PeekMaskOverlay({
          visible: $showPeek,
          onClose: () => {
            this.closePeek();
          }
        })
        PlaySheetOverlay({
          visible: $showPlay,
          onClose: () => {
            this.showPlay = false;
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

  private static buildCardIndexes(): number[] {
    const out: number[] = [];
    if (!ConfigRepository.isReady()) {
      return out;
    }
    const n: number = ConfigRepository.match().hand_size_default;
    for (let i = 0; i < n; i++) {
      out.push(i);
    }
    return out;
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
