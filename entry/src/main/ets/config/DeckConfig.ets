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

/** Keys are player-count strings from deck.json (verbatim). */
export interface DeckByPlayers {
  '3': RankCounts;
  '4': RankCounts;
  '5': RankCounts;
  '6': RankCounts;
}

export function deckCountsFor(cfg: DeckConfig, playerCount: number): RankCounts | null {
  return bagByKey(cfg, `${playerCount}`);
}

function bagByKey(cfg: DeckConfig, key: string): RankCounts | null {
  if (key === '3') {
    return cfg.decks['3'];
  }
  if (key === '4') {
    return cfg.decks['4'];
  }
  if (key === '5') {
    return cfg.decks['5'];
  }
  if (key === '6') {
    return cfg.decks['6'];
  }
  return null;
}
