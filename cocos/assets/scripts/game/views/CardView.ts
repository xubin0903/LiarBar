import { Node, Sprite, SpriteFrame } from 'cc';
import { ensureUi } from '../Nodes';
import { CARD_H, CARD_W } from '../Layout';

export class CardView {
  readonly node: Node;
  private sprite: Sprite;

  constructor(node: Node) {
    this.node = node;
    ensureUi(node, CARD_W, CARD_H);
    let sp = node.getComponent(Sprite);
    if (!sp) {
      sp = node.addComponent(Sprite);
    }
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    this.sprite = sp;
  }

  setFrame(sf: SpriteFrame | null): void {
    if (sf) {
      this.sprite.spriteFrame = sf;
    }
  }

  setVisible(on: boolean): void {
    this.node.active = on;
  }
}
