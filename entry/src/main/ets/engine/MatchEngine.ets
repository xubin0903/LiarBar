import { ConfigRepository } from '../config/ConfigRepository';
import { MatchDefaults } from '../config/MatchDefaults';
import { DeckConfig, RankCounts, deckCountsFor } from '../config/DeckConfig';
import { DemoForceEvent, DemoSeedConfig } from '../config/DemoSeedConfig';
import { ChallengeBeatIds } from '../common/Ids';
import { Logger } from '../common/Logger';
import { PersonaId, DEFAULT_SEAT_PERSONAS } from '../ai/PersonaId';
import { isChallengeSuccess, isLegal } from './Judge';
import { lineForKey, pickTurnDealerKey } from './DealerLines';
import { dealRound, DealResult, isFakeRank, repairDemoHands } from './DeckDeal';
import {
  CardModel,
  ChallengeModel,
  ClaimModel,
  FaceBet,
  MatchEvent,
  MatchSnapshot,
  PlayModel,
  RecapRow,
  SeatModel
} from './MatchTypes';
import {
  BetPick,
  ChallengeResult,
  EventKind,
  FirstActorPolicy,
  LifeReason,
  Phase,
  PlayStyle,
  SeatRole,
  SeatStatus,
  TableMode,
  TurnWindow
} from './Phase';
import { SeededRng } from './SeededRng';
import { aliveCount, nextAlive, nicknameOf, seatById } from './SeatUtil';

const TAG = 'MatchEngine';

export interface StartMatchOpts {
  nickname: string;
  playerCount: number;
  silent: boolean;
}

/**
 * Pure match state machine (docs/05-技术/02-回合状态机草图.md T01+).
 * No UI / Kit. Win condition is only "one ALIVE seat remains".
 * HUMAN TURN / PLAY_REVEAL_SELF: clock paused; timeout() never auto-acts.
 * AI seats still use turn_seconds + timeout_auto_play / challenge_only skip.
 */
export class MatchEngine {
  private snapshot: MatchSnapshot | null = null;
  private cfg: MatchDefaults | null = null;
  private deck: DeckConfig | null = null;
  private demo: DemoSeedConfig | null = null;
  private rng: SeededRng | null = null;
  private hands: CardModel[][] = [];
  private lastPlayRanks: string[] = [];
  private discard: CardModel[] = [];
  private cardSeq: number = 0;
  private playSeq: number = 0;
  private claimSeq: number = 0;
  private challengeSeq: number = 0;
  private eventLog: MatchEvent[] = [];
  private seats: SeatModel[] = [];
  private phase: Phase = Phase.LOBBY;
  private turnWindow: TurnWindow = TurnWindow.NORMAL;
  private currentSeatId: number = 0;
  private currentClaim: ClaimModel | null = null;
  private lastPlay: PlayModel | null = null;
  private lastPenalizedSeatId: number = -1;
  private lastLoserSeatId: number = -1;
  private roundIndex: number = 0;
  private playIndexInRound: number = 0;
  private stallSkipCount: number = 0;
  private winnerSeatId: number = -1;
  private silentMode: boolean = false;
  private matchId: string = '';
  private seed: number = 0;
  private startedAt: number = 0;
  private endedAt: number = 0;
  private turnEndsAtMs: number = 0;
  private ritualEndsAtMs: number = 0;
  private beatEndsAtMs: number = 0;
  private penaltyEndsAtMs: number = 0;
  private nowMs: number = 0;
  private revealOpen: boolean = false;
  private judged: boolean = false;
  private challenge: ChallengeModel | null = null;
  private dealerKey: string = '';
  private dealerLine: string = '';
  private highlightLine: string = '';
  private demoOn: boolean = false;
  private forceClaimUsed: boolean = false;
  private forcePlayUsed: boolean = false;
  private challengeHappened: boolean = false;
  private slamUsed: number = 0;
  private hesitateUsed: number = 0;
  private lastClaimRank: string = '';
  private viewerSeatId: number = 0;
  private playCounts: number[] = [];
  private fakeHandCounts: number[] = [];
  private challengeCounts: number[] = [];
  private challengeHits: number[] = [];
  private tableMode: TableMode = TableMode.SOCIAL;
  private skipDepth: number = 0;

  current(): MatchSnapshot | null {
    if (this.snapshot === null && this.cfg === null) {
      return null;
    }
    return this.buildSnapshot();
  }

  phaseOf(): Phase {
    return this.phase;
  }

  /** TURN / PLAY_REVEAL_SELF on a HUMAN seat: director must wait; never timeout-auto. */
  humanMustWait(): boolean {
    return this.currentSeatIsHuman() &&
      (this.phase === Phase.TURN || this.phase === Phase.PLAY_REVEAL_SELF);
  }

  pulse(nowMs: number): boolean {
    this.nowMs = nowMs;
    if (this.cfg === null) {
      return false;
    }
    if (this.phase === Phase.TURN || this.phase === Phase.PLAY_REVEAL_SELF) {
      if (this.humanMustWait()) {
        return false;
      }
      if (this.turnEndsAtMs > 0 && nowMs >= this.turnEndsAtMs) {
        this.timeout();
        return true;
      }
    }
    if (this.phase === Phase.CHALLENGE_RITUAL) {
      if (this.ritualEndsAtMs > 0 && nowMs >= this.ritualEndsAtMs) {
        this.ritualDone(false);
        return true;
      }
      if (this.beatEndsAtMs > 0 && nowMs >= this.beatEndsAtMs) {
        this.advanceRitualBeat();
        return true;
      }
    }
    if (this.phase === Phase.PENALTY) {
      if (this.penaltyEndsAtMs > 0 && nowMs >= this.penaltyEndsAtMs) {
        this.penaltyDone();
        return true;
      }
    }
    return false;
  }

