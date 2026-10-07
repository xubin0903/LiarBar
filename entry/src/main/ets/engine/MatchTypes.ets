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
  /** Alive token for candle UI (1/0). Not 3-life formula. */
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
  /** PR-B 战绩：本座出的牌被质疑次数（21 §2.2 doubted）。 */
  doubtedCount: number;
  /** PR-B 战绩：本座被识破次数（裁定 SUCCESS，21 §2.2 caught）。 */
  caughtCount: number;
  /** PR-B 战绩：离场时刻存活座数（含自己），0 = 还在场（21 §1.5）。 */
  aliveAtExit: number;
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
  /** Seats that emptied this land (RoundSafeWait contributors). Not whole-match place. */
  emptyOrder: number[];
  /**
   * Deprecated under revolver v1 — engine keeps false.
   * HandEmptyGate replaces RoundWin→RedealAll.
   */
  roundWinPending: boolean;
  /** ≥3 EmptySafe3: next must choose 你/上家. */
  emptySafePending?: boolean;
  /** =2: force challenge emptier's last hand. */
  forceChallengeEmpty?: boolean;
  /** Emptier seat for HandEmptyGate. */
  emptyHandSeatId?: number;
  /** Seats in RoundSafeWait (≥3 不质疑你). */
  roundSafeWaitSeats?: number[];
  /** Frozen · 废左轮. Always −1 on primary path. */
  chamberIndex?: number;
  /** Frozen · 废左轮. Always −1 on primary path. */
  liveChamberIndex?: number;
  /** Legacy field: true iff last PenaltyExtinguish1 eliminated (lives→0). */
  lastShotLive?: boolean;
  /** Legacy field: seat that took last PenaltyExtinguish1 (−1 none). */
  lastShooterSeatId?: number;
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

/**
 * 21 §1.3 引擎私有出牌日志 `playLog` 的一条（结算面板唯一数据源）。
 * 不进 MatchSnapshot（局中不出现）；只在 RECAP / END 后经 MatchEngine.recapPlayLog() 读副本。
 * seq = 本局手序（1 起，rollback 弹末条、不留空号），不是 playId 里的 playSeq。
 */
export interface PlayLogEntry {
  seq: number;
  round: number;
  actorSeatId: number;
  /** 张数 1～3。 */
  count: number;
  /** 本手非宣称非 Joker 张数（commitPicked 内已算的 fake）。 */
  fakeCount: number;
  style: PlayStyle;
  challenged: boolean;
  challengerSeatId: number;
  /** 裁定 SUCCESS（被拆穿）。 */
  caught: boolean;
  loserSeatId: number;
}

/**
 * PR-A 结算高光快照：collectRedeal 清空 challenge/lastPlay 之前抓取。
 * handNo = 本局第几手（全局手序，回撤已扣），不是张数。
 */
export interface HighlightPick {
  challengerSeatId: number;
  accusedSeatId: number;
  handNo: number;
  style: string;
  success: boolean;
}

export { BetPick, ChallengeResult, EventKind, LifeReason, PlayStyle };
