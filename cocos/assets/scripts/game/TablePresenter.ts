/**
 * 事件 → UI。不改判定。宣称/法官/timer 分区：左上三句，中顶只 timer。
 */
import { SpriteFrame } from 'cc';
import { MatchEngine } from '../engine/MatchEngine';
import { MatchEngineEvent } from '../engine/MatchEvents';
import { PlayStyle } from '../engine/Phase';
import { TableStage } from './Layout';
import { ChallengeView } from './views/ChallengeView';
import { HandView } from './views/HandView';
import { HudView } from './views/HudView';
import { LifeView } from './views/LifeView';
import { PoolView } from './views/PoolView';
import { SeatView } from './views/SeatView';

const SEAT_NAMES = ['你', '怂货', '老千', '杠精'];

export class TablePresenter {
  private cursor = 0;
  private hud: HudView;
  private hand: HandView;
  private seats: SeatView[];
  private lives: LifeView[];
  private challenge: ChallengeView;
  private pool: PoolView | null;
  private back: SpriteFrame | null;
  private rankFrames: { [rank: string]: SpriteFrame } = {};
  private remain: number[] = [0, 0, 0, 0];
  private burn: SpriteFrame[] = [];

  constructor(
    private engine: MatchEngine,
    stage: TableStage,
    hand: HandView,
    seats: SeatView[],
    back: SpriteFrame | null,
    pool: PoolView | null
  ) {
    this.hud = new HudView(stage);
    this.hand = hand;
    this.seats = seats;
    this.challenge = new ChallengeView(stage.challenge);
    this.back = back;
    this.pool = pool;
    this.lives = [
      new LifeView(stage.lives[0] || stage.lifeSelf),
      new LifeView(stage.lives[1]),
      new LifeView(stage.lives[2]),
      new LifeView(stage.lives[3])
    ];

    this.bindChallengeActions();
  }

  setRankFrames(map: { [rank: string]: SpriteFrame }): void {
    this.rankFrames = map;
  }

  setBurnFrames(frames: SpriteFrame[]): void {
    this.burn = frames;
    for (let i = 0; i < this.lives.length; i++) {
      this.lives[i].setBurnFrames(frames);
    }
  }

  private bindChallengeActions(): void {
    this.challenge.onDoubt(() => {
      this.engine.intentChallenge();
      this.engine.commitChallenge(0);
      this.challenge.hide();
      this.pump();
    });

    this.challenge.onBelieve(() => {
      this.engine.believe();
      this.challenge.hide();
      this.pump();
    });
  }

  resetCopy(): void {
    this.hud.setClaim('');
    this.hud.setTip('准备开局');
    this.hud.setJudge('');
    this.hud.setTimer('--');
    this.hud.setPoolCount(0);
    if (this.pool) {
      this.pool.setEmpty();
    }
    this.challenge.hide();
    this.remain = [0, 0, 0, 0];
    for (let i = 0; i < this.seats.length; i++) {
      const seat = this.seats[i];
      seat.setName(SEAT_NAMES[seat.seat] || '');
      seat.clearFan();
    }
    for (let j = 0; j < this.lives.length; j++) {
      this.lives[j].setLives(3);
    }
  }

  playSelectedCards(): boolean {
    const ids = this.hand.getSelectedCardIds();
    if (ids.length === 0 || ids.length > 3) return false;
    const snap = this.engine.current();
    if (!snap || snap.currentSeatId !== 0) return false;

    this.engine.intentPlay();
    const ok = this.engine.submitPlay(ids, PlayStyle.SOFT, '', -1);
    if (ok) {
      this.hand.clearSelection();
      this.pump();
    }
    return ok;
  }

  pump(): void {
    const evs: MatchEngineEvent[] = this.engine.drainEvents(this.cursor);
    for (let i = 0; i < evs.length; i++) {
      this.cursor = evs[i].seq;
      this.onEvent(evs[i]);
    }
  }

  private onEvent(ev: MatchEngineEvent): void {
    if (ev.name === 'MatchStarted') {
      this.hud.setJudge('');
      this.hud.setTip('荷官发牌');
      this.hud.setTimer('--');
      return;
    }
    if (ev.name === 'Dealt') {
      const seat = Number(ev.payload['seat']);
      const count = Number(ev.payload['count']);
      this.remain[seat] = count;
      if (seat === 0) {
        const snap = this.engine.current();
        if (snap && snap.selfHand && snap.selfHand.length > 0) {
          this.hand.showPlayerHand(snap.selfHand, this.rankFrames, this.back);
        } else {
          this.hand.showBacks(count, this.back);
        }
      } else {
        const view = this.seat(seat);
        if (view) {
          view.showDealFan(count);
        }
      }
      return;
    }
    if (ev.name === 'ClaimSet') {
      const rank = String(ev.payload['rank'] ?? '');
      this.hud.setClaim(rank);
      this.hud.setTip('手牌已发');
      this.hud.setTimer('--');
      return;
    }
    if (ev.name === 'TurnBegan') {
      const seat = Number(ev.payload['seat']);
      const who = SEAT_NAMES[seat] || 座\;
      this.hud.setTip(seat === 0 ? '轮到你出牌' : 轮到\);
      return;
    }
    if (ev.name === 'PlayLanded') {
      const seat = Number(ev.payload['seat']);
      const count = Number(ev.payload['count']);
      this.hud.setPoolCount(0);
      if (this.pool) {
        this.pool.setHand(count);
      }
      this.remain[seat] = Math.max(0, (this.remain[seat] || 0) - count);
      if (seat === 0) {
        const snap = this.engine.current();
        if (snap && snap.selfHand) {
          this.hand.showPlayerHand(snap.selfHand, this.rankFrames, this.back);
        } else {
          this.hand.showBacks(this.remain[0], this.back);
        }
      } else {
        const view = this.seat(seat);
        if (view) {
          view.setCount(this.remain[seat]);
        }
      }
      return;
    }
    if (ev.name === 'ChallengeWindowOpened') {
      this.challenge.show();
      const count = Number(ev.payload['count']);
      if (count > 0 && this.pool) {
        this.pool.setHand(count);
      }
      return;
    }
    if (ev.name === 'Believed' || ev.name === 'ChallengeCommitted') {
      this.challenge.hide();
    }
    if (ev.name === 'Judged') {
      const succ = Boolean(ev.payload['success']);
      this.hud.setJudge(succ ? '质疑成功！' : '质疑失败！');
    }
    if (ev.name === 'CandleOut') {
      const seat = Number(ev.payload['seat']);
      const livesLeft = Number(ev.payload['livesLeft']);
      if (this.lives[seat]) {
        this.lives[seat].setLives(livesLeft);
      }
    }
    if (ev.name === 'MatchEnded') {
      const winner = Number(ev.payload['winnerSeat']);
      const who = SEAT_NAMES[winner] || 座\;
      this.hud.setTip(对局结束，胜者：\);
    }
  }

  tickLives(): void {
    for (let i = 0; i < this.lives.length; i++) {
      this.lives[i].tickFlame();
    }
  }

  private seat(id: number): SeatView | null {
    for (let i = 0; i < this.seats.length; i++) {
      if (this.seats[i].seat === id) {
        return this.seats[i];
      }
    }
    return null;
  }
}
