/**
 * 附录 E / 05 §3.3 十五事件 · 环缓冲 + drain(seq)。
 * 表现层只订阅；不改判定。RevealStarted.ranks 必须为真牌面。
 * 与 MatchTypes.MatchEvent（旧 EventKind 日志）并存，勿混用。
 */

/** 十五事件名 — 禁止发明新名。 */
export type AppendixEName =
  | 'MatchStarted'
  | 'Dealt'
  | 'ClaimSet'
  | 'TurnBegan'
  | 'PlayLanded'
  | 'ChallengeWindowOpened'
  | 'Believed'
  | 'ChallengeCommitted'
  | 'RevealStarted'
  | 'Judged'
  | 'CandleOut'
  | 'SeatEliminated'
  | 'Redealt'
  | 'EmptyGate'
  | 'MatchEnded';

export interface MatchEngineEvent {
  /** 单调递增，从 1 起。 */
  seq: number;
  name: AppendixEName;
  at: number;
  payload: Record<string, unknown>;
}

const CAPACITY = 4096;

/**
 * 环缓冲事件总线。drain(seq) 返回 seq 之后（不含）的全部事件，按 seq 升序。
 */
export class MatchEvents {
  private buf: MatchEngineEvent[] = [];
  private nextSeq: number = 1;
  private capacity: number = CAPACITY;

  clear(): void {
    this.buf = [];
    this.nextSeq = 1;
  }

  /** 当前已写入的最大 seq；空缓冲为 0。 */
  headSeq(): number {
    if (this.buf.length === 0) {
      return 0;
    }
    return this.buf[this.buf.length - 1].seq;
  }

  emit(name: AppendixEName, payload: Record<string, unknown>, atMs?: number): MatchEngineEvent {
    const ev: MatchEngineEvent = {
      seq: this.nextSeq,
      name: name,
      at: atMs !== undefined ? atMs : Date.now(),
      payload: payload
    };
    this.nextSeq = this.nextSeq + 1;
    this.buf.push(ev);
    if (this.buf.length > this.capacity) {
      this.buf.splice(0, this.buf.length - this.capacity);
    }
    return ev;
  }

  /**
   * 返回 seq 之后的事件（ev.seq > seq）。
   * 调用方用返回末条 seq 作为下次游标。
   */
  drain(seq: number): MatchEngineEvent[] {
    const out: MatchEngineEvent[] = [];
    for (let i = 0; i < this.buf.length; i++) {
      if (this.buf[i].seq > seq) {
        out.push(this.buf[i]);
      }
    }
    return out;
  }

  /** 全量快照（parity / 调试）。 */
  snapshot(): MatchEngineEvent[] {
    const out: MatchEngineEvent[] = [];
    for (let i = 0; i < this.buf.length; i++) {
      out.push(this.buf[i]);
    }
    return out;
  }
}
