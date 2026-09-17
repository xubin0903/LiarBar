import { Logger } from '../common/Logger';

const TAG = 'CocosBridge';

/**
 * C2 Spike · ArkTS side of lb.* bridge (docs/05 §5 · 04 §3).
 * Reflection targets: register this file in entry/build-profile.json5
 *   buildOption.arkOptions.runtimeOnly.sources
 * Kit bodies land in C3 (TtsAdapter / LiveWindow / PeekPrivacy / GamePerf).
 * No game rules here — host IO only.
 *
 * C2′：本机 so 经 copy_cocos_native_libs → entry/libs；XComponent 链路由
 * CocosNativeLink.LINK_LIBCOCOS。Worker / ProxyPort / evalString 真桥仍待整包引擎 ArkTS。
 * 当前 stub 仅 hilog，供宿主生命周期与开关联调。
 */
export class CocosBridge {
  /** JS→ArkTS ping; returns pong token for Spike A3. */
  static ping(): string {
    Logger.info(TAG, 'ping → pong');
    return 'pong';
  }

  /** ArkTS→JS / host ack (log-only until evalString path exists). */
  static pong(): void {
    Logger.info(TAG, 'pong');
  }

  /** lb.tts — Core Speech; C3. */
  static tts(text: string): void {
    Logger.info(TAG, `lb.tts stub textLen=${text.length}`);
  }

  /** lb.live — Live View three fields; never ranks. */
  static live(payloadJson: string): void {
    Logger.info(TAG, `lb.live stub ${payloadJson}`);
  }

  /** lb.privacy — PeekPrivacyAdapter. */
  static privacy(on: boolean): void {
    Logger.info(TAG, `lb.privacy stub on=${on}`);
  }

  /** lb.perfScene — GameService gamePerformance. */
  static perfScene(sceneId: string): void {
    Logger.info(TAG, `lb.perfScene stub scene=${sceneId}`);
  }

  /** lb.exit — leave table → Lobby. */
  static exit(): void {
    Logger.info(TAG, 'lb.exit stub');
  }

  /** lb.report — hand off recap JSON → Report. */
  static report(resultJson: string): void {
    Logger.info(TAG, `lb.report stub len=${resultJson.length}`);
  }

  /** lb.start — open table / seed opts into Cocos Director. */
  static start(optsJson: string): void {
    Logger.info(TAG, `lb.start stub ${optsJson}`);
  }

  /** lb.pause — Ability background. */
  static pause(): void {
    Logger.info(TAG, 'lb.pause stub');
  }

  /** lb.resume — Ability foreground. */
  static resume(): void {
    Logger.info(TAG, 'lb.resume stub');
  }

  /** lb.back — system / chrome back while on table. */
  static back(): void {
    Logger.info(TAG, 'lb.back stub');
  }
}