  startMatch(opts: StartMatchOpts): boolean {
    if (!ConfigRepository.isReady()) {
      Logger.warn(TAG, 'START_MATCH ignored: config not ready');
      return false;
    }
    const cfg: MatchDefaults = ConfigRepository.snapshotMatchDefaults();
    if (opts.playerCount < cfg.min_players || opts.playerCount > cfg.max_players) {
      Logger.warn(TAG, 'START_MATCH ignored: player count out of range');
      return false;
    }
    this.cfg = cfg;
    this.deck = JSON.parse(JSON.stringify(ConfigRepository.deck())) as DeckConfig;
    this.demo = JSON.parse(JSON.stringify(ConfigRepository.demo())) as DemoSeedConfig;
    this.demoOn = cfg.demo_seed_enabled;
    if (this.demoOn) {
      this.seed = cfg.demo_seed_value;
    } else {
      this.seed = Date.now();
    }
    this.rng = new SeededRng(this.seed);
    this.nowMs = Date.now();
    this.matchId = `m-${this.seed}`;
    this.silentMode = opts.silent;
    this.startedAt = Date.now();
    this.endedAt = 0;
    this.cardSeq = 0;
    this.playSeq = 0;
    this.claimSeq = 0;
    this.challengeSeq = 0;
    this.eventLog = [];
    this.lastPenalizedSeatId = -1;
    this.lastLoserSeatId = -1;
    this.roundIndex = 0;
    this.playIndexInRound = 0;
    this.stallSkipCount = 0;
    this.winnerSeatId = -1;
    this.currentClaim = null;
    this.lastPlay = null;
    this.lastPlayRanks = [];
    this.discard = [];
    this.challenge = null;
    this.revealOpen = false;
    this.judged = false;
    this.forceClaimUsed = false;
    this.forcePlayUsed = false;
    this.challengeHappened = false;
    this.slamUsed = 0;
    this.hesitateUsed = 0;
    this.lastClaimRank = '';
    this.highlightLine = '';
    this.viewerSeatId = 0;
    this.skipDepth = 0;
    this.buildSeats(opts);
    this.phase = Phase.DEAL;
    this.dealFresh(false);
    Logger.info(TAG, `T01 START_MATCH → DEAL matchId=${this.matchId} seed=${this.seed} n=${opts.playerCount}`);
    return true;
  }

  /**
   * T02: last flying card has landed. Logic hands already exist.
   * Must stay in DEAL until UI calls this — do not skip to CLAIM/TURN mid-show.
   */
  dealDone(): boolean {
    if (this.phase !== Phase.DEAL) {
      return false;
    }
    Logger.info(TAG, 'T02 DEAL_DONE → CLAIM');
    this.announceClaim();
    return true;
  }

  resetToLobby(): void {
    if (!ConfigRepository.isReady()) {
      Logger.warn(TAG, 'config not ready; stay uninitialized');
      return;
    }
    const cfg: MatchDefaults = ConfigRepository.snapshotMatchDefaults();
    this.cfg = cfg;
    this.demo = ConfigRepository.demo();
    let seed: number = 0;
    if (cfg.demo_seed_enabled) {
      seed = cfg.demo_seed_value;
    }
    this.seed = seed;
    this.phase = Phase.LOBBY;
    this.turnWindow = TurnWindow.NORMAL;
    this.seats = [];
    this.hands = [];
    this.currentSeatId = 0;
    this.roundIndex = 0;
    this.playIndexInRound = 0;
    this.stallSkipCount = 0;
    this.currentClaim = null;
    this.lastPlay = null;
    this.challenge = null;
    this.winnerSeatId = -1;
    this.dealerKey = 'lb_str_dlr_lobby_full';
    this.dealerLine = '本桌四人，酒已满。';
    this.snapshot = this.buildSnapshot();
    Logger.info(TAG, 'engine reset → LOBBY');
  }

  intentPlay(): boolean {
    if (this.phase !== Phase.TURN) {
      return false;
    }
    if (!this.hasCardsNow()) {
      return false;
    }
    if (this.currentIsGhost()) {
      return false;
    }
    this.phase = Phase.PLAY_REVEAL_SELF;
    this.dealerKey = 'lb_str_overlay_play';
    this.dealerLine = '确认出牌';
    return true;
  }

  cancelPlay(): boolean {
    if (this.phase !== Phase.PLAY_REVEAL_SELF) {
      return false;
    }
    this.phase = Phase.TURN;
    this.refreshTurnBanner();
    return true;
  }

  submitPlay(cardIds: string[], style: PlayStyle, speech: string, namedSeatId: number): boolean {
    if (this.phase !== Phase.PLAY_REVEAL_SELF && this.phase !== Phase.TURN) {
      return false;
    }
    if (this.cfg === null) {
      return false;
    }
    if (this.currentIsGhost()) {
      return false;
    }
    const hand: CardModel[] = this.handOf(this.currentSeatId);
    if (cardIds.length < this.cfg.min_play_cards || cardIds.length > this.cfg.max_play_cards) {
      return false;
    }
    if (cardIds.length > hand.length) {
      return false;
    }
    const picked: CardModel[] = [];
    for (let i = 0; i < cardIds.length; i++) {
      const card = this.takeFromHand(this.currentSeatId, cardIds[i]);
      if (card === null) {
        this.returnCards(this.currentSeatId, picked);
        return false;
      }
      picked.push(card);
    }
    let usedStyle: PlayStyle = style;
    if (usedStyle === PlayStyle.SLAM) {
      if (this.slamUsed >= this.cfg.max_slam_per_game) {
        usedStyle = PlayStyle.SOFT;
      } else {
        this.slamUsed++;
      }
    }
    if (usedStyle === PlayStyle.HESITATE) {
      if (this.hesitateUsed >= this.cfg.max_hesitate_per_game) {
        usedStyle = PlayStyle.SOFT;
      } else {
        this.hesitateUsed++;
      }
    }
    this.commitPicked(picked, usedStyle, speech, namedSeatId, false);
    return true;
  }

