import { common } from '@kit.AbilityKit';
import { ControlIds } from '../../common/Ids';
import { Logger } from '../../common/Logger';
import { RecordsModel, RecordsRowView, RecordsView, RECORDS_TEXT_KEYS } from './RecordsModel';

const TAG = 'RecordsPanel';

/**
 * 22 §7.1 战绩大厅叠层面板 `lb_cmp_records_panel`（非路由页）。
 * 面板底图欠交 → 程序底 tavern_panel（同出局二选一临时口径）；遮罩由大厅挂 lb_cmp_overlay_mask。
 */
@Component
export struct RecordsPanel {
  onClose: () => void = () => {};
  @State private view: RecordsView = new RecordsView();

  aboutToAppear(): void {
    this.view = RecordsModel.build(this.readTexts());
  }

  build() {
    Column() {
      Row() {
        Text($r('app.string.lb_str_records'))
          .fontColor($r('app.color.tavern_candle'))
          .fontSize($r('app.float.page_text_size'))
          .fontWeight(FontWeight.Medium)
          .layoutWeight(1)
        Button($r('app.string.lb_str_back'))
          .id(ControlIds.RECORDS_BACK)
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

      if (this.view.empty) {
        Blank().layoutWeight(1)
        Text($r('app.string.lb_str_records_empty'))
          .fontColor($r('app.color.tavern_mute'))
          .fontSize($r('app.float.subtitle_text_size'))
          .textAlign(TextAlign.Center)
          .width('100%')
        Blank().layoutWeight(1)
      } else {
        Column({ space: 6 }) {
          Text(this.view.sumLine)
            .fontColor($r('app.color.tavern_paper'))
            .fontSize($r('app.float.subtitle_text_size'))
            .width('100%')
          Text(this.view.doubtLine)
            .fontColor($r('app.color.tavern_mute'))
            .fontSize($r('app.float.caption_text_size'))
            .width('100%')
          Text(this.view.quitLine)
            .fontColor($r('app.color.tavern_mute'))
            .fontSize($r('app.float.caption_text_size'))
            .width('100%')
        }
        .id(ControlIds.RECORDS_SUMMARY)
        .width('100%')
        .margin({ top: 12, bottom: 8 })
        .alignItems(HorizontalAlign.Start)

        Text($r('app.string.lb_str_rec_recent'))
          .fontColor($r('app.color.tavern_brass'))
          .fontSize($r('app.float.caption_text_size'))
          .width('100%')
          .margin({ bottom: 4 })

        List({ space: 0 }) {
          ForEach(this.view.rows, (row: RecordsRowView) => {
            ListItem() {
              this.rowItem(row)
            }
          }, (row: RecordsRowView) => row.id)
        }
        .id(ControlIds.LIST_RECORDS)
        .width('100%')
        .layoutWeight(1)
        .scrollBar(BarState.Auto)
      }
    }
    .id(ControlIds.RECORDS_PANEL)
    .width('92%')
    .constraintSize({ maxHeight: '86%' })
    .padding(16)
    .backgroundColor($r('app.color.tavern_panel'))
    .borderRadius(12)
    .border({ width: 1, color: $r('app.color.tavern_brass') })
  }

  @Builder
  rowItem(row: RecordsRowView) {
    Row() {
      Column({ space: 2 }) {
        Text(row.main)
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.subtitle_text_size'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .width('100%')
        Text(row.detail)
          .fontColor($r('app.color.tavern_mute'))
          .fontSize($r('app.float.caption_text_size'))
          .width('100%')
        Text(row.opp)
          .fontColor($r('app.color.tavern_mute'))
          .fontSize($r('app.float.caption_text_size'))
          .width('100%')
      }
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Start)
      Text(row.tag)
        .fontColor(row.kind === 'win' ? $r('app.color.tavern_success') :
          (row.kind === 'quit' ? $r('app.color.tavern_danger') : $r('app.color.tavern_mute')))
        .fontSize($r('app.float.subtitle_text_size'))
        .fontWeight(FontWeight.Medium)
        .margin({ left: 8 })
    }
    .id(row.id)
    .width('100%')
    .padding({ top: 10, bottom: 10 })
    .border({ width: { bottom: 1 }, color: $r('app.color.tavern_shadow') })
    .alignItems(VerticalAlign.Center)
  }

  private readTexts(): Map<string, string> {
    const texts: Map<string, string> = new Map<string, string>();
    try {
      const ctx: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
      for (let i = 0; i < RECORDS_TEXT_KEYS.length; i++) {
        try {
          texts.set(RECORDS_TEXT_KEYS[i], ctx.resourceManager.getStringByNameSync(RECORDS_TEXT_KEYS[i]));
        } catch (err) {
          Logger.warn(TAG, `records text miss ${RECORDS_TEXT_KEYS[i]}`);
        }
      }
    } catch (err) {
      Logger.warn(TAG, 'records texts: no context');
    }
    return texts;
  }
}
