import { ControlIds } from '../../common/Ids';
import { ReportCardView, ReportRowView, ReportView } from './ReportModel';

/**
 * 结算战报版面（22 §4）：顶区固定 → 主体（唯一可滚区）→ 按钮条固定贴底，不在 Scroll 内（S21-28 / S22-02）。
 * 只摆 ReportModel 算好的 view，不读引擎。素材只复用已有 id（结果条 / 三枚高光徽章 / 14b 烛身 + 熄尽态）。
 */
@Component
export struct ReportPanel {
  view: ReportView = new ReportView();
  onAgain: () => void = () => {};
  onHome: () => void = () => {};
  /** L-small（短边 < 320vp）：两栏改单栏（22 §4.5）。 */
  @State narrow: boolean = false;
  /** L-fold（1.20 ≤ W/H < 1.60，且不是 L-small）：仍两栏，左右外边距各 8%（22 §4.5 · 22:283）。 */
  @State fold: boolean = false;

  build() {
    Column() {
      this.head()
      Scroll() {
        if (this.narrow) {
          Column({ space: 12 }) {
            this.recapTable()
            this.highlights()
          }
          .id(ControlIds.REPORT_BODY)
          .width('100%')
        } else {
          Row({ space: 12 }) {
            this.recapTable()
            this.highlights()
          }
          .id(ControlIds.REPORT_BODY)
          .width('100%')
          .alignItems(VerticalAlign.Top)
        }
      }
      .id(ControlIds.REPORT_SCROLL)
      .width('100%')
      .layoutWeight(1)
      .scrollable(ScrollDirection.Vertical)
      .scrollBar(BarState.Auto)
      .edgeEffect(EdgeEffect.Spring)
      .align(Alignment.Top)
      .padding({ left: 16, right: 16 })
      this.btnBar()
    }
    .width('100%')
    .height('100%')
    .padding({ left: this.fold ? '8%' : 0, right: this.fold ? '8%' : 0 })
    .onAreaChange((oldArea: Area, newArea: Area) => {
      this.applyTier(Number(newArea.width), Number(newArea.height));
    })
  }

  /** 22 §4.5 档位：L-small = 短边 < 320vp（单栏）；L-fold = 1.20 ≤ W/H < 1.60（两栏 + 左右 8%）；其余 = L-phone。 */
  applyTier(w: number, h: number): void {
    this.narrow = Math.min(w, h) < 320;
    const ratio: number = h > 0 ? w / h : 0;
    this.fold = !this.narrow && ratio >= 1.20 && ratio < 1.60;
  }

  @Builder
  head() {
    Column({ space: 1 }) {
      Stack() {
        if (this.view.humanWon) {
          Image($r('app.media.art_result_bar_win'))
            .width('100%')
            .height('100%')
            .objectFit(ImageFit.Fill)
        } else {
          Image($r('app.media.art_result_bar_lose'))
            .width('100%')
            .height('100%')
            .objectFit(ImageFit.Fill)
        }
        Text(this.view.topText)
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.page_text_size'))
          .fontWeight(FontWeight.Bold)
      }
      .width('100%')
      .height(30)
      Row({ space: 12 }) {
        Text(this.view.winnerText)
          .id(ControlIds.WINNER)
          .fontColor($r('app.color.tavern_candle'))
          .fontSize($r('app.float.subtitle_text_size'))
          .lineHeight(18)
          .maxLines(1)
        Text(`${this.view.durationText} · ${this.view.roundsText}`)
          .fontColor($r('app.color.tavern_mute'))
          .fontSize(12)
          .lineHeight(18)
          .maxLines(1)
      }
      if (this.view.ffNote) {
        Text($r('app.string.lb_str_rpt_ff_note'))
          .id(ControlIds.REPORT_FF_NOTE)
          .fontColor($r('app.color.tavern_mute'))
          .fontSize(11)
          .lineHeight(14)
          .maxLines(1)
      }
    }
    .id(ControlIds.REPORT_HEAD)
    .width('100%')
    // 22:211 顶区 ≤20%。360vp 横屏 20% = 72vp：上 4 + 结果条 30 + 1 + 胜者行 18 + 1 + 快进附注 14 + 下 2 = 70vp，快进局也放得下。
    .constraintSize({ maxHeight: '20%' })
    .clip(true)
    .padding({ left: 16, right: 16, top: 4, bottom: 2 })
  }

