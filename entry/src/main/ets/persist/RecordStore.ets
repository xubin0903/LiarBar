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
  private static summary: RecordSummaryV1 = RecordStore.zeroSummary();
  private static lastMatchId: string = '';
  /** 演示局只在内存里占位（防 RECAP 每 tick 重复打日志），不落盘、不动 last_match_id。 */
  private static demoClaim: string = '';
  private static loaded: boolean = false;

  static async init(context: common.UIAbilityContext): Promise<void> {
    try {
      const store: preferences.Preferences = await preferences.getPreferences(context, PersistNs.RECORDS);
      RecordStore.store = store;
      const rawRecent: preferences.ValueType = await store.get(RecordStore.KEY_RECENT, '');
      const rawSummary: preferences.ValueType = await store.get(RecordStore.KEY_SUMMARY, '');
      const rawLast: preferences.ValueType = await store.get(RecordStore.KEY_LAST_MATCH, '');
      RecordStore.recentList = RecordStore.parseRecent(`${rawRecent}`);
      RecordStore.summary = RecordStore.parseSummary(`${rawSummary}`);
      RecordStore.lastMatchId = `${rawLast}`;
      RecordStore.loaded = true;
      Logger.info(TAG, `loaded recent=${RecordStore.recentList.length} total=${RecordStore.summary.total}`);
    } catch (err) {
      Logger.warn(TAG, 'preferences load fail-soft — empty records');
    }
  }

  static isLoaded(): boolean {
    return RecordStore.loaded;
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
    const s: RecordSummaryV1 = {
      v: 1,
      total: RecordStore.summary.total,
      wins: RecordStore.summary.wins,
      quits: RecordStore.summary.quits,
      doubts: RecordStore.summary.doubts,
      doubtHits: RecordStore.summary.doubtHits
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
    RecordStore.summary.total = RecordStore.summary.total + 1;
    if (rec.result === RecordResult.WIN) {
      RecordStore.summary.wins = RecordStore.summary.wins + 1;
    }
    if (rec.quit) {
      RecordStore.summary.quits = RecordStore.summary.quits + 1;
    }
    RecordStore.summary.doubts = RecordStore.summary.doubts + rec.doubts;
    RecordStore.summary.doubtHits = RecordStore.summary.doubtHits + rec.doubtHits;
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

  private static parseRecent(raw: string): MatchRecordV1[] {
    const out: MatchRecordV1[] = [];
    if (raw.length === 0) {
      return out;
    }
    try {
      const list: MatchRecordV1[] = JSON.parse(raw) as MatchRecordV1[];
      if (!Array.isArray(list)) {
        return out;
      }
      for (let i = 0; i < list.length && out.length < RecordStore.KEEP; i++) {
        const r: MatchRecordV1 = list[i];
        if (r !== null && r !== undefined && r.v === 1 && typeof r.matchId === 'string') {
          out.push(r);
        }
      }
    } catch (err) {
      Logger.warn(TAG, 'recent_v1 JSON corrupt — start empty');
    }
    return out;
  }

  private static parseSummary(raw: string): RecordSummaryV1 {
    if (raw.length === 0) {
      return RecordStore.zeroSummary();
    }
    try {
      const s: RecordSummaryV1 = JSON.parse(raw) as RecordSummaryV1;
      const out: RecordSummaryV1 = {
        v: 1,
        total: Number(s.total) || 0,
        wins: Number(s.wins) || 0,
        quits: Number(s.quits) || 0,
        doubts: Number(s.doubts) || 0,
        doubtHits: Number(s.doubtHits) || 0
      };
      return out;
    } catch (err) {
      Logger.warn(TAG, 'summary_v1 JSON corrupt — start empty');
      return RecordStore.zeroSummary();
    }
  }

  private static async persist(): Promise<void> {
    const store: preferences.Preferences | null = RecordStore.store;
    if (store === null) {
      return;
    }
    try {
      await store.put(RecordStore.KEY_RECENT, JSON.stringify(RecordStore.recentList));
      await store.put(RecordStore.KEY_SUMMARY, JSON.stringify(RecordStore.summary));
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
