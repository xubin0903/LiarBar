import { ControlIds } from '../../common/Ids';

/**
 * 14 · candle life pips (art co-sign).
 * Binds art_life_candle_full / _hurt / _dying.
 * PLACEHOLDER media until illustrated PNG lands — do not swap lb_* ids.
 * Does not change lives_default (still 3). Not a button.
 */
@Component
export struct LifeCandles {
  @Prop lives: number = 3;
  @Prop groupId: string = '';
  /** Opponent seats: smaller pips. */
  @Prop compact: boolean = false;
  /** L-small short side: shrink, never unmount. */
  @Prop small: boolean = false;
  /** Self only: secondary digit. Not the primary read. */
  @Prop showDigit: boolean = false;
  @State shakeX: number = 0;
  private lastLives: number = 3;
  private shakeTimer: number = -1;

  aboutToAppear(): void {
    this.lastLives = this.lives;
  }

  aboutToDisappear(): void {
    if (this.shakeTimer >= 0) {
      clearTimeout(this.shakeTimer);
      this.shakeTimer = -1;
    }
  }

  @Watch('lives')
  onLivesChanged(): void {
    if (this.lives < this.lastLives) {
      this.playDropShake();
    }
    this.lastLives = this.lives;
  }

  build() {
    Row({ space: this.compact ? 2 : 4 }) {
      this.pip(0)
      this.pip(1)
      this.pip(2)
      if (this.showDigit) {
        Text(`${this.lives}`)
          .id(ControlIds.TXT_LIFE_SELF)
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.caption_text_size'))
          .margin({ left: 2 })
      }
    }
    .id(this.groupId)
    .opacity(this.lives <= 0 ? 0.42 : 1)
    .offset({ x: this.shakeX, y: 0 })
    .hitTestBehavior(HitTestMode.None)
    .constraintSize({ maxWidth: '100%' })
  }

  @Builder
  pip(index: number) {
    // PLACEHOLDER: art_life_candle_* until illustrated PNG. Ids stay.
    if (this.pipKind(index) === 0) {
      Image($r('app.media.art_life_candle_full'))
        .id(this.pipId(index))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
        .opacity(this.pipOn(index) ? 1 : 0.28)
    } else if (this.pipKind(index) === 1) {
      Image($r('app.media.art_life_candle_hurt'))
        .id(this.pipId(index))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
        .opacity(this.pipOn(index) ? 1 : 0.28)
    } else {
      Image($r('app.media.art_life_candle_dying'))
        .id(this.pipId(index))
        .width(this.pipVp())
        .height(this.pipVp())
        .objectFit(ImageFit.Contain)
        .opacity(this.pipOn(index) ? 1 : 0.28)
    }
  }

  private pipOn(index: number): boolean {
    return index < this.lives;
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
    if (this.showDigit) {
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

  /** 14 §5.2: 120～200ms light shake on the deducted group. */
  private playDropShake(): void {
    const opt: AnimateParam = {
      duration: 80,
      curve: Curve.EaseOut
    };
    animateTo(opt, (): void => {
      this.shakeX = this.compact ? 3 : 5;
    });
    if (this.shakeTimer >= 0) {
      clearTimeout(this.shakeTimer);
    }
    this.shakeTimer = setTimeout((): void => {
      this.shakeTimer = -1;
      const back: AnimateParam = {
        duration: 80,
        curve: Curve.EaseIn
      };
      animateTo(back, (): void => {
        this.shakeX = 0;
      });
    }, 80);
  }
}
