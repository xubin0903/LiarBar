/** Switch + seed + optional legal force-event list (AI spec §3). */
export interface DemoForceEvent {
  at: string;
  rank: string;
  first_actor_seat_id: number;
  seat_id: number;
  play_index_in_round: number;
  count: number;
  has_fake: boolean;
  style: string;
  named_seat_id: number;
  after_play_index: number;
  skip: boolean;
}

export interface DemoSeedConfig {
  schema_version: string;
  demo_seed_enabled: boolean;
  demo_seed_value: number;
  /**
   * OFF in default builds. When true (and demo_seed_enabled), MatchDirector
   * may apply force_events PLAY/CHALLENGE. Live AI must not use this path.
   */
  demo_force_ai_enabled: boolean;
  force_events: DemoForceEvent[];
}
