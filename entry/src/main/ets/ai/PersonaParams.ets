import { PersonaRow } from '../config/AiPersonasConfig';
import { AiPersonaParams } from './AiTypes';
import { AiMath } from './AiMath';

/**
 * Continuous parameter view. 人机对局AI-核心算法.md v0.2.0 §0.2 / §6.
 * Decisions must not branch on persona id / seat id — only on these knobs.
 */
export class PersonaParams {
  static readonly PLAY_MIN: number = 1200;
  static readonly PLAY_MAX: number = 3500;
  static readonly CHAL_MIN: number = 1500;
  static readonly CHAL_MAX: number = 4000;
  static readonly DEFAULT_TEMP: number = 0.45;
  static readonly DEFAULT_CHAL_TEMP: number = 0.19;
  static readonly W_BIAS: number = -0.60;

  static betaOf(params: AiPersonaParams): number {
    return AiMath.lerp(1.2, 3.2, params.challengeSensitivity);
  }

  static thresholdOf(params: AiPersonaParams): number {
    const t0: number = AiMath.lerp(0.18, -0.05, params.challengeSensitivity);
    const raw: number = t0 + 0.12 * params.caution - 0.08 * params.aggression;
    return AiMath.clamp(raw, -0.20, 0.35);
  }

  static fill(row: PersonaRow): AiPersonaParams {
    const playMin: number = PersonaParams.pick(row.thinkPlayMin, row.thinkMsMin, PersonaParams.PLAY_MIN);
    const playMax: number = PersonaParams.pick(row.thinkPlayMax, row.thinkMsMax, PersonaParams.PLAY_MAX);
    const chalMin: number = PersonaParams.pick(row.thinkChalMin, 0, PersonaParams.CHAL_MIN);
    const chalMax: number = PersonaParams.pick(row.thinkChalMax, 0, PersonaParams.CHAL_MAX);
    let temp: number = row.temperature;
    if (temp < 0.05) {
      temp = PersonaParams.DEFAULT_TEMP;
    }
    let chalTemp: number = row.challengeTemperature;
    if (chalTemp < 0.05) {
      chalTemp = PersonaParams.DEFAULT_CHAL_TEMP;
    }
    let speech: string = row.speechPlay;
    if (speech.length === 0) {
      speech = '看着办。';
    }
    return {
      personaId: row.personaId,
      displayName: row.displayName,
      aggression: row.aggression,
      caution: row.caution,
      bluffTendency: row.bluffTendency,
      challengeSensitivity: row.challengeSensitivity,
      handPressureWeight: row.handPressureWeight,
      memoryWeight: row.memoryWeight,
      errorRate: row.errorRate,
      preferPlay1: row.preferPlay1,
      preferPlay2: row.preferPlay2,
      preferPlay3: row.preferPlay3,
      pSlam: row.pSlam,
      pHesitateOnBluff: row.pHesitateOnBluff,
      pNameCall: row.pNameCall,
      thinkMsMin: playMin,
      thinkMsMax: playMax,
      thinkPlayMin: playMin,
      thinkPlayMax: playMax,
      thinkChalMin: chalMin,
      thinkChalMax: chalMax,
      temperature: temp,
      challengeTemperature: chalTemp,
      speechPlay: speech,
      pEmoteAfterPlay: row.pEmoteAfterPlay,
      pKnock: row.pKnock,
      pSignNo: row.pSignNo
    };
  }

  private static pick(primary: number, fallback: number, def: number): number {
    if (primary > 0) {
      return primary;
    }
    if (fallback > 0) {
      return fallback;
    }
    return def;
  }
}
