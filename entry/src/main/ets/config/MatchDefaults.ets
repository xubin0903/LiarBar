/**
 * Keys must match docs/02-游戏设计/数值与牌堆配置.md verbatim.
 * Do not alias lives_default → hp, etc.
 */
export interface MatchDefaults {
  schema_version: string;
  min_players: number;
  max_players: number;
  default_players: number;
  lives_default: number;
  hand_size_default: number;
  max_play_cards: number;
  min_play_cards: number;
  turn_seconds: number;
  challenge_only_seconds: number;
  challenge_bet_seconds: number;
  challenge_ritual_max_seconds: number;
  low_time_threshold: number;
  timeout_auto_play: boolean;
  max_slam_per_game: number;
  max_hesitate_per_game: number;
  hesitate_dwell_ms: number;
  soft_max_velocity: number;
  slam_min_velocity: number;
  demo_seed_enabled: boolean;
  demo_seed_value: number;
  first_actor_policy: string;
  avoid_same_claim_streak: number;
  face_bet_enabled: boolean;
  face_bet_correct: number;
  face_bet_wrong: number;
  auto_play_prefer_legal: boolean;
  auto_play_else: string;
  challenge_only_on_timeout: string;
  consecutive_timeout_warn: number;
  ai_think_ms_min: number;
  ai_think_ms_max: number;
}
