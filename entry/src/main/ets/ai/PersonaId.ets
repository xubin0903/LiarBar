/** Engine field Seat.aiPersona. Display ids AI_TIMID / AI_SHARK / AI_KAREN live in JSON. */
export enum PersonaId {
  TIMID = 'TIMID',
  SHARK = 'SHARK',
  KAREN = 'KAREN'
}

export const DEFAULT_SEAT_PERSONAS: PersonaId[] = [
  PersonaId.TIMID,
  PersonaId.SHARK,
  PersonaId.KAREN
];