  intentChallenge(): boolean {
    if (this.phase !== Phase.TURN) {
      return false;
    }
    if (!this.canChallengeNow()) {
      return false;
    }
    if (this.currentIsGhost()) {
      return false;
    }
    if (this.lastPlay === null || this.cfg === null) {
      return false;
    }
    this.challengeSeq++;
    this.challenge = {
      challengeId: `ch-${this.challengeSeq}`,
      challengerSeatId: this.currentSeatId,
      targetPlayId: this.lastPlay.playId,
      ritualSkipped: false,
      ritualBeat: ChallengeBeatIds.WINDUP,
      result: '',
      fakeCount: 0,
      judgedAt: 0,
      bets: []
    };
    this.challengeHappened = true;
    this.challengeCounts[this.currentSeatId] = this.challengeCounts[this.currentSeatId] + 1;
    this.stallSkipCount = 0;
    this.phase = Phase.CHALLENGE_RITUAL;
    this.revealOpen = false;
    this.judged = false;
    this.ritualEndsAtMs = this.nowMs + this.cfg.challenge_ritual_max_seconds * 1000;
    this.beatEndsAtMs = this.nowMs + this.beatDurationMs(ChallengeBeatIds.WINDUP);
    this.pushEvent(EventKind.CHALLENGE, this.currentSeatId, this.lastPlay.playId);
    this.dealerKey = 'lb_str_dlr_windup';
    this.dealerLine = lineForKey(this.dealerKey, this.buildSnapshot());
    Logger.info(TAG, `T11 challenge target=${this.lastPlay.playId}`);
    return true;
  }

  skip(): boolean {
    if (this.phase !== Phase.TURN) {
      return false;
    }
    if (this.turnWindow !== TurnWindow.CHALLENGE_ONLY && this.hasCardsNow()) {
      return false;
    }
    this.applySkip();
    return true;
  }

  /**
   * AI: CHALLENGE_ONLY → skip; NORMAL + timeout_auto_play → autoPlayOne.
   * HUMAN: never auto-play / auto-skip. Clock is paused in armTurnClock; wait for tap.
   */
  timeout(): boolean {
    if (this.cfg === null) {
      return false;
    }
    if (this.currentSeatIsHuman()) {
      return false;
    }
    if (this.phase === Phase.TURN && this.turnWindow === TurnWindow.CHALLENGE_ONLY) {
      this.dealerKey = 'lb_str_dlr_chal_only_skip';
      this.dealerLine = lineForKey(this.dealerKey, this.buildSnapshot());
      this.applySkip();
      return true;
    }
    if ((this.phase === Phase.TURN || this.phase === Phase.PLAY_REVEAL_SELF) && this.hasCardsNow()) {
      if (!this.cfg.timeout_auto_play) {
        return false;
      }
      const seat: SeatModel | null = seatById(this.seats, this.currentSeatId);
      if (seat !== null) {
        seat.consecutiveTimeouts = seat.consecutiveTimeouts + 1;
      }
      this.autoPlayOne();
      return true;
    }
    if (this.phase === Phase.TURN && !this.hasCardsNow()) {
      this.applySkip();
      return true;
    }
    return false;
  }

  skipRitual(): boolean {
    if (this.phase !== Phase.CHALLENGE_RITUAL) {
      return false;
    }
    return this.ritualDone(true);
  }

  ritualDone(skipped: boolean): boolean {
    if (this.phase !== Phase.CHALLENGE_RITUAL && this.phase !== Phase.JUDGE) {
      return false;
    }
    if (this.challenge !== null) {
      this.challenge.ritualSkipped = skipped;
      this.challenge.ritualBeat = ChallengeBeatIds.RESULT;
    }
    if (!this.judged) {
      this.applyJudged();
    }
    this.phase = Phase.PENALTY;
    if (this.cfg !== null) {
      this.penaltyEndsAtMs = this.nowMs + this.cfg.challenge_bet_seconds * 1000;
    }
    this.refreshPenaltyBanner();
    return true;
  }

  placeBet(seatId: number, pick: BetPick): boolean {
    if (this.phase !== Phase.CHALLENGE_RITUAL || this.challenge === null || this.cfg === null) {
      return false;
    }
    if (!this.cfg.face_bet_enabled) {
      return false;
    }
    if (this.challenge.ritualBeat !== ChallengeBeatIds.STANDOFF) {
      return false;
    }
    for (let i = 0; i < this.challenge.bets.length; i++) {
      if (this.challenge.bets[i].seatId === seatId) {
        this.challenge.bets[i].pick = pick;
        return true;
      }
    }
    this.challenge.bets.push({ seatId: seatId, pick: pick });
    this.pushEvent(EventKind.TABLE_ACT, seatId, `BET_${pick}`);
    return true;
  }

  tableAct(seatId: number, act: string): boolean {
    this.pushEvent(EventKind.TABLE_ACT, seatId, act);
    return true;
  }

  emote(seatId: number, emoteId: string): boolean {
    this.pushEvent(EventKind.EMOTE, seatId, emoteId);
    return true;
  }

  /**
   * 14b R-LIFE-5 debug −1. Same life drop as penalty, no rule rewrite:
   * lives_default stays 3, max_play frozen, challenge not unfrozen, no recap.
   */
  debugDecLife(seatId: number): boolean {
    if (this.cfg === null || this.seats.length === 0) {
      return false;
    }
    const seat = seatById(this.seats, seatId);
    if (seat === null || seat.lives <= 0) {
      return false;
    }
    seat.lives = seat.lives - 1;
    seat.lastDelta = -1;
    seat.lastReason = LifeReason.NONE;
    this.pushEvent(EventKind.LIFE_CHANGE, seatId, 'DEBUG_DEC');
    if (seat.lives === 0) {
      seat.status = SeatStatus.GHOST;
      this.hands[seatId] = [];
      this.pushEvent(EventKind.OUT, seatId, 'GHOST');
    }
    Logger.info(TAG, `debugDecLife seat=${seatId} lives=${seat.lives}`);
    return true;
  }

