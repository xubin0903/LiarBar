import { ConfigRepository } from '../config/ConfigRepository';
import { PersonaRow } from '../config/AiPersonasConfig';
import { PersonaId } from './PersonaId';
import { Logger } from '../common/Logger';

/**
 * Read persona tables only. No live match decisions yet. No LLM judging.
 */
export class AiFriendStub {
  row(id: PersonaId): PersonaRow {
    const table = ConfigRepository.aiPersonas().personas;
    if (id === PersonaId.SHARK) {
      return table.SHARK;
    }
    if (id === PersonaId.KAREN) {
      return table.KAREN;
    }
    return table.TIMID;
  }

  /** Placeholder: later PR samples from the table. */
  thinkDelayMs(id: PersonaId): number {
    const cfg = ConfigRepository.match();
    Logger.info('AiFriendStub', `think window for ${id} uses ai_think_ms_* from config`);
    return cfg.ai_think_ms_min;
  }
}
