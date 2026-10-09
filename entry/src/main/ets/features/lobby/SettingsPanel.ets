import { ControlIds } from '../../common/Ids';
import { AudioSettings } from '../../persist/AudioSettings';
import { DemoArm } from '../../persist/DemoArm';
import { LobbyAudio } from './LobbyAudio';
import { TableAudio } from '../table/TableAudio';
import { RulesPanel } from './RulesPanel';
import { promptAction } from '@kit.ArkUI';

const VERSION_LABEL: string = '0.1.0-scaffold';
const DEMO_TAPS: number = 7;

/**
 * 22 §7.2 `lb_cmp_settings_panel`：大厅 + 暂停层共用。
 * 主页：BGM/SFX 滑条、mute_all（art_icon_mute）、规则/关于；局内静默局只读提示。
 * 关于子页：版本 7 连点解锁演示（仅 allowDemoUnlock）；面板底 tavern_panel（art_panel_base 欠）。
 */
@Component
export struct SettingsPanel {
  /** true = 大厅入口（可解锁演示）；false = 暂停层（永不挂 demo）。 */
  allowDemoUnlock: boolean = false;
  /** 局内静默局只读提示。 */
  silentMatchNote: boolean = false;
  /** 横屏局内约 52%；大厅竖屏 92%。 */
  panelWidthPct: string = '92%';
  onClose: () => void = () => {};

  @State private sub: string = 'main'; // main | about | rules
  @State private bgm: number = 100;
  @State private sfx: number = 100;
  @State private muted: boolean = false;
  @State private demoUnlocked: boolean = false;
  @State private demoOn: boolean = false;
  @State private versionTaps: number = 0;
  private listener: () => void = () => {};

  aboutToAppear(): void {
    this.pull();
    this.demoUnlocked = this.allowDemoUnlock && DemoArm.isUnlocked();
    this.demoOn = DemoArm.isArmed();
    this.listener = (): void => {
      this.pull();
    };
    AudioSettings.addListener(this.listener);
  }

  aboutToDisappear(): void {
    AudioSettings.removeListener(this.listener);
  }

  private pull(): void {
    this.bgm = AudioSettings.bgmLevel();
    this.sfx = AudioSettings.sfxLevel();
    this.muted = AudioSettings.isMuted();
  }

  private previewSfx(): void {
    if (this.silentMatchNote) {
      TableAudio.playTurnTick();
    } else {
      LobbyAudio.playCtaTap(true);
    }
  }

  build() {
    if (this.sub === 'rules') {
      RulesPanel({
        panelWidthPct: this.panelWidthPct,
        onClose: () => {
          this.sub = 'main';
        }
      })
    } else if (this.sub === 'about') {
      this.aboutBody()
    } else {
      this.mainBody()
    }
  }