  penaltyDone(): boolean {
    if (this.phase !== Phase.PENALTY) {
      return false;
    }
    this.lastPenalizedSeatId = this.lastLoserSeatId;
    this.lastPlay = null;
    this.lastPlayRanks = [];
    this.playIndexInRound = 0;
    this.stallSkipCount = 0;
    this.revealOpen = false;
    this.judged = false;
    const live: number = aliveCount(this.seats);
    if (live <= 1) {
      this.toRecap();
      return true;
    }
    this.challenge = null;
    this.announceClaim();
    return true;
  }

  playAgain(): boolean {
    this.resetToLobby();
    return true;
  }

  leave(): boolean {
    this.phase = Phase.END;
    this.endedAt = Date.now();
    return true;
  }

  toLobby(): boolean {
    this.resetToLobby();
    return true;
  }

  handForAi(seatId: number): CardModel[] {
    const seat = seatById(this.seats, seatId);
    if (seat === null || seat.role !== SeatRole.AI) {
      return [];
    }
    return this.copyCards(this.handOf(seatId));
  }

  forceEventAt(at: string): DemoForceEvent | null {
    if (!this.demoOn || this.demo === null) {
      return null;
    }
    const list: DemoForceEvent[] = this.demo.force_events;
    if (list === null || list.length === 0) {
      return null;
    }
    for (let i = 0; i < list.length; i++) {
      if (list[i].at === at) {
        return list[i];
      }
    }
    return null;
  }

  shouldForceSharkPlay(): boolean {
    if (this.forcePlayUsed || this.challengeHappened || this.currentSeatIsHuman()) {
      return false;
    }
    const ev: DemoForceEvent | null = this.forceEventAt('PLAY');
    if (ev === null) {
      return false;
    }
    return this.currentSeatId === ev.seat_id && (this.playIndexInRound + 1) === ev.play_index_in_round;
  }

  shouldForceKarenChallenge(): boolean {
    if (this.challengeHappened || this.currentSeatIsHuman()) {
      return false;
    }
    const ev: DemoForceEvent | null = this.forceEventAt('CHALLENGE');
    if (ev === null) {
      return false;
    }
    return this.currentSeatId === ev.seat_id && this.playIndexInRound >= ev.after_play_index &&
      this.canChallengeNow();
  }

  demoForcePlay(): boolean {
    if (this.currentSeatIsHuman()) {
      return false;
    }
    const ev: DemoForceEvent | null = this.forceEventAt('PLAY');
    if (ev === null || this.cfg === null || this.currentClaim === null) {
      return false;
    }
    const ids: string[] = this.pickForcedCards(ev.count, ev.has_fake);
    if (ids.length < this.cfg.min_play_cards) {
      return false;
    }
    let style: PlayStyle = PlayStyle.SLAM;
    if (ev.style === 'SOFT') {
      style = PlayStyle.SOFT;
    } else if (ev.style === 'HESITATE') {
      style = PlayStyle.HESITATE;
    }
    if (this.phase === Phase.TURN) {
      this.intentPlay();
    }
    const ok: boolean = this.submitPlay(ids, style, '', ev.named_seat_id);
    if (ok) {
      this.forcePlayUsed = true;
    }
    return ok;
  }

  private buildSeats(opts: StartMatchOpts): void {
    if (this.cfg === null) {
      return;
    }
    this.seats = [];
    this.hands = [];
    this.playCounts = [];
    this.fakeHandCounts = [];
    this.challengeCounts = [];
    this.challengeHits = [];
    let nick: string = opts.nickname;
    if (nick.length === 0) {
      nick = '你';
    }
    for (let i = 0; i < opts.playerCount; i++) {
      let role: SeatRole = SeatRole.AI;
      let persona: string = '';
      let name: string = '';
      if (i === 0) {
        role = SeatRole.HUMAN;
        name = nick;
      } else {
        const p: PersonaId = DEFAULT_SEAT_PERSONAS[(i - 1) % DEFAULT_SEAT_PERSONAS.length];
        persona = p;
        name = this.displayName(p);
      }
      this.seats.push({
        seatId: i,
        role: role,
        aiPersona: persona,
        nickname: name,
        status: SeatStatus.ALIVE,
        isHost: i === 0,
        faceScore: 0,
        lives: this.cfg.lives_default,
        lastDelta: 0,
        lastReason: LifeReason.NONE,
        handCount: 0,
        consecutiveTimeouts: 0
      });
      this.hands.push([]);
      this.playCounts.push(0);
      this.fakeHandCounts.push(0);
      this.challengeCounts.push(0);
      this.challengeHits.push(0);
    }
  }

  private displayName(id: PersonaId): string {
    if (id === PersonaId.SHARK) {
      return '老千';
    }
    if (id === PersonaId.KAREN) {
      return '杠精';
    }
    return '怂货';
  }

