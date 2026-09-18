import { Node, Button } from 'cc';
import { findDeep } from '../Nodes';

export class ChallengeView {
  readonly root: Node | null;
  private btnDoubt: Node | null = null;
  private btnBelieve: Node | null = null;
  private onDoubtCb: (() => void) | null = null;
  private onBelieveCb: (() => void) | null = null;

  constructor(root: Node | null) {
    this.root = root;
    if (root) {
      this.btnDoubt = findDeep(root, 'lb_btn_challenge_doubt');
      this.btnBelieve = findDeep(root, 'lb_btn_challenge_believe');

      if (this.btnDoubt) {
        this.btnDoubt.on(Button.EventType.CLICK, () => {
          if (this.onDoubtCb) this.onDoubtCb();
        });
      }
      if (this.btnBelieve) {
        this.btnBelieve.on(Button.EventType.CLICK, () => {
          if (this.onBelieveCb) this.onBelieveCb();
        });
      }
    }
    this.hide();
  }

  onDoubt(cb: () => void): void {
    this.onDoubtCb = cb;
  }

  onBelieve(cb: () => void): void {
    this.onBelieveCb = cb;
  }

  show(): void {
    if (this.root) {
      this.root.active = true;
    }
  }

  hide(): void {
    if (this.root) {
      this.root.active = false;
    }
  }
}
