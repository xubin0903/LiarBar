import { Logger } from '../common/Logger';

export interface LiveWindowPayload {
  phaseText: string;
  remainSec: number;
  claimShort: string;
}

/**
 * F-08 fail-soft stub.
 * Does not import LiveViewKit so machines without the entitlement still compile.
 * Capsule may only show phase / remaining seconds / claim short — never ranks in hand.
 */
export class LiveWindowAdapter {
  private active: boolean = false;

  start(payload: LiveWindowPayload): boolean {
    Logger.info('LiveWindow', `start stub ${payload.phaseText} ${payload.remainSec}s ${payload.claimShort}`);
    this.active = false;
    return false;
  }

  update(payload: LiveWindowPayload): boolean {
    if (!this.active) {
      return false;
    }
    Logger.info('LiveWindow', `update stub ${payload.phaseText}`);
    return false;
  }

  stop(): void {
    this.active = false;
    Logger.info('LiveWindow', 'stop stub');
  }
}