  private dealFresh(keepDealerLine: boolean): void {
    if (this.cfg === null || this.deck === null || this.rng === null) {
      return;
    }
    const counts: RankCounts | null = deckCountsFor(this.deck, this.seats.length);
    if (counts === null) {
      Logger.warn(TAG, 'deal aborted: no n3..n6 bag for player count');
      return;
    }
    const aliveIds: number[] = [];
    for (let i = 0; i < this.seats.length; i++) {
      if (this.seats[i].status === SeatStatus.ALIVE) {
        aliveIds.push(this.seats[i].seatId);
      } else {
        this.hands[i] = [];
      }
    }
    const dealt: DealResult = dealRound(counts, aliveIds, this.cfg.hand_size_default, this.rng, this.cardSeq);
    this.cardSeq = dealt.nextCardSeq;
    this.discard = dealt.discard;
    for (let i = 0; i < aliveIds.length; i++) {
      this.hands[aliveIds[i]] = dealt.hands[i];
    }
    this.roundIndex = this.roundIndex + 1;
    this.playIndexInRound = 0;
    this.stallSkipCount = 0;
    this.lastPlay = null;
    this.lastPlayRanks = [];
    this.currentClaim = null;
    this.phase = Phase.DEAL;
    if (!keepDealerLine) {
      this.dealerKey = 'lb_str_dlr_deal';
      this.dealerLine = `发牌。每人 ${this.cfg.hand_size_default} 张。`;
    }
  }

  private announceClaim(): void {
    if (this.cfg === null || this.deck === null || this.rng === null) {
      return;
    }
    const rank: string = this.pickClaimRank();
    const first: number = this.pickFirstActor();
    if (this.demoOn && !this.forceClaimUsed) {
      this.repairOpeningHands(rank);
      this.forceClaimUsed = true;
    }
    this.claimSeq++;
    this.currentClaim = {
      claimId: `cl-${this.claimSeq}`,
      rank: rank,
      firstActorSeatId: first,
      announcedAt: Date.now()
    };
    this.lastClaimRank = rank;
    this.currentSeatId = first;
    this.playIndexInRound = 0;
    this.lastPlay = null;
    this.lastPlayRanks = [];
    this.stallSkipCount = 0;
    this.phase = Phase.TURN;
    this.dealerKey = 'lb_str_dlr_claim';
    this.dealerLine = lineForKey(this.dealerKey, this.buildSnapshot());
    this.enterTurn();
  }

  private repairOpeningHands(rank: string): void {
    let shark: number = -1;
    for (let i = 0; i < this.seats.length; i++) {
      if (this.seats[i].aiPersona === PersonaId.SHARK) {
        shark = this.seats[i].seatId;
      }
    }
    repairDemoHands(this.hands, this.discard, rank, this.viewerSeatId, shark);
  }

  private pickClaimRank(): string {
    if (this.deck === null || this.rng === null || this.cfg === null) {
      return 'A';
    }
    const ev = this.forceEventAt('CLAIM');
    if (ev !== null && !this.forceClaimUsed && ev.rank.length > 0) {
      return ev.rank;
    }
    const claimable: string[] = this.deck.claimable;
    const pool: string[] = [];
    for (let i = 0; i < claimable.length; i++) {
      if (this.cfg.avoid_same_claim_streak >= 1 && claimable[i] === this.lastClaimRank) {
        continue;
      }
      pool.push(claimable[i]);
    }
    const use: string[] = pool.length > 0 ? pool : claimable;
    if (use.length === 0) {
      return 'A';
    }
    return use[this.rng.nextInt(use.length)];
  }

  private pickFirstActor(): number {
    if (this.lastPenalizedSeatId >= 0) {
      return nextAlive(this.seats, this.lastPenalizedSeatId);
    }
    const ev = this.forceEventAt('CLAIM');
    if (ev !== null && !this.forceClaimUsed && ev.first_actor_seat_id >= 0) {
      return ev.first_actor_seat_id;
    }
    if (this.cfg !== null && this.cfg.first_actor_policy === FirstActorPolicy.HOST_LEFT) {
      return nextAlive(this.seats, this.viewerSeatId);
    }
    return this.randomAlive();
  }

  private randomAlive(): number {
    if (this.rng === null) {
      return 0;
    }
    const ids: number[] = [];
    for (let i = 0; i < this.seats.length; i++) {
      if (this.seats[i].status === SeatStatus.ALIVE) {
        ids.push(this.seats[i].seatId);
      }
    }
    if (ids.length === 0) {
      return 0;
    }
    return ids[this.rng.nextInt(ids.length)];
  }

  private enterTurn(): void {
    if (this.cfg === null) {
      return;
    }
    this.phase = Phase.TURN;
    this.skipDepth = this.skipDepth + 1;
    if (this.skipDepth > this.seats.length + 1) {
      this.skipDepth = 0;
      this.redealStall();
      return;
    }
    if (!this.hasCardsNow() && this.canChallengeNow()) {
      this.turnWindow = TurnWindow.CHALLENGE_ONLY;
      this.armTurnClock(this.cfg.challenge_only_seconds);
      this.refreshTurnBanner();
      this.skipDepth = 0;
      return;
    }
    if (!this.hasCardsNow() && !this.canChallengeNow()) {
      this.turnWindow = TurnWindow.AUTO_SKIP;
      this.applySkip();
      return;
    }
    this.turnWindow = TurnWindow.NORMAL;
    this.armTurnClock(this.cfg.turn_seconds);
    this.refreshTurnBanner();
    this.skipDepth = 0;
  }

  /** AI: `seconds` countdown then timeout(). HUMAN: pause (turnEndsAtMs=0), wait for tap. */
  private armTurnClock(seconds: number): void {
    if (this.currentSeatIsHuman()) {
      this.turnEndsAtMs = 0;
      return;
    }
    this.turnEndsAtMs = this.nowMs + seconds * 1000;
  }

  private applySkip(): void {
    const nameSeat: number = this.currentSeatId;
    this.pushEvent(EventKind.SKIP_EMPTY, nameSeat, 'skip');
    this.stallSkipCount = this.stallSkipCount + 1;
    if (this.stallSkipCount >= aliveCount(this.seats)) {
      this.redealStall();
      return;
    }
    this.currentSeatId = nextAlive(this.seats, this.currentSeatId);
    this.enterTurn();
  }

