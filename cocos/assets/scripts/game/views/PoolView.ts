/**
 * 荷官旁放牌槽。空槽是容器，牌只在本手落入后出现。
 * empty  只有槽，不摆牌
 * hand   1～3 张牌背在槽里齐叠（2px），0°
 */
import { Color, Graphics, Node, Prefab, Sprite, SpriteFrame, UITransform, instantiate } from 'cc';
import { CARD_H, CARD_W } from '../Layout';

const HAND_MAX = 3;
const STEP = 2;
const WELL_W = 96;
const WELL_H = 108;
const GOLD = new Color(212, 184, 110, 220);
const GOLD_DIM = new Color(168, 138, 78, 90);
const WELL = new Color(48, 16, 20, 55);

export class PoolView {
  readonly node: Node;
  private stack: Node;
  private cards: Node[] = [];
  private back: SpriteFrame | null;
  private kind: 'empty' | 'hand' = 'empty';
  private count = 0;

  constructor(node: Node, cardPrefab: Prefab | null, back: SpriteFrame | null) {
    this.node = node;
    this.back = back;
    const slot = node.getComponent(Sprite);
    if (slot) {
      slot.enabled = false;
      slot.spriteFrame = null;
    }
    this.ensureWell();
    this.stack = node.getChildByName('_rt_pool_stack') || new Node('_rt_pool_stack');
    this.stack.layer = node.layer;
    this.stack.setPosition(0, 0, 0);
    if (!this.stack.parent) {
      node.addChild(this.stack);
    }
    this.stack.removeAllChildren();
    this.cards = [];
    for (let i = 0; i < HAND_MAX; i++) {
      const card = this.makeCard(cardPrefab, i);
      card.active = false;
      this.stack.addChild(card);
      this.cards.push(card);
    }
    this.setEmpty();
  }

  setEmpty(): void {
    this.kind = 'empty';
    this.count = 0;
    for (let i = 0; i < this.cards.length; i++) {
      this.cards[i].active = false;
    }
  }

  setHand(n: number): void {
    const count = Math.min(Math.max(n, 0), HAND_MAX);
    if (count <= 0) {
      this.setEmpty();
      return;
    }
    this.kind = 'hand';
    this.count = count;
    const mid = (count - 1) * 0.5;
    for (let i = 0; i < HAND_MAX; i++) {
      const card = this.cards[i];
      card.active = i < count;
      if (!card.active) {
        continue;
      }
      card.setPosition((i - mid) * STEP, (i - mid) * STEP, 0);
      card.angle = 0;
      this.sizeCard(card, CARD_W, CARD_H);
    }
  }

  current(): { kind: string; count: number } {
    return { kind: this.kind, count: this.count };
  }

  private ensureWell(): void {
    let well = this.node.getChildByName('_rt_pool_well');
    if (!well) {
      well = new Node('_rt_pool_well');
      this.node.addChild(well);
    }
    well.layer = this.node.layer;
    well.setPosition(0, 0, 0);
    const ui = well.getComponent(UITransform) || well.addComponent(UITransform);
    ui.setContentSize(WELL_W, WELL_H);
    ui.setAnchorPoint(0.5, 0.5);
    const g = well.getComponent(Graphics) || well.addComponent(Graphics);
    g.clear();
    const x = -WELL_W / 2;
    const y = -WELL_H / 2;
    g.fillColor = WELL;
    g.roundRect(x, y, WELL_W, WELL_H, 10);
    g.fill();
    g.strokeColor = GOLD;
    g.lineWidth = 1.8;
    g.roundRect(x, y, WELL_W, WELL_H, 10);
    g.stroke();
    g.strokeColor = GOLD_DIM;
    g.lineWidth = 1.2;
    g.roundRect(x + 5, y + 5, WELL_W - 10, WELL_H - 10, 7);
    g.stroke();
  }

  private makeCard(prefab: Prefab | null, i: number): Node {
    let card: Node;
    if (prefab) {
      card = instantiate(prefab);
      card.name = `pool_card_${i}`;
    } else {
      card = new Node(`pool_card_${i}`);
    }
    card.layer = this.node.layer;
    const sp = card.getComponent(Sprite) || card.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    if (this.back) {
      sp.spriteFrame = this.back;
    }
    this.sizeCard(card, CARD_W, CARD_H);
    return card;
  }

  private sizeCard(card: Node, w: number, h: number): void {
    const ui = card.getComponent(UITransform) || card.addComponent(UITransform);
    ui.setContentSize(w, h);
    ui.setAnchorPoint(0.5, 0.5);
  }
}
