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
 * Named bags for 3–6 players.
 * ArkTS (API 23) forbids indexed field access (arkts-no-props-by-index),
 * so these are not the rawfile keys "3"|"4"|"5"|"6".
 * ConfigRepository.parseDeck copies deck.json keys onto n3..n6.
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
