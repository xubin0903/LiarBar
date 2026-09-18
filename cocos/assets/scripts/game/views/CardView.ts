import { Node, Sprite, SpriteFrame, tween, Vec3, Button } from 'cc';
import { ensureUi } from '../Nodes';
import { CARD_H, CARD_W } from '../Layout';

const CARD_RAISE_Y = 24;

export class CardView {
  readonly node: Node;
  private sprite: Sprite;
  private _cardId: string = '';
  private _rank: string = '';
  private _isFaceUp: boolean = false;
  private _isSelected: boolean = false;
  private initialY: number = 0;
  private onCardTapped: ((card: CardView) => void) | null = null;

  constructor(node: Node) {
    this.node = node;
    ensureUi(node, CARD_W, CARD_H);
    let sp = node.getComponent(Sprite);
    if (!sp) {
      sp = node.addComponent(Sprite);
    }
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    this.sprite = sp;
    this.initialY = node.position.y;

    this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
  }

  get cardId(): string {
    return this._cardId;
  }

  get rank(): string {
    return this._rank;
  }

  get isSelected(): boolean {
    return this._isSelected;
  }

  setCardData(cardId: string, rank: string): void {
    this._cardId = cardId;
    this._rank = rank;
  }

  setFrame(sf: SpriteFrame | null): void {
    if (sf) {
      this.sprite.spriteFrame = sf;
    }
  }

  setVisible(on: boolean): void {
    this.node.active = on;
    if (!on) {
      this.setSelected(false);
    }
  }

  setSelected(selected: boolean): void {
    if (this._isSelected === selected) return;
    this._isSelected = selected;
    const targetY = selected ? this.initialY + CARD_RAISE_Y : this.initialY;
    tween(this.node)
      .to(0.12, { position: new Vec3(this.node.position.x, targetY, this.node.position.z) })
      .start();
  }

  toggleSelect(): boolean {
    this.setSelected(!this._isSelected);
    return this._isSelected;
  }

  flipTo(faceUp: boolean, frontSf: SpriteFrame | null, backSf: SpriteFrame | null): void {
    this._isFaceUp = faceUp;
    tween(this.node)
      .to(0.1, { scale: new Vec3(0.05, 1, 1) })
      .call(() => {
        this.setFrame(faceUp ? frontSf : backSf);
      })
      .to(0.1, { scale: new Vec3(1, 1, 1) })
      .start();
  }

  onTap(callback: (card: CardView) => void): void {
    this.onCardTapped = callback;
  }

  private onTouchEnd(): void {
    if (!this.node.active) return;
    if (this.onCardTapped) {
      this.onCardTapped(this);
    } else {
      this.toggleSelect();
    }
  }
}
