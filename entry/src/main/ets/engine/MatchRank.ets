/**
 * 名次（21 §1.5，负责人 2026-10-07 统一口径）：
 * 名次 = 该座离场时刻的存活座数（含自己）。出局、中退同一条规则；胜者 = 1。
 * 纯函数、无依赖：引擎在座位出局前调 aliveIncludingSelf 记下离场时刻存活数，
 * RecordStore 用 rankAtExit 出名次。prb_client_check 在 node 里直接跑这两个函数。
 */
export class MatchRank {
  /** 离场那一刻的存活座数（含自己）：在把该座置为出局之前调用。 */
  static aliveIncludingSelf(alive: boolean[]): number {
    let n: number = 0;
    for (let i = 0; i < alive.length; i++) {
      if (alive[i]) {
        n++;
      }
    }
    return n;
  }

  /** 胜者 = 1；其余 = 离场时刻存活座数（含自己）。 */
  static rankAtExit(won: boolean, aliveAtExit: number): number {
    if (won) {
      return 1;
    }
    return Math.max(1, aliveAtExit);
  }
}
