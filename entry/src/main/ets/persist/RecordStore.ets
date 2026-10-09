import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { AiPersonaRegistry } from '../ai/AiPersonaRegistry';
import { PersistNs } from '../common/Ids';
import { Logger } from '../common/Logger';
import { MatchSnapshot, RecapRow, SeatModel } from '../engine/MatchTypes';
import { MatchRank } from '../engine/MatchRank';
import { SeatRole, SeatStatus } from '../engine/Phase';

const TAG = 'RecordStore';

/** 21 §2.2 `result` 取值（中退恒为 LOSE）。 */
export class RecordResult {
  static readonly WIN: string = 'WIN';
  static readonly LOSE: string = 'LOSE';
}

/** 21 §2.2 单局记录 `MatchRecordV1`（字段逐条照 21，不多不少）。 */
export interface MatchRecordV1 {
  v: number;
  matchId: string;
  endedAt: number;
  /** endedAt − startedAt − pausedTotalMs（扣暂停，21 §1.2）。 */
  durationMs: number;
  rounds: number;
  /** 21：playLog.length；playLog 未落地前 = 各座出牌数之和（同一口径：每手 +1，撤回 −1）。 */
  hands: number;
  playerCount: number;
  /** 21 §1.5。 */
  rank: number;
  /** RecordResult.WIN | RecordResult.LOSE。 */
  result: string;
  quit: boolean;
  /** 快进结算；快进 PR 前恒 false。 */
  ff: boolean;
  livesLeft: number;
  plays: number;
  fakeHands: number;
  doubts: number;
  doubtHits: number;
  doubted: number;
  caught: number;
  /** 对手 aiPersona，座位序。 */
  opponents: string[];
}

/** 21 §2.3 汇总 `RecordSummaryV1`（全量累计，不受 20 条限制）。 */
export interface RecordSummaryV1 {
  v: number;
  total: number;
  wins: number;
  quits: number;
  doubts: number;
  doubtHits: number;
}

/** 读档结果：合法明细 + 是否「原来有数据但一条都不合法」（21 §2.6 明细全坏）。 */
class RecentParse {
  list: MatchRecordV1[] = [];
  allBad: boolean = false;
  dropped: number = 0;
}

/** 写入参数（类型化，避免散参）。 */
export interface RecordCommit {
  /** 在局确认离开 = 中退。 */
  quit: boolean;
  /** 演示局：不写（21 §2.4 / §4.4）。 */
  isDemo: boolean;
  /** 快进终局（21 §1.7）。 */
  ff: boolean;
  /** 本局累计暂停 ms（engine.pausedTotalAt），时长扣掉它。 */
  pausedMs: number;
}

/**
 * PR-B 战绩（21 §2.1）：Preferences 命名空间 `lb.records`，三个键：
 *  - `recent_v1`：JSON 数组，新在前，最多 20 条，超出删最旧
 *  - `summary_v1`：JSON 汇总
 *  - `last_match_id`：最后写入的 matchId（去重，S21-17）
 * 写后必 flush。只写一次：写前比对 last_match_id，相同则跳过。
 */
export class RecordStore {
  static readonly KEEP: number = 20;
  static readonly KEY_RECENT: string = 'recent_v1';
  static readonly KEY_SUMMARY: string = 'summary_v1';
  static readonly KEY_LAST_MATCH: string = 'last_match_id';
  private static store: preferences.Preferences | null = null;
  private static recentList: MatchRecordV1[] = [];
  /** 懒加载（负责人 #5：不在静态初始化里调方法）；用 summaryRef() 取。 */
  private static summary: RecordSummaryV1 | null = null;
  private static lastMatchId: string = '';
  /** 演示局只在内存里占位（防 RECAP 每 tick 重复打日志），不落盘、不动 last_match_id。 */
  private static demoClaim: string = '';
  private static loaded: boolean = false;

