import { common } from '@kit.AbilityKit';
import { AuthCallResult, AuthSession } from '../auth/AuthClient';
import { ControlIds, ScreenIds } from '../common/Ids';
import { LbRouter } from '../common/LbRouter';
import { Logger } from '../common/Logger';
import { WindowOrientation } from '../harmony/WindowOrientation';
import { AuthStore } from '../persist/AuthStore';

const TAG = 'Login';

/**
 * 22 §7.0 `lb_scr_login`：竖屏，与大厅同向；全屏一层底（实现 B）。
 * 层级：`lb_cmp_auth_bg`(art_lobby_bg) → `lb_cmp_auth_fx`(dust/candle) → `lb_cmp_auth_card`(art_panel_base 贴边≤2%)。
 * CTA 字色暖金 `tavern_candle`（禁 tavern_bg 压深底）。无令牌落地；已登录误入则 replace 大厅。
 */
@Entry
@Component
struct Login {
  @State modeRegister: boolean = false;
  @State username: string = '';
  @State password: string = '';
  @State errorKey: string = '';
  @State busy: boolean = false;

  aboutToAppear(): void {
    this.lockPortraitSoft();
    if (AuthStore.corruptCleared()) {
      this.errorKey = 'lb_str_auth_token_corrupt';
    }
    const noted: string = AuthStore.takeGatePhrase();
    if (noted.length > 0) {
      this.errorKey = noted;
    }
    if (AuthStore.isLoggedIn()) {
      this.goLobbyAfterAuth();
      return;
    }
  }

  /** 冷启动落地无上一页可回大厅（22 §7.0）。返回键不得绕进大厅。 */
  onBackPress(): boolean {
    return true;
  }

  private async lockPortraitSoft(): Promise<void> {
    try {
      const ctx: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
      await WindowOrientation.lockPortrait(ctx);
    } catch (err) {
      Logger.warn(TAG, 'portrait request fail-soft');
    }
  }

  private async submit(): Promise<void> {
    if (this.busy) {
      return;
    }
    this.busy = true;
    this.errorKey = '';
    const result: AuthCallResult = await AuthSession.submit(this.modeRegister, this.username, this.password);
    this.busy = false;
    if (!result.ok) {
      this.errorKey = result.phrase;
      return;
    }
    this.goLobbyAfterAuth();
  }

  private goLobbyAfterAuth(): void {
    LbRouter.toLobby();
  }

  private switchMode(): void {
    this.modeRegister = !this.modeRegister;
    this.password = '';
    this.errorKey = '';
  }

  private errorLine(): Resource {
    if (this.errorKey === 'lb_str_auth_login_fail') {
      return $r('app.string.lb_str_auth_login_fail');
    }
    if (this.errorKey === 'lb_str_auth_register_conflict') {
      return $r('app.string.lb_str_auth_register_conflict');
    }
    if (this.errorKey === 'lb_str_auth_field_invalid') {
      return $r('app.string.lb_str_auth_field_invalid');
    }
    if (this.errorKey === 'lb_str_auth_network') {
      return $r('app.string.lb_str_auth_network');
    }
    if (this.errorKey === 'lb_str_auth_prefs_fail') {
      return $r('app.string.lb_str_auth_prefs_fail');
    }
    if (this.errorKey === 'lb_str_auth_token_corrupt') {
      return $r('app.string.lb_str_auth_token_corrupt');
    }
    if (this.errorKey === 'lb_str_auth_logout_leak') {
      return $r('app.string.lb_str_auth_logout_leak');
    }
    if (this.errorKey === 'lb_str_auth_gate_bypass') {
      return $r('app.string.lb_str_auth_gate_bypass');
    }
    if (this.errorKey === 'lb_str_auth_rate_limit') {
      return $r('app.string.lb_str_auth_rate_limit');
    }
    return $r('app.string.lb_str_auth_bad_response');
  }

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Image($r('app.media.art_lobby_bg'))
        .id('lb_cmp_auth_bg')
        .width('100%')
        .height('100%')
        .objectFit(ImageFit.Cover)

      Stack() {
        Image($r('app.media.art_fx_dust'))
          .width('100%')
          .height('100%')
          .objectFit(ImageFit.Cover)
          .opacity(0.32)
          .hitTestBehavior(HitTestMode.None)
        Image($r('app.media.art_fx_candle'))
          .width(96)
          .height(96)
          .objectFit(ImageFit.Contain)
          .opacity(0.85)
          .hitTestBehavior(HitTestMode.None)
          .align(Alignment.BottomStart)
          .margin({ left: 12, bottom: 40 })
      }
      .id('lb_cmp_auth_fx')
      .width('100%')
      .height('100%')
      .hitTestBehavior(HitTestMode.None)

