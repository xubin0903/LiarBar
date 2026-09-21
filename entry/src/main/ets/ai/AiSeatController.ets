import { SeededRng } from '../engine/SeededRng';
import { AiPersonaRegistry } from './AiPersonaRegistry';
import { AiChallengeTrace, AiInfoSet, AiPersonaParams, ChallengeAction, PlayAction } from './AiTypes';
import { ChallengePolicy } from './ChallengePolicy';
import { Memory } from './Memory';
import { PlayPolicy } from './PlayPolicy';
import { ThinkDelay } from './ThinkDelay';

/**
 * Thin orchestrator. 人机对局AI-核心算法.md v0.2.0 §6.
 * Decisions live in PlayPolicy / ChallengePolicy / ThinkDelay.
 */
export class AiSeatController {
  seatId: number;
  personaId: string;
  private params: AiPersonaParams;

  constructor(seatId: number, personaId: string, params: AiPersonaParams) {
    this.seatId = seatId;
    this.personaId = AiPersonaRegistry.normalize(personaId);
    this.params = params;
  }

  static create(seatId: number, personaId: string): AiSeatController {
    const id: string = AiPersonaRegistry.normalize(personaId);
    return new AiSeatController(seatId, id, AiPersonaRegistry.params(id));
  }

  updateParams(p: AiPersonaParams): void {
    this.params = p;
  }

  thinkDelayMs(rng: SeededRng, turnSeconds: number): number {
    let ms: number = ThinkDelay.play(4, 0.2, this.params, rng);
    const cap: number = (turnSeconds - 2) * 1000;
    if (cap >= 1200 && ms > cap) {
      ms = cap;
    }
    return ms;
  }

  decideChallenge(info: AiInfoSet, rng: SeededRng): ChallengeAction {
    return ChallengePolicy.decideChallenge(info, Memory.fromInfoSet(info), rng, true);
  }

  decidePlay(info: AiInfoSet, rng: SeededRng): PlayAction {
    return PlayPolicy.decidePlay(info, Memory.fromInfoSet(info), rng, true);
  }

  scoreChallenge(info: AiInfoSet): AiChallengeTrace {
    return ChallengePolicy.scoreChallenge(info, Memory.fromInfoSet(info));
  }
}
