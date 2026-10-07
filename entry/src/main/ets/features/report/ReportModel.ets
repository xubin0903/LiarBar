import { MatchEvent, PlayLogEntry, RecapRow, SeatModel } from '../../engine/MatchTypes';
import { EventKind, PlayStyle, SeatRole } from '../../engine/Phase';
import { PlayLog, PlayLogTally } from '../../engine/PlayLog';

/**
 * 结算战报纯模型（21 §1.2 / §1.4 / §1.5 · 22 §4）。不碰 UI、不碰引擎状态：
 * 入参 = RECAP 后的快照字段 + playLog 副本；文案由调用方按键名查好塞进 texts（结算句一律显式传参，不走 DealerLines fill）。
 */
export const REPORT_TEXT_KEYS: string[] = [
  'lb_str_rpt_win', 'lb_str_rpt_lose', 'lb_str_rpt_quit',
  'lb_str_rpt_winner_fmt', 'lb_str_rpt_winner_none', 'lb_str_rpt_rank_fmt',
  'lb_str_rpt_duration_fmt', 'lb_str_rpt_rounds_fmt',
  'lb_str_rpt_tag_alive', 'lb_str_rpt_tag_out_fmt', 'lb_str_rpt_tag_quit', 'lb_str_rpt_tag_left',
  'lb_str_hl_bluff_fmt', 'lb_str_hl_doubt_fmt', 'lb_str_hl_burn_fmt', 'lb_str_hl_burn_out_fmt',
  'lb_str_hl_bluff_none', 'lb_str_hl_doubt_none', 'lb_str_hl_burn_none',
  'lb_str_hl_none', 'lb_str_hl_quiet',
  'lb_str_replay_caught_fmt', 'lb_str_replay_hit_fmt', 'lb_str_replay_wrong_fmt',
  'lb_str_style_word_soft', 'lb_str_style_word_slam', 'lb_str_style_word_hesitate'
];

export interface ReportInput {
  seats: SeatModel[];
  recap: RecapRow[];
  eventLog: MatchEvent[];
  playLog: PlayLogEntry[];
  winnerSeatId: number;
  roundIndex: number;
  startedAt: number;
  endedAt: number;
  pausedMs: number;
  livesDefault: number;
  /** D1 中退战报（暂停层「结束游戏」；本 PR 入口仍只有正常终局）。 */
  quit: boolean;
  /** 出局后「直接看结算」快进局（2b 接入；本 PR 恒 false）。 */
  ff: boolean;
}

/** H1 最大连骗候选。 */
export class BluffPick {
  seatId: number = -1;
  best: number = 0;
  fakeSum: number = 0;
  endSeq: number = 0;
}

/** H2 最准质疑候选。 */
export class DoubtPick {
  seatId: number = -1;
  hits: number = 0;
  doubts: number = 0;
  /** 第 h 次命中那一手的 seq（并列 ③ 先达成）。 */
  hthSeq: number = 0;
}

/** H3 最惨连熄候选。 */
export class BurnPick {
  seatId: number = -1;
  k: number = 0;
  out: boolean = false;
  human: boolean = false;
  /** 段首 LIFE_CHANGE 在 eventLog 里的下标（并列 ④ 早者）。 */
  startIdx: number = 0;
}

export class ReportRowView {
  /** self / p1 / p2 …（行 id `lb_cmp_recap_row_*`、烛组 `lb_cmp_recap_candles_*`）。 */
  slot: string = '';
  seatId: number = -1;
  nickname: string = '';
  isHuman: boolean = false;
  /** 长 = lives_default；true = 亮烛（剩），false = 熄。 */
  candles: boolean[] = [];
  burnt: number = 0;
  plays: number = 0;
  fakes: number = 0;
  doubts: number = 0;
  hits: number = 0;
  rankText: string = '';
  tagText: string = '';
}

export class ReportCardView {
  /** true = 本卡入选（徽章原色）；false = 本卡降级句（徽章灰度 100% + 40%）。 */
  ok: boolean = false;
  text: string = '';
}

