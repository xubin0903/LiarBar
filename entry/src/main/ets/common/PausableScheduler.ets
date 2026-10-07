/**
 * PR-B 可暂停的一次性定时器（替代页面内裸 setTimeout/clearTimeout）。
 * - schedule 返回本调度器自己的 id（≥1），-1 仍可当「未武装」哨兵。
 * - pause：撤掉所有原生定时器，记住各自剩余时长；resume：按剩余时长重新武装。
 * - 回调触发前先从表里摘掉，所以回调里再 schedule 是安全的。
 */
class TimerEntry {
  id: number = 0;
  fn: () => void = (): void => {};
  remainMs: number = 0;
  dueAt: number = 0;
  nativeId: number = -1;
  /** 21 §3.2 / PAU-3：已在飞的那一段（如发牌当前这张的落地）。pause 不冻它，到点照常落地；它回调里新排的段在暂停中挂起。 */
  atomic: boolean = false;
}

export class PausableScheduler {
  private entries: TimerEntry[] = [];
  private seq: number = 0;
  private paused: boolean = false;
  private pausedAt: number = 0;

  schedule(fn: () => void, ms: number): number {
    return this.add(fn, ms, false);
  }

  /**
   * 不可中断的一小段（≤ 一张牌的飞行时长）：暂停时照常到点触发（牌落地），
   * 回调里再 schedule 的后续段在暂停中挂起，恢复时按 floor 重挂。
   */
  scheduleAtomic(fn: () => void, ms: number): number {
    return this.add(fn, ms, true);
  }

  private add(fn: () => void, ms: number, atomic: boolean): number {
    this.seq = this.seq + 1;
    const e: TimerEntry = new TimerEntry();
    e.id = this.seq;
    e.fn = fn;
    e.remainMs = ms > 0 ? ms : 0;
    e.atomic = atomic;
    this.entries.push(e);
    if (!this.paused || atomic) {
      this.arm(e);
    }
    return e.id;
  }

  cancel(id: number): void {
    if (id < 0) {
      return;
    }
    const kept: TimerEntry[] = [];
    for (let i = 0; i < this.entries.length; i++) {
      const e: TimerEntry = this.entries[i];
      if (e.id === id) {
        if (e.nativeId >= 0) {
          clearTimeout(e.nativeId);
          e.nativeId = -1;
        }
      } else {
        kept.push(e);
      }
    }
    this.entries = kept;
  }

  cancelAll(): void {
    for (let i = 0; i < this.entries.length; i++) {
      if (this.entries[i].nativeId >= 0) {
        clearTimeout(this.entries[i].nativeId);
        this.entries[i].nativeId = -1;
      }
    }
    this.entries = [];
    this.paused = false;
    this.pausedAt = 0;
  }

  isPaused(): boolean {
    return this.paused;
  }

  pending(): number {
    return this.entries.length;
  }

  pause(): void {
    if (this.paused) {
      return;
    }
    const now: number = Date.now();
    this.paused = true;
    this.pausedAt = now;
    for (let i = 0; i < this.entries.length; i++) {
      const e: TimerEntry = this.entries[i];
      if (e.atomic) {
        // In-flight segment finishes as a unit (PAU-3); its follow-ups get held.
        continue;
      }
      if (e.nativeId >= 0) {
        clearTimeout(e.nativeId);
        e.nativeId = -1;
        const left: number = e.dueAt - now;
        e.remainMs = left > 0 ? left : 0;
      }
    }
  }

  /**
   * 返回暂停时长 ms。floorMs = 恢复缓冲（策划 21 §3.4：剩余 < floorMs 的抬到 floorMs，
   * 继续后缓冲期内不进下一拍；Table 传 RESUME_GRACE_MS）。
   */
  resume(floorMs: number = 0): number {
    if (!this.paused) {
      return 0;
    }
    const floor: number = floorMs > 0 ? floorMs : 0;
    for (let i = 0; i < this.entries.length; i++) {
      if (this.entries[i].nativeId < 0 && this.entries[i].remainMs < floor) {
        this.entries[i].remainMs = floor;
      }
    }
    const held: number = Date.now() - this.pausedAt;
    this.paused = false;
    this.pausedAt = 0;
    const list: TimerEntry[] = [];
    for (let i = 0; i < this.entries.length; i++) {
      list.push(this.entries[i]);
    }
    for (let i = 0; i < list.length; i++) {
      if (list[i].nativeId < 0) {
        this.arm(list[i]);
      }
    }
    return held > 0 ? held : 0;
  }

  private arm(e: TimerEntry): void {
    e.dueAt = Date.now() + e.remainMs;
    const id: number = e.id;
    e.nativeId = setTimeout((): void => {
      this.fire(id);
    }, e.remainMs);
  }

  private fire(id: number): void {
    let hit: TimerEntry | null = null;
    const kept: TimerEntry[] = [];
    for (let i = 0; i < this.entries.length; i++) {
      if (this.entries[i].id === id) {
        hit = this.entries[i];
      } else {
        kept.push(this.entries[i]);
      }
    }
    this.entries = kept;
    if (hit === null) {
      return;
    }
    hit.nativeId = -1;
    hit.fn();
  }
}
