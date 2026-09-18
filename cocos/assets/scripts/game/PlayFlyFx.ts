import { Node, Sprite, SpriteFrame, UITransform, Vec3, tween, Quat } from 'cc';
import { PlayStyle } from '../engine/Phase';
import { TableAudio } from './TableAudio';

export class PlayFlyFx {
  static readonly FLY_MS = 320;
  static readonly DRAW_TO_FLIP_MS = 1000;
  static readonly REVEAL_HOLD_MS = 3000;

  static playCardFly(
    stageNode: Node,
    startPos: Vec3,
    endPos: Vec3,
    count: number,
    backSf: SpriteFrame | null,
    style: PlayStyle,
    onLanded?: () => void
  ): void {
    TableAudio.playLaunch();
    const angles = count === 1 ? [0] : count === 2 ? [-8, 8] : [-12, 0, 12];
    let landedCount = 0;

    for (let i = 0; i < count; i++) {
      const flyer = new Node(lyer_play_\);
      const ui = flyer.addComponent(UITransform);
      ui.setContentSize(56, 78);
      const sp = flyer.addComponent(Sprite);
      sp.sizeMode = Sprite.SizeMode.CUSTOM;
      if (backSf) sp.spriteFrame = backSf;

      const offsetStart = new Vec3(startPos.x + (i - (count - 1) / 2) * 20, startPos.y, 0);
      const offsetEnd = new Vec3(endPos.x + (i - (count - 1) / 2) * 16, endPos.y, 0);

      flyer.setPosition(offsetStart);
      flyer.setRotationFromEuler(0, 0, angles[i] || 0);
      stageNode.addChild(flyer);

      tween(flyer)
        .to(PlayFlyFx.FLY_MS / 1000, {
          position: offsetEnd
        }, { easing: 'quadOut' })
        .call(() => {
          landedCount++;
          if (landedCount === count) {
            TableAudio.playLand();
            TableAudio.playStyle(style);
            if (onLanded) onLanded();
          }
          flyer.destroy();
        })
        .start();
    }
  }
}
