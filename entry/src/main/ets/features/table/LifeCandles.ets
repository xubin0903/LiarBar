import { ControlIds } from '../../common/Ids';
import { LifeFx } from './LifeFx';
import { SoundPlayer } from './SoundPlayer';

/**
 * 14b R-LIFE: candle pips. No showDigit / no lb_txt_life_self on the face.
 * Binds #108 real media: body + flame_{full,hurt,dying} + extinguish_0..3.
 * Full pip loops flame_full_0..3 when those files exist (they do on develop).
 * Falls back to art_life_candle_full/_hurt/_dying only if LifeFx.LAYERED is false.
 * Does not change lives_default (still 3). Not a button. No padB / GAP / flush.
 */
@Component
export struct LifeCandles {
  @Prop @Watch('onLivesChanged') lives: number = 3;
  @Prop groupId: string = '';
  /** Opponent seats: smaller pips. */
  @Prop compact: boolean = false;
  /** L-small short side: shrink, never unmount. */
  @Prop small: boolean = false;
  @State flamePulse: number = 1;
  @State fullLoop: number = 0;
  @State extPip: number = -1;
  @State extFrame: number = -1;
  private lastLives: number = 3;
  private flameTimer: number = -1;
  private fullLoopTimer: number = -1;
  private extTimers: number[] = [];

  aboutToAppear(): void {
    this.lastLives = this.lives;
    this.armFlameLoop();
    this.armFullLoop();
  }

  aboutToDisappear(): void {
    this.clearFlameTimer();
    this.clearFullLoopTimer();
    this.clearExtTimers();
  }

  onLivesChanged(): void {
    if (this.lives < this.lastLives) {
      this.playExtinguish(this.lastLives - 1);
    } else {
      this.lastLives = this.lives;
    }
  }

  build() {
    Row({ space: this.compact ? 2 : 4 }) {
      this.pip(0)
      this.pip(1)
      this.pip(2)
    }
    .id(this.groupId)
    .opacity(this.lives <= 0 ? 0.42 : 1)
    .hitTestBehavior(HitTestMode.None)
    .constraintSize({ maxWidth: '100%' })
    .accessibilityText(this.lifeA11y())
  }

  @Builder
  pip(index: number) {
    if (LifeFx.LAYERED) {
      this.layeredPip(index)
    } else {
      this.legacyPip(index)
    }
  }

  @Builder
  layeredPip(index: number) {
    Stack({ alignContent: Alignment.Bottom }) {
      Image($r('app.media.art_life_candle_body'))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
        .opacity(this.bodyOpacity(index))
      if (this.isExtinguishing(index)) {
        this.extinguishLayer()
      } else if (this.pipOn(index)) {
        this.flameLayer(this.pipKind(index))
      }
    }
    .id(this.pipId(index))
    .width(this.pipVp())
    .height(this.pipVp())
  }

  @Builder
  flameLayer(kind: number) {
    if (kind === 0) {
      this.fullFlameLoop()
    } else if (kind === 1) {
      Image($r('app.media.art_life_candle_flame_hurt'))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
        .opacity(0.82 + this.flamePulse * 0.18)
    } else {
      Image($r('app.media.art_life_candle_flame_dying'))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
        .opacity(0.70 + this.flamePulse * 0.30)
    }
  }

  @Builder
  fullFlameLoop() {
    if (this.fullLoop === 0) {
      Image($r('app.media.art_life_candle_flame_full_0'))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
    } else if (this.fullLoop === 1) {
      Image($r('app.media.art_life_candle_flame_full_1'))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
    } else if (this.fullLoop === 2) {
      Image($r('app.media.art_life_candle_flame_full_2'))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
    } else {
      Image($r('app.media.art_life_candle_flame_full_3'))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
    }
  }

  @Builder
  extinguishLayer() {
    if (this.extFrame === 0) {
      Image($r('app.media.art_life_candle_extinguish_0'))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
    } else if (this.extFrame === 1) {
      Image($r('app.media.art_life_candle_extinguish_1'))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
    } else if (this.extFrame === 2) {
      Image($r('app.media.art_life_candle_extinguish_2'))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
    } else {
      Image($r('app.media.art_life_candle_extinguish_3'))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
    }
  }

  @Builder
  legacyPip(index: number) {
    Stack() {
      if (this.isExtinguishing(index)) {
        this.legacyExtinguish()
      } else if (this.pipKind(index) === 0) {
        Image($r('app.media.art_life_candle_full'))
          .width(this.pipVp())
          .height(this.pipVp())
          .objectFit(ImageFit.Contain)
          .opacity(this.pipOn(index) ? 1 : 0.28)
          .scale({ x: this.flamePulse, y: this.flamePulse })
      } else if (this.pipKind(index) === 1) {
        Image($r('app.media.art_life_candle_hurt'))
          .width(this.pipVp())
          .height(this.pipVp())
          .objectFit(ImageFit.Contain)
          .opacity(this.pipOn(index) ? 1 : 0.28)
          .scale({ x: this.flamePulse, y: this.flamePulse })
      } else {
        Image($r('app.media.art_life_candle_dying'))
          .width(this.pipVp())
          .height(this.pipVp())
          .objectFit(ImageFit.Contain)
          .opacity(this.pipOn(index) ? 1 : 0.28)
          .scale({ x: this.flamePulse, y: this.flamePulse })
      }
    }
    .id(this.pipId(index))
    .width(this.pipVp())
    .height(this.pipVp())
  }