  @Builder
  recapTable() {
    Column() {
      Row() {
        this.headCell($r('app.string.lb_str_rpt_col_seat'), 3)
        this.headCell($r('app.string.lb_str_rpt_col_candles'), 2.4)
        this.headCell($r('app.string.lb_str_rpt_col_burnt'), 1)
        this.headCell($r('app.string.lb_str_rpt_col_play'), 1)
        this.headCell($r('app.string.lb_str_rpt_col_fake'), 1)
        this.headCell($r('app.string.lb_str_rpt_col_doubt'), 1)
        this.headCell($r('app.string.lb_str_rpt_col_hit'), 1)
        this.headCell($r('app.string.lb_str_rpt_col_rank'), 3.2)
      }
      .width('100%')
      .height(28)
      ForEach(this.view.rows, (r: ReportRowView) => {
        this.recapRow(r)
      }, (r: ReportRowView) => r.slot)
    }
    .id(ControlIds.RECAP_LIST)
    .width('100%')
    // 22 §4.2 两栏 ≈58 / 42 按权重分「行宽 − 12vp 栏缝」（不再 58% + 42% + 12vp 溢出）；单栏不加权。
    .layoutWeight(this.narrow ? 0 : 58)
  }

  @Builder
  headCell(label: Resource, weight: number) {
    Text(label)
      .layoutWeight(weight)
      .fontColor($r('app.color.tavern_mute'))
      .fontSize(12)
      .textAlign(TextAlign.Center)
  }

  @Builder
  numCell(n: number, isHuman: boolean) {
    Text(`${n}`)
      .layoutWeight(1)
      .fontColor(isHuman ? $r('app.color.tavern_candle') : $r('app.color.tavern_paper'))
      .fontSize(13)
      .textAlign(TextAlign.Center)
  }

  @Builder
  recapRow(r: ReportRowView) {
    Row() {
      Text(r.isHuman ? `★${r.nickname}` : r.nickname)
        .layoutWeight(3)
        .fontColor(r.isHuman ? $r('app.color.tavern_candle') : $r('app.color.tavern_paper'))
        .fontSize(13)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
      Row({ space: 2 }) {
        ForEach(r.candles, (lit: boolean, i: number) => {
          this.candle(lit)
        }, (lit: boolean, i: number) => `${r.slot}-${i}-${lit}`)
      }
      .id(`${ControlIds.RECAP_CANDLES_PREFIX}${r.slot}`)
      .layoutWeight(2.4)
      .justifyContent(FlexAlign.Center)
      this.numCell(r.burnt, r.isHuman)
      this.numCell(r.plays, r.isHuman)
      this.numCell(r.fakes, r.isHuman)
      this.numCell(r.doubts, r.isHuman)
      this.numCell(r.hits, r.isHuman)
      Column() {
        Text(r.rankText)
          .fontColor($r('app.color.tavern_paper'))
          .fontSize(12)
        Text(r.tagText)
          .fontColor($r('app.color.tavern_mute'))
          .fontSize(11)
      }
      .layoutWeight(3.2)
    }
    .id(`${ControlIds.RECAP_ROW_PREFIX}${r.slot}`)
    .width('100%')
    .constraintSize({ minHeight: 32 })
    .backgroundColor(r.isHuman ? $r('app.color.tavern_panel') : Color.Transparent)
    .borderRadius(4)
  }

