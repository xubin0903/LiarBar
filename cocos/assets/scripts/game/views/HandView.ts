import { SpriteFrame } from 'cc';
import { CardView } from './CardView';
import { HAND_SLOTS } from '../Layout';

export class HandView {
  readonly cards: CardView[];
  private onSelectChange: ((count: number) => void) | null = null;

  constructor(cards: CardView[]) {
    this.cards = cards;
    for (let i = 0; i < cards.length; i++) {
      cards[i].onTap((card) => this.onCardTapped(card));
    }
  }

  showBacks(count: number, back: SpriteFrame | null): void {
    for (let i = 0; i < HAND_SLOTS; i++) {
      const card = this.cards[i];
      if (!card) continue;
      card.setVisible(i < count);
      card.setFrame(back);
    }
  }

  showPlayerHand(
    handData: { cardId: string; rank: string }[],
    rankFrames: { [rank: string]: SpriteFrame },
    backSf: SpriteFrame | null
  ): void {
    for (let i = 0; i < HAND_SLOTS; i++) {
      const card = this.cards[i];
      if (!card) continue;
      if (i < handData.length) {
        card.setVisible(true);
        card.setCardData(handData[i].cardId, handData[i].rank);
        const front = rankFrames[handData[i].rank] || backSf;
        card.flipTo(true, front, backSf);
      } else {
        card.setVisible(false);
      }
    }
  }

  getSelectedCardIds(): string[] {
    const ids: string[] = [];
    for (let i = 0; i < this.cards.length; i++) {
      if (this.cards[i].node.active && this.cards[i].isSelected) {
        ids.push(this.cards[i].cardId);
      }
    }
    return ids;
  }

  clearSelection(): void {
    for (let i = 0; i < this.cards.length; i++) {
      this.cards[i].setSelected(false);
    }
    if (this.onSelectChange) {
      this.onSelectChange(0);
    }
  }

  onSelectionChanged(callback: (count: number) => void): void {
    this.onSelectChange = callback;
  }

  private onCardTapped(card: CardView): void {
    const current = this.getSelectedCardIds();
    if (!card.isSelected && current.length >= 3) {
      // Max 3 cards in Liar's Bar
      return;
    }
    card.toggleSelect();
    if (this.onSelectChange) {
      this.onSelectChange(this.getSelectedCardIds().length);
    }
  }
}