  private redealStall(): void {
    this.pushEvent(EventKind.REDEAL_STALL, this.currentSeatId, 'stall');
    this.dealerKey = 'lb_str_dlr_redeal';
    this.dealerLine = lineForKey(this.dealerKey, this.buildSnapshot());
    this.phase = Phase.DEAL;
    this.dealFresh(true);
    Logger.info(TAG, 'T17 REDEAL_STALL → DEAL (rebuild show, no L1)');
  }

  private commitPicked(
    picked: CardModel[],
    style: PlayStyle,
    speech: string,
    namedSeatId: number,
    auto: boolean
  ): void {
    this.playSeq++;
    const ranks: string[] = [];
    let fake: number = 0;
    const claimRank: string = this.currentClaim === null ? '' : this.currentClaim.rank;
    for (let i = 0; i < picked.length; i++) {
      ranks.push(picked[i].rank);
      if (isFakeRank(picked[i].rank, claimRank)) {
        fake++;
      }
    }
    const actor: number = this.currentSeatId;
    this.lastPlay = {
      playId: `p-${this.playSeq}`,
      actorSeatId: actor,
      count: picked.length,
      style: style,
      speech: speech,
      namedSeatId: namedSeatId,
      isFirstOfRound: this.playIndexInRound === 0,
      committedAt: Date.now()
    };
    this.lastPlayRanks = ranks;
    this.playIndexInRound = this.playIndexInRound + 1;
    this.stallSkipCount = 0;
    this.playCounts[actor] = this.playCounts[actor] + 1;
    if (fake > 0) {
      this.fakeHandCounts[actor] = this.fakeHandCounts[actor] + 1;
    }
    let namedBit: string = '0';
    if (namedSeatId >= 0) {
      namedBit = '1';
    }
    this.pushEvent(EventKind.PLAY, actor, `${picked.length}|${style}|${namedBit}`);
    if (auto) {
      this.dealerKey = 'lb_str_dlr_auto_play';
    } else if (namedSeatId >= 0) {
      this.dealerKey = 'lb_str_dlr_play_named';
    } else {
      this.dealerKey = 'lb_str_dlr_play';
    }
    this.dealerLine = lineForKey(this.dealerKey, this.buildSnapshot());
    this.currentSeatId = nextAlive(this.seats, actor);
    this.phase = Phase.TURN;
    this.enterTurn();
  }

  private autoPlayOne(): void {
    if (this.cfg === null || this.currentClaim === null) {
      return;
    }
    if (this.currentSeatIsHuman()) {
      return;
    }
    const hand: CardModel[] = this.handOf(this.currentSeatId);
    if (hand.length === 0) {
      this.applySkip();
      return;
    }
    let pick: CardModel = hand[0];
    if (this.cfg.auto_play_prefer_legal) {
      for (let i = 0; i < hand.length; i++) {
        if (isLegal(hand[i].rank, this.currentClaim.rank)) {
          pick = hand[i];
          break;
        }
      }
    } else if (this.rng !== null) {
      pick = hand[this.rng.nextInt(hand.length)];
    }
    const card = this.takeFromHand(this.currentSeatId, pick.cardId);
    if (card === null) {
      return;
    }
    this.phase = Phase.PLAY_REVEAL_SELF;
    this.commitPicked([card], PlayStyle.SOFT, '', -1, true);
  }

  private pickForcedCards(count: number, hasFake: boolean): string[] {
    if (this.currentClaim === null || this.cfg === null) {
      return [];
    }
    const hand: CardModel[] = this.handOf(this.currentSeatId);
    const fakes: CardModel[] = [];
    const others: CardModel[] = [];
    for (let i = 0; i < hand.length; i++) {
      if (isFakeRank(hand[i].rank, this.currentClaim.rank)) {
        fakes.push(hand[i]);
      } else {
        others.push(hand[i]);
      }
    }
    const out: string[] = [];
    const need: number = count;
    if (hasFake && fakes.length > 0) {
      out.push(fakes[0].cardId);
    }
    for (let i = 0; i < others.length && out.length < need; i++) {
      out.push(others[i].cardId);
    }
    for (let i = 1; i < fakes.length && out.length < need; i++) {
      out.push(fakes[i].cardId);
    }
    return out;
  }

  private advanceRitualBeat(): void {
    if (this.challenge === null || this.cfg === null) {
      return;
    }
    const cur: string = this.challenge.ritualBeat;
    if (cur === ChallengeBeatIds.WINDUP) {
      this.challenge.ritualBeat = ChallengeBeatIds.STANDOFF;
      this.beatEndsAtMs = this.nowMs + this.beatDurationMs(ChallengeBeatIds.STANDOFF);
      this.dealerKey = 'lb_str_dlr_standoff';
      this.dealerLine = lineForKey(this.dealerKey, this.buildSnapshot());
      return;
    }
    if (cur === ChallengeBeatIds.STANDOFF) {
      this.challenge.ritualBeat = ChallengeBeatIds.REVEAL;
      this.revealOpen = true;
      this.beatEndsAtMs = this.nowMs + this.beatDurationMs(ChallengeBeatIds.REVEAL);
      this.dealerKey = 'lb_str_dlr_reveal';
      this.dealerLine = lineForKey(this.dealerKey, this.buildSnapshot());
      return;
    }
    if (cur === ChallengeBeatIds.REVEAL) {
      this.challenge.ritualBeat = ChallengeBeatIds.RESULT;
      if (!this.judged) {
        this.applyJudged();
      }
      this.beatEndsAtMs = this.nowMs + this.beatDurationMs(ChallengeBeatIds.RESULT);
      return;
    }
    this.ritualDone(false);
  }