  /** 亮 = 14b 烛身 + 满焰；灭 = 烛身 45% + 熄尽态（复用已有素材，21 §8.2）。 */
  @Builder
  candle(lit: boolean) {
    Stack() {
      if (lit) {
        Image($r('app.media.art_life_candle_body')).width(14).height(24)
        Image($r('app.media.art_life_candle_flame_full')).width(14).height(24)
      } else {
        Image($r('app.media.art_life_candle_body')).width(14).height(24).opacity(0.45)
        Image($r('app.media.art_life_candle_extinguish_3')).width(14).height(24)
      }
    }
    .width(16)
    .height(24)
  }

  @Builder
  highlights() {
    Column({ space: 8 }) {
      if (this.view.showCards) {
        this.card(ControlIds.REPORT_HL_BLUFF, $r('app.media.art_hl_long_bluff'), $r('app.string.lb_str_hl_bluff_title'), this.view.bluff)
        this.card(ControlIds.REPORT_HL_DOUBT, $r('app.media.art_hl_best_challenge'), $r('app.string.lb_str_hl_doubt_title'), this.view.doubt)
        this.card(ControlIds.REPORT_HL_BURN, $r('app.media.art_hl_worst_break'), $r('app.string.lb_str_hl_burn_title'), this.view.burn)
      } else {
        Text(this.view.fallbackText)
          .id(ControlIds.REPORT_HL_FALLBACK)
          .width('100%')
          .fontColor($r('app.color.tavern_paper'))
          .fontSize(14)
          .textAlign(TextAlign.Center)
          .maxLines(2)
      }
      Text(this.view.replayText)
        .id(ControlIds.HIGHLIGHT)
        .width('100%')
        .fontColor($r('app.color.tavern_candle'))
        .fontSize(13)
        .maxLines(2)
        .visibility(this.view.replayText.length > 0 ? Visibility.Visible : Visibility.None)
    }
    .id(ControlIds.REPORT_HL)
    .width('100%')
    .layoutWeight(this.narrow ? 0 : 42)
  }

  /** 不成立的卡：位置 / 尺寸 / 顺序不变，徽章灰度 100% + 不透明度 40%，标题与降级句用 tavern_mute（22 §4.4）。 */
  @Builder
  card(id: string, badge: Resource, title: Resource, c: ReportCardView) {
    Row({ space: 8 }) {
      Image(badge)
        .width(36)
        .height(36)
        .grayscale(c.ok ? 0 : 1)
        .opacity(c.ok ? 1 : 0.4)
      Column({ space: 2 }) {
        Text(title)
          .fontColor(c.ok ? $r('app.color.tavern_candle') : $r('app.color.tavern_mute'))
          .fontSize(13)
        Text(c.text)
          .fontColor(c.ok ? $r('app.color.tavern_paper') : $r('app.color.tavern_mute'))
          .fontSize(12)
          .maxLines(2)
      }
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Start)
    }
    .id(id)
    .width('100%')
    .constraintSize({ minHeight: 44 })
  }

  @Builder
  btnBar() {
    Row({ space: 24 }) {
      Button($r('app.string.lb_str_report_lobby'))
        .id(ControlIds.REPORT_LOBBY)
        .width('36%')
        .height(48)
        .backgroundColor(Color.Transparent)
        .border({ width: 1.5, color: $r('app.color.tavern_brass') })
        .fontColor($r('app.color.tavern_paper'))
        .onClick(() => {
          this.onHome();
        })
      Button($r('app.string.lb_str_again'))
        .id(ControlIds.AGAIN)
        .width('36%')
        .height(48)
        .backgroundColor($r('app.color.tavern_accent'))
        .fontColor($r('app.color.tavern_bg'))
        .onClick(() => {
          this.onAgain();
        })
    }
    .id(ControlIds.REPORT_BTNBAR)
    .width('100%')
    .height('18%')
    .constraintSize({ minHeight: 56 })
    .justifyContent(FlexAlign.Center)
    .alignItems(VerticalAlign.Center)
  }
}