export class ReportView {
  humanWon: boolean = false;
  topText: string = '';
  winnerText: string = '';
  durationText: string = '';
  roundsText: string = '';
  ffNote: boolean = false;
  rows: ReportRowView[] = [];
  /** §1.4.3a 规则 1：至少一条入选 → 三卡；false → 收成一句 fallbackText（规则 2）。 */
  showCards: boolean = false;
  bluff: ReportCardView = new ReportCardView();
  doubt: ReportCardView = new ReportCardView();
  burn: ReportCardView = new ReportCardView();
  fallbackText: string = '';
  /** 回放句；空串 = 无靶，整行隐藏（规则 3）。 */
  replayText: string = '';
}

export class ReportModel {
  /** 显式占位填充（`{键}` 全替换）；缺键原样留下，便于闸抓空槽。 */
  static fill(tpl: string, keys: string[], vals: string[]): string {
    let out: string = tpl;
    for (let i = 0; i < keys.length; i++) {
      out = out.split(`{${keys[i]}}`).join(vals[i]);
    }
    return out;
  }

  static text(texts: Map<string, string>, key: string): string {
    const v: string | undefined = texts.get(key);
    return v === undefined ? '' : v;
  }

  static humanSeatOf(seats: SeatModel[]): number {
    for (let i = 0; i < seats.length; i++) {
      if (seats[i].role === SeatRole.HUMAN) {
        return seats[i].seatId;
      }
    }
    return -1;
  }

  static nickOf(seats: SeatModel[], seatId: number): string {
    for (let i = 0; i < seats.length; i++) {
      if (seats[i].seatId === seatId) {
        return seats[i].nickname;
      }
    }
    return '';
  }

  /** H1（21 §1.4.1）：每座按 seq 走自己的出牌，掺假且未被拆穿 → run+1，否则 run=0；best ≥ 2 入选。 */
  static pickBluff(log: PlayLogEntry[]): BluffPick | null {
    let top: BluffPick | null = null;
    const seatIds: number[] = [];
    for (let i = 0; i < log.length; i++) {
      if (seatIds.indexOf(log[i].actorSeatId) < 0) {
        seatIds.push(log[i].actorSeatId);
      }
    }
    for (let s = 0; s < seatIds.length; s++) {
      const seat: number = seatIds[s];
      let run: number = 0;
      let sum: number = 0;
      for (let i = 0; i < log.length; i++) {
        const e: PlayLogEntry = log[i];
        if (e.actorSeatId !== seat) {
          continue;
        }
        if (e.fakeCount > 0 && !e.caught) {
          run++;
          sum = sum + e.fakeCount;
          if (run >= 2) {
            const c: BluffPick = new BluffPick();
            c.seatId = seat;
            c.best = run;
            c.fakeSum = sum;
            c.endSeq = e.seq;
            if (top === null || ReportModel.bluffBetter(c, top)) {
              top = c;
            }
          }
        } else {
          run = 0;
          sum = 0;
        }
      }
    }
    return top;
  }

  /** 并列：① best 大 ② 该段 fakeCount 和大 ③ 该段末手 seq 小（先达成）。 */
  static bluffBetter(a: BluffPick, b: BluffPick): boolean {
    if (a.best !== b.best) {
      return a.best > b.best;
    }
    if (a.fakeSum !== b.fakeSum) {
      return a.fakeSum > b.fakeSum;
    }
    return a.endSeq < b.endSeq;
  }

  /** H2（21 §1.4.2）：h = 开中，k = 质疑（均由 playLog 推出）；h ≥ 1 入选。 */
  static pickDoubt(log: PlayLogEntry[], seatIds: number[]): DoubtPick | null {
    let top: DoubtPick | null = null;
    for (let s = 0; s < seatIds.length; s++) {
      const t: PlayLogTally = PlayLog.tallyOf(log, seatIds[s]);
      if (t.doubtHits < 1) {
        continue;
      }
      const c: DoubtPick = new DoubtPick();
      c.seatId = seatIds[s];
      c.hits = t.doubtHits;
      c.doubts = t.doubts;
      let seen: number = 0;
      for (let i = 0; i < log.length; i++) {
        if (log[i].challenged && log[i].caught && log[i].challengerSeatId === seatIds[s]) {
          seen++;
          if (seen === t.doubtHits) {
            c.hthSeq = log[i].seq;
            break;
          }
        }
      }
      if (top === null || ReportModel.doubtBetter(c, top)) {
        top = c;
      }
    }
    return top;
  }

