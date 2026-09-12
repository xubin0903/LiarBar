import { ControlIds } from '../../common/Ids';
import { LifeFx } from './LifeFx';
import { SoundPlayer } from './SoundPlayer';

/**
 * 14b R-LIFE: candle pips. No showDigit / no lb_txt_life_self on the face.
 * Prefers art_life_candle_body + looping flame_* + extinguish_0/1/2.
 * Falls back to art_life_candle_full/_hurt/_dying when layered media is off.
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
  @State extPip: number = -1;
  @State extFrame: number = -1;
  private lastLives: number = 3;
  private flameTimer: number = -1;
  private extTimers: number[] = [];

  aboutToAppear(): void {
    this.lastLives = this.lives;
    this.armFlameLoop();
  }

  aboutToDisappear(): void {
    this.clearFlameTimer();
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
      Image($r('app.media.art_life_candle_flame_full'))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
        .scale({ x: this.flamePulse, y: this.flamePulse })
        .opacity(0.72 + this.flamePulse * 0.28)
    } else if (kind === 1) {
      Image($r('app.media.art_life_candle_flame_hurt'))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
        .scale({ x: this.flamePulse, y: this.flamePulse })
        .opacity(0.70 + this.flamePulse * 0.26)
    } else {
      Image($r('app.media.art_life_candle_flame_dying'))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
        .scale({ x: this.flamePulse, y: this.flamePulse })
        .opacity(0.62 + this.flamePulse * 0.30)
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
    } else {
      Image($r('app.media.art_life_candle_extinguish_2'))
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
        .opacity(0.85)
        .scale({ x: 0.92, y: 0.88 })
    } else if (this.extFrame === 1) {
      Image($r('app.media.art_life_candle_hurt'))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
        .opacity(0.70)
        .scale({ x: 0.86, y: 0.80 })
    } else {
      Image($r('app.media.art_life_candle_dying'))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
        .opacity(0.45)
        .scale({ x: 0.80, y: 0.74 })
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

  /** 14b R-LIFE-4: extinguish_0/1/2, 180～320ms, no hard cut. */
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
    this.extTimers.push(setTimeout((): void => {
      this.extFrame = 1;
    }, step));
    this.extTimers.push(setTimeout((): void => {
      this.extFrame = 2;
      SoundPlayer.playLifeExtinguish();
    }, step * 2));
    this.extTimers.push(setTimeout((): void => {
      this.extFrame = -1;
      this.extPip = -1;
      this.lastLives = this.lives;
      this.extTimers = [];
    }, step * LifeFx.EXTINGUISH_FRAMES));
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

  private clearExtTimers(): void {
    for (let i = 0; i < this.extTimers.length; i++) {
      clearTimeout(this.extTimers[i]);
    }
    this.extTimers = [];
  }
}
