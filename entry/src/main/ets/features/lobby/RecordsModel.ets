import { AiPersonaRegistry } from '../../ai/AiPersonaRegistry';
import { ReportModel } from '../report/ReportModel';
import { MatchRecordV1, RecordResult, RecordStore, RecordSummaryV1 } from '../../persist/RecordStore';

/** 战绩面板用到的文案键（21 §2 · §6）。 */
export const RECORDS_TEXT_KEYS: string[] = [
  'lb_str_rec_sum_fmt', 'lb_str_rec_doubt_fmt', 'lb_str_rec_quit_fmt', 'lb_str_rec_rate_na',
  'lb_str_rec_row_fmt', 'lb_str_rec_detail_fmt', 'lb_str_rec_opp_fmt',
  'lb_str_rec_tag_win', 'lb_str_rec_tag_lose', 'lb_str_rec_tag_quit'
];

/** 单局行视图（22 §7.1）。 */
export class RecordsRowView {
  id: string = '';
  main: string = '';
  detail: string = '';
  opp: string = '';
  tag: string = '';
  /** win / lose / quit —— 颜色区分。 */
  kind: string = 'lose';
}

/** 战绩面板视图（空态只看 empty）。 */
export class RecordsView {
  empty: boolean = true;
  sumLine: string = '';
  doubtLine: string = '';
  quitLine: string = '';
  rows: RecordsRowView[] = [];
}

/**
 * 战绩纯模型（21 §2.2 / §2.3 · 22 §7.1）。不碰 UI / 路由；文案由调用方按键名查好塞进 texts。
 */
export class RecordsModel {
  static build(texts: Map<string, string>): RecordsView {
    const v: RecordsView = new RecordsView();
    const sum: RecordSummaryV1 = RecordStore.summaryNow();
    if (sum.total <= 0) {
      v.empty = true;
      return v;
    }
    v.empty = false;
    const winRate: string = RecordsModel.rate(sum.wins, sum.total, texts);
    const doubtRate: string = RecordsModel.rate(sum.doubtHits, sum.doubts, texts);
    v.sumLine = ReportModel.fill(ReportModel.text(texts, 'lb_str_rec_sum_fmt'),
      ['场', '胜', '率'], [`${sum.total}`, `${sum.wins}`, winRate]);
    v.doubtLine = ReportModel.fill(ReportModel.text(texts, 'lb_str_rec_doubt_fmt'),
      ['率', '中', '疑'], [doubtRate, `${sum.doubtHits}`, `${sum.doubts}`]);
    v.quitLine = ReportModel.fill(ReportModel.text(texts, 'lb_str_rec_quit_fmt'),
      ['退'], [`${sum.quits}`]);
    const recent: MatchRecordV1[] = RecordStore.recent();
    for (let i = 0; i < recent.length; i++) {
      v.rows.push(RecordsModel.rowOf(recent[i], i, texts));
    }
    return v;
  }

  private static rate(num: number, den: number, texts: Map<string, string>): string {
    if (den <= 0) {
      return ReportModel.text(texts, 'lb_str_rec_rate_na');
    }
    return `${Math.round((num * 100) / den)}%`;
  }

  private static rowOf(r: MatchRecordV1, index: number, texts: Map<string, string>): RecordsRowView {
    const out: RecordsRowView = new RecordsRowView();
    out.id = `lb_cmp_records_row_${index}`;
    out.main = ReportModel.fill(ReportModel.text(texts, 'lb_str_rec_row_fmt'),
      ['日期', '名次', '人数', '时长'],
      [RecordsModel.dateOf(r.endedAt), `${r.rank}`, `${r.playerCount}`, RecordsModel.durationOf(r.durationMs)]);
    out.detail = ReportModel.fill(ReportModel.text(texts, 'lb_str_rec_detail_fmt'),
      ['疑', '中', '被疑', '破'],
      [`${r.doubts}`, `${r.doubtHits}`, `${r.doubted}`, `${r.caught}`]);
    out.opp = ReportModel.fill(ReportModel.text(texts, 'lb_str_rec_opp_fmt'),
      ['对手'], [RecordsModel.oppNames(r.opponents)]);
    if (r.quit) {
      out.kind = 'quit';
      out.tag = ReportModel.text(texts, 'lb_str_rec_tag_quit');
    } else if (r.result === RecordResult.WIN) {
      out.kind = 'win';
      out.tag = ReportModel.text(texts, 'lb_str_rec_tag_win');
    } else {
      out.kind = 'lose';
      out.tag = ReportModel.text(texts, 'lb_str_rec_tag_lose');
    }
    return out;
  }

  /** 本机时区 MM-DD HH:mm（21 §2.2）。 */
  static dateOf(ms: number): string {
    const d: Date = new Date(ms);
    const mo: string = RecordsModel.pad2(d.getMonth() + 1);
    const day: string = RecordsModel.pad2(d.getDate());
    const hh: string = RecordsModel.pad2(d.getHours());
    const mm: string = RecordsModel.pad2(d.getMinutes());
    return `${mo}-${day} ${hh}:${mm}`;
  }

  /** 行内时长：M分S秒（与结算扣暂停口径同源 durationMs）。 */
  static durationOf(ms: number): string {
    const sec: number = Math.floor(Math.max(0, ms) / 1000);
    return `${Math.floor(sec / 60)}分${sec % 60}秒`;
  }

  private static oppNames(ids: string[]): string {
    if (ids.length === 0) {
      return '';
    }
    const names: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      names.push(AiPersonaRegistry.displayName(ids[i]));
    }
    return names.join('、');
  }

  private static pad2(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
  }
}
