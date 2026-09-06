export interface DemoForceEvent {
  at: string;
  rank?: string;
  firstActorSeatId?: number;
  seatId?: number;
  playIndexInRound?: number;
  count?: number;
  hasFake?: boolean;
  style?: string;
  namedSeatId?: number;
  afterPlayIndex?: number;
  skip?: boolean;
}

export interface DemoSeedConfig {
  schema_version: string;
  demo_seed_enabled: boolean;
  demo_seed_value: number;
  use_match_defaults_for_table: boolean;
  claim_rank: string;
  first_actor_seat_id: number;
  player_hand_requires_legal_and_fake: boolean;
  shark_hand_requires_fake: boolean;
  note: string;
  demo_force_events: DemoForceEvent[];
}
