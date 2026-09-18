import { lineForKey } from '../engine/DealerLines';
import { MatchSnapshot } from '../engine/MatchTypes';
import { Logger } from '../common/Logger';

/**
 * Template announcer. JUDGE / PENALTY sentences are not rewritten.
 */
export class Dealer {
  announce(key: string, snap: MatchSnapshot): string {
    Logger.info('Dealer', `template ${key} (no LLM)`);
    return lineForKey(key, snap);
  }
}