  @Builder
  legacyExtinguish() {
    if (this.extFrame === 0) {
      Image($r('app.media.art_life_candle_full'))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
        .opacity(0.90)
        .scale({ x: 0.94, y: 0.90 })
    } else if (this.extFrame === 1) {
      Image($r('app.media.art_life_candle_hurt'))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
        .opacity(0.78)
        .scale({ x: 0.88, y: 0.84 })
    } else if (this.extFrame === 2) {
      Image($r('app.media.art_life_candle_dying'))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
        .opacity(0.58)
        .scale({ x: 0.82, y: 0.78 })
    } else {
      Image($r('app.media.art_life_candle_dying'))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
        .opacity(0.32)
        .scale({ x: 0.76, y: 0.70 })
    }
  }

  private pipOn(index: number): boolean {
    return index < this.lives;
  }

  private isExtinguishing(index: number): boolean {
    return index === this.extPip && this.extFrame >= 0;
  }

  private bodyOpacity(index: number): number {
    if (this.isExtinguishing(index) || this.pipOn(index)) {
      return 1;
    }
    return 0.28;
  }

  /**
   * Count + shape (14 §2.2). On pips: 3=full, 2=hurt, 1=dying.
   * Lost pips stay dying/dim — not red/green-only.
   */
  private pipKind(index: number): number {
    if (!this.pipOn(index)) {
      return 2;
    }
    if (this.lives >= 3) {
      return 0;
    }
    if (this.lives === 2) {
      return 1;
    }
    return 2;
  }

  private pipId(index: number): string {
    if (this.groupId === ControlIds.LIFE_SELF) {
      if (index === 0) {
        return ControlIds.LIFE_PIP_0;
      }
      if (index === 1) {
        return ControlIds.LIFE_PIP_1;
      }
      return ControlIds.LIFE_PIP_2;
    }
    return `${this.groupId}_pip_${index}`;
  }

  private pipVp(): Resource {
    if (this.compact) {
      if (this.small) {
        return $r('app.float.life_pip_seat_small');
      }
      return $r('app.float.life_pip_seat');
    }
    if (this.small) {
      return $r('app.float.life_pip_self_small');
    }
    return $r('app.float.life_pip_self');
  }

  private lifeA11y(): string {
    if (this.groupId === ControlIds.LIFE_SELF) {
      return `自己生命 ${this.lives}`;
    }
    return `生命 ${this.lives}`;
  }

  /** 14b R-LIFE-4 + #108: extinguish_0..3 (≤4), 180～320ms, no hard cut. */
  private playExtinguish(pip: number): void {
    this.clearExtTimers();
    let target: number = pip;
    if (target < 0) {
      target = 0;
    }
    if (target > 2) {
      target = 2;
    }
    this.extPip = target;
    this.extFrame = 0;
    SoundPlayer.playCardFlip();
    const step: number = LifeFx.EXTINGUISH_FRAME_MS;
    let frames: number = LifeFx.EXTINGUISH_FRAMES;
    if (frames < 2) {
      frames = 2;
    }
    if (frames > LifeFx.EXTINGUISH_MAX_FRAMES) {
      frames = LifeFx.EXTINGUISH_MAX_FRAMES;
    }
    const last: number = frames - 1;
    for (let i = 1; i < frames; i++) {
      const frame: number = i;
      this.extTimers.push(setTimeout((): void => {
        this.extFrame = frame;
        if (frame === last) {
          SoundPlayer.playLifeExtinguish();
        }
      }, step * i));
    }
    this.extTimers.push(setTimeout((): void => {
      this.extFrame = -1;
      this.extPip = -1;
      this.lastLives = this.lives;
      this.extTimers = [];
    }, step * frames));
  }

  private armFullLoop(): void {
    this.clearFullLoopTimer();
    this.tickFullLoop();
  }

  private tickFullLoop(): void {
    this.fullLoopTimer = setTimeout((): void => {
      this.fullLoop = (this.fullLoop + 1) % LifeFx.FLAME_FULL_LOOP;
      this.tickFullLoop();
    }, LifeFx.FLAME_FULL_FRAME_MS);
  }

  private armFlameLoop(): void {
    this.clearFlameTimer();
    this.tickFlame();
  }

  private tickFlame(): void {
    const ms: number = this.flameLoopMs();
    const opt: AnimateParam = {
      duration: ms,
      curve: Curve.EaseInOut
    };
    const next: number = this.flamePulse > 0.96 ? this.flameLow() : 1;
    animateTo(opt, (): void => {
      this.flamePulse = next;
    });
    this.flameTimer = setTimeout((): void => {
      this.tickFlame();
    }, ms);
  }

  private flameLoopMs(): number {
    if (this.lives >= 3) {
      return LifeFx.FLAME_FULL_MS;
    }
    if (this.lives === 2) {
      return LifeFx.FLAME_HURT_MS;
    }
    return LifeFx.FLAME_DYING_MS;
  }

  private flameLow(): number {
    if (this.lives >= 3) {
      return 0.90;
    }
    if (this.lives === 2) {
      return 0.86;
    }
    return 0.78;
  }

  private clearFlameTimer(): void {
    if (this.flameTimer >= 0) {
      clearTimeout(this.flameTimer);
      this.flameTimer = -1;
    }
  }

  private clearFullLoopTimer(): void {
    if (this.fullLoopTimer >= 0) {
      clearTimeout(this.fullLoopTimer);
      this.fullLoopTimer = -1;
    }
  }

  private clearExtTimers(): void {
    for (let i = 0; i < this.extTimers.length; i++) {
      clearTimeout(this.extTimers[i]);
    }
    this.extTimers = [];
  }
}
