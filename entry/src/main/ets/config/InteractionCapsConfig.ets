export interface CapPair {
  per_round?: number;
  per_game?: number;
  per_play?: number;
  per_turn?: number;
  only_when_low_time?: boolean;
}

export interface InteractionActions {
  KNOCK: CapPair;
  STARE: CapPair;
  SIGN_OK: CapPair;
  SIGN_NO: CapPair;
  HECKLE: CapPair;
  NAMED: CapPair;
  HURRY: CapPair;
}

export interface InteractionCapsConfig {
  schema_version: string;
  actions: InteractionActions;
}
