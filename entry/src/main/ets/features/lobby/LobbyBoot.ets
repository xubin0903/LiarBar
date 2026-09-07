/**
 * Cold-start beat lengths on lb_scr_lobby (docs/04-设计/03-开场与大厅交互-v2.md §2).
 * Default axis ~2.0s. Changing BOOT_MS_TOTAL scales every beat; none may be dropped.
 * Total is clamped to [BOOT_MS_MIN, BOOT_MS_MAX] = 1500–2500.
 */
export class LobbyBoot {
  static readonly BOOT_MS_TOTAL: number = 2000;
  static readonly BOOT_MS_MIN: number = 1500;
  static readonly BOOT_MS_MAX: number = 2500;
  static readonly BOOT_MS_SPLASH: number = 350;
  static readonly BOOT_MS_LOAD: number = 550;
  static readonly BOOT_MS_DEALER: number = 400;
  static readonly BOOT_MS_STAGGER: number = 400;
  static readonly BOOT_MS_STEADY: number = 300;
  static readonly BOOT_MS_STAGGER_GAP: number = 80;
  static readonly BOOT_MS_LAYER: number = 220;
  static readonly BOOT_MS_GREET: number = 200;
  static readonly BOOT_MS_LOAD_FADE: number = 150;
  static readonly BOOT_MS_CTA_PRESS: number = 80;
  static readonly BOOT_MS_CTA_RELEASE: number = 110;
  static readonly BOOT_MS_BREATH: number = 1600;
  static readonly BOOT_MS_CANDLE: number = 700;

  static clampTotal(ms: number): number {
    if (ms < LobbyBoot.BOOT_MS_MIN) {
      return LobbyBoot.BOOT_MS_MIN;
    }
    if (ms > LobbyBoot.BOOT_MS_MAX) {
      return LobbyBoot.BOOT_MS_MAX;
    }
    return ms;
  }

  static scaleOf(totalMs: number): number {
    return LobbyBoot.clampTotal(totalMs) / LobbyBoot.BOOT_MS_TOTAL;
  }

  static scaled(baseMs: number, totalMs: number): number {
    return Math.round(baseMs * LobbyBoot.scaleOf(totalMs));
  }

  static plan(totalMs: number): BootMarks {
    const total: number = LobbyBoot.clampTotal(totalMs);
    const marks: BootMarks = new BootMarks();
    marks.splashMs = LobbyBoot.scaled(LobbyBoot.BOOT_MS_SPLASH, total);
    marks.loadMs = LobbyBoot.scaled(LobbyBoot.BOOT_MS_LOAD, total);
    marks.dealerMs = LobbyBoot.scaled(LobbyBoot.BOOT_MS_DEALER, total);
    marks.staggerMs = LobbyBoot.scaled(LobbyBoot.BOOT_MS_STAGGER, total);
    marks.steadyMs = LobbyBoot.scaled(LobbyBoot.BOOT_MS_STEADY, total);
    marks.gapMs = LobbyBoot.scaled(LobbyBoot.BOOT_MS_STAGGER_GAP, total);
    marks.layerMs = LobbyBoot.scaled(LobbyBoot.BOOT_MS_LAYER, total);
    marks.splashAt = 0;
    marks.loadAt = marks.splashMs;
    marks.dealerAt = marks.loadAt + marks.loadMs;
    marks.staggerAt = marks.dealerAt + marks.dealerMs;
    marks.steadyAt = LobbyBoot.clampTotal(marks.staggerAt + marks.staggerMs + marks.steadyMs);
    return marks;
  }
}

export class BootMarks {
  splashAt: number = 0;
  loadAt: number = 0;
  dealerAt: number = 0;
  staggerAt: number = 0;
  steadyAt: number = 0;
  splashMs: number = 0;
  loadMs: number = 0;
  dealerMs: number = 0;
  staggerMs: number = 0;
  steadyMs: number = 0;
  gapMs: number = 0;
  layerMs: number = 0;
}
