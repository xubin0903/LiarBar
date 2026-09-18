import { Node, tween, Vec3, UIOpacity } from 'cc';
import { TableAudio } from './TableAudio';

export class LifeFx {
  static readonly EXTINGUISH_TOTAL_MS = 280;

  static playExtinguish(flameNode: Node, onComplete?: () => void): void {
    TableAudio.playExtinguish();

    let op = flameNode.getComponent(UIOpacity);
    if (!op) {
      op = flameNode.addComponent(UIOpacity);
    }

    tween(flameNode)
      .to(0.1, { scale: new Vec3(1.3, 1.3, 1) })
      .to(LifeFx.EXTINGUISH_TOTAL_MS / 1000 - 0.1, { scale: new Vec3(0.1, 0.1, 1) })
      .call(() => {
        flameNode.active = false;
        if (onComplete) onComplete();
      })
      .start();

    tween(op)
      .to(LifeFx.EXTINGUISH_TOTAL_MS / 1000, { opacity: 0 })
      .start();
  }
}
