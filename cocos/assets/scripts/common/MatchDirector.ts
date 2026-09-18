import { AiFriend, AiDecision } from '../ai/AiFriend';
import { PersonaRow } from '../config/AiPersonasConfig';
import { MatchEngine } from '../engine/MatchEngine';
import { CardModel, MatchSnapshot } from '../engine/MatchTypes';
import { Phase, SeatRole, TurnWindow } from '../engine/Phase';
import { SeededRng } from '../engine/SeededRng';
import { Logger } from './Logger';

const TAG = 'MatchDirector';

/**
 * Dealer clock + AI turns. Pulses the pure engine.
 * HUMAN TURN / PLAY_REVEAL_SELF: does not arm think, does not runAi, does not autoPlay.
 * AI seats keep think-delay then decide / demo_seed force events.
 */
export class MatchDirector {
  private timerId: any = null;
  playBusy: boolean = false;
  private thinkUntilMs: number = 0;
  private armedSeat: number = -1;
  private armedRound: number = -1;
  private armedPlays: number = -1;
  readonly ai: AiFriend = new AiFriend();
  private engine: MatchEngine | null = null;
  private onSnapshotChanged: ((snap: MatchSnapshot) => void) | null = null;

  bind(engine: MatchEngine, onSnapshot?: (snap: MatchSnapshot) => void): void {
    this.engine = engine;
    if (onSnapshot) {
      this.onSnapshotChanged = onSnapshot;
    }
  }

  start(): void {
    if (this.engine === null) {
      return;
    }
    this.stopTimerOnly();
    this.engine.pulse(Date.now());
    if (this.engine.humanMustWait()) {
      this.thinkUntilMs = 0;
    } else {
      this.armIfNeeded();
    }
    this.timerId = setInterval(() => {
      this.tick();
    }, 200);
    Logger.info(TAG, 'director started');
  }

  stop(): void {
    this.stopTimerOnly();
    this.thinkUntilMs = 0;
    this.armedSeat = -1;
    this.playBusy = false;
  }

  tick(): void {
    if (this.engine === null) {
      return;
    }
    this.engine.pulse(Date.now());
    const snap: MatchSnapshot | null = this.engine.current();
    if (snap === null) {
      return;
    }
    if (this.onSnapshotChanged) {
      this.onSnapshotChanged(snap);
    }
    if (snap.phase === Phase.RECAP || snap.phase === Phase.END || snap.phase === Phase.LOBBY) {
      return;
    }
    if (this.playBusy) {
      return;
    }
    if (this.engine.humanMustWait()) {
      this.thinkUntilMs = 0;
      return;
    }
    this.armIfNeeded();
    if (this.thinkUntilMs > 0 && Date.now() >= this.thinkUntilMs) {
      this.thinkUntilMs = 0;
      this.runAi();
    }
  }

  private stopTimerOnly(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private armIfNeeded(): void {
    if (this.engine === null) {
      return;
    }
    const snap: MatchSnapshot | null = this.engine.current();
    if (snap === null || snap.phase !== Phase.TURN) {
      return;
    }
    if (
      this.armedSeat === snap.currentSeatId &&
      this.armedRound === snap.roundIndex &&
      this.armedPlays === snap.playIndexInRound
    ) {
      return;
    }
    this.armedSeat = snap.currentSeatId;
    this.armedRound = snap.roundIndex;
    this.armedPlays = snap.playIndexInRound;
    if (!this.isAiSeat(snap, snap.currentSeatId)) {
      this.thinkUntilMs = 0;
      return;
    }
    const rng: SeededRng = this.turnRng(snap);
    let persona: string = '';
    for (let i = 0; i < snap.seats.length; i++) {
      if (snap.seats[i].seatId === snap.currentSeatId) {
        persona = snap.seats[i].aiPersona;
      }
    }
    this.thinkUntilMs = Date.now() + this.ai.thinkDelayMs(persona, rng);
  }

  private runAi(): void {
    if (this.engine === null) {
      return;
    }
    const engine: MatchEngine = this.engine;
    const snap: MatchSnapshot | null = engine.current();
    if (snap === null || snap.phase !== Phase.TURN) {
      return;
    }
    if (!this.isAiSeat(snap, snap.currentSeatId)) {
      return;
    }
    if (engine.shouldForceKarenChallenge()) {
      engine.intentChallenge();
      return;
    }
    if (engine.shouldForceSharkPlay()) {
      engine.demoForcePlay();
      return;
    }
    const hand: CardModel[] = engine.handForAi(snap.currentSeatId);
    const rng: SeededRng = this.turnRng(snap);
    const d: AiDecision = this.ai.decide(snap, hand, rng);
    if (d.kind === 'CHALLENGE') {
      engine.intentChallenge();
    } else if (d.kind === 'PLAY') {
      engine.intentPlay();
      engine.submitPlay(d.cardIds, d.style, d.speech, d.namedSeatId);
    } else {
      if (snap.turnWindow === TurnWindow.CHALLENGE_ONLY || !snap.hasCards) {
        engine.skip();
      } else {
        engine.intentPlay();
        engine.submitPlay(d.cardIds, d.style, d.speech, d.namedSeatId);
      }
    }
  }

  private turnRng(snap: MatchSnapshot): SeededRng {
    const salt: number = snap.seed + snap.roundIndex * 1000 + snap.playIndexInRound * 17;
    return new SeededRng(salt);
  }

  private isAiSeat(snap: MatchSnapshot, seatId: number): boolean {
    for (let i = 0; i < snap.seats.length; i++) {
      if (snap.seats[i].seatId === seatId) {
        return snap.seats[i].role === SeatRole.AI;
      }
    }
    return false;
  }
}
