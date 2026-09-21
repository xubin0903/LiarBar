import { PersonaRow } from '../config/AiPersonasConfig';
import { SeededRng } from '../engine/SeededRng';
import { AiPersonaRegistry } from './AiPersonaRegistry';
import { AiSeatController } from './AiSeatController';

/**
 * Facade for think delay / emote row. Decisions live in AiSeatController.
 * 人机对局AI.md v0.1.0 — no probability-table challenge, no seat-hardcoded intent.
 */
export class AiFriend {
  row(id: string): PersonaRow {
    return AiPersonaRegistry.row(id);
  }

  thinkDelayMs(id: string, rng: SeededRng, turnSeconds: number): number {
    const ctrl: AiSeatController = AiSeatController.create(-1, id);
    return ctrl.thinkDelayMs(rng, turnSeconds);
  }
}
