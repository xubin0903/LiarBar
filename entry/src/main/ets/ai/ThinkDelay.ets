import { SeededRng } from '../engine/SeededRng';
import { AiPersonaParams } from './AiTypes';
import { AiMath } from './AiMath';
import { PersonaParams } from './PersonaParams';

/**
 * Think-delay floors. 人机对局AI-核心算法.md v0.2.0 §5.
 * Play ∈ [1200, 3500]; challenge ∈ [1500, 4000]. Below floor → lb_str_ai_instant_think.
 */
export class ThinkDelay {
  static play(candCount: number, risk: number, params: AiPersonaParams, rng: SeededRng): number {
    const u: number = rng.next();
    let lo: number = params.thinkPlayMin;
    let hi: number = params.thinkPlayMax;
    if (lo < PersonaParams.PLAY_MIN) {
      lo = PersonaParams.PLAY_MIN;
    }
    if (hi > PersonaParams.PLAY_MAX) {
      hi = PersonaParams.PLAY_MAX;
    }
    if (hi < lo) {
      hi = lo;
    }
    const base: number = AiMath.lerp(lo, hi, u);
    const candFactor: number = AiMath.clamp(candCount / 12, 0, 1);
    const riskFactor: number = AiMath.clamp(risk, 0, 1);
    const ms: number = AiMath.clamp(base + 800 * candFactor + 600 * riskFactor,
      PersonaParams.PLAY_MIN, PersonaParams.PLAY_MAX);
    return Math.floor(ms);
  }

  static challenge(marginAbs: number, params: AiPersonaParams, rng: SeededRng, styleSignal: number): number {
    const u: number = rng.next();
    let lo: number = params.thinkChalMin;
    let hi: number = params.thinkChalMax;
    if (lo < PersonaParams.CHAL_MIN) {
      lo = PersonaParams.CHAL_MIN;
    }
    if (hi > PersonaParams.CHAL_MAX) {
      hi = PersonaParams.CHAL_MAX;
    }
    if (hi < lo) {
      hi = lo;
    }
    const base: number = AiMath.lerp(lo, hi, u);
    const ambig: number = AiMath.clamp(1.0 - marginAbs / 0.35, 0, 1);
    const sig: number = AiMath.clamp(styleSignal, 0, 1);
    const ms: number = AiMath.clamp(base + 900 * ambig + 500 * sig,
      PersonaParams.CHAL_MIN, PersonaParams.CHAL_MAX);
    return Math.floor(ms);
  }
}
