import { ControlIds } from '../../../common/Ids';
import { PlayFlyFx } from '../PlayFlyFx';

/**
 * lb_cmp_reveal_stage — 18 ack-after reveal. Pool center down REVEAL_DOWN_VP.
 * x/y = stage top-left (fan bounding box before revealScale).
 * Blur/dim live on Table overlay behind this — never on cards.
 */
@Component
export struct RevealStage {
  @Prop visible: boolean = false;
  @Prop ranks: string[] = [];
  @Prop faceUp: boolean = false;
  @Prop x: number = 0;
  @Prop y: number = 0;
  /** Not `scale` — shadows CustomComponent.scale (CompileArkTS). */
  @Prop revealScale: number = PlayFlyFx.REVEAL_SCALE;

  build() {
    if (this.visible && this.cardCount() > 0) {
      Stack({ alignContent: Alignment.Center }) {
        ForEach(this.indexes(), (idx: number) => {
          this.cardAt(idx)
        }, (idx: number) => `reveal_${idx}_${this.faceUp ? 'up' : 'dn'}`)
      }
      .id(ControlIds.REVEAL_STAGE)
      .width(PlayFlyFx.pileWidth(this.cardCount()))
      .height(PlayFlyFx.pileHeight())
      .position({ x: this.x, y: this.y })
      .scale({ x: this.revealScale, y: this.revealScale })
      .hitTestBehavior(HitTestMode.None)
    }
  }

  @Builder
  cardAt(idx: number) {
    if (this.faceUp) {
      this.faceImage(this.rankAt(idx), idx)
    } else {
      Image($r('app.media.art_card_back'))
        .width(PlayFlyFx.CARD_W)
        .height(PlayFlyFx.CARD_H)
        .objectFit(ImageFit.Cover)
        .offset({ x: PlayFlyFx.fanOffset(this.cardCount(), idx), y: 0 })
        .rotate({ angle: PlayFlyFx.fanAngle(this.cardCount(), idx) })
    }
  }

  @Builder
  faceImage(rank: string, idx: number) {
    if (rank === 'A') {
      Image($r('app.media.art_card_a'))
        .width(PlayFlyFx.CARD_W)
        .height(PlayFlyFx.CARD_H)
        .objectFit(ImageFit.Cover)
        .offset({ x: PlayFlyFx.fanOffset(this.cardCount(), idx), y: 0 })
        .rotate({ angle: PlayFlyFx.fanAngle(this.cardCount(), idx) })
    } else if (rank === 'K') {
      Image($r('app.media.art_card_k'))
        .width(PlayFlyFx.CARD_W)
        .height(PlayFlyFx.CARD_H)
        .objectFit(ImageFit.Cover)
        .offset({ x: PlayFlyFx.fanOffset(this.cardCount(), idx), y: 0 })
        .rotate({ angle: PlayFlyFx.fanAngle(this.cardCount(), idx) })
    } else if (rank === 'Q') {
      Image($r('app.media.art_card_q'))
        .width(PlayFlyFx.CARD_W)
        .height(PlayFlyFx.CARD_H)
        .objectFit(ImageFit.Cover)
        .offset({ x: PlayFlyFx.fanOffset(this.cardCount(), idx), y: 0 })
        .rotate({ angle: PlayFlyFx.fanAngle(this.cardCount(), idx) })
    } else {
      Image($r('app.media.art_card_joker'))
        .width(PlayFlyFx.CARD_W)
        .height(PlayFlyFx.CARD_H)
        .objectFit(ImageFit.Cover)
        .offset({ x: PlayFlyFx.fanOffset(this.cardCount(), idx), y: 0 })
        .rotate({ angle: PlayFlyFx.fanAngle(this.cardCount(), idx) })
    }
  }

  /** R1′: empty ranks → 0 cards (never fake n=1 / claim face). */
  private cardCount(): number {
    const n: number = this.ranks.length;
    if (n < 1) {
      return 0;
    }
    return PlayFlyFx.clampCount(n);
  }

  private rankAt(idx: number): string {
    if (idx >= 0 && idx < this.ranks.length) {
      return this.ranks[idx];
    }
    return '';
  }

  private indexes(): number[] {
    const n: number = this.cardCount();
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      out.push(i);
    }
    return out;
  }
}
