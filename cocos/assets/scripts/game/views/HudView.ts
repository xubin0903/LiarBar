import { Label } from 'cc';
import { TableStage } from '../Layout';
import { labelOf } from '../Nodes';

export class HudView {
  private claim: Label | null;
  private tip: Label | null;
  private judge: Label | null;
  private timer: Label | null;
  private poolCount: Label | null;

  constructor(stage: TableStage) {
    this.claim = labelOf(stage.claim);
    this.tip = labelOf(stage.tip);
    this.judge = labelOf(stage.judge);
    this.timer = labelOf(stage.timer);
    this.poolCount = labelOf(stage.poolCount);
  }

  setClaim(rank: string): void {
    if (this.claim) {
      this.claim.string = rank ? `本局宣称：${rank}` : '';
    }
  }

  setTip(text: string): void {
    if (this.tip) {
      this.tip.string = text;
    }
  }

  setJudge(text: string): void {
    if (this.judge) {
      this.judge.string = text;
    }
  }

  setTimer(text: string): void {
    if (this.timer) {
      this.timer.string = text;
    }
  }

  setPoolCount(_n: number): void {
    if (this.poolCount) {
      this.poolCount.string = '';
      this.poolCount.node.active = false;
    }
  }
}
