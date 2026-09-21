import { Logger } from '../common/Logger';
import { SeededRng } from '../engine/SeededRng';
import { AiChallengeTrace, AiInfoSet, ChallengeAction } from './AiTypes';
import { AiMath } from './AiMath';
import { Memory } from './Memory';
import { PersonaParams } from './PersonaParams';
import { ThinkDelay } from './ThinkDelay';

const TAG = 'ChallengePolicy';

/**
 * D2 likelihood + EV. 人机对局AI-核心算法.md v0.2.0 §4 / §4b.
 * Continuous params only — no persona / seat action branches.
 */
export class ChallengePolicy {
  static readonly W_D: number = 0.35;
  static readonly W_S: number = 0.25;
  static readonly W_C: number = 0.15;
  static readonly W_P: number = 0.10;
  static readonly W_H: number = 0.12;
  static readonly W_N: number = 0.03;

  static decideChallenge(info: AiInfoSet, memory: Memory, rng: SeededRng, log: boolean): ChallengeAction {
    const trace: AiChallengeTrace = ChallengePolicy.scoreChallenge(info, memory);
    if (info.forceChallenge2) {
      trace.intent = 'DOUBT';
      trace.thinkMs = ThinkDelay.challenge(1.0, info.params, rng, 1.0);
      if (log) {
        ChallengePolicy.logTrace(trace);
      }
      return { type: 'DOUBT', thinkMs: trace.thinkMs };
    }
    if (!info.canChallenge) {
      const skip: string = ChallengePolicy.believeOrSkip(info);
      trace.intent = skip;
      trace.thinkMs = ThinkDelay.challenge(1.0, info.params, rng, ChallengePolicy.styleSignal(info));
      if (log) {
        ChallengePolicy.logTrace(trace);
      }
      return { type: skip, thinkMs: trace.thinkMs };
    }
    let temp: number = info.params.challengeTemperature;
    if (temp < 1e-6) {
      temp = PersonaParams.DEFAULT_CHAL_TEMP;
    }
    const pDoubt: number = AiMath.sigmoid((trace.EV - trace.T) / temp);
    let intent: string = ChallengePolicy.believeOrSkip(info);
    if (rng.next() < pDoubt) {
      intent = 'DOUBT';
    }
    let flipped: boolean = false;
    if (rng.next() < info.params.errorRate) {
      intent = ChallengePolicy.flipIntent(intent, info);
      flipped = true;
    }
    trace.intent = intent;
    trace.noiseFlipped = flipped;
    const margin: number = Math.abs(trace.EV - trace.T);
    trace.thinkMs = ThinkDelay.challenge(margin, info.params, rng, ChallengePolicy.styleSignal(info));
    if (log) {
      ChallengePolicy.logTrace(trace);
    }
    return { type: intent, thinkMs: trace.thinkMs };
  }

  static scoreChallenge(info: AiInfoSet, memory: Memory): AiChallengeTrace {
    const gate: string = ChallengePolicy.gateName(info);
    if (info.forceChallenge2) {
      return ChallengePolicy.traceOf(info, gate, 1, 1, PersonaParams.thresholdOf(info.params),
        PersonaParams.betaOf(info.params), 0, 1, 1, 0, 0, 0, 'DOUBT', 0);
    }
    const phi: number[] = ChallengePolicy.features(info, memory);
    const beta: number = PersonaParams.betaOf(info.params);
    const dot: number = PersonaParams.W_BIAS +
      ChallengePolicy.W_D * phi[0] +
      ChallengePolicy.W_S * phi[1] +
      ChallengePolicy.W_C * phi[2] +
      ChallengePolicy.W_P * phi[3] +
      ChallengePolicy.W_H * phi[4] +
      ChallengePolicy.W_N * phi[5];
    const lFake: number = AiMath.sigmoid(beta * dot);
    const lTrue: number = 1 - lFake;
    const cWrong: number = ChallengePolicy.wrongCost(info);
    const ev: number = lFake * 1.0 - lTrue * cWrong;
    const t: number = PersonaParams.thresholdOf(info.params);
    let intent: string = ChallengePolicy.believeOrSkip(info);
    if (ev > t) {
      intent = 'DOUBT';
    }
    return ChallengePolicy.traceOf(info, gate, lFake, ev, t, beta,
      phi[0], phi[1], phi[2], phi[3], phi[4], phi[5], intent, 0);
  }

