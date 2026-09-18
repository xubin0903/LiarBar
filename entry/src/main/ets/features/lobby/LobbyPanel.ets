import { ControlIds } from '../../common/Ids';
import { ConfigRepository } from '../../config/ConfigRepository';
import { LobbyBoot } from './LobbyBoot';

@Component
export struct LobbyPanel {
  @Link nickname: string;
  @Link playerCount: number;
  @Link silent: boolean;
  @State nickRing: number = 0;
  @State nickAccent: boolean = false;
  @State silentRing: number = 0;
  @State fillHot: boolean = false;
  @State fillPressScale: number = 1;
  onFillLast: () => void = () => {};
  onSilentChange: (on: boolean) => void = (_on: boolean) => {};
  private nickPointerHot: boolean = false;
  private nickFocusHot: boolean = false;
  private silentPointerHot: boolean = false;
  private silentFocusHot: boolean = false;
  private fillPointerHot: boolean = false;
  private fillFocusHot: boolean = false;

  build() {
    Column({ space: 12 }) {
      Text($r('app.string.lb_str_autofill_hint'))
        .fontColor($r('app.color.tavern_mute'))
        .fontSize($r('app.float.caption_text_size'))
        .alignSelf(ItemAlign.Start)

      Stack() {
        Image($r('app.media.art_input_field'))
          .width('100%')
          .height($r('app.float.btn_height'))
          .objectFit(ImageFit.Fill)
        TextInput({ text: this.nickname, placeholder: $r('app.string.lb_str_nick_ph') })
          .id(ControlIds.NICK_FIELD)
          .width('100%')
          .height($r('app.float.btn_height'))
          .padding({ left: 20, right: 20 })
          .backgroundColor(Color.Transparent)
          .placeholderColor($r('app.color.tavern_mute'))
          .fontColor($r('app.color.tavern_paper'))
          .focusable(true)
          .onHover((isHover: boolean) => {
            this.setNickPointerHot(isHover);
          })
          .onFocus(() => {
            this.setNickFocusHot(true);
          })
          .onBlur(() => {
            this.setNickFocusHot(false);
          })
          .onChange((value: string) => {
            this.nickname = value;
          })
      }
      .width('100%')
      .height($r('app.float.btn_height'))
      .borderWidth(this.nickRing)
      .borderColor(this.nickAccent ? $r('app.color.tavern_accent') : $r('app.color.tavern_brass'))
      .borderRadius(8)

      Row({ space: 12 }) {
        Text(`人数 ${this.playerCount} · 命 ${this.livesText()}`)
          .id(ControlIds.PLAYERCOUNT)
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.page_text_size'))
      }
      .width('100%')

      Row() {
        Text($r('app.string.lb_str_silent_hint'))
          .fontColor($r('app.color.tavern_mute'))
          .fontSize($r('app.float.caption_text_size'))
          .layoutWeight(1)
        Row() {
          Toggle({ type: ToggleType.Switch, isOn: this.silent })
            .id(ControlIds.SILENT)
            .focusable(true)
            .onFocus(() => {
              this.setSilentFocusHot(true);
            })
            .onBlur(() => {
              this.setSilentFocusHot(false);
            })
            .onChange((on: boolean) => {
              this.silent = on;
              this.onSilentChange(on);
            })
        }
        .padding(3)
        .borderWidth(this.silentRing)
        .borderColor($r('app.color.tavern_accent'))
        .borderRadius(18)
        .onHover((isHover: boolean) => {
          this.setSilentPointerHot(isHover);
        })
      }
      .width('100%')

      Text($r('app.string.lb_str_fill_last'))
        .fontColor(this.fillHot ? $r('app.color.tavern_paper') : $r('app.color.tavern_mute'))
        .fontSize($r('app.float.caption_text_size'))
        .alignSelf(ItemAlign.Start)
        .decoration({
          type: this.fillHot ? TextDecorationType.Underline : TextDecorationType.None,
          color: $r('app.color.tavern_paper')
        })
        .hoverEffect(HoverEffect.None)
        .focusable(true)
        .scale({ x: this.fillPressScale, y: this.fillPressScale })
        .onHover((isHover: boolean) => {
          this.setFillPointerHot(isHover);
        })
        .onFocus(() => {
          this.setFillFocusHot(true);
        })
        .onBlur(() => {
          this.setFillFocusHot(false);
        })
        .onTouch((event: TouchEvent) => {
          this.onFillTouch(event);
        })
        .onClick(() => {
          this.onFillLast();
        })
    }
    .width('100%')
    .padding(16)
    .backgroundColor($r('app.color.tavern_panel'))
    .borderRadius($r('app.float.panel_radius'))
    .borderWidth(1)
    .borderColor($r('app.color.tavern_brass'))
  }

