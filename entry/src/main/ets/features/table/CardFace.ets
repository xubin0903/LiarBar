import { CardFaceIds } from '../../common/Ids';

/**
 * Reusable baked card face (docs/04-设计/09 §4).
 * Identity lives in art_card_* PNG (盾徽 bake ≥22%). Do not overlay rank Text.
 */
@Component
export struct CardFace {
  @Prop rank: string = '';
  @Prop faceUp: boolean = false;
  @Prop selected: boolean = false;
  @Prop instanceId: string = '';
  @Prop compact: boolean = false;

  build() {
    Stack() {
      Image($r('app.media.art_card_back'))
        .width(this.layerW())
        .height(this.layerH())
        .objectFit(ImageFit.Cover)
        .id(CardFaceIds.BACK)
        .opacity(this.faceUp ? 0 : 1)

      if (this.faceUp) {
        this.frontLayer()
      }
    }
    .id(this.hostId())
    .width(this.layerW())
    .height(this.layerH())
    .borderRadius($r('app.float.card_radius'))
    .clip(true)
    .border({
      width: this.selected ? 2 : 0,
      color: $r('app.color.tavern_accent')
    })
  }

  @Builder
  frontLayer() {
    if (this.rank === 'A') {
      Image($r('app.media.art_card_a'))
        .width(this.layerW())
        .height(this.layerH())
        .objectFit(ImageFit.Cover)
        .id(CardFaceIds.FRONT)
    } else if (this.rank === 'K') {
      Image($r('app.media.art_card_k'))
        .width(this.layerW())
        .height(this.layerH())
        .objectFit(ImageFit.Cover)
        .id(CardFaceIds.FRONT)
    } else if (this.rank === 'Q') {
      Image($r('app.media.art_card_q'))
        .width(this.layerW())
        .height(this.layerH())
        .objectFit(ImageFit.Cover)
        .id(CardFaceIds.FRONT)
    } else {
      Image($r('app.media.art_card_joker'))
        .width(this.layerW())
        .height(this.layerH())
        .objectFit(ImageFit.Cover)
        .id(CardFaceIds.FRONT)
    }
  }

  private hostId(): string {
    if (this.instanceId.length > 0) {
      return this.instanceId;
    }
    return CardFaceIds.FACE;
  }

  private layerW(): Resource {
    if (this.compact) {
      return $r('app.float.card_w');
    }
    return $r('app.float.card_face_w');
  }

  private layerH(): Resource {
    if (this.compact) {
      return $r('app.float.card_h');
    }
    return $r('app.float.card_face_h');
  }
}
