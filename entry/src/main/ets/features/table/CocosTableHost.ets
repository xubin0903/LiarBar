import { ControlIds, ScreenIds } from '../../common/Ids';
import { Logger } from '../../common/Logger';
import { CocosBridge } from '../../harmony/CocosBridge';
import { LINK_LIBCOCOS } from '../../harmony/CocosNativeLink';
import { USE_COCOS_TABLE } from '../../harmony/CocosTableFlag';

const TAG = 'CocosTableHost';

/**
 * C2′ · Mode 2 XComponent host for Cocos surface.
 *
 * - USE_COCOS_TABLE（CocosTableFlag）控制是否进本宿主；默认 false → 旧桌。
 * - LINK_LIBCOCOS（CocosNativeLink）控制是否带 libraryname: 'cocos'。
 *   true 前须本机已有 entry/libs/arm64-v8a/libcocos.so（copy 脚本；勿 commit so）。
 * - 链 so ≠ 场景出牌：Worker / jsb / 资源仍待整包引擎 ArkTS（见 cocos_engine/README.md）。
 */
@Component
export struct CocosTableHost {
  onRequestHome: () => void = () => {
  };

  aboutToAppear(): void {
    Logger.info(TAG,
      `aboutToAppear — USE_COCOS_TABLE=${USE_COCOS_TABLE} LINK_LIBCOCOS=${LINK_LIBCOCOS}`);
    CocosBridge.start('{"spike":true,"c2prime":true}');
    const token: string = CocosBridge.ping();
    Logger.info(TAG, `bridge ping-pong token=${token}`);
  }

  aboutToDisappear(): void {
    Logger.info(TAG, 'aboutToDisappear');
    CocosBridge.pause();
  }

  build() {
    Stack({ alignContent: Alignment.Center }) {
      // LINK_LIBCOCOS=false：SURFACE 占位，不 dlopen libcocos（缺 so 时安全）。
      // LINK_LIBCOCOS=true：与 Creator harmonyos-next 模板一致 libraryname: 'cocos'。
      if (LINK_LIBCOCOS) {
        XComponent({
          id: 'lb_xcomp_cocos',
          type: XComponentType.SURFACE,
          libraryname: 'cocos'
        })
          .onLoad((_ctx?: object) => {
            Logger.info(TAG, 'XComponent onLoad — libraryname=cocos (libcocos expected in libs)');
            CocosBridge.pong();
          })
          .onDestroy(() => {
            Logger.info(TAG, 'XComponent onDestroy');
          })
          .width('100%')
          .height('100%')
      } else {
        XComponent({
          id: 'lb_xcomp_cocos',
          type: XComponentType.SURFACE
        })
          .onLoad((_ctx?: object) => {
            Logger.info(TAG,
              'XComponent onLoad — SURFACE placeholder; set LINK_LIBCOCOS after copy_cocos_native_libs');
            CocosBridge.pong();
          })
          .onDestroy(() => {
            Logger.info(TAG, 'XComponent onDestroy');
          })
          .width('100%')
          .height('100%')
      }

      Column({ space: 8 }) {
        Text('Cocos Table Host (C2′)')
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.page_text_size'))
        Text(LINK_LIBCOCOS ?
          'LINK_LIBCOCOS=true · libraryname=cocos' :
          'LINK_LIBCOCOS=false · SURFACE only')
          .fontColor($r('app.color.tavern_candle'))
          .fontSize($r('app.float.caption_text_size'))
        Text(ControlIds.HOME)
          .id(ControlIds.HOME)
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.caption_text_size'))
          .padding({ left: 16, right: 16, top: 8, bottom: 8 })
          .backgroundColor($r('app.color.tavern_panel'))
          .borderRadius(8)
          .onClick(() => {
            CocosBridge.back();
            CocosBridge.exit();
            this.onRequestHome();
          })
      }
      .hitTestBehavior(HitTestMode.Default)
    }
    .id(ScreenIds.TABLE)
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.tavern_bg'))
  }
}