  /** 并列：① h 大 ② h/k 高（交叉相乘，免浮点）③ 第 h 次命中 seq 小。 */
  static doubtBetter(a: DoubtPick, b: DoubtPick): boolean {
    if (a.hits !== b.hits) {
      return a.hits > b.hits;
    }
    const ra: number = a.hits * b.doubts;
    const rb: number = b.hits * a.doubts;
    if (ra !== rb) {
      return ra > rb;
    }
    return a.hthSeq < b.hthSeq;
  }

  /**
   * H3（21 §1.4.3）：eventLog 里 LIFE_CHANGE 的 seatId 序列，连续同座最长段 k（上限 3）；k ≥ 2 入选。
   * 收尾出局 = 段末那次熄烛之后、下一次熄烛之前出现同座 OUT。
   */
  static pickBurn(events: MatchEvent[], humanSeatId: number): BurnPick | null {
    const lifeIdx: number[] = [];
    for (let i = 0; i < events.length; i++) {
      if (events[i].kind === EventKind.LIFE_CHANGE) {
        lifeIdx.push(i);
      }
    }
    let top: BurnPick | null = null;
    let i: number = 0;
    while (i < lifeIdx.length) {
      const seat: number = events[lifeIdx[i]].seatId;
      let j: number = i;
      while (j + 1 < lifeIdx.length && events[lifeIdx[j + 1]].seatId === seat) {
        j++;
      }
      const k: number = Math.min(3, j - i + 1);
      if (k >= 2) {
        const c: BurnPick = new BurnPick();
        c.seatId = seat;
        c.k = k;
        c.human = seat === humanSeatId;
        c.startIdx = lifeIdx[i];
        const stop: number = j + 1 < lifeIdx.length ? lifeIdx[j + 1] : events.length;
        for (let e = lifeIdx[j] + 1; e < stop; e++) {
          if (events[e].kind === EventKind.OUT && events[e].seatId === seat) {
            c.out = true;
            break;
          }
        }
        if (top === null || ReportModel.burnBetter(c, top)) {
          top = c;
        }
      }
      i = j + 1;
    }
    return top;
  }

  /** 并列：① k 大 ② 以 OUT 收尾 ③ 人类座 ④ 段首早。 */
  static burnBetter(a: BurnPick, b: BurnPick): boolean {
    if (a.k !== b.k) {
      return a.k > b.k;
    }
    if (a.out !== b.out) {
      return a.out;
    }
    if (a.human !== b.human) {
      return a.human;
    }
    return a.startIdx < b.startIdx;
  }

  /** 回放句选靶（21 §1.4.4）：最后一条涉及人类的已裁定手 → 否则最后一条已裁定手 → 否则无靶（null）。 */
  static pickReplay(log: PlayLogEntry[], humanSeatId: number): PlayLogEntry | null {
    let last: PlayLogEntry | null = null;
    for (let i = log.length - 1; i >= 0; i--) {
      const e: PlayLogEntry = log[i];
      if (!e.challenged) {
        continue;
      }
      if (last === null) {
        last = e;
      }
      if (e.actorSeatId === humanSeatId || e.challengerSeatId === humanSeatId) {
        return e;
      }
    }
    return last;
  }

  static styleWordKey(style: PlayStyle): string {
    if (style === PlayStyle.SLAM) {
      return 'lb_str_style_word_slam';
    }
    if (style === PlayStyle.HESITATE) {
      return 'lb_str_style_word_hesitate';
    }
    return 'lb_str_style_word_soft';
  }