  static async init(context: common.UIAbilityContext): Promise<void> {
    try {
      const store: preferences.Preferences = await preferences.getPreferences(context, PersistNs.RECORDS);
      const rawRecent: preferences.ValueType = await store.get(RecordStore.KEY_RECENT, '');
      const rawSummary: preferences.ValueType = await store.get(RecordStore.KEY_SUMMARY, '');
      const rawLast: preferences.ValueType = await store.get(RecordStore.KEY_LAST_MATCH, '');
      RecordStore.loadFrom(rawRecent, rawSummary, rawLast);
      // 补丁轮 2 第 3 条：三个 get 全部读成功、内存已载入后才挂 store——某个 get 抛错时 store 保持 null，
      // 之后的 commitOnce 不会拿「只有 1 条」的内存列表覆盖原档。
      RecordStore.store = store;
      Logger.info(TAG, `loaded recent=${RecordStore.recentList.length} total=${RecordStore.summaryRef().total}`);
    } catch (err) {
      Logger.warn(TAG, 'preferences load fail-soft — empty records');
    }
  }

  /**
   * 21 §2.6 存档容错（S21-47，负责人最终口径 2026-10-07）：逐字段校验，不 `as T`、不 `Number(x) || 0`。
   * - 单条明细非法（非对象 / 缺字段 / 类型错 / v 缺失或 ≠ 1）→ 只丢这一条；
   * - 汇总非法（非 JSON / 字段非法 / 负数 / v 缺失或 ≠ 1）→ 用剩下合法明细重算（不归零、不出负数）；
   * - 汇总合法但明细全坏 → 保留汇总，只清明细；汇总和明细都坏 → 一起清空（新玩家）；
   * - last_match_id 坏或缺失（非字符串 / 空 / 不在合法明细里）→ 取合法明细最新一条的 matchId，没有就空。
   * 修正只在内存里生效：读操作永不写存档（负责人 2026-10-07）；下次 commitOnce 正常写入时自然落盘。返回是否做过修复。
   */
  static loadFrom(rawRecent: preferences.ValueType, rawSummary: preferences.ValueType, rawLast: preferences.ValueType): boolean {
    let repaired: boolean = false;
    const rp: RecentParse = RecordStore.parseRecent(rawRecent);
    const parsed: RecordSummaryV1 | null = RecordStore.parseSummary(rawSummary, rp.list);
    if (rp.allBad) {
      RecordStore.recentList = [];
      repaired = true;
      if (parsed === null) {
        RecordStore.summary = RecordStore.zeroSummary();
        Logger.warn(TAG, 'recent_v1 + summary_v1 both invalid — clear records (new player, 21 §2.6)');
      } else {
        RecordStore.summary = parsed;
        Logger.warn(TAG, 'recent_v1 all invalid — keep valid summary, clear details (21 §2.6)');
      }
    } else {
      RecordStore.recentList = rp.list;
      if (rp.dropped > 0) {
        repaired = true;
        Logger.warn(TAG, `recent_v1 dropped ${rp.dropped} invalid record(s) (21 §2.6)`);
      }
      if (parsed === null) {
        RecordStore.summary = RecordStore.recomputeSummary(rp.list);
        repaired = true;
        Logger.warn(TAG, `summary_v1 invalid — recomputed from ${rp.list.length} record(s) (21 §2.6)`);
      } else {
        RecordStore.summary = parsed;
      }
    }
    const last: string = RecordStore.parseLastMatchId(rawLast, RecordStore.recentList);
    if (typeof rawLast !== 'string' || last !== rawLast) {
      repaired = true;
    }
    RecordStore.lastMatchId = last;
    RecordStore.loaded = true;
    if (repaired) {
      Logger.info(TAG, 'repaired in memory only — next commitOnce persists it (read never writes)');
    }
    return repaired;
  }

  /** last_match_id：合法 = 非空字符串且是某条合法明细的 matchId；否则取最新一条明细的 matchId，没有明细 = 空。 */
  private static parseLastMatchId(raw: preferences.ValueType, list: MatchRecordV1[]): string {
    if (typeof raw === 'string') {
      const id: string = raw;
      for (let i = 0; i < list.length; i++) {
        if (list[i].matchId === id && id.length > 0) {
          return id;
        }
      }
      if (id.length === 0 && list.length === 0) {
        return '';
      }
    }
    return list.length > 0 ? list[0].matchId : '';
  }