  private beatDurationMs(beat: string): number {
    if (this.cfg === null) {
      return 0;
    }
    const ritualMs: number = this.cfg.challenge_ritual_max_seconds * 1000;
    const betMs: number = this.cfg.challenge_bet_seconds * 1000;
    let body: number = ritualMs - betMs;
    if (body < 0) {
      body = 0;
    }
    const half: number = body / 2;
    if (beat === ChallengeBeatIds.WINDUP) {
      return half;
    }
    if (beat === ChallengeBeatIds.STANDOFF) {
      return betMs;
    }
    if (beat === ChallengeBeatIds.REVEAL) {
      return half;
    }
    return this.cfg.ai_think_ms_min;
  }

  private applyJudged(): void {
    if (this.challenge === null || this.currentClaim === null || this.lastPlay === null || this.cfg === null) {
      return;
    }
    if (this.challenge.targetPlayId !== this.lastPlay.playId) {
      Logger.warn(TAG, 'judge ignored: target is not lastPlay');
      return;
    }
    const success: boolean = isChallengeSuccess(this.lastPlayRanks, this.currentClaim.rank);
    let fake: number = 0;
    for (let i = 0; i < this.lastPlayRanks.length; i++) {
      if (isFakeRank(this.lastPlayRanks[i], this.currentClaim.rank)) {
        fake++;
      }
    }
    this.challenge.fakeCount = fake;
    this.challenge.judgedAt = Date.now();
    this.revealOpen = true;
    this.judged = true;
    let loser: number = this.challenge.challengerSeatId;
    let reason: LifeReason = LifeReason.CHALLENGE_FAIL_ON_SELF;
    if (success) {
      this.challenge.result = ChallengeResult.SUCCESS;
      loser = this.lastPlay.actorSeatId;
      reason = LifeReason.CHALLENGE_SUCCESS_ON_TARGET;
      this.challengeHits[this.challenge.challengerSeatId] =
        this.challengeHits[this.challenge.challengerSeatId] + 1;
      this.dealerKey = 'lb_str_dlr_judge_success';
    } else {
      this.challenge.result = ChallengeResult.FAIL;
      this.dealerKey = 'lb_str_dlr_judge_fail';
    }
    this.lastLoserSeatId = loser;
    this.applyLifeLoss(loser, reason);
    this.settleBets(success);
    this.pushEvent(EventKind.JUDGE, loser, `${this.challenge.result}|${fake}`);
    this.dealerLine = lineForKey(this.dealerKey, this.buildSnapshot());
    this.phase = Phase.JUDGE;
    this.phase = Phase.CHALLENGE_RITUAL;
  }

  private applyLifeLoss(seatId: number, reason: LifeReason): void {
    const seat = seatById(this.seats, seatId);
    if (seat === null) {
      return;
    }
    if (seat.lives > 0) {
      seat.lives = seat.lives - 1;
    }
    seat.lastDelta = -1;
    seat.lastReason = reason;
    this.pushEvent(EventKind.LIFE_CHANGE, seatId, reason);
    if (seat.lives === 0) {
      seat.status = SeatStatus.GHOST;
      this.hands[seatId] = [];
      this.pushEvent(EventKind.OUT, seatId, 'GHOST');
    }
  }

  private settleBets(success: boolean): void {
    if (this.challenge === null || this.cfg === null) {
      return;
    }
    for (let i = 0; i < this.challenge.bets.length; i++) {
      const bet: FaceBet = this.challenge.bets[i];
      const seat = seatById(this.seats, bet.seatId);
      if (seat === null) {
        continue;
      }
      const pickedFake: boolean = bet.pick === BetPick.FAKE;
      if (pickedFake === success) {
        seat.faceScore = seat.faceScore + this.cfg.face_bet_correct;
      } else {
        seat.faceScore = seat.faceScore + this.cfg.face_bet_wrong;
      }
    }
  }

  private refreshPenaltyBanner(): void {
    const seat = seatById(this.seats, this.lastLoserSeatId);
    if (seat === null) {
      return;
    }
    if (seat.status === SeatStatus.GHOST) {
      this.dealerKey = 'lb_str_dlr_penalty_out';
    } else {
      this.dealerKey = 'lb_str_dlr_penalty_life';
    }
    this.dealerLine = lineForKey(this.dealerKey, this.buildSnapshot());
  }

  private toRecap(): void {
    this.phase = Phase.RECAP;
    this.endedAt = Date.now();
    for (let i = 0; i < this.seats.length; i++) {
      if (this.seats[i].status === SeatStatus.ALIVE) {
        this.winnerSeatId = this.seats[i].seatId;
      }
    }
    this.dealerKey = 'lb_str_dlr_recap';
    this.highlightLine = this.buildHighlight();
    this.dealerLine = lineForKey(this.dealerKey, this.buildSnapshot());
  }

  private buildHighlight(): string {
    let slamThenSuccess: boolean = false;
    let fail: boolean = false;
    let lastPlayStyle: string = '';
    for (let i = 0; i < this.eventLog.length; i++) {
      const ev = this.eventLog[i];
      if (ev.kind === EventKind.PLAY) {
        lastPlayStyle = ev.detail;
      }
      if (ev.kind === EventKind.JUDGE && ev.detail.indexOf(ChallengeResult.SUCCESS) >= 0) {
        if (lastPlayStyle.indexOf('SLAM') >= 0) {
          slamThenSuccess = true;
        }
      }
      if (ev.kind === EventKind.JUDGE && ev.detail.indexOf(ChallengeResult.FAIL) >= 0) {
        fail = true;
      }
    }
    if (slamThenSuccess) {
      return lineForKey('lb_str_dlr_hl_slam_caught', this.buildSnapshot());
    }
    if (fail) {
      return lineForKey('lb_str_dlr_hl_fail', this.buildSnapshot());
    }
    return lineForKey('lb_str_dlr_hl_fallback', this.buildSnapshot());
  }

