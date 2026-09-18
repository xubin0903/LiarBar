import { Label, Node, Prefab, Sprite, SpriteFrame, UITransform, instantiate } from 'cc';
import { HAND_SLOTS } from '../Layout';
import { findDeep, labelOf } from '../Nodes';

const MINI_W = 40;
const MINI_H = 56;

export class SeatView {
  readonly node: Node;
  readonly seat: number;
  private pile: Node | null = null;
  private cards: Node[] = [];
  private nameLab: Label | null = null;
  private cardPrefab: Prefab | null;
  private back: SpriteFrame | null;

  constructor(node: Node, seat: number, cardPrefab: Prefab | null, back: SpriteFrame | null) {
    this.node = node;
    this.seat = seat;
    this.cardPrefab = cardPrefab;
    this.back = back;
    this.nameLab = labelOf(findDeep(node, this.nameId()));
    this.stripRuntimeJunk();
    if (this.seat !== 0) {
      this.ensureFan();
    }
  }

  setName(text: string): void {
    if (this.nameLab) {
      this.nameLab.string = text;
    }
  }

  showDealFan(count: number): void {
    this.setCount(count);
  }

  setCount(count: number): void {
    if (this.seat === 0) {
      return;
    }
    this.ensureFan();
    const n = Math.min(Math.max(count, 0), HAND_SLOTS);
    for (let i = 0; i < this.cards.length; i++) {
      this.cards[i].active = i < n;
    }
  }

  clearFan(): void {
    this.setCount(0);
  }

  private nameId(): string {
    if (this.seat === 0) {
      return 'lb_cmp_seat_self_name';
    }
    return `lb_cmp_seat_p${this.seat}_name`;
  }

  private ensureFan(): void {
    this.pile = this.node.getChildByName('_rt_seat_fan');
    if (!this.pile) {
      this.pile = new Node('_rt_seat_fan');
      this.node.addChild(this.pile);
      this.pile.layer = this.node.layer;
      this.pile.setPosition(0, 0, 0);
    }
    if (this.cards.length === HAND_SLOTS) {
      return;
    }
    this.pile.removeAllChildren();
    this.cards = [];
    for (let i = 0; i < HAND_SLOTS; i++) {
      const card = this.makeCard(i);
      this.pile.addChild(card);
      this.layoutMini(card, i);
      card.active = false;
      this.cards.push(card);
    }
  }

  private makeCard(i: number): Node {
    let card: Node;
    if (this.cardPrefab) {
      card = instantiate(this.cardPrefab);
      card.name = `fan_${i}`;
    } else {
      card = new Node(`fan_${i}`);
      const sp = card.addComponent(Sprite);
      sp.sizeMode = Sprite.SizeMode.CUSTOM;
      if (this.back) {
        sp.spriteFrame = this.back;
      }
    }
    card.layer = this.node.layer;
    const ui = card.getComponent(UITransform) || card.addComponent(UITransform);
    ui.setContentSize(MINI_W, MINI_H);
    ui.setAnchorPoint(0.5, 0.5);
    const sp = card.getComponent(Sprite);
    if (sp) {
      sp.sizeMode = Sprite.SizeMode.CUSTOM;
      if (this.back) {
        sp.spriteFrame = this.back;
      }
    }
    return card;
  }

  /** 三座都用老千那种横扇：名字下方一排，不挡名牌。 */
  private layoutMini(card: Node, i: number): void {
    const mid = (HAND_SLOTS - 1) / 2;
    card.setPosition((i - mid) * 18, -82, 0);
  }

  private stripRuntimeJunk(): void {
    const leftover = this.node.getChildByName('avatar');
    if (leftover) {
      leftover.active = false;
    }
    const rootSp = this.node.getComponent(Sprite);
    if (rootSp && this.node.name.indexOf('_avatar') < 0) {
      rootSp.enabled = false;
      rootSp.spriteFrame = null;
    }
    const junk = ['lb_seat_deal_pile', '_rt_seat_fan'];
    for (let i = 0; i < junk.length; i++) {
      const old = this.node.getChildByName(junk[i]);
      if (old) {
        old.removeFromParent();
        old.destroy();
      }
    }
    this.pile = null;
    this.cards = [];
    const kids = this.node.children.slice();
    for (let j = 0; j < kids.length; j++) {
      const name = kids[j].name;
      if (name.indexOf('deal_') === 0 || name.indexOf('fan_') === 0) {
        kids[j].removeFromParent();
        kids[j].destroy();
      }
    }
  }
}