  static isLoaded(): boolean {
    return RecordStore.loaded;
  }

  /** 只读：当前内存里的 last_match_id（S22-33 / 22:427 离局框藏「记中退」行）。 */
  static lastMatchIdNow(): string {
    return RecordStore.lastMatchId;
  }

  /** 最近在前。返回副本。 */
  static recent(): MatchRecordV1[] {
    const out: MatchRecordV1[] = [];
    for (let i = 0; i < RecordStore.recentList.length; i++) {
      out.push(RecordStore.recentList[i]);
    }
    return out;
  }

  static summaryNow(): RecordSummaryV1 {
    const cur: RecordSummaryV1 = RecordStore.summaryRef();
    const s: RecordSummaryV1 = {
      v: 1,
      total: cur.total,
      wins: cur.wins,
      quits: cur.quits,
      doubts: cur.doubts,
      doubtHits: cur.doubtHits
    };
    return s;
  }

  /**
   * 写一次（21 §2.4）。返回是否真的写入。
   * - 同 matchId 已写（last_match_id）→ 跳过。
   * - isDemo → 不写（不进列表、不进汇总、不动 last_match_id）。
   */
  static commitOnce(snap: MatchSnapshot, opts: RecordCommit): boolean {
    if (snap.startedAt <= 0 || snap.seats.length === 0 || snap.matchId.length === 0) {
      return false;
    }
    if (snap.matchId === RecordStore.lastMatchId || snap.matchId === RecordStore.demoClaim) {
      return false;
    }
    if (opts.isDemo) {
      RecordStore.demoClaim = snap.matchId;
      Logger.info(TAG, `skip demo match ${snap.matchId} (not recorded)`);
      return false;
    }
    const rec: MatchRecordV1 = RecordStore.build(snap, opts);
    const next: MatchRecordV1[] = [rec];
    for (let i = 0; i < RecordStore.recentList.length && next.length < RecordStore.KEEP; i++) {
      next.push(RecordStore.recentList[i]);
    }
    RecordStore.recentList = next;
    RecordStore.lastMatchId = rec.matchId;
    const sum: RecordSummaryV1 = RecordStore.summaryRef();
    sum.total = sum.total + 1;
    if (rec.result === RecordResult.WIN) {
      sum.wins = sum.wins + 1;
    }
    if (rec.quit) {
      sum.quits = sum.quits + 1;
    }
    sum.doubts = sum.doubts + rec.doubts;
    sum.doubtHits = sum.doubtHits + rec.doubtHits;
    Logger.info(TAG, `commit ${rec.matchId} result=${rec.result} quit=${rec.quit} rank=${rec.rank} dur=${rec.durationMs}`);
    void RecordStore.persist();
    return true;
  }

  private static build(snap: MatchSnapshot, opts: RecordCommit): MatchRecordV1 {
    let human: SeatModel | null = null;
    for (let i = 0; i < snap.seats.length; i++) {
      if (snap.seats[i].role === SeatRole.HUMAN) {
        human = snap.seats[i];
        break;
      }
    }
    const humanId: number = human === null ? -1 : human.seatId;
    const n: number = snap.seats.length;
    const won: boolean = !opts.quit && humanId >= 0 && snap.winnerSeatId === humanId;
    const endedAt: number = snap.endedAt > 0 ? snap.endedAt : Date.now();
    const paused: number = opts.pausedMs > 0 ? opts.pausedMs : 0;
    let hands: number = 0;
    let mine: RecapRow | null = null;
    for (let i = 0; i < snap.recap.length; i++) {
      const row: RecapRow = snap.recap[i];
      hands = hands + row.playCount;
      if (row.seatId === humanId) {
        mine = row;
      }
    }
    const opponents: string[] = [];
    for (let i = 0; i < snap.seats.length; i++) {
      const s: SeatModel = snap.seats[i];
      if (s.role === SeatRole.AI) {
        opponents.push(s.aiPersona.length > 0 ? s.aiPersona : AiPersonaRegistry.personaIdForSeat(s.seatId));
      }
    }
    const rec: MatchRecordV1 = {
      v: 1,
      matchId: snap.matchId,
      endedAt: endedAt,
      durationMs: Math.max(0, endedAt - snap.startedAt - paused),
      rounds: snap.roundIndex,
      hands: hands,
      playerCount: n,
      rank: RecordStore.rankOf(snap, mine, won, opts.quit),
      result: won ? RecordResult.WIN : RecordResult.LOSE,
      quit: opts.quit,
      ff: opts.ff,
      livesLeft: human === null ? 0 : human.lives,
      plays: mine === null ? 0 : mine.playCount,
      fakeHands: mine === null ? 0 : mine.fakeHandCount,
      doubts: mine === null ? 0 : mine.challengeCount,
      doubtHits: mine === null ? 0 : mine.challengeHits,
      doubted: mine === null ? 0 : mine.doubtedCount,
      caught: mine === null ? 0 : mine.caughtCount,
      opponents: opponents
    };
    return rec;
  }

