import { ConfigRepository } from '../config/ConfigRepository';
import { PersonaRow } from '../config/AiPersonasConfig';
import { AiPersonaParams } from './AiTypes';
import { PersonaId } from './PersonaId';
import { PersonaParams } from './PersonaParams';

/**
 * Seat bind + persona table. 人机对局AI.md v0.1.0 §4.3.
 * Bind is configurable JSON; decisions must not branch on raw seatId.
 */
export class AiPersonaRegistry {
  static normalize(id: string): string {
    if (id === 'SHARK' || id === PersonaId.SHARK || id === 'AI_SHARK') {
      return 'AI_SHARK';
    }
    if (id === 'KAREN' || id === PersonaId.KAREN || id === 'AI_KAREN') {
      return 'AI_KAREN';
    }
    return 'AI_TIMID';
  }

  static row(id: string): PersonaRow {
    const key: string = AiPersonaRegistry.normalize(id);
    if (ConfigRepository.isReady()) {
      const table = ConfigRepository.aiPersonas().personas;
      if (key === 'AI_SHARK') {
        return table.AI_SHARK;
      }
      if (key === 'AI_KAREN') {
        return table.AI_KAREN;
      }
      return table.AI_TIMID;
    }
    return AiPersonaRegistry.fallback(key);
  }

  static params(id: string): AiPersonaParams {
    return AiPersonaRegistry.toParams(AiPersonaRegistry.row(id));
  }

  static toParams(row: PersonaRow): AiPersonaParams {
    return PersonaParams.fill(row);
  }

  static displayName(id: string): string {
    return AiPersonaRegistry.row(id).displayName;
  }

  /** MVP bind: seat1=TIMID, seat2=SHARK, seat3=KAREN (JSON-overridable). */
  static personaIdForSeat(seatId: number): string {
    if (ConfigRepository.isReady()) {
      const bind = ConfigRepository.aiPersonas().mvpSeatBind;
      if (seatId === 1) {
        return AiPersonaRegistry.normalize(bind.seat1);
      }
      if (seatId === 2) {
        return AiPersonaRegistry.normalize(bind.seat2);
      }
      if (seatId === 3) {
        return AiPersonaRegistry.normalize(bind.seat3);
      }
    }
    if (seatId === 2) {
      return 'AI_SHARK';
    }
    if (seatId === 3) {
      return 'AI_KAREN';
    }
    return 'AI_TIMID';
  }

  static preferWeight(params: AiPersonaParams, n: number): number {
    if (n === 1) {
      return params.preferPlay1;
    }
    if (n === 2) {
      return params.preferPlay2;
    }
    if (n === 3) {
      return params.preferPlay3;
    }
    return 0;
  }

  private static fallback(key: string): PersonaRow {
    if (key === 'AI_SHARK') {
      return {
        personaId: 'AI_SHARK',
        displayName: '老千',
        aggression: 0.55,
        caution: 0.50,
        bluffTendency: 0.62,
        challengeSensitivity: 0.42,
        handPressureWeight: 0.40,
        memoryWeight: 0.65,
        errorRate: 0.05,
        preferPlay1: 0.20,
        preferPlay2: 0.55,
        preferPlay3: 0.25,
        pSlam: 0.35,
        pHesitateOnBluff: 0.25,
        pNameCall: 0.25,
        thinkMsMin: 1200,
        thinkMsMax: 3500,
        thinkPlayMin: 1200,
        thinkPlayMax: 3500,
        thinkChalMin: 1500,
        thinkChalMax: 4000,
        temperature: 0.45,
        challengeTemperature: 0.19,
        speechPlay: '整整齐齐',
        pEmoteAfterPlay: 0.5,
        pKnock: 0.15,
        pSignNo: 0.15
      };
    }
    if (key === 'AI_KAREN') {
      return {
        personaId: 'AI_KAREN',
        displayName: '杠精',
        aggression: 0.65,
        caution: 0.35,
        bluffTendency: 0.40,
        challengeSensitivity: 0.72,
        handPressureWeight: 0.45,
        memoryWeight: 0.40,
        errorRate: 0.06,
        preferPlay1: 0.35,
        preferPlay2: 0.45,
        preferPlay3: 0.20,
        pSlam: 0.25,
        pHesitateOnBluff: 0.20,
        pNameCall: 0.20,
        thinkMsMin: 1200,
        thinkMsMax: 3500,
        thinkPlayMin: 1200,
        thinkPlayMax: 3500,
        thinkChalMin: 1500,
        thinkChalMax: 4000,
        temperature: 0.45,
        challengeTemperature: 0.19,
        speechPlay: '看着办。',
        pEmoteAfterPlay: 0.45,
        pKnock: 0.25,
        pSignNo: 0.35
      };
    }
    return {
      personaId: 'AI_TIMID',
      displayName: '怂货',
      aggression: 0.25,
      caution: 0.75,
      bluffTendency: 0.15,
      challengeSensitivity: 0.28,
      handPressureWeight: 0.55,
      memoryWeight: 0.35,
      errorRate: 0.08,
      preferPlay1: 0.70,
      preferPlay2: 0.25,
      preferPlay3: 0.05,
      pSlam: 0.10,
      pHesitateOnBluff: 0.15,
      pNameCall: 0.05,
      thinkMsMin: 1200,
      thinkMsMax: 3500,
      thinkPlayMin: 1200,
      thinkPlayMax: 3500,
      thinkChalMin: 1500,
      thinkChalMax: 4000,
      temperature: 0.45,
      challengeTemperature: 0.19,
      speechPlay: '就…一张。',
      pEmoteAfterPlay: 0.2,
      pKnock: 0.05,
      pSignNo: 0.05
    };
  }
}
