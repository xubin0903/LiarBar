import { PlayLogEntry } from './MatchTypes';
import { PlayStyle } from './Phase';

/** 一座的计数，全部由 playLog 推出（21 §1.2 结算逐座表 / §2.2 战绩）。 */
export class PlayLogTally {
  /** 出牌手数。 */
  plays: number = 0;
  /** 掺假手数（本手 fakeCount ≥ 1）。 */
  fakeHands: number = 0;
  /** 质疑次数（已裁定；含 =2 强制质疑、「质疑你」）。 */
  doubts: number = 0;
  /** 开中次数（本座质疑、裁定 SUCCESS）。 */
  doubtHits: number = 0;
  /** 本座出的牌被质疑次数。 */
  doubted: number = 0;
  /** 本座被识破次数。 */
  caught: number = 0;
}

/**
 * 21 §1.3 引擎私有出牌日志 `playLog`（结算唯一数据源）。
 * - commitPicked → append（seq = 当前长度 + 1）
 * - applyJudged → markJudged（collectRedeal 清空 lastPlay / challenge 之前写入）
 * - rollbackLastPlay → popLast（弹末条，seq 不留空号）
 * - startMatch → clear；collectRedeal / dealFresh 不清
 * 旧的六个逐座计数器（playCounts / fakeHandCounts / challengeCounts / challengeHits / doubtedCounts / caughtCounts）
 * 已由本类 tally() 取代（结算面板 PR，逐值对拍后删除）。
 */
export class PlayLog {
  private list: PlayLogEntry[] = [];

  clear(): void {
    this.list = [];
  }

  size(): number {
    return this.list.length;
  }

  /** 追加一手，返回它的 seq（本局手序）。 */
  append(round: number, actorSeatId: number, count: number, fakeCount: number, style: PlayStyle): number {
    const entry: PlayLogEntry = {
      seq: this.list.length + 1,
      round: round,
      actorSeatId: actorSeatId,
      count: count,
      fakeCount: fakeCount,
      style: style,
      challenged: false,
      challengerSeatId: -1,
      caught: false,
      loserSeatId: -1
    };
    this.list.push(entry);
    return entry.seq;
  }

  /** 裁定写入末条（= 被质疑的 lastPlay）。末条不是这位出牌者或已裁定过 → 不写，返回 false。 */
  markJudged(actorSeatId: number, challengerSeatId: number, caught: boolean, loserSeatId: number): boolean {
    if (this.list.length === 0) {
      return false;
    }
    const last: PlayLogEntry = this.list[this.list.length - 1];
    if (last.actorSeatId !== actorSeatId || last.challenged) {
      return false;
    }
    last.challenged = true;
    last.challengerSeatId = challengerSeatId;
    last.caught = caught;
    last.loserSeatId = loserSeatId;
    return true;
  }

  /** rollbackLastPlay 同步弹出末条（只弹这位出牌者、未裁定的那一手）。 */
  popLast(actorSeatId: number): boolean {
    if (this.list.length === 0) {
      return false;
    }
    const last: PlayLogEntry = this.list[this.list.length - 1];
    if (last.actorSeatId !== actorSeatId || last.challenged) {
      return false;
    }
    this.list.pop();
    return true;
  }

  /** 副本（调用方改不动引擎内的日志）。 */
  entries(): PlayLogEntry[] {
    const out: PlayLogEntry[] = [];
    for (let i = 0; i < this.list.length; i++) {
      const e: PlayLogEntry = this.list[i];
      out.push({
        seq: e.seq,
        round: e.round,
        actorSeatId: e.actorSeatId,
        count: e.count,
        fakeCount: e.fakeCount,
        style: e.style,
        challenged: e.challenged,
        challengerSeatId: e.challengerSeatId,
        caught: e.caught,
        loserSeatId: e.loserSeatId
      });
    }
    return out;
  }

  tally(seatId: number): PlayLogTally {
    return PlayLog.tallyOf(this.list, seatId);
  }

  /** 由一份日志推出某座计数（结算面板对同一份副本复算，口径与引擎 buildRecap 一致）。 */
  static tallyOf(list: PlayLogEntry[], seatId: number): PlayLogTally {
    const t: PlayLogTally = new PlayLogTally();
    for (let i = 0; i < list.length; i++) {
      const e: PlayLogEntry = list[i];
      if (e.actorSeatId === seatId) {
        t.plays++;
        if (e.fakeCount > 0) {
          t.fakeHands++;
        }
        if (e.challenged) {
          t.doubted++;
          if (e.caught) {
            t.caught++;
          }
        }
      }
      if (e.challenged && e.challengerSeatId === seatId) {
        t.doubts++;
        if (e.caught) {
          t.doubtHits++;
        }
      }
    }
    return t;
  }
}
