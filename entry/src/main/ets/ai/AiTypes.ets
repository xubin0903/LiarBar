/**
 * AI InfoSet + action types. 人机对局AI.md v0.1.0 §2 / §6.
 * Other seats' hidden ranks and unrevealed play faces must never appear here.
 */

export interface AiCard {
  cardId: string;
  rank: string;
}

export interface AiSelfView {
  seatId: number;
  handRanks: string[];
  handCount: number;
  lives: number;
  cards: AiCard[];
}

export interface AiClaimView {
  rank: string;
}

/** Public last-play only. Face ranks omitted until history.reveals. */
export interface AiPublicLastPlay {
  seatId: number;
  count: number;
  style: string;
  namedSeatId: number;
}

export interface AiPublicSeat {
  seatId: number;
  handCount: number;
  lives: number;
  alive: boolean;
  order: number;
  isHuman: boolean;
}

export interface AiRevealRec {
  playSeatId: number;
  ranks: string[];
  verdict: string;
  loserSeatId: number;
}

export interface AiChallengeOutcome {
  challenger: number;
  target: number;
  success: boolean;
}

export interface AiHistoryView {
  reveals: AiRevealRec[];
  challengeOutcomes: AiChallengeOutcome[];
}

export interface AiMemoryView {
  revealedA: number;
  revealedK: number;
  revealedQ: number;
  revealedJoker: number;
  publicPlayTotal: number;
}

export interface AiLimitsView {
  maxPlay: number;
  minPlay: number;
  handSizeDefault: number;
  livesDefault: number;
  deckTotal: number;
  deckLegal: number;
  wild: string;
}

/** §4.1 persona knobs. Emote rates are performance-only. */
export interface AiPersonaParams {
  personaId: string;
  displayName: string;
  aggression: number;
  caution: number;
  bluffTendency: number;
  challengeSensitivity: number;
  handPressureWeight: number;
  memoryWeight: number;
  errorRate: number;
  preferPlay1: number;
  preferPlay2: number;
  preferPlay3: number;
  pSlam: number;
  pHesitateOnBluff: number;
  pNameCall: number;
  thinkMsMin: number;
  thinkMsMax: number;
  pEmoteAfterPlay: number;
  pKnock: number;
  pSignNo: number;
}

export interface AiInfoSet {
  self: AiSelfView;
  claim: AiClaimView;
  lastPlay: AiPublicLastPlay | null;
  seats: AiPublicSeat[];
  history: AiHistoryView;
  memory: AiMemoryView;
  phase: string;
  turnWindow: string;
  canChallenge: boolean;
  forceChallenge2: boolean;
  aliveCount: number;
  turnSecondsLeft: number;
  params: AiPersonaParams;
  limits: AiLimitsView;
  personaId: string;
}

/** Engine → builder: already-projected fields only. */
export interface AiBuilderSource {
  selfSeatId: number;
  selfCards: AiCard[];
  selfLives: number;
  claimRank: string;
  lastPlay: AiPublicLastPlay | null;
  seats: AiPublicSeat[];
  reveals: AiRevealRec[];
  challengeOutcomes: AiChallengeOutcome[];
  phase: string;
  turnWindow: string;
  canChallenge: boolean;
  forceChallenge2: boolean;
  aliveCount: number;
  turnSecondsLeft: number;
  publicPlayTotal: number;
  params: AiPersonaParams;
  personaId: string;
  maxPlay: number;
  minPlay: number;
  handSizeDefault: number;
  livesDefault: number;
  deckTotal: number;
  deckLegal: number;
  wild: string;
}

export interface ChallengeAction {
  type: string;
}

export interface PlayAction {
  type: string;
  cardIds: string[];
  style: string;
  namedSeatId: number;
  speech: string;
}

export interface AiChallengeTrace {
  seatId: number;
  persona: string;
  gate: string;
  S_fake: number;
  S_need: number;
  S_risk: number;
  Score: number;
  T: number;
  intent: string;
  noiseFlipped: boolean;
}
