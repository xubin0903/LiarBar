import { LobbyBoot } from './LobbyBoot';

/** Local idle-loop kinds. Not control ids. announce is a separate pair. */
export class DealerIdleKind {
  static readonly IDLE: string = 'idle_base';
  static readonly BLINK: string = 'blink';
  static readonly NOD: string = 'nod';
  static readonly CUP: string = 'cup';
  static readonly MASK: string = 'mask';
}

class IdleWeight {
  kind: string = '';
  weight: number = 0;
}

/**
 * Weighted idle loop (docs/04-设计/05-开场大厅v3-UI动效挂点.md §C.2).
 * blink 0.40 / nod 0.25 / cup 0.20 / mask 0.15 + cooldown + mutex.
 */
export class DealerIdleMachine {
  static readonly W_BLINK: number = 0.40;
  static readonly W_NOD: number = 0.25;
  static readonly W_CUP: number = 0.20;
  static readonly W_MASK: number = 0.15;
  static readonly CROSS_MS: number = 150;

  private lastMajor: string = '';
  private blinkReadyAt: number = 0;
  private nodReadyAt: number = 0;
  private cupReadyAt: number = 0;
  private maskReadyAt: number = 0;
  private loopStartMs: number = 0;
  private sawBlink: boolean = false;
  private sawAccent: boolean = false;

  reset(nowMs: number): void {
    this.lastMajor = '';
    this.blinkReadyAt = 0;
    this.nodReadyAt = 0;
    this.cupReadyAt = 0;
    this.maskReadyAt = 0;
    this.loopStartMs = nowMs;
    this.sawBlink = false;
    this.sawAccent = false;
  }

  durationOf(kind: string): number {
    if (kind === DealerIdleKind.BLINK) {
      return LobbyBoot.BOOT_MS_BLINK;
    }
    if (kind === DealerIdleKind.NOD) {
      return LobbyBoot.BOOT_MS_NOD;
    }
    if (kind === DealerIdleKind.CUP) {
      return LobbyBoot.BOOT_MS_CUP;
    }
    if (kind === DealerIdleKind.MASK) {
      return LobbyBoot.BOOT_MS_MASK;
    }
    return 0;
  }

  markPlayed(kind: string, nowMs: number): void {
    if (kind === DealerIdleKind.BLINK) {
      this.blinkReadyAt = nowMs + LobbyBoot.BOOT_MS_BLINK_CD;
      this.sawBlink = true;
      this.lastMajor = '';
      return;
    }
    if (kind === DealerIdleKind.NOD) {
      this.nodReadyAt = nowMs + LobbyBoot.BOOT_MS_NOD_CD;
      this.lastMajor = DealerIdleKind.NOD;
      this.sawAccent = true;
      return;
    }
    if (kind === DealerIdleKind.CUP) {
      this.cupReadyAt = nowMs + LobbyBoot.BOOT_MS_CUP_CD;
      this.lastMajor = DealerIdleKind.CUP;
      this.sawAccent = true;
      return;
    }
    if (kind === DealerIdleKind.MASK) {
      this.maskReadyAt = nowMs + LobbyBoot.BOOT_MS_MASK_CD;
      this.sawAccent = true;
      this.lastMajor = '';
    }
  }

  canBlink(nowMs: number): boolean {
    return nowMs >= this.blinkReadyAt;
  }

  pick(nowMs: number, cupActive: boolean): string {
    const forced: string = this.forceAccentIfNeeded(nowMs, cupActive);
    if (forced.length > 0) {
      return forced;
    }
    const rows: IdleWeight[] = this.eligible(nowMs, cupActive, false);
    if (rows.length === 0) {
      if (this.canBlink(nowMs) && !cupActive) {
        return DealerIdleKind.BLINK;
      }
      return DealerIdleKind.IDLE;
    }
    return DealerIdleMachine.weightedPick(rows);
  }

  pickFirst(nowMs: number): string {
    if (this.canBlink(nowMs)) {
      return DealerIdleKind.BLINK;
    }
    return this.pick(nowMs, false);
  }

  private forceAccentIfNeeded(nowMs: number, cupActive: boolean): string {
    if (this.sawAccent) {
      return '';
    }
    if (nowMs - this.loopStartMs < 8000) {
      return '';
    }
    const rows: IdleWeight[] = this.eligible(nowMs, cupActive, true);
    if (rows.length === 0) {
      return '';
    }
    return DealerIdleMachine.weightedPick(rows);
  }

  private eligible(nowMs: number, cupActive: boolean, accentOnly: boolean): IdleWeight[] {
    const rows: IdleWeight[] = [];
    const blockMajor: boolean = cupActive || this.lastMajor === DealerIdleKind.NOD ||
      this.lastMajor === DealerIdleKind.CUP;
    if (!accentOnly && this.canBlink(nowMs)) {
      const blink: IdleWeight = new IdleWeight();
      blink.kind = DealerIdleKind.BLINK;
      blink.weight = DealerIdleMachine.W_BLINK;
      rows.push(blink);
    }
    if (!blockMajor && nowMs >= this.nodReadyAt) {
      const nod: IdleWeight = new IdleWeight();
      nod.kind = DealerIdleKind.NOD;
      nod.weight = DealerIdleMachine.W_NOD;
      rows.push(nod);
    }
    if (!blockMajor && nowMs >= this.cupReadyAt) {
      const cup: IdleWeight = new IdleWeight();
      cup.kind = DealerIdleKind.CUP;
      cup.weight = DealerIdleMachine.W_CUP;
      rows.push(cup);
    }
    if (!cupActive && nowMs >= this.maskReadyAt) {
      const mask: IdleWeight = new IdleWeight();
      mask.kind = DealerIdleKind.MASK;
      mask.weight = DealerIdleMachine.W_MASK;
      rows.push(mask);
    }
    return rows;
  }

  private static weightedPick(rows: IdleWeight[]): string {
    let sum: number = 0;
    for (let i = 0; i < rows.length; i++) {
      sum += rows[i].weight;
    }
    if (sum <= 0) {
      return DealerIdleKind.BLINK;
    }
    let cursor: number = Math.random() * sum;
    for (let i = 0; i < rows.length; i++) {
      cursor -= rows[i].weight;
      if (cursor <= 0) {
        return rows[i].kind;
      }
    }
    return rows[rows.length - 1].kind;
  }
}
