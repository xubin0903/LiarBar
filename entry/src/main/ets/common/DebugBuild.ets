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

  /**
   * PR-B 调试暂停（策划 21 §3.7 / S21-41）：同一开关 ApplicationInfo.debug（hvigor debug 构建 = true，
   * release HAP = false）。与 lifeDecShown 不同：读不到时 fail-closed（返回 false），交付包绝不出现入口。
   */
  static debugPauseShown(): boolean {
    try {
      const flags: number = bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION;
      const info: bundleManager.BundleInfo = bundleManager.getBundleInfoForSelfSync(flags);
      return info.appInfo.debug === true;
    } catch (err) {
      Logger.warn(TAG, 'debug flag unread — hide debug pause (fail-closed)');
      return false;
    }
  }
}