      this.card()
    }
    .id(ScreenIds.LOGIN)
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.tavern_bg'))
  }

  @Builder
  card() {
    Stack() {
      Image($r('app.media.art_panel_base'))
        .width('100%')
        .height('100%')
        .objectFit(ImageFit.Fill)
        .resizable({
          slice: { left: 48, top: 48, right: 48, bottom: 48 }
        })
      Column({ space: 12 }) {
        Text(this.modeRegister ? $r('app.string.lb_str_auth_title_register') : $r('app.string.lb_str_auth_title_login'))
          .id(ControlIds.AUTH_TITLE)
          .fontColor($r('app.color.tavern_candle'))
          .fontSize($r('app.float.page_text_size'))
          .fontWeight(FontWeight.Medium)
          .width('100%')
          .textAlign(TextAlign.Center)

        Stack() {
          Image($r('app.media.art_input_field'))
            .width('100%')
            .height('100%')
            .objectFit(ImageFit.Fill)
          TextInput({ text: this.username, placeholder: $r('app.string.lb_str_auth_username_ph') })
            .id(ControlIds.AUTH_USER)
            .width('100%')
            .height($r('app.float.btn_height'))
            .padding({ left: 16, right: 16 })
            .backgroundColor(Color.Transparent)
            .placeholderColor($r('app.color.tavern_mute'))
            .fontColor($r('app.color.tavern_paper'))
            .onChange((value: string) => {
              this.username = value;
            })
        }
        .width('100%')
        .height($r('app.float.btn_height'))

        Stack() {
          Image($r('app.media.art_input_field'))
            .width('100%')
            .height('100%')
            .objectFit(ImageFit.Fill)
          TextInput({ text: this.password, placeholder: $r('app.string.lb_str_auth_password_ph') })
            .id(ControlIds.AUTH_PASS)
            .type(InputType.Password)
            .width('100%')
            .height($r('app.float.btn_height'))
            .padding({ left: 16, right: 16 })
            .backgroundColor(Color.Transparent)
            .placeholderColor($r('app.color.tavern_mute'))
            .fontColor($r('app.color.tavern_paper'))
            .onChange((value: string) => {
              this.password = value;
            })
        }
        .width('100%')
        .height($r('app.float.btn_height'))

        if (this.errorKey.length > 0) {
          Text(this.errorLine())
            .id(ControlIds.AUTH_ERROR)
            .fontColor($r('app.color.tavern_danger'))
            .fontSize($r('app.float.caption_text_size'))
            .width('100%')
        } else {
          Text('')
            .id(ControlIds.AUTH_ERROR)
            .height(0)
            .width('100%')
        }

        Stack() {
          Image(this.busy ? $r('app.media.art_btn_primary_on') : $r('app.media.art_btn_primary'))
            .width('100%')
            .height('100%')
            .objectFit(ImageFit.Fill)
          Button(this.modeRegister ? $r('app.string.lb_str_auth_submit_register') : $r('app.string.lb_str_auth_submit_login'))
            .id(ControlIds.AUTH_SUBMIT)
            .type(ButtonType.Normal)
            .width('100%')
            .height($r('app.float.btn_height'))
            .fontSize($r('app.float.page_text_size'))
            .fontWeight(FontWeight.Medium)
            .backgroundColor(Color.Transparent)
            .fontColor($r('app.color.tavern_candle'))
            .enabled(!this.busy)
            .onClick(() => {
              this.submit();
            })
        }
        .width('100%')
        .height($r('app.float.btn_height'))

        Text(this.modeRegister ? $r('app.string.lb_str_auth_switch_to_login') : $r('app.string.lb_str_auth_switch_to_register'))
          .id(ControlIds.AUTH_SWITCH)
          .width('100%')
          .height(44)
          .textAlign(TextAlign.Center)
          .fontColor($r('app.color.tavern_brass'))
          .fontSize($r('app.float.caption_text_size'))
          .onClick(() => {
            this.switchMode();
          })
      }
      .width('100%')
      .height('100%')
      .justifyContent(FlexAlign.Center)
      .padding({ left: 24, right: 24, top: 24, bottom: 24 })
    }
    .id(ControlIds.AUTH_CARD)
    .width('96%')
    .height('96%')
  }
}
