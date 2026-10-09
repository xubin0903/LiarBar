import { ControlIds } from '../../common/Ids';

/**
 * 22 §7.3 规则说明 `lb_cmp_rules_panel`（大厅 / 设置 / 暂停入口共用）。
 * 面板底图欠交 → 程序底 tavern_panel；遮罩由挂载方（大厅或暂停层）提供。
 */
@Component
export struct RulesPanel {
  onClose: () => void = () => {};
  /** 大厅竖屏 92%；局内暂停子层横屏约 100%（外层已约束宽）。 */
  panelWidthPct: string = '92%';

  build() {
    Column() {
      Row() {
        Text($r('app.string.lb_str_rules_title'))
          .fontColor($r('app.color.tavern_candle'))
          .fontSize($r('app.float.page_text_size'))
          .fontWeight(FontWeight.Medium)
          .layoutWeight(1)
        Button($r('app.string.lb_str_back'))
          .id(ControlIds.RULES_BACK)
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
        Column({ space: 14 }) {
          this.sec(ControlIds.RULES_SEC_GOAL, $r('app.string.lb_str_rules_h_goal'), $r('app.string.lb_str_rules_goal'))
          this.sec(ControlIds.RULES_SEC_DEAL, $r('app.string.lb_str_rules_h_deal'), $r('app.string.lb_str_rules_deal'))
          this.sec(ControlIds.RULES_SEC_PLAY, $r('app.string.lb_str_rules_h_play'), $r('app.string.lb_str_rules_play'))
          this.sec(ControlIds.RULES_SEC_DOUBT, $r('app.string.lb_str_rules_h_doubt'), $r('app.string.lb_str_rules_doubt'))
          this.sec(ControlIds.RULES_SEC_EMPTY, $r('app.string.lb_str_rules_h_empty'), $r('app.string.lb_str_rules_empty'))
          this.sec(ControlIds.RULES_SEC_OUT, $r('app.string.lb_str_rules_h_out'), $r('app.string.lb_str_rules_out'))
          this.sec(ControlIds.RULES_SEC_WIN, $r('app.string.lb_str_rules_h_win'), $r('app.string.lb_str_rules_win'))
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)
        .padding({ top: 12, bottom: 8 })
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(BarState.Auto)
    }
    .id(ControlIds.RULES_PANEL)
    .width(this.panelWidthPct)
    .constraintSize({ maxHeight: '86%' })
    .padding(16)
    .backgroundColor($r('app.color.tavern_panel'))
    .borderRadius(12)
    .border({ width: 1, color: $r('app.color.tavern_brass') })
  }

  @Builder
  sec(id: string, title: Resource, body: Resource) {
    Column({ space: 4 }) {
      Text(title)
        .fontColor($r('app.color.tavern_brass'))
        .fontSize($r('app.float.subtitle_text_size'))
        .fontWeight(FontWeight.Bold)
        .width('100%')
      Text(body)
        .fontColor($r('app.color.tavern_paper'))
        .fontSize($r('app.float.caption_text_size'))
        .width('100%')
    }
    .id(id)
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }
}