  /**
   * 21 §1.5（负责人 2026-10-07 统一口径）：名次 = 离场时刻存活座数（含自己），胜者 = 1。
   * - 出局：引擎在置 GHOST 前记下的 aliveAtExit。
   * - 中退：此刻就是离场时刻 → 当前存活座数（人类自己还活着，已含在内）。
   */
  private static rankOf(snap: MatchSnapshot, mine: RecapRow | null, won: boolean, quit: boolean): number {
    let aliveNow: number = 0;
    for (let i = 0; i < snap.seats.length; i++) {
      if (snap.seats[i].status === SeatStatus.ALIVE) {
        aliveNow++;
      }
    }
    const exited: number = mine === null ? 0 : mine.aliveAtExit;
    const aliveAtExit: number = !quit && exited > 0 ? exited : aliveNow;
    return MatchRank.rankAtExit(won, aliveAtExit);
  }

  private static summaryRef(): RecordSummaryV1 {
    if (RecordStore.summary === null) {
      RecordStore.summary = RecordStore.zeroSummary();
    }
    return RecordStore.summary;
  }

  // ---------------------------------------------------------------- 21 §2.6 field-by-field validation

  private static readonly MAX_COUNT: number = 99999;
  private static readonly MAX_SEATS: number = 12;
  private static readonly MAX_ID_LEN: number = 64;

  private static parseRecent(raw: preferences.ValueType): RecentParse {
    const out: RecentParse = new RecentParse();
    if (typeof raw !== 'string') {
      out.allBad = true;
      return out;
    }
    const text: string = raw;
    if (text.length === 0) {
      return out;
    }
    let parsed: Object | null = null;
    try {
      parsed = JSON.parse(text) as Object;
    } catch (err) {
      out.allBad = true;
      return out;
    }
    if (parsed === null || !Array.isArray(parsed)) {
      out.allBad = true;
      return out;
    }
    const arr: Object[] = parsed as Object[];
    const seen: string[] = [];
    for (let i = 0; i < arr.length; i++) {
      const rec: MatchRecordV1 | null = RecordStore.validateRecord(arr[i]);
      if (rec === null || seen.indexOf(rec.matchId) >= 0 || out.list.length >= RecordStore.KEEP) {
        out.dropped++;
        continue;
      }
      seen.push(rec.matchId);
      out.list.push(rec);
    }
    out.allBad = arr.length > 0 && out.list.length === 0;
    return out;
  }

  private static asFields(v: Object | null | undefined): Record<string, Object> | null {
    if (v === null || v === undefined || typeof v !== 'object' || Array.isArray(v)) {
      return null;
    }
    return v as Record<string, Object>;
  }