  static replayLine(log: PlayLogEntry[], seats: SeatModel[], texts: Map<string, string>): string {
    const human: number = ReportModel.humanSeatOf(seats);
    const e: PlayLogEntry | null = ReportModel.pickReplay(log, human);
    if (e === null) {
      return '';
    }
    let key: string = 'lb_str_replay_wrong_fmt';
    if (e.caught && e.challengerSeatId === human) {
      key = 'lb_str_replay_hit_fmt';
    } else if (e.caught) {
      key = 'lb_str_replay_caught_fmt';
    }
    return ReportModel.fill(ReportModel.text(texts, key), ['被质疑者', '质疑者', '手', '方式'], [
      ReportModel.nickOf(seats, e.actorSeatId),
      ReportModel.nickOf(seats, e.challengerSeatId),
      `${e.seq}`,
      ReportModel.text(texts, ReportModel.styleWordKey(e.style))
    ]);
  }

  /** 21 §1.5：OUT 事件顺序 = 出局序（第 k 个出局）。 */
  static outOrder(events: MatchEvent[]): number[] {
    const order: number[] = [];
    for (let i = 0; i < events.length; i++) {
      if (events[i].kind === EventKind.OUT && order.indexOf(events[i].seatId) < 0) {
        order.push(events[i].seatId);
      }
    }
    return order;
  }

  static aliveAtExitOf(recap: RecapRow[], seatId: number): number {
    for (let i = 0; i < recap.length; i++) {
      if (recap[i].seatId === seatId) {
        return recap[i].aliveAtExit;
      }
    }
    return 0;
  }

  static build(input: ReportInput, texts: Map<string, string>): ReportView {
    const v: ReportView = new ReportView();
    const seats: SeatModel[] = input.seats;
    const log: PlayLogEntry[] = input.playLog;
    const human: number = ReportModel.humanSeatOf(seats);
    const decided: boolean = !input.quit && input.winnerSeatId >= 0;
    v.humanWon = decided && input.winnerSeatId === human;
    if (input.quit) {
      v.topText = ReportModel.text(texts, 'lb_str_rpt_quit');
    } else if (v.humanWon) {
      v.topText = ReportModel.text(texts, 'lb_str_rpt_win');
    } else {
      v.topText = ReportModel.text(texts, 'lb_str_rpt_lose');
    }
    if (decided) {
      v.winnerText = ReportModel.fill(ReportModel.text(texts, 'lb_str_rpt_winner_fmt'), ['胜者'],
        [ReportModel.nickOf(seats, input.winnerSeatId)]);
    } else {
      v.winnerText = ReportModel.text(texts, 'lb_str_rpt_winner_none');
    }
    const ms: number = Math.max(0, input.endedAt - input.startedAt - input.pausedMs);
    const sec: number = Math.floor(ms / 1000);
    v.durationText = ReportModel.fill(ReportModel.text(texts, 'lb_str_rpt_duration_fmt'), ['分', '秒'],
      [`${Math.floor(sec / 60)}`, `${sec % 60}`]);
    v.roundsText = ReportModel.fill(ReportModel.text(texts, 'lb_str_rpt_rounds_fmt'), ['轮', '手'],
      [`${input.roundIndex}`, `${log.length}`]);
    v.ffNote = input.ff;
    v.rows = ReportModel.buildRows(input, texts, human);

    const seatIds: number[] = [];
    for (let i = 0; i < seats.length; i++) {
      seatIds.push(seats[i].seatId);
    }
    const b: BluffPick | null = ReportModel.pickBluff(log);
    const d: DoubtPick | null = ReportModel.pickDoubt(log, seatIds);
    const u: BurnPick | null = ReportModel.pickBurn(input.eventLog, human);
    v.showCards = b !== null || d !== null || u !== null;
    if (v.showCards) {
      v.bluff.ok = b !== null;
      v.bluff.text = b === null ? ReportModel.text(texts, 'lb_str_hl_bluff_none') :
        ReportModel.fill(ReportModel.text(texts, 'lb_str_hl_bluff_fmt'), ['昵称', 'k'],
          [ReportModel.nickOf(seats, b.seatId), `${b.best}`]);
      v.doubt.ok = d !== null;
      v.doubt.text = d === null ? ReportModel.text(texts, 'lb_str_hl_doubt_none') :
        ReportModel.fill(ReportModel.text(texts, 'lb_str_hl_doubt_fmt'), ['昵称', 'k', 'h'],
          [ReportModel.nickOf(seats, d.seatId), `${d.doubts}`, `${d.hits}`]);
      v.burn.ok = u !== null;
      v.burn.text = u === null ? ReportModel.text(texts, 'lb_str_hl_burn_none') :
        ReportModel.fill(ReportModel.text(texts, u.out ? 'lb_str_hl_burn_out_fmt' : 'lb_str_hl_burn_fmt'),
          ['昵称', 'k'], [ReportModel.nickOf(seats, u.seatId), `${u.k}`]);
    } else {
      let judged: boolean = false;
      for (let i = 0; i < log.length; i++) {
        if (log[i].challenged) {
          judged = true;
          break;
        }
      }
      v.fallbackText = ReportModel.text(texts, judged ? 'lb_str_hl_quiet' : 'lb_str_hl_none');
    }
    v.replayText = ReportModel.replayLine(log, seats, texts);
    return v;
  }

