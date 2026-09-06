import { MatchDefaults } from '../config/MatchDefaults';
import {
  BetPick,
  ChallengeResult,
  EventKind,
  LifeReason,
  Phase,
  PlayStyle,
  SeatRole,
  SeatStatus,
  TableMode,
  TurnWindow
} from './Phase';

export interface CardModel {
  cardId: string;
  rank: string;
}

export interface ClaimModel {
  claimId: string;
  rank: string;
  firstActorSeatId: number;
  announcedAt: number;
}

export interface PlayModel {
  playId: string;
  actorSeatId: number;
  count: number;
  style: PlayStyle;
  speech: string;
  namedSeatId: number;
  isFirstOfRound: boolean;
  committedAt: number;
}

export interface FaceBet {
  seatId: number;
  pick: BetPick;
}

export interface ChallengeModel {
  challengeId: string;
  challengerSeatId: number;
  targetPlayId: string;
  ritualSkipped: boolean;
  ritualBeat: string;
  result: string;
  fakeCount: number;
  judgedAt: number;
  bets: FaceBet[];
}

export interface SeatModel {
  seatId: number;
  role: SeatRole;
  aiPersona: string;
  nickname: string;
  status: SeatStatus;
  isHost: boolean;
  faceScore: number;
  lives: number;
  lastDelta: number;
  lastReason: LifeReason;
  handCount: number;
  consecutiveTimeouts: number;
}

export interface MatchEvent {
  kind: EventKind;
  seatId: number;
  detail: string;
  at: number;
}

export interface RecapRow {
  seatId: number;
  nickname: string;
  playCount: number;
  fakeHandCount: number;
  challengeCount: number;
  challengeHits: number;
}

export interface MatchSnapshot {
  matchId: string;
  seed: number;
  config: MatchDefaults;
  phase: Phase;
  turnWindow: TurnWindow;
  tableMode: TableMode;
  silentMode: boolean;
  currentSeatId: number;
  currentClaim: ClaimModel | null;
  lastPlay: PlayModel | null;
  lastPenalizedSeatId: number;
  roundIndex: number;
  playIndexInRound: number;
  stallSkipCount: number;
  winnerSeatId: number;
  canChallenge: boolean;
  hasCards: boolean;
  turnRemainMs: number;
  ritualBeat: string;
  revealOpen: boolean;
  dealerKey: string;
  dealerLine: string;
  highlightLine: string;
  selfHand: CardModel[];
  lastPlayRanks: string[];
  seats: SeatModel[];
  challenge: ChallengeModel | null;
  eventLog: MatchEvent[];
  recap: RecapRow[];
  startedAt: number;
  endedAt: number;
}

export { BetPick, ChallengeResult, EventKind, LifeReason, PlayStyle };
