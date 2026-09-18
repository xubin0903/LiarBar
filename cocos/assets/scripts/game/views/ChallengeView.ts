import { Node } from 'cc';

export class ChallengeView {
  readonly root: Node | null;

  constructor(root: Node | null) {
    this.root = root;
    this.hide();
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