  private refreshTurnBanner(): void {
    this.dealerKey = pickTurnDealerKey(this.buildSnapshot());
    this.dealerLine = lineForKey(this.dealerKey, this.buildSnapshot());
  }

  private hasCardsNow(): boolean {
    return this.handOf(this.currentSeatId).length > 0;
  }

  private canChallengeNow(): boolean {
    const seat = seatById(this.seats, this.currentSeatId);
    if (seat === null || seat.status !== SeatStatus.ALIVE) {
      return false;
    }
    if (this.lastPlay === null) {
      return false;
    }
    return this.playIndexInRound >= 1;
  }

  private currentIsGhost(): boolean {
    const seat: SeatModel | null = seatById(this.seats, this.currentSeatId);
    return seat === null || seat.status === SeatStatus.GHOST;
  }

  private currentSeatIsHuman(): boolean {
    const seat: SeatModel | null = seatById(this.seats, this.currentSeatId);
    return seat !== null && seat.role === SeatRole.HUMAN;
  }

  private handOf(seatId: number): CardModel[] {
    if (seatId < 0 || seatId >= this.hands.length) {
      return [];
    }
    return this.hands[seatId];
  }

  private takeFromHand(seatId: number, cardId: string): CardModel | null {
    const hand: CardModel[] = this.handOf(seatId);
    for (let i = 0; i < hand.length; i++) {
      if (hand[i].cardId === cardId) {
        const card: CardModel = hand[i];
        const next: CardModel[] = [];
        for (let j = 0; j < hand.length; j++) {
          if (j !== i) {
            next.push(hand[j]);
          }
        }
        this.hands[seatId] = next;
        return card;
      }
    }
    return null;
  }

  private returnCards(seatId: number, cards: CardModel[]): void {
    for (let i = 0; i < cards.length; i++) {
      this.hands[seatId].push(cards[i]);
    }
  }

  private copyCards(src: CardModel[]): CardModel[] {
    const out: CardModel[] = [];
    for (let i = 0; i < src.length; i++) {
      out.push({ cardId: src[i].cardId, rank: src[i].rank });
    }
    return out;
  }

  private pushEvent(kind: EventKind, seatId: number, detail: string): void {
    this.eventLog.push({
      kind: kind,
      seatId: seatId,
      detail: detail,
      at: Date.now()
    });
  }

  private buildRecap(): RecapRow[] {
    const rows: RecapRow[] = [];
    for (let i = 0; i < this.seats.length; i++) {
      rows.push({
        seatId: this.seats[i].seatId,
        nickname: this.seats[i].nickname,
        playCount: this.playCounts[i],
        fakeHandCount: this.fakeHandCounts[i],
        challengeCount: this.challengeCounts[i],
        challengeHits: this.challengeHits[i]
      });
    }
    return rows;
  }

  private buildSnapshot(): MatchSnapshot {
    const cfg: MatchDefaults = this.cfg === null ? ConfigRepository.snapshotMatchDefaults() : this.cfg;
    const pubSeats: SeatModel[] = [];
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      pubSeats.push({
        seatId: s.seatId,
        role: s.role,
        aiPersona: s.aiPersona,
        nickname: s.nickname,
        status: s.status,
        isHost: s.isHost,
        faceScore: s.faceScore,
        lives: s.lives,
        lastDelta: s.lastDelta,
        lastReason: s.lastReason,
        handCount: this.phase === Phase.DEAL ? 0 : this.handOf(s.seatId).length,
        consecutiveTimeouts: s.consecutiveTimeouts
      });
    }
    let remain: number = 0;
    if (this.phase === Phase.TURN || this.phase === Phase.PLAY_REVEAL_SELF) {
      remain = this.turnEndsAtMs - this.nowMs;
    } else if (this.phase === Phase.CHALLENGE_RITUAL) {
      remain = this.ritualEndsAtMs - this.nowMs;
    }
    if (remain < 0) {
      remain = 0;
    }
    const showRanks: boolean = this.revealOpen || this.phase === Phase.JUDGE || this.phase === Phase.PENALTY ||
      this.phase === Phase.RECAP;
    let ritualBeat: string = '';
    if (this.challenge !== null) {
      ritualBeat = this.challenge.ritualBeat;
    }
    const snap: MatchSnapshot = {
      matchId: this.matchId,
      seed: this.seed,
      config: cfg,
      phase: this.phase,
      turnWindow: this.turnWindow,
      tableMode: this.tableMode,
      silentMode: this.silentMode,
      currentSeatId: this.currentSeatId,
      currentClaim: this.currentClaim,
      lastPlay: this.lastPlay,
      lastPenalizedSeatId: this.lastPenalizedSeatId,
      roundIndex: this.roundIndex,
      playIndexInRound: this.playIndexInRound,
      stallSkipCount: this.stallSkipCount,
      winnerSeatId: this.winnerSeatId,
      canChallenge: this.canChallengeNow(),
      hasCards: this.hasCardsNow(),
      turnRemainMs: remain,
      ritualBeat: ritualBeat,
      revealOpen: this.revealOpen,
      dealerKey: this.dealerKey,
      dealerLine: this.dealerLine,
      highlightLine: this.highlightLine,
      selfHand: this.phase === Phase.DEAL ? [] : this.copyCards(this.handOf(this.viewerSeatId)),
      lastPlayRanks: showRanks ? this.copyRanks(this.lastPlayRanks) : [],
      seats: pubSeats,
      challenge: this.challenge,
      eventLog: this.eventLog,
      recap: this.buildRecap(),
      startedAt: this.startedAt,
      endedAt: this.endedAt
    };
    this.snapshot = snap;
    return snap;
  }

  private copyRanks(src: string[]): string[] {
    const out: string[] = [];
    for (let i = 0; i < src.length; i++) {
      out.push(src[i]);
    }
    return out;
  }
}
