import { CardFaceIds } from '../../common/Ids';
import { SoundPlayer } from './SoundPlayer';

/** 15 §3 Selected-raise 8～16vp. Visual only — not a padB / HAND_RING_GAP change. */
const CARD_RAISE_VP: number = 12;
const CARD_FLIP_MS: number = 210;
const CARD_RAISE_MS: number = 140;

/**
 * Reusable baked card face (docs/04-设计/09 §4 + 15 flip/raise).
 * Identity lives in art_card_* PNG (盾徽 bake ≥22%). Do not overlay rank Text.
 * Tap-select: vertical-axis squash flip 180～240ms + raise 8～16vp.
 * Flip audio is SoundPlayer.playCardFlip (lb_sfx_card_flip).
 * Visual kickoff stays playFlip (same animateTo) — not after the squash
 * completes, and never at T2. EXP 5 may arm PCM on eligible TouchType.Down
 * so the bufMs≈93 HAL period overlaps press→visual; T0 then is touchDown
 * (logged earlier, explained). playCardFlip reuses that arm (no second play).
 * Peek face-up does not play flip (selected stays false). Table noteSfx
 * still routes the slot.
 */
@Component
export struct CardFace {
  @Prop rank: string = '';
  @Prop @Watch('onFaceUp') faceUp: boolean = false;
  @Prop @Watch('onSelected') selected: boolean = false;
  @Prop instanceId: string = '';
  @Prop compact: boolean = false;
  /** Parent bumps this to play a 150ms over-select fail shake. */
  @Prop @Watch('onFailTick') failTick: number = 0;
  @State showFront: boolean = false;
  @State flipScale: number = 1;
  @State raiseY: number = 0;
  @State failX: number = 0;
  private flipTimer: number = -1;
  private failTimer: number = -1;
  private flipSfxArmed: boolean = false;
  /** DIAG: visual kickoff stamp (playFlip / animateTo). T2 is 210ms from here. */
  private diagFlipT0: number = 0;
  private diagT2Timer: number = -1;

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
    if (this.diagT2Timer >= 0) {
      clearTimeout(this.diagT2Timer);
      this.diagT2Timer = -1;
    }
  }

  onFaceUp(): void {
    if (!this.faceUp) {
      this.flipSfxArmed = false;
    }
    this.playFlip();
  }

  onSelected(): void {
    if (!this.selected) {
      this.flipSfxArmed = false;
    }
    if (this.flipTimer >= 0) {
      this.kickFlipSfx();
    }
    this.playRaise();
  }

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
    this.diagFlipT0 = Date.now();
    if (this.flipTimer >= 0) {
      clearTimeout(this.flipTimer);
      this.flipTimer = -1;
    }
    this.kickFlipSfx();
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

  /** Tap-select only: face-up + selected. Peek / sheet already-up skip. */
  private kickFlipSfx(): void {
    if (this.flipSfxArmed || !this.faceUp || !this.selected) {
      return;
    }
    this.flipSfxArmed = true;
    const visualAt: number = this.diagFlipT0 > 0 ? this.diagFlipT0 : Date.now();
    if (!SoundPlayer.hasFlipTouchArm()) {
      SoundPlayer.diagT0('flip', visualAt, 'playFlip');
    }
    SoundPlayer.logFlipVisualKick(visualAt);
    SoundPlayer.playCardFlip();
    if (this.diagT2Timer >= 0) {
      clearTimeout(this.diagT2Timer);
    }
    // T2 = end of 210ms flip animate, from visual kickoff — not earlier T0.
    const elapsed: number = Date.now() - visualAt;
    let wait: number = CARD_FLIP_MS - elapsed;
    if (wait < 0) {
      wait = 0;
    }
    this.diagT2Timer = setTimeout((): void => {
      this.diagT2Timer = -1;
      SoundPlayer.diagT2('flip');
    }, wait);
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