  /** 非负（或 [min,max]）整数字段；不合法返回 -1。 */
  private static intField(o: Record<string, Object>, key: string, min: number, max: number): number {
    const v: Object | undefined = o[key];
    if (typeof v !== 'number') {
      return -1;
    }
    const n: number = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      return -1;
    }
    return n;
  }

  /** 布尔字段：1 = true，0 = false，-1 = 不合法。 */
  private static boolField(o: Record<string, Object>, key: string): number {
    const v: Object | undefined = o[key];
    if (typeof v !== 'boolean') {
      return -1;
    }
    return v === true ? 1 : 0;
  }

  private static strField(o: Record<string, Object>, key: string): string {
    const v: Object | undefined = o[key];
    if (typeof v !== 'string') {
      return '';
    }
    const t: string = String(v);
    return t.length <= RecordStore.MAX_ID_LEN ? t : '';
  }

  private static validateRecord(raw: Object | null | undefined): MatchRecordV1 | null {
    const o: Record<string, Object> | null = RecordStore.asFields(raw);
    if (o === null) {
      return null;
    }
    const big: number = RecordStore.MAX_COUNT;
    const v: number = RecordStore.intField(o, 'v', 1, 1);
    const matchId: string = RecordStore.strField(o, 'matchId');
    const endedAt: number = RecordStore.intField(o, 'endedAt', 0, Number.MAX_SAFE_INTEGER);
    const durationMs: number = RecordStore.intField(o, 'durationMs', 0, Number.MAX_SAFE_INTEGER);
    const rounds: number = RecordStore.intField(o, 'rounds', 0, big);
    const hands: number = RecordStore.intField(o, 'hands', 0, big);
    const playerCount: number = RecordStore.intField(o, 'playerCount', 2, RecordStore.MAX_SEATS);
    const rank: number = RecordStore.intField(o, 'rank', 1, RecordStore.MAX_SEATS);
    const result: string = RecordStore.strField(o, 'result');
    const quit: number = RecordStore.boolField(o, 'quit');
    const ff: number = RecordStore.boolField(o, 'ff');
    const livesLeft: number = RecordStore.intField(o, 'livesLeft', 0, big);
    const plays: number = RecordStore.intField(o, 'plays', 0, big);
    const fakeHands: number = RecordStore.intField(o, 'fakeHands', 0, big);
    const doubts: number = RecordStore.intField(o, 'doubts', 0, big);
    const doubtHits: number = RecordStore.intField(o, 'doubtHits', 0, big);
    const doubted: number = RecordStore.intField(o, 'doubted', 0, big);
    const caught: number = RecordStore.intField(o, 'caught', 0, big);
    if (v !== 1 || matchId.length === 0 || endedAt < 0 || durationMs < 0 || rounds < 0 || hands < 0 ||
      playerCount < 0 || rank < 0 || rank > playerCount || quit < 0 || ff < 0 || livesLeft < 0 ||
      plays < 0 || fakeHands < 0 || doubts < 0 || doubtHits < 0 || doubted < 0 || caught < 0) {
      return null;
    }
    if (result !== RecordResult.WIN && result !== RecordResult.LOSE) {
      return null;
    }
    // 自洽：掺假 ≤ 出牌、开中 ≤ 质疑、被识破 ≤ 被质疑；中退恒 LOSE；WIN = 第 1 且非中退。
    // 自相矛盾（例：WIN 但名次≠1，21:320）= 坏明细，只丢这一条。
    if (fakeHands > plays || doubtHits > doubts || caught > doubted) {
      return null;
    }
    if ((quit === 1 && result === RecordResult.WIN) || (result === RecordResult.WIN && rank !== 1)) {
      return null;
    }
    const oppRaw: Object | undefined = o['opponents'];
    if (oppRaw === undefined || oppRaw === null || !Array.isArray(oppRaw)) {
      return null;
    }
    const oppArr: Object[] = oppRaw as Object[];
    if (oppArr.length > playerCount - 1) {
      return null;
    }
    const opponents: string[] = [];
    for (let i = 0; i < oppArr.length; i++) {
      const p: Object = oppArr[i];
      if (typeof p !== 'string' || String(p).length === 0 || String(p).length > RecordStore.MAX_ID_LEN) {
        return null;
      }
      opponents.push(String(p));
    }
    const rec: MatchRecordV1 = {
      v: 1,
      matchId: matchId,
      endedAt: endedAt,
      durationMs: durationMs,
      rounds: rounds,
      hands: hands,
      playerCount: playerCount,
      rank: rank,
      result: result,
      quit: quit === 1,
      ff: ff === 1,
      livesLeft: livesLeft,
      plays: plays,
      fakeHands: fakeHands,
      doubts: doubts,
      doubtHits: doubtHits,
      doubted: doubted,
      caught: caught,
      opponents: opponents
    };
    return rec;
  }

  /** 汇总校验；不合法返回 null（调用方用明细重算）。汇总必须覆盖现有明细（累计 ≥ 明细里的计数）。 */
  private static parseSummary(raw: preferences.ValueType, recent: MatchRecordV1[]): RecordSummaryV1 | null {
    if (typeof raw !== 'string') {
      return null;
    }
    const text: string = raw;
    if (text.length === 0) {
      return recent.length === 0 ? RecordStore.zeroSummary() : null;
    }
    let parsed: Object | null = null;
    try {
      parsed = JSON.parse(text) as Object;
    } catch (err) {
      return null;
    }
    const o: Record<string, Object> | null = RecordStore.asFields(parsed);
    if (o === null) {
      return null;
    }
    const max: number = Number.MAX_SAFE_INTEGER;
    const v: number = RecordStore.intField(o, 'v', 1, 1);
    const total: number = RecordStore.intField(o, 'total', 0, max);
    const wins: number = RecordStore.intField(o, 'wins', 0, max);
    const quits: number = RecordStore.intField(o, 'quits', 0, max);
    const doubts: number = RecordStore.intField(o, 'doubts', 0, max);
    const doubtHits: number = RecordStore.intField(o, 'doubtHits', 0, max);
    if (v !== 1 || total < 0 || wins < 0 || quits < 0 || doubts < 0 || doubtHits < 0) {
      return null;
    }
    // 不可能状态（21:322）：wins+quits>total，或任一计数小于按有效明细重算值 → 坏汇总，交给调用方重算。
    // 汇总大于重算值是正常的（明细最多 20 条），不算坏。
    if (wins > total || quits > total || wins + quits > total || doubtHits > doubts) {
      return null;
    }
    const floor: RecordSummaryV1 = RecordStore.recomputeSummary(recent);
    if (total < floor.total || wins < floor.wins || quits < floor.quits || doubts < floor.doubts || doubtHits < floor.doubtHits) {
      return null;
    }
    const out: RecordSummaryV1 = {
      v: 1,
      total: total,
      wins: wins,
      quits: quits,
      doubts: doubts,
      doubtHits: doubtHits
    };
    return out;
  }

  /** 用合法明细重算汇总（21 §2.6：可能少于真实累计，可接受；不会为负）。 */
  private static recomputeSummary(list: MatchRecordV1[]): RecordSummaryV1 {
    const s: RecordSummaryV1 = RecordStore.zeroSummary();
    for (let i = 0; i < list.length; i++) {
      const r: MatchRecordV1 = list[i];
      s.total = s.total + 1;
      if (r.result === RecordResult.WIN) {
        s.wins = s.wins + 1;
      }
      if (r.quit) {
        s.quits = s.quits + 1;
      }
      s.doubts = s.doubts + r.doubts;
      s.doubtHits = s.doubtHits + r.doubtHits;
    }
    return s;
  }

  private static async persist(): Promise<void> {
    const store: preferences.Preferences | null = RecordStore.store;
    if (store === null || !RecordStore.loaded) {
      // 未完整读入原档（init 失败 / 读到一半抛错）→ 不写盘，原存档字节不动（补丁轮 2 第 3 条）。
      return;
    }
    try {
      await store.put(RecordStore.KEY_RECENT, JSON.stringify(RecordStore.recentList));
      await store.put(RecordStore.KEY_SUMMARY, JSON.stringify(RecordStore.summaryRef()));
      await store.put(RecordStore.KEY_LAST_MATCH, RecordStore.lastMatchId);
      await store.flush();
    } catch (err) {
      Logger.warn(TAG, 'persist fail-soft');
    }
  }

  private static zeroSummary(): RecordSummaryV1 {
    const s: RecordSummaryV1 = {
      v: 1,
      total: 0,
      wins: 0,
      quits: 0,
      doubts: 0,
      doubtHits: 0
    };
    return s;
  }
}
