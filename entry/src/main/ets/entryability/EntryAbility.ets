import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { ConfigRepository } from '../config/ConfigRepository';
import { AppRuntime } from '../common/AppRuntime';
import { Logger } from '../common/Logger';
import { WindowOrientation } from '../harmony/WindowOrientation';
import { LocalStore } from '../persist/LocalStore';

const TAG = 'EntryAbility';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    Logger.info(TAG, `onCreate ability=${want.abilityName ?? ''} reason=${launchParam.launchReason}`);
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    this.bootstrap(windowStage);
  }

  private async bootstrap(windowStage: window.WindowStage): Promise<void> {
    try {
      await ConfigRepository.loadAll(this.context);
      await LocalStore.init(this.context);
      AppRuntime.bootDirector();
      AppRuntime.engine.resetToLobby();
    } catch (err) {
      Logger.error(TAG, 'config/persist bootstrap failed — pages may hydrate empty');
    }

    Logger.info(TAG, 'bootstrap before orientation lock');
    try {
      await WindowOrientation.lockPortrait(this.context);
    } catch (err) {
      Logger.warn(TAG, 'portrait request fail-soft');
    }
    Logger.info(TAG, 'bootstrap after orientation lock');

    try {
      const win: window.Window = await windowStage.getMainWindow();
      const props: window.WindowProperties = win.getWindowProperties();
      Logger.info(TAG, `bootstrap attach w=${props.windowRect.width} h=${props.windowRect.height}`);
    } catch (err) {
      Logger.warn(TAG, 'bootstrap attach/properties fail-soft');
    }

    Logger.info(TAG, 'bootstrap before loadContent');
    windowStage.loadContent('pages/Lobby', (err) => {
      Logger.info(TAG, 'bootstrap after loadContent');
      if (err.code) {
        Logger.error(TAG, `load Lobby failed code=${err.code}`);
        return;
      }
      Logger.info(TAG, 'cold start → pages/Lobby (lb_scr_lobby)');
    });
  }

  onWindowStageDestroy(): void {
    Logger.info(TAG, 'onWindowStageDestroy');
  }

  onForeground(): void {
    Logger.info(TAG, 'onForeground');
  }

  onBackground(): void {
    Logger.info(TAG, 'onBackground');
  }
}
