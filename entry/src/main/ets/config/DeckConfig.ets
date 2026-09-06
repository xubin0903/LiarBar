export interface RankCounts {
  A: number;
  K: number;
  Q: number;
  JOKER: number;
}

export interface DeckConfig {
  schema_version: string;
  ranks: string[];
  wild: string;
  claimable: string[];
  decks: DeckByPlayers;
}

/**
 * Runtime keys match deck.json: n3..n6 (player-count 3–6).
 * Dot access only — ArkTS API 23 forbids indexed field access.
 */
export interface DeckByPlayers {
  n3: RankCounts;
  n4: RankCounts;
  n5: RankCounts;
  n6: RankCounts;
}

export function deckCountsFor(cfg: DeckConfig, playerCount: number): RankCounts | null {
  if (playerCount === 3) {
    return cfg.decks.n3;
  }
  if (playerCount === 4) {
    return cfg.decks.n4;
  }
  if (playerCount === 5) {
    return cfg.decks.n5;
  }
  if (playerCount === 6) {
    return cfg.decks.n6;
  }
  return null;
}
