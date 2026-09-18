import { common } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { Logger } from '../common/Logger';

const TAG = 'WindowOrientation';

/** Avoid-area insets in px. Convert with UIContext.px2vp at the page (docs 11 §4.1 / LY1). */
export class SafeInsets {
  left: number = 0;
  top: number = 0;
  right: number = 0;
  bottom: number = 0;
}

/**
 * Page-level orientation (docs 11 §6.1 / O1 / R-LAND-1).
 * Lock landscape at L-0 (quickstart), not after Table appears.
 * module.json5 stays portrait so lobby is not forced landscape.
 *
 * Use fixed LANDSCAPE — AUTO_ROTATION_LANDSCAPE fights emulator/system
 * (black flash / desktop leak). Identical lock is a no-op so enter-table
 * and return-lobby each call setPreferredOrientation at most once.
 */
export class WindowOrientation {
  private static lastWanted: window.Orientation | null = null;
  private static inFlight: Promise<void> | null = null;

  static async lockLandscape(ctx: common.UIAbilityContext): Promise<void> {
    await WindowOrientation.applyPreferred(ctx, window.Orientation.LANDSCAPE);
  }

  static async lockPortrait(ctx: common.UIAbilityContext): Promise<void> {
    await WindowOrientation.applyPreferred(ctx, window.Orientation.PORTRAIT);
  }

  static async mainWindow(ctx: common.UIAbilityContext): Promise<window.Window | null> {
    try {
      return await window.getLastWindow(ctx);
    } catch (err) {
      Logger.warn(TAG, 'getLastWindow fail-soft');
      return null;
    }
  }

  static readSafeInsets(win: window.Window | null): SafeInsets {
    const out: SafeInsets = new SafeInsets();
    if (win === null) {
      return out;
    }
    WindowOrientation.mergeType(out, win, window.AvoidAreaType.TYPE_SYSTEM);
    WindowOrientation.mergeType(out, win, window.AvoidAreaType.TYPE_CUTOUT);
    WindowOrientation.mergeType(out, win, window.AvoidAreaType.TYPE_SYSTEM_GESTURE);
    WindowOrientation.mergeType(out, win, window.AvoidAreaType.TYPE_NAVIGATION_INDICATOR);
    return out;
  }

  /**
   * Skip setPreferredOrientation when this process already locked `want`.
   * Coalesce overlapping calls so Table aboutToAppear cannot re-twist
   * a window Lobby just locked (system-layer flash).
   */
  private static async applyPreferred(
    ctx: common.UIAbilityContext,
    want: window.Orientation
  ): Promise<void> {
    if (WindowOrientation.lastWanted === want) {
      const label: string = want === window.Orientation.LANDSCAPE ? 'landscape' : 'portrait';
      Logger.info(TAG, `skip want=${label}`);
      return;
    }
    if (WindowOrientation.inFlight !== null) {
      await WindowOrientation.inFlight;
      if (WindowOrientation.lastWanted === want) {
        const label: string = want === window.Orientation.LANDSCAPE ? 'landscape' : 'portrait';
        Logger.info(TAG, `skip want=${label}`);
        return;
      }
    }
    const task: Promise<void> = WindowOrientation.commit(ctx, want);
    WindowOrientation.inFlight = task;
    try {
      await task;
    } finally {
      if (WindowOrientation.inFlight === task) {
        WindowOrientation.inFlight = null;
      }
    }
  }

  private static async commit(
    ctx: common.UIAbilityContext,
    want: window.Orientation
  ): Promise<void> {
    const label: string = want === window.Orientation.LANDSCAPE ? 'landscape' : 'portrait';
    try {
      const win: window.Window = await window.getLastWindow(ctx);
      await win.setPreferredOrientation(want);
      WindowOrientation.lastWanted = want;
      Logger.info(TAG, `commit want=${label} result=ok ts=${Date.now()}`);
    } catch (err) {
      Logger.warn(TAG, `commit want=${label} result=fail ts=${Date.now()}`);
    }
  }

  private static mergeType(out: SafeInsets, win: window.Window, type: window.AvoidAreaType): void {
    try {
      WindowOrientation.mergeAvoid(out, win.getWindowAvoidArea(type));
    } catch (err) {
      Logger.warn(TAG, 'avoidArea type fail-soft');
    }
  }

  private static mergeAvoid(out: SafeInsets, area: window.AvoidArea): void {
    out.left = WindowOrientation.maxEdge(out.left, area.leftRect.width);
    out.top = WindowOrientation.maxEdge(out.top, area.topRect.height);
    out.right = WindowOrientation.maxEdge(out.right, area.rightRect.width);
    out.bottom = WindowOrientation.maxEdge(out.bottom, area.bottomRect.height);
  }

  private static maxEdge(current: number, size: number): number {
    if (size > current) {
      return size;
    }
    return current;
  }
}