  @Builder
  mainBody() {
    Column() {
      Row() {
        Text($r('app.string.lb_str_settings'))
          .fontColor($r('app.color.tavern_candle'))
          .fontSize($r('app.float.page_text_size'))
          .fontWeight(FontWeight.Medium)
          .layoutWeight(1)
        Button($r('app.string.lb_str_back'))
          .id(ControlIds.SETTINGS_BACK)
          .height($r('app.float.btn_height'))
          .backgroundColor(Color.Transparent)
          .border({ width: 1.5, color: $r('app.color.tavern_brass') })
          .fontColor($r('app.color.tavern_paper'))
          .onClick(() => {
            this.onClose();
          })
      }
      .width('100%')
      .alignItems(VerticalAlign.Center)

      Scroll() {
        Column({ space: 16 }) {
          this.volRow(ControlIds.VOL_BGM, $r('app.string.lb_str_set_bgm'), this.bgm, (v: number) => {
            this.bgm = v;
            AudioSettings.setBgmLevel(v);
          }, false)
          this.volRow(ControlIds.VOL_SFX, $r('app.string.lb_str_set_sfx'), this.sfx, (v: number) => {
            this.sfx = v;
            AudioSettings.setSfxLevel(v);
          }, true)

          Row({ space: 10 }) {
            Image(this.muted ? $r('app.media.art_icon_mute_on') : $r('app.media.art_icon_mute'))
              .id(ControlIds.ICO_MUTE)
              .width(28)
              .height(28)
              .objectFit(ImageFit.Contain)
            Column({ space: 2 }) {
              Text($r('app.string.lb_str_set_mute'))
                .fontColor($r('app.color.tavern_paper'))
                .fontSize($r('app.float.subtitle_text_size'))
                .width('100%')
              Text($r('app.string.lb_str_set_mute_hint'))
                .fontColor($r('app.color.tavern_mute'))
                .fontSize($r('app.float.caption_text_size'))
                .width('100%')
            }
            .layoutWeight(1)
            .alignItems(HorizontalAlign.Start)
            Toggle({ type: ToggleType.Switch, isOn: this.muted })
              .id(ControlIds.TOG_MUTE)
              .selectedColor($r('app.color.tavern_accent'))
              .onChange((on: boolean) => {
                this.muted = on;
                AudioSettings.setMuted(on);
              })
          }
          .width('100%')
          .alignItems(VerticalAlign.Center)

          if (this.silentMatchNote) {
            Row({ space: 10 }) {
              Image($r('app.media.art_icon_silent_match_on'))
                .id(ControlIds.ICO_SILENT_MATCH)
                .width(28)
                .height(28)
                .objectFit(ImageFit.Contain)
              Text($r('app.string.lb_str_set_silent_match_note'))
                .fontColor($r('app.color.tavern_candle'))
                .fontSize($r('app.float.caption_text_size'))
                .layoutWeight(1)
            }
            .width('100%')
            .alignItems(VerticalAlign.Center)
          }

          this.linkRow(ControlIds.SETTINGS_RULES, $r('app.string.lb_str_set_rules'), () => {
            this.sub = 'rules';
          })
          this.linkRow(ControlIds.SETTINGS_ABOUT, $r('app.string.lb_str_set_about'), () => {
            this.sub = 'about';
            this.versionTaps = 0;
          })
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)
        .padding({ top: 12, bottom: 8 })
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(BarState.Auto)
    }
    .id(ControlIds.SETTINGS_PANEL)
    .width(this.panelWidthPct)
    .constraintSize({ maxHeight: '86%' })
    .padding(16)
    .backgroundColor($r('app.color.tavern_panel'))
    .borderRadius(12)
    .border({ width: 1, color: $r('app.color.tavern_brass') })
  }

  @Builder
  volRow(id: string, label: Resource, value: number, onEnd: (v: number) => void, sfxPreview: boolean) {
    Column({ space: 6 }) {
      Row() {
        Text(label)
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.subtitle_text_size'))
          .layoutWeight(1)
        Text(`${value}`)
          .fontColor($r('app.color.tavern_brass'))
          .fontSize($r('app.float.caption_text_size'))
      }
      .width('100%')
      Slider({
        value: value,
        min: AudioSettings.LEVEL_MIN,
        max: AudioSettings.LEVEL_MAX,
        step: AudioSettings.LEVEL_STEP,
        style: SliderStyle.OutSet
      })
        .id(id)
        .width('100%')
        .selectedColor($r('app.color.tavern_accent'))
        .trackColor($r('app.color.tavern_shadow'))
        .blockColor($r('app.color.tavern_brass'))
        .opacity(this.muted ? 0.5 : 1)
        .onChange((v: number, mode: SliderChangeMode) => {
          if (mode === SliderChangeMode.End || mode === SliderChangeMode.Click) {
            onEnd(v);
            if (sfxPreview) {
              this.previewSfx();
            }
          } else {
            // 拖动中只跟增益，不写盘。
            if (id === ControlIds.VOL_BGM) {
              this.bgm = v;
              AudioSettings.applyBgmLive(v);
            } else {
              this.sfx = v;
              AudioSettings.applySfxLive(v);
            }
          }
        })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }

  @Builder
  linkRow(id: string, label: Resource, onTap: () => void) {
    Row() {
      Text(label)
        .fontColor($r('app.color.tavern_paper'))
        .fontSize($r('app.float.subtitle_text_size'))
        .layoutWeight(1)
      Text('›')
        .fontColor($r('app.color.tavern_brass'))
        .fontSize($r('app.float.page_text_size'))
    }
    .id(id)
    .width('100%')
    .height(44)
    .alignItems(VerticalAlign.Center)
    .onClick(() => {
      onTap();
    })
  }

  @Builder
  aboutBody() {
    Column() {
      Row() {
        Text($r('app.string.lb_str_set_about'))
          .fontColor($r('app.color.tavern_candle'))
          .fontSize($r('app.float.page_text_size'))
          .fontWeight(FontWeight.Medium)
          .layoutWeight(1)
        Button($r('app.string.lb_str_back'))
          .height($r('app.float.btn_height'))
          .backgroundColor(Color.Transparent)
          .border({ width: 1.5, color: $r('app.color.tavern_brass') })
          .fontColor($r('app.color.tavern_paper'))
          .onClick(() => {
            this.sub = 'main';
          })
      }
      .width('100%')

      Scroll() {
        Column({ space: 12 }) {
          Text($r('app.string.lb_str_set_about_body'))
            .fontColor($r('app.color.tavern_paper'))
            .fontSize($r('app.float.caption_text_size'))
            .width('100%')
          // 版本整行热区 ≥44vp（S22-21）；仅大厅连点计数。
          Row() {
            Text(`版本 ${VERSION_LABEL}`)
              .fontColor($r('app.color.tavern_brass'))
              .fontSize($r('app.float.subtitle_text_size'))
          }
          .id(ControlIds.ABOUT_VERSION)
          .width('100%')
          .height(44)
          .alignItems(VerticalAlign.Center)
          .onClick(() => {
            if (!this.allowDemoUnlock) {
              return;
            }
            this.versionTaps = this.versionTaps + 1;
            if (this.versionTaps >= DEMO_TAPS && !this.demoUnlocked) {
              DemoArm.unlock();
              this.demoUnlocked = true;
              this.versionTaps = 0;
            }
          })
          Text($r('app.string.lb_str_set_credits'))
            .fontColor($r('app.color.tavern_mute'))
            .fontSize($r('app.float.caption_text_size'))
            .width('100%')
          if (this.allowDemoUnlock && this.demoUnlocked) {
            Row({ space: 10 }) {
              Column({ space: 2 }) {
                Text($r('app.string.lb_str_set_demo'))
                  .fontColor($r('app.color.tavern_paper'))
                  .fontSize($r('app.float.subtitle_text_size'))
                  .width('100%')
                Text($r('app.string.lb_str_set_demo_hint'))
                  .fontColor($r('app.color.tavern_mute'))
                  .fontSize($r('app.float.caption_text_size'))
                  .width('100%')
              }
              .layoutWeight(1)
              .alignItems(HorizontalAlign.Start)
              Toggle({ type: ToggleType.Switch, isOn: this.demoOn })
                .id(ControlIds.TOG_DEMO)
                .selectedColor($r('app.color.tavern_accent'))
                .onChange((on: boolean) => {
                  this.demoOn = on;
                  DemoArm.setArmed(on);
                  if (on) {
                    try {
                      promptAction.showToast({ message: $r('app.string.lb_str_demo_armed'), duration: 2000 });
                    } catch (_e) {
                      // fail-soft
                    }
                  }
                })
            }
            .width('100%')
            .alignItems(VerticalAlign.Center)
          }
        }
        .width('100%')
        .padding({ top: 12, bottom: 8 })
      }
      .layoutWeight(1)
      .width('100%')
    }
    .id(ControlIds.ABOUT_PAGE)
    .width(this.panelWidthPct)
    .constraintSize({ maxHeight: '86%' })
    .padding(16)
    .backgroundColor($r('app.color.tavern_panel'))
    .borderRadius(12)
    .border({ width: 1, color: $r('app.color.tavern_brass') })
  }
}
