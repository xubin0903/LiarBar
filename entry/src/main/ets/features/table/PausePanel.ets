import { ControlIds, OverlayIds } from '../../common/Ids';
import { RulesPanel } from '../lobby/RulesPanel';

/**
 * 22 §6 局内暂停层 `lb_cmp_pause_layer`：MENU 五项 / BG_RESUME 单键 / SETTINGS·RULES 子层 / CONFIRM_END。
 * 遮罩 tavern_bg 0.6（22:106 55%～65%）；点遮罩不关。面板底 art_panel_base 欠 → tavern_panel。
 * 设置完整面板归设置 PR；本票 SETTINGS 子层为最小可用（标题 + 返回菜单）。
 */
@Component
export struct PausePanel {
  /** 21 §3.6：切后台进的暂停，只露「继续」+ bg note。 */
  fromBackground: boolean = false;
  /** menu | settings | rules | confirm_end */
  @Link sub: string;
  onResume: () => void = () => {};
  onOpenSettings: () => void = () => {};
  onOpenRules: () => void = () => {};
  onOpenEnd: () => void = () => {};
  onOpenLobby: () => void = () => {};
  onBackToMenu: () => void = () => {};
  onConfirmEnd: () => void = () => {};
  onCancelEnd: () => void = () => {};

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor($r('app.color.tavern_bg'))
        .opacity(0.6)
        .id(OverlayIds.MASK)
        .onClick(() => {
          // 22:106 / S21-12：遮罩吃点击，不关层。
        })
      if (this.fromBackground) {
        this.bgResumeBody()
      } else if (this.sub === 'settings') {
        this.settingsBody()
      } else if (this.sub === 'rules') {
        this.rulesBody()
      } else if (this.sub === 'confirm_end') {
        this.confirmEndBody()
      } else {
        this.menuBody()
      }
    }
    .width('100%')
    .height('100%')
    .expandSafeArea([SafeAreaType.SYSTEM, SafeAreaType.CUTOUT],
      [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM, SafeAreaEdge.START, SafeAreaEdge.END])
    .hitTestBehavior(HitTestMode.Default)
    .id(ControlIds.PAUSE_LAYER)
  }

  @Builder
  menuBody() {
    Column({ space: 12 }) {
      Text($r('app.string.lb_str_pause_title'))
        .fontColor($r('app.color.tavern_candle'))
        .fontSize($r('app.float.page_text_size'))
        .width('100%')
        .textAlign(TextAlign.Center)
      Button($r('app.string.lb_str_pause_resume'))
        .id(ControlIds.PAUSE_RESUME)
        .width('100%')
        .height($r('app.float.btn_height'))
        .backgroundColor($r('app.color.tavern_accent'))
        .fontColor($r('app.color.tavern_bg'))
        .onClick(() => {
          this.onResume();
        })
      Row({ space: 12 }) {
        Button($r('app.string.lb_str_pause_settings'))
          .id(ControlIds.PAUSE_SETTINGS)
          .layoutWeight(1)
          .height($r('app.float.btn_height'))
          .backgroundColor(Color.Transparent)
          .border({ width: 1.5, color: $r('app.color.tavern_brass') })
          .fontColor($r('app.color.tavern_paper'))
          .onClick(() => {
            this.onOpenSettings();
          })
        Button($r('app.string.lb_str_pause_rules'))
          .id(ControlIds.PAUSE_RULES)
          .layoutWeight(1)
          .height($r('app.float.btn_height'))
          .backgroundColor(Color.Transparent)
          .border({ width: 1.5, color: $r('app.color.tavern_brass') })
          .fontColor($r('app.color.tavern_paper'))
          .onClick(() => {
            this.onOpenRules();
          })
      }
      .width('100%')
      Row({ space: 12 }) {
        Button($r('app.string.lb_str_pause_end'))
          .id(ControlIds.PAUSE_END)
          .layoutWeight(1)
          .height($r('app.float.btn_height'))
          .backgroundColor(Color.Transparent)
          .border({ width: 1.5, color: $r('app.color.tavern_danger') })
          .fontColor($r('app.color.tavern_danger'))
          .onClick(() => {
            this.onOpenEnd();
          })
        Button($r('app.string.lb_str_pause_lobby'))
          .id(ControlIds.PAUSE_LOBBY)
          .layoutWeight(1)
          .height($r('app.float.btn_height'))
          .backgroundColor(Color.Transparent)
          .border({ width: 1.5, color: $r('app.color.tavern_danger') })
          .fontColor($r('app.color.tavern_danger'))
          .onClick(() => {
            this.onOpenLobby();
          })
      }
      .width('100%')
    }
    .width('44%')
    .constraintSize({ maxHeight: '86%' })
    .padding(20)
    .backgroundColor($r('app.color.tavern_panel'))
    .borderRadius(12)
    .border({ width: 1, color: $r('app.color.tavern_brass') })
  }

  @Builder
  bgResumeBody() {
    Column({ space: 14 }) {
      Text($r('app.string.lb_str_pause_title'))
        .fontColor($r('app.color.tavern_candle'))
        .fontSize($r('app.float.page_text_size'))
      Text($r('app.string.lb_str_pause_bg_note'))
        .id(ControlIds.PAUSE_BG_NOTE)
        .fontColor($r('app.color.tavern_paper'))
        .fontSize($r('app.float.caption_text_size'))
      Button($r('app.string.lb_str_pause_resume'))
        .id(ControlIds.PAUSE_RESUME)
        .width('100%')
        .height($r('app.float.btn_height'))
        .backgroundColor($r('app.color.tavern_accent'))
        .fontColor($r('app.color.tavern_bg'))
        .onClick(() => {
          this.onResume();
        })
    }
    .width('44%')
    .padding(20)
    .backgroundColor($r('app.color.tavern_panel'))
    .borderRadius(12)
    .border({ width: 1, color: $r('app.color.tavern_brass') })
  }

  @Builder
  settingsBody() {
    Column({ space: 14 }) {
      Text($r('app.string.lb_str_pause_settings'))
        .fontColor($r('app.color.tavern_candle'))
        .fontSize($r('app.float.page_text_size'))
        .width('100%')
      Button($r('app.string.lb_str_back'))
        .height($r('app.float.btn_height'))
        .width('100%')
        .backgroundColor(Color.Transparent)
        .border({ width: 1.5, color: $r('app.color.tavern_brass') })
        .fontColor($r('app.color.tavern_paper'))
        .onClick(() => {
          this.onBackToMenu();
        })
    }
    .width('44%')
    .constraintSize({ maxHeight: '86%' })
    .padding(20)
    .backgroundColor($r('app.color.tavern_panel'))
    .borderRadius(12)
    .border({ width: 1, color: $r('app.color.tavern_brass') })
  }

  @Builder
  rulesBody() {
    Column({ space: 8 }) {
      RulesPanel({
        panelWidthPct: '100%',
        onClose: () => {
          this.onBackToMenu();
        }
      })
    }
    .width('48%')
    .constraintSize({ maxHeight: '86%' })
  }

  @Builder
  confirmEndBody() {
    Column({ space: 12 }) {
      Text($r('app.string.lb_str_confirm_end_title'))
        .fontColor($r('app.color.tavern_candle'))
        .fontSize($r('app.float.page_text_size'))
        .width('100%')
        .textAlign(TextAlign.Center)
      Text($r('app.string.lb_str_confirm_end_body'))
        .fontColor($r('app.color.tavern_paper'))
        .fontSize($r('app.float.subtitle_text_size'))
        .width('100%')
        .textAlign(TextAlign.Center)
      Row({ space: 12 }) {
        Button($r('app.string.lb_str_confirm_cancel'))
          .id(ControlIds.CONFIRM_END_CANCEL)
          .layoutWeight(1)
          .height($r('app.float.btn_height'))
          .backgroundColor($r('app.color.tavern_accent'))
          .fontColor($r('app.color.tavern_bg'))
          .onClick(() => {
            this.onCancelEnd();
          })
        Button($r('app.string.lb_str_confirm_end_ok'))
          .id(ControlIds.CONFIRM_END_OK)
          .layoutWeight(1)
          .height($r('app.float.btn_height'))
          .backgroundColor(Color.Transparent)
          .border({ width: 1.5, color: $r('app.color.tavern_danger') })
          .fontColor($r('app.color.tavern_danger'))
          .onClick(() => {
            this.onConfirmEnd();
          })
      }
      .width('100%')
    }
    .id(ControlIds.CONFIRM_END)
    .width('40%')
    .padding(20)
    .backgroundColor($r('app.color.tavern_panel'))
    .borderRadius(12)
    .border({ width: 1, color: $r('app.color.tavern_brass') })
  }
}