  /** 逐座行：人类置顶，其余按座位号（21 §1.2）；名次 / 状态标按 §1.5。 */
  static buildRows(input: ReportInput, texts: Map<string, string>, human: number): ReportRowView[] {
    const order: SeatModel[] = [];
    for (let i = 0; i < input.seats.length; i++) {
      if (input.seats[i].seatId === human) {
        order.push(input.seats[i]);
      }
    }
    const others: SeatModel[] = [];
    for (let i = 0; i < input.seats.length; i++) {
      if (input.seats[i].seatId !== human) {
        others.push(input.seats[i]);
      }
    }
    others.sort((a: SeatModel, b: SeatModel): number => a.seatId - b.seatId);
    for (let i = 0; i < others.length; i++) {
      order.push(others[i]);
    }
    const outs: number[] = ReportModel.outOrder(input.eventLog);
    let aliveNow: number = 0;
    for (let i = 0; i < input.seats.length; i++) {
      if (outs.indexOf(input.seats[i].seatId) < 0) {
        aliveNow++;
      }
    }
    const rows: ReportRowView[] = [];
    let p: number = 0;
    for (let i = 0; i < order.length; i++) {
      const s: SeatModel = order[i];
      const r: ReportRowView = new ReportRowView();
      r.seatId = s.seatId;
      r.isHuman = s.seatId === human;
      if (r.isHuman) {
        r.slot = 'self';
      } else {
        p++;
        r.slot = `p${p}`;
      }
      r.nickname = s.nickname;
      const lives: number = Math.max(0, Math.min(input.livesDefault, s.lives));
      for (let c = 0; c < input.livesDefault; c++) {
        r.candles.push(c < lives);
      }
      r.burnt = input.livesDefault - lives;
      const t: PlayLogTally = PlayLog.tallyOf(input.playLog, s.seatId);
      r.plays = t.plays;
      r.fakes = t.fakeHands;
      r.doubts = t.doubts;
      r.hits = t.doubtHits;
      const outAt: number = outs.indexOf(s.seatId);
      let rank: number = -1;
      if (outAt >= 0) {
        rank = Math.max(1, ReportModel.aliveAtExitOf(input.recap, s.seatId));
        r.tagText = ReportModel.fill(ReportModel.text(texts, 'lb_str_rpt_tag_out_fmt'), ['序'], [`${outAt + 1}`]);
      } else if (input.quit && r.isHuman) {
        rank = Math.max(1, aliveNow);
        r.tagText = ReportModel.text(texts, 'lb_str_rpt_tag_quit');
      } else if (input.quit) {
        r.tagText = ReportModel.text(texts, 'lb_str_rpt_tag_left');
      } else {
        rank = s.seatId === input.winnerSeatId ? 1 : Math.max(1, aliveNow);
        r.tagText = ReportModel.text(texts, 'lb_str_rpt_tag_alive');
      }
      r.rankText = rank < 0 ? '—' :
        ReportModel.fill(ReportModel.text(texts, 'lb_str_rpt_rank_fmt'), ['名次'], [`${rank}`]);
      rows.push(r);
    }
    return rows;
  }
}
