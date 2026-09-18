import { Node, Sprite, SpriteFrame, UITransform, Vec3, tween } from 'cc';
import { TableAudio } from './TableAudio';

export class DealFx {
  static readonly DEAL_CARD_MS_DEFAULT = 220;
  static readonly DEAL_STAGGER_MS_DEFAULT = 55;
  static readonly DEAL_OPENING_MS = 5445;

  static playDealCard(
    stageNode: Node,
    startPos: Vec3,
    endPos: Vec3,
    backSf: SpriteFrame | null,
    onLanded?: () => void
  ): void {
    const flyer = new Node('flyer_deal_card');
    const ui = flyer.addComponent(UITransform);
    ui.setContentSize(56, 78);
    const sp = flyer.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    if (backSf) sp.spriteFrame = backSf;

    flyer.setPosition(startPos);
    flyer.setScale(new Vec3(0.72, 0.72, 1));
    stageNode.addChild(flyer);

    TableAudio.playDeal();

    tween(flyer)
      .to(DealFx.DEAL_CARD_MS_DEFAULT / 1000, {
        position: endPos,
        scale: new Vec3(1, 1, 1)
      }, { easing: 'sineOut' })
      .call(() => {
        if (onLanded) onLanded();
        flyer.destroy();
      })
      .start();
  }
}
