import { CardFaceIds } from '../../common/Ids';

/** 15 §3 Selected-raise 8～16vp. Visual only — not a padB / HAND_RING_GAP change. */
const CARD_RAISE_VP: number = 12;
const CARD_FLIP_MS: number = 210;
const CARD_RAISE_MS: number = 140;

/**
 * Reusable baked card face (docs/04-设计/09 §4 + 15 flip/raise).
 * Identity lives in art_card_* PNG (盾徽 bake ≥22%). Do not overlay rank Text.
 * Tap-select: vertical-axis squash flip 180～240ms + raise 8～16vp.
 */
@Component
export struct CardFace {
  @Prop rank: string = '';
  @Prop faceUp: boolean = false;
  @Prop selected: boolean = false;
  @Prop instanceId: string = '';
  @Prop compact: boolean = false;
  /** Parent bumps this to play a 150ms over-select fail shake. */
  @Prop failTick: number = 0;
  @State showFront: boolean = false;
  @State flipScale: number = 1;
  @State raiseY: number = 0;
  @State failX: number = 0;
  private flipTimer: number = -1;
  private failTimer: number = -1;

  aboutToAppear(): void {
    this.showFront = this.faceUp;
    this.flipScale = 1;
    this.raiseY = this.selected ? CARD_RAISE_VP : 0;
  }

  aboutToDisappear(): void {
    if (this.flipTimer >= 0) {
      clearTimeout(this.flipTimer);
      this.flipTimer = -1;
    }
    if (this.failTimer >= 0) {
      clearTimeout(this.failTimer);
      this.failTimer = -1;
    }
  }

  @Watch('faceUp')
  onFaceUp(): void {
    this.playFlip();
  }

  @Watch('selected')
  onSelected(): void {
    this.playRaise();
  }

  @Watch('failTick')
  onFailTick(): void {
    if (this.failTick > 0) {
      this.playFailShake();
    }
  }

  build() {
    Stack() {
      Image($r('app.media.art_card_back'))
        .width(this.layerW())
        .height(this.layerH())
        .objectFit(ImageFit.Cover)
        .id(CardFaceIds.BACK)
        .opacity(this.showFront ? 0 : 1)

      if (this.showFront) {
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
    .scale({ x: this.flipScale, y: 1 })
    .offset({ x: this.failX, y: 0 - this.raiseY })
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

  /** 15 §3: squash through 0 = short 3D flip (not a texture pop). */
  private playFlip(): void {
    if (this.flipTimer >= 0) {
      clearTimeout(this.flipTimer);
      this.flipTimer = -1;
    }
    const half: number = Math.round(CARD_FLIP_MS / 2);
    const inward: AnimateParam = {
      duration: half,
      curve: Curve.EaseIn
    };
    animateTo(inward, (): void => {
      this.flipScale = 0.02;
    });
    this.flipTimer = setTimeout((): void => {
      this.flipTimer = -1;
      this.showFront = this.faceUp;
      const outward: AnimateParam = {
        duration: half,
        curve: Curve.EaseOut
      };
      animateTo(outward, (): void => {
        this.flipScale = 1;
      });
    }, half);
  }

  private playRaise(): void {
    const opt: AnimateParam = {
      duration: CARD_RAISE_MS,
      curve: Curve.EaseOut
    };
    const next: number = this.selected ? CARD_RAISE_VP : 0;
    animateTo(opt, (): void => {
      this.raiseY = next;
    });
  }

  /** 15 §4: over-select _fail shake 150ms. */
  private playFailShake(): void {
    if (this.failTimer >= 0) {
      clearTimeout(this.failTimer);
      this.failTimer = -1;
    }
    const hit: AnimateParam = {
      duration: 75,
      curve: Curve.EaseOut
    };
    animateTo(hit, (): void => {
      this.failX = 6;
    });
    this.failTimer = setTimeout((): void => {
      this.failTimer = -1;
      const back: AnimateParam = {
        duration: 75,
        curve: Curve.EaseIn
      };
      animateTo(back, (): void => {
        this.failX = 0;
      });
    }, 75);
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
