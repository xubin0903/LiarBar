import { PersonaRow } from '../config/AiPersonasConfig';
import { SeededRng } from '../engine/SeededRng';
import { AiPersonaRegistry } from './AiPersonaRegistry';
import { ThinkDelay } from './ThinkDelay';

/**
 * Facade for think delay / emote row. Decisions live in Play/ChallengePolicy.
 * 人机对局AI-核心算法.md v0.2.0 — no probability-table, no seat-hardcoded intent.
 */
export class AiFriend {
  row(id: string): PersonaRow {
    return AiPersonaRegistry.row(id);
  }

  thinkDelayMs(id: string, rng: SeededRng, turnSeconds: number): number {
    let ms: number = ThinkDelay.play(4, 0.2, AiPersonaRegistry.params(id), rng);
    const cap: number = (turnSeconds - 2) * 1000;
    if (cap >= 1200 && ms > cap) {
      ms = cap;
    }
    return ms;
  }
}