  private setNickPointerHot(on: boolean): void {
    this.nickPointerHot = on;
    this.syncNickHot();
  }

  private setNickFocusHot(on: boolean): void {
    this.nickFocusHot = on;
    this.syncNickHot();
  }

  private syncNickHot(): void {
    const focusOn: boolean = this.nickFocusHot;
    const hot: boolean = this.nickPointerHot || focusOn;
    if (hot) {
      this.nickAccent = focusOn;
      if (this.nickRing === 0) {
        this.nickRing = 1;
      }
      const opt: AnimateParam = {
        duration: LobbyBoot.BOOT_MS_HOVER,
        curve: Curve.EaseOut
      };
      animateTo(opt, (): void => {
        this.nickRing = focusOn ? 2 : 1;
        this.nickAccent = focusOn;
      });
      return;
    }
    const leaveOpt: AnimateParam = {
      duration: LobbyBoot.BOOT_MS_HOVER,
      curve: Curve.EaseOut
    };
    animateTo(leaveOpt, (): void => {
      this.nickRing = 0;
      this.nickAccent = false;
    });
  }

  private setSilentPointerHot(on: boolean): void {
    this.silentPointerHot = on;
    this.syncSilentHot();
  }

  private setSilentFocusHot(on: boolean): void {
    this.silentFocusHot = on;
    this.syncSilentHot();
  }

  private syncSilentHot(): void {
    const hot: boolean = this.silentPointerHot || this.silentFocusHot;
    if (hot) {
      if (this.silentRing === 0) {
        this.silentRing = 1;
      }
      const opt: AnimateParam = {
        duration: LobbyBoot.BOOT_MS_HOVER,
        curve: Curve.EaseOut
      };
      animateTo(opt, (): void => {
        this.silentRing = 2;
      });
      return;
    }
    const leaveOpt: AnimateParam = {
      duration: LobbyBoot.BOOT_MS_HOVER,
      curve: Curve.EaseOut
    };
    animateTo(leaveOpt, (): void => {
      this.silentRing = 0;
    });
  }

  private setFillPointerHot(on: boolean): void {
    this.fillPointerHot = on;
    this.syncFillHot();
  }

  private setFillFocusHot(on: boolean): void {
    this.fillFocusHot = on;
    this.syncFillHot();
  }

  private syncFillHot(): void {
    const hot: boolean = this.fillPointerHot || this.fillFocusHot;
    this.fillHot = hot;
  }

  private onFillTouch(event: TouchEvent): void {
    if (event.type === TouchType.Down) {
      this.fillPressScale = 1;
      const pressOpt: AnimateParam = {
        duration: LobbyBoot.BOOT_MS_CTA_PRESS,
        curve: Curve.EaseOut
      };
      animateTo(pressOpt, (): void => {
        this.fillPressScale = 0.98;
      });
    }
    if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
      const relOpt: AnimateParam = {
        duration: LobbyBoot.BOOT_MS_CTA_RELEASE,
        curve: Curve.EaseOut
      };
      animateTo(relOpt, (): void => {
        this.fillPressScale = 1;
      });
    }
  }

  private livesText(): string {
    if (!ConfigRepository.isReady()) {
      return '--';
    }
    return `${ConfigRepository.match().lives_default}`;
  }
}
