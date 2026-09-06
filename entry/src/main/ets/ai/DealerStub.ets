import { Logger } from '../common/Logger';

/**
 * Dealer is an engine announcer + template lines.
 * JUDGE / PENALTY sentences must not be rewritten by an LLM.
 */
export class DealerStub {
  announce(key: string): string {
    Logger.info('DealerStub', `template ${key} (no LLM)`);
    return key;
  }
}
