/** Engine field Seat.aiPersona. IDs match 人机对局AI.md v0.1.0 / GDD §8.2. */
export enum PersonaId {
  TIMID = 'AI_TIMID',
  SHARK = 'AI_SHARK',
  KAREN = 'AI_KAREN'
}

/** Fallback bind if JSON missing. Prefer ai_personas.json mvpSeatBind. */
export const DEFAULT_SEAT_PERSONAS: PersonaId[] = [
  PersonaId.TIMID,
  PersonaId.SHARK,
  PersonaId.KAREN
];
