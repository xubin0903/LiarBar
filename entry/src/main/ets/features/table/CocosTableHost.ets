import { ControlIds, ScreenIds } from '../../common/Ids';
import { Logger } from '../../common/Logger';
import { CocosBridge } from '../../harmony/CocosBridge';

const TAG = 'CocosTableHost';

/**
 * C2 Spike · Mode 2 XComponent host for Cocos surface.
 *
 * 待 K2 产物（cocos_engine / libcocos.so）到位后：
 *   - 取消下方 libraryname 注释，设为 'cocos'
 *   - 在 onLoad 里走 Worker / nativeEngineInit（对齐 Creator harmonyos-next 模板）
 * 当前：SURFACE 占位 + 生命周期日志 + 桥 ping；不链接 native so。
 */
@Component
export struct CocosTableHost {
  onRequestHome: () => void = () => {
  };

  aboutToAppear(): void {
    Logger.info(TAG, 'aboutToAppear — Cocos host (no libcocos yet)');
    CocosBridge.start('{"spike":true}');
    const token: string = CocosBridge.ping();
    Logger.info(TAG, `bridge ping-pong token=${token}`);
  }

  aboutToDisappear(): void {
    Logger.info(TAG, 'aboutToDisappear');
    CocosBridge.pause();
  }

  build() {
    Stack({ alignContent: Alignment.Center }) {
      // SURFACE 占位。libraryname / libcocos.so：待 cocos build 产物 —— 勿在无 so 时强链。
      // 有产物后改为：
      // XComponent({ id: 'lb_xcomp_cocos', type: XComponentType.SURFACE, libraryname: 'cocos' })
      XComponent({
        id: 'lb_xcomp_cocos',
        type: XComponentType.SURFACE
      })
        .onLoad((_ctx?: object) => {
          Logger.info(TAG,
            'XComponent onLoad — SURFACE ready; libcocos link deferred (await K2)');
          CocosBridge.pong();
        })
        .onDestroy(() => {
          Logger.info(TAG, 'XComponent onDestroy');
        })
        .width('100%')
        .height('100%')

      Column({ space: 8 }) {
        Text('Cocos Table Host (Spike)')
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.page_text_size'))
        Text('USE_COCOS_TABLE · awaiting K2 libcocos')
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
