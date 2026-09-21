/** 人机对局AI.md v0.1.0 §4.3 — score/threshold knobs + emote rates. */
export interface PersonaRow {
  personaId: string;
  displayName: string;
  aggression: number;
  caution: number;
  bluffTendency: number;
  challengeSensitivity: number;
  handPressureWeight: number;
  memoryWeight: number;
  errorRate: number;
  preferPlay1: number;
  preferPlay2: number;
  preferPlay3: number;
  pSlam: number;
  pHesitateOnBluff: number;
  pNameCall: number;
  thinkMsMin: number;
  thinkMsMax: number;
  thinkPlayMin: number;
  thinkPlayMax: number;
  thinkChalMin: number;
  thinkChalMax: number;
  temperature: number;
  challengeTemperature: number;
  speechPlay: string;
  pEmoteAfterPlay: number;
  pKnock: number;
  pSignNo: number;
}

export interface PersonaTable {
  AI_TIMID: PersonaRow;
  AI_SHARK: PersonaRow;
  AI_KAREN: PersonaRow;
}

export interface MvpSeatBind {
  seat1: string;
  seat2: string;
  seat3: string;
}

export interface AiPersonasConfig {
  schema_version: string;
  personas: PersonaTable;
  mvpSeatBind: MvpSeatBind;
}
