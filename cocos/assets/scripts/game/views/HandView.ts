import { SpriteFrame } from 'cc';
import { CardView } from './CardView';
import { HAND_SLOTS } from '../Layout';

export class HandView {
  readonly cards: CardView[];

  constructor(cards: CardView[]) {
    this.cards = cards;
  }

  showBacks(count: number, back: SpriteFrame | null): void {
    for (let i = 0; i < HAND_SLOTS; i++) {
      const card = this.cards[i];
      if (!card) {
        continue;
      }
      card.setVisible(i < count);
      card.setFrame(back);
    }
  }
}
