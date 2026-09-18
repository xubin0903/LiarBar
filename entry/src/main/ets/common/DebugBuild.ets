import { bundleManager } from '@kit.AbilityKit';
import { Logger } from './Logger';

const TAG = 'DebugBuild';

/**
 * 14b R-LIFE-5: debug chrome is debug/dev only.
 * Hides lb_btn_debug_open / lb_cmp_debug_life / lb_btn_debug_life_dec together.
 * Reads ApplicationInfo.debug (false on release HAP). Fail-soft shows in unsigned dev.
 */
export class DebugBuild {
  static lifeDecShown(): boolean {
    try {
      const flags: number = bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION;
      const info: bundleManager.BundleInfo = bundleManager.getBundleInfoForSelfSync(flags);
      return info.appInfo.debug === true;
    } catch (err) {
      Logger.warn(TAG, 'debug flag unread — show life-dec (dev fallback)');
      return true;
    }
  }
}
