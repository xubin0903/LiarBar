export interface PersonaRow {
  persona_id: string;
  display_name: string;
  p_play_truth_when_can: number;
  p_prefer_slam: number;
  p_prefer_hesitate_bluff: number;
  avg_play_count_bias: number;
  base_p_challenge: number;
  bonus_after_consecutive_play: number;
  bonus_on_slam: number;
  penalty_strong_hand: number;
  p_emote_after_play: number;
  p_knock: number;
  p_sign_no: number;
  p_name: number;
}

export interface PersonaTable {
  TIMID: PersonaRow;
  SHARK: PersonaRow;
  KAREN: PersonaRow;
}

export interface AiPersonasConfig {
  schema_version: string;
  challenge_p_min: number;
  challenge_p_max: number;
  strong_hand_min_truth: number;
  personas: PersonaTable;
}
