/**
 * Cold-start beat lengths on lb_scr_lobby
 * (docs/04-设计/05-开场大厅v3-UI动效挂点.md §A.1).
 * Default axis 3800ms. Total is clamped to [3000, 4500].
 * Short axis scales every visual beat; long axis only stretches T2 + T3.
 * Voice-over is never time-stretched or trimmed.
 */
export class LobbyBoot {
  static readonly BOOT_MS_TOTAL: number = 3800;
  static readonly BOOT_MS_MIN: number = 3000;
  static readonly BOOT_MS_MAX: number = 4500;
  static readonly BOOT_MS_T0: number = 80;
  static readonly BOOT_MS_T1: number = 520;
  static readonly BOOT_MS_T2: number = 800;
  static readonly BOOT_MS_T3: number = 800;
  static readonly BOOT_MS_T4_AT: number = 2200;
  static readonly BOOT_MS_T5: number = 800;
  static readonly BOOT_MS_T5_AT: number = 2500;
  static readonly BOOT_MS_T6: number = 500;
  static readonly BOOT_MS_T6_AT: number = 3300;
  static readonly BOOT_MS_CLICKABLE_AT: number = 3800;
  static readonly BOOT_MS_HIT_AT: number = 180;
  static readonly BOOT_MS_AMB_AT: number = 600;
  static readonly BOOT_MS_AMB_FADE: number = 400;
  static readonly BOOT_MS_BGM_AT: number = 800;
  static readonly BOOT_MS_BGM_FADE: number = 600;
  static readonly BOOT_MS_VO_DEFAULT: number = 2100;
  static readonly BOOT_MS_VO_MIN: number = 1800;
  static readonly BOOT_MS_VO_MAX: number = 2400;
  static readonly BOOT_MS_STAGGER_GAP: number = 100;
  static readonly BOOT_MS_LAYER: number = 260;
  static readonly BOOT_MS_CTA_PRESS: number = 80;
  static readonly BOOT_MS_CTA_RELEASE: number = 110;
  /** R2 hover/focus window (06 §3.2 / 07). Acceptance: visible inside 80–120ms. */
  static readonly BOOT_MS_HOVER: number = 100;
  static readonly BOOT_MS_HOVER_SNAP: number = 16;
  static readonly BOOT_MS_RETURN_ENTER: number = 400;
  static readonly BOOT_MS_T4_LEAD: number = 300;
  static readonly BOOT_MS_ANNOUNCE_CROSS: number = 350;
  static readonly BOOT_MS_ANNOUNCE_HOLD: number = 250;
  static readonly BOOT_MS_IDLE_BACK: number = 400;
  static readonly BOOT_MS_IDLE_CROSS: number = 150;
  static readonly BOOT_MS_GREET_HOLD: number = 400;
  static readonly BOOT_MS_GREET_FADE: number = 200;
  static readonly BOOT_MS_SUBTITLE_MIN: number = 2500;
  static readonly BOOT_MS_DUCK: number = 200;
  static readonly BOOT_MS_LEAVE_BGM: number = 400;
  static readonly BOOT_MS_LEAVE_AMB: number = 300;
  static readonly BOOT_MS_LOAD_FADE: number = 200;
  static readonly BOOT_MS_BREATH: number = 1600;
  static readonly BOOT_MS_CANDLE: number = 700;
  static readonly BOOT_MS_DUST: number = 11000;
  static readonly BOOT_MS_CTA_GLOW: number = 4500;
  static readonly BOOT_MS_TOPBAR_PULSE: number = 6000;
  static readonly BOOT_MS_BLINK: number = 190;
  static readonly BOOT_MS_NOD: number = 620;
  static readonly BOOT_MS_CUP: number = 1250;
  static readonly BOOT_MS_MASK: number = 800;
  static readonly BOOT_MS_BLINK_CD: number = 2800;
  static readonly BOOT_MS_NOD_CD: number = 7000;
  static readonly BOOT_MS_CUP_CD: number = 12000;
  static readonly BOOT_MS_MASK_CD: number = 6000;

  static clampTotal(ms: number): number {
    if (ms < LobbyBoot.BOOT_MS_MIN) {
      return LobbyBoot.BOOT_MS_MIN;
    }
    if (ms > LobbyBoot.BOOT_MS_MAX) {
      return LobbyBoot.BOOT_MS_MAX;
    }
    return ms;
  }

  static voClockMs(silent: boolean): number {
    if (silent) {
      return LobbyBoot.BOOT_MS_VO_DEFAULT;
    }
    return LobbyBoot.BOOT_MS_VO_MAX;
  }

  static idleBackEnd(t4At: number, voMs: number): number {
    return t4At + voMs + LobbyBoot.BOOT_MS_ANNOUNCE_HOLD + LobbyBoot.BOOT_MS_IDLE_BACK;
  }