  static features(info: AiInfoSet, memory: Memory): number[] {
    const density: number = memory.density(info);
    const phiD: number = 1 - density;
    let phiS: number = 0;
    let phiC: number = 0;
    let phiP: number = 0;
    let phiH: number = 0;
    let phiN: number = 0;
    if (info.lastPlay !== null) {
      if (info.lastPlay.style === 'SLAM') {
        phiS = 1.0;
      } else if (info.lastPlay.style === 'HESITATE') {
        phiS = 0.35;
      }
      phiC = (info.lastPlay.count - 1) / 2;
      const actor = Memory.seatOf(info, info.lastPlay.seatId);
      phiP = Memory.pressureOf(actor, info.limits.handSizeDefault, info.limits.livesDefault);
      phiH = memory.liarOf(info.lastPlay.seatId);
      if (info.lastPlay.namedSeatId === info.self.seatId) {
        phiN = 1;
      }
    }
    return [phiD, phiS, phiC, phiP, phiH, phiN];
  }

  private static wrongCost(info: AiInfoSet): number {
    let c: number = 1.0 * (0.6 + 0.4 * info.params.caution);
    if (info.self.lives === 1) {
      c = c + 0.25;
    }
    if (info.aliveCount === 2) {
      c = c + 0.15;
    }
    return c;
  }

  private static styleSignal(info: AiInfoSet): number {
    if (info.lastPlay === null) {
      return 0;
    }
    if (info.lastPlay.style === 'SLAM') {
      return 1;
    }
    if (info.lastPlay.style === 'HESITATE') {
      return 0.35;
    }
    return 0;
  }

  private static gateName(info: AiInfoSet): string {
    if (info.forceChallenge2) {
      return 'ForceChallenge2';
    }
    if (info.turnWindow === 'CHALLENGE_ONLY') {
      return 'CHALLENGE_ONLY';
    }
    if (info.turnWindow === 'EMPTY_SAFE') {
      return 'HandEmptyGate';
    }
    return 'TrustOrChallenge';
  }

  private static believeOrSkip(info: AiInfoSet): string {
    if (info.turnWindow === 'CHALLENGE_ONLY') {
      return 'SKIP';
    }
    return 'BELIEVE';
  }

  private static flipIntent(intent: string, info: AiInfoSet): string {
    if (intent === 'DOUBT') {
      return ChallengePolicy.believeOrSkip(info);
    }
    return 'DOUBT';
  }

  private static traceOf(
    info: AiInfoSet,
    gate: string,
    lFake: number,
    ev: number,
    t: number,
    beta: number,
    phiD: number,
    phiS: number,
    phiC: number,
    phiP: number,
    phiH: number,
    phiN: number,
    intent: string,
    thinkMs: number
  ): AiChallengeTrace {
    return {
      seatId: info.self.seatId,
      persona: info.personaId,
      gate: gate,
      L_fake: lFake,
      EV: ev,
      T: t,
      beta: beta,
      phiDensity: phiD,
      phiStyle: phiS,
      phiCount: phiC,
      phiPressure: phiP,
      phiHistory: phiH,
      phiNamed: phiN,
      S_fake: lFake,
      S_need: 0,
      S_risk: 0,
      Score: ev,
      intent: intent,
      noiseFlipped: false,
      thinkMs: thinkMs
    };
  }

  private static logTrace(tr: AiChallengeTrace): void {
    Logger.info(TAG,
      'challenge seat=' + tr.seatId + ' persona=' + tr.persona +
        ' L_fake=' + ChallengePolicy.fmt(tr.L_fake) +
        ' EV=' + ChallengePolicy.fmt(tr.EV) +
        ' T=' + ChallengePolicy.fmt(tr.T) +
        ' beta=' + ChallengePolicy.fmt(tr.beta) +
        ' intent=' + tr.intent + ' gate=' + tr.gate +
        ' thinkMs=' + tr.thinkMs + ' noise=' + tr.noiseFlipped);
  }

  private static fmt(x: number): number {
    return Math.round(x * 1000) / 1000;
  }
}
