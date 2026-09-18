import { Node, Sprite, SpriteFrame } from 'cc';
import { findDeep } from '../Nodes';

const PIPS = 3;

export class LifeView {
  readonly node: Node | null;
  private frame = 0;
  private burn: SpriteFrame[] = [];

  constructor(node: Node | null) {
    this.node = node;
  }

  setBurnFrames(frames: SpriteFrame[]): void {
    this.burn = frames;
    this.frame = 0;
    this.applyFlame();
  }

  setLives(n: number): void {
    if (!this.node) {
      return;
    }
    const show = Math.min(Math.max(n, 0), PIPS);
    for (let i = 0; i < PIPS; i++) {
      const pip =
        findDeep(this.node, `lb_cmp_life_pip_${i}`) ||
        this.node.getChildByName(`candle_${i}`);
      if (pip) {
        pip.active = i < show;
      }
    }
  }

  /** 正常燃烧序列帧。残血/熄灭后接。 */
  tickFlame(): void {
    if (this.burn.length === 0) {
      return;
    }
    this.frame = (this.frame + 1) % this.burn.length;
    this.applyFlame();
  }

  private applyFlame(): void {
    if (!this.node || this.burn.length === 0) {
      return;
    }
    const sf = this.burn[this.frame];
    for (let i = 0; i < PIPS; i++) {
      const flame =
        findDeep(this.node, `lb_cmp_life_flame_${i}`) ||
        findDeep(this.node, `flame_${i}`);
      const sp = flame ? flame.getComponent(Sprite) : null;
      if (sp && sf) {
        sp.spriteFrame = sf;
      }
    }
  }
}