  static idleLoopStart(clickableAt: number, t4At: number, voMs: number): number {
    const backEnd: number = LobbyBoot.idleBackEnd(t4At, voMs);
    if (clickableAt > backEnd) {
      return clickableAt;
    }
    return backEnd;
  }

  static greetHideAt(t4At: number, voMs: number): number {
    const afterVo: number = t4At + voMs + LobbyBoot.BOOT_MS_GREET_HOLD;
    const floorAt: number = t4At + LobbyBoot.BOOT_MS_SUBTITLE_MIN;
    if (afterVo > floorAt) {
      return afterVo;
    }
    return floorAt;
  }

  static plan(totalMs: number): BootMarks {
    const total: number = LobbyBoot.clampTotal(totalMs);
    const marks: BootMarks = new BootMarks();
    let t0Ms: number = LobbyBoot.BOOT_MS_T0;
    let t1Ms: number = LobbyBoot.BOOT_MS_T1;
    let t2Ms: number = LobbyBoot.BOOT_MS_T2;
    let t3Ms: number = LobbyBoot.BOOT_MS_T3;
    let t4LeadMs: number = LobbyBoot.BOOT_MS_T4_LEAD;
    let t5Ms: number = LobbyBoot.BOOT_MS_T5;
    if (total < LobbyBoot.BOOT_MS_TOTAL) {
      const scale: number = total / LobbyBoot.BOOT_MS_TOTAL;
      t0Ms = Math.round(LobbyBoot.BOOT_MS_T0 * scale);
      t1Ms = Math.round(LobbyBoot.BOOT_MS_T1 * scale);
      t2Ms = Math.round(LobbyBoot.BOOT_MS_T2 * scale);
      t3Ms = Math.round(LobbyBoot.BOOT_MS_T3 * scale);
      t4LeadMs = Math.round(LobbyBoot.BOOT_MS_T4_LEAD * scale);
      t5Ms = Math.round(LobbyBoot.BOOT_MS_T5 * scale);
    } else if (total > LobbyBoot.BOOT_MS_TOTAL) {
      const extra: number = total - LobbyBoot.BOOT_MS_TOTAL;
      const halfExtra: number = Math.floor(extra / 2);
      t2Ms = LobbyBoot.BOOT_MS_T2 + halfExtra;
      t3Ms = LobbyBoot.BOOT_MS_T3 + (extra - halfExtra);
    }
    marks.t0Ms = t0Ms;
    marks.t1Ms = t1Ms;
    marks.t2Ms = t2Ms;
    marks.t3Ms = t3Ms;
    marks.t4LeadMs = t4LeadMs;
    marks.t5Ms = t5Ms;
    marks.t0At = 0;
    marks.t1At = t0Ms;
    marks.t2At = marks.t1At + t1Ms;
    marks.t3At = marks.t2At + t2Ms;
    marks.t4At = marks.t3At + t3Ms;
    marks.t5At = marks.t4At + t4LeadMs;
    marks.t6At = marks.t5At + t5Ms;
    marks.t6Ms = total - marks.t6At;
    marks.clickableAt = total;
    marks.hitAt = marks.t1At + Math.round((LobbyBoot.BOOT_MS_HIT_AT - LobbyBoot.BOOT_MS_T0) * (t1Ms / LobbyBoot.BOOT_MS_T1));
    marks.ambAt = marks.t2At;
    marks.bgmAt = marks.t2At + Math.round((LobbyBoot.BOOT_MS_BGM_AT - LobbyBoot.BOOT_MS_AMB_AT) * (t2Ms / LobbyBoot.BOOT_MS_T2));
    marks.ambFadeMs = LobbyBoot.BOOT_MS_AMB_FADE;
    marks.bgmFadeMs = LobbyBoot.BOOT_MS_BGM_FADE;
    marks.gapMs = LobbyBoot.BOOT_MS_STAGGER_GAP;
    marks.layerMs = LobbyBoot.BOOT_MS_LAYER;
    return marks;
  }
}

export class BootMarks {
  t0At: number = 0;
  t1At: number = 0;
  t2At: number = 0;
  t3At: number = 0;
  t4At: number = 0;
  t5At: number = 0;
  t6At: number = 0;
  clickableAt: number = 0;
  hitAt: number = 0;
  ambAt: number = 0;
  bgmAt: number = 0;
  t0Ms: number = 0;
  t1Ms: number = 0;
  t2Ms: number = 0;
  t3Ms: number = 0;
  t4LeadMs: number = 0;
  t5Ms: number = 0;
  t6Ms: number = 0;
  ambFadeMs: number = 0;
  bgmFadeMs: number = 0;
  gapMs: number = 0;
  layerMs: number = 0;
}

/** Process-scoped: cold axis runs once; later lobby entries use the 0.4s return. */
export class LobbySession {
  private static coldStartPending: boolean = true;

  static takeColdStart(): boolean {
    if (LobbySession.coldStartPending) {
      LobbySession.coldStartPending = false;
      return true;
    }
    return false;
  }
}
