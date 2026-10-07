#!/usr/bin/env python3
"""PR-B break tests (mutation tests) for scripts/prb_client_check.mjs — NOT one of the 18 gates.

Each mutation is applied to a scratch copy of entry/src/main + scripts (the repo itself is never touched);
prb_client_check.mjs must then exit non-zero with a FAIL line containing the expected text.
A final run on the restored copy must be green.

Usage:  python3 scripts/prb_break_tests.py [repo_dir] [-k substring]
Exit 0 = every mutation went red as expected and the restored copy is green.
"""
import os, shutil, subprocess, sys, tempfile

args = [a for a in sys.argv[1:]]
only = ''
if '-k' in args:
    i = args.index('-k')
    only = args[i + 1]
    del args[i:i + 2]
repo = args[0] if args else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
E = 'entry/src/main/ets/'
T, R, LR, LB = E + 'pages/Table.ets', E + 'persist/RecordStore.ets', E + 'common/LbRouter.ets', E + 'pages/Lobby.ets'
TA, SP, AS, ME, MD = (E + 'features/table/TableAudio.ets', E + 'features/table/SoundPlayer.ets', E + 'persist/AudioSettings.ets',
                      E + 'engine/MatchEngine.ets', E + 'common/MatchDirector.ets')
ROOT_PAUSE = "      if (this.pauseLayerOn) {\n        this.pauseLayer()\n      }\n"
LB_PLAY_IF_IDLE = ("      // 补丁轮 3（负责人批）：接手的大厅音频若已在交接窗外被释放（新大厅超过 1000ms 才出现）→ 按当前增益重起；仍在响 → 不动。\n"
                   "      LobbyAudio.playIfIdle();\n")
GONE_AWAIT = ("    if (this.pageGone) {\n      // 补丁轮 3：等路由期间本页已被另一趟 replace 销毁 → 结果不论成败都不回到本页（不解锁、不锁横屏、不恢复导演）。\n"
              "      Logger.warn(TAG, 'leave route settled after the table was destroyed — ignored (no unlock / landscape / resume)');\n      return;\n    }\n")
GONE_REL = ("    if (this.pageGone) {\n      // 补丁轮 3：本页已销毁 → 不锁横屏、不重绑 avoidAreaChange、不恢复导演、不复位锁。\n"
            "      Logger.warn(TAG, 'releaseLeaveLock skipped — table already destroyed');\n      return;\n    }\n")
GONE_TEAR = ("    if (this.pageGone) {\n      // 补丁轮 3：本页已销毁（收尾已由 aboutToDisappear 做过）→ 不再碰已销毁的页面。\n      return;\n    }\n")
GONE_SET = "    this.pageGone = true; // 补丁轮 3：本页已销毁。下一行（负责人 #12 / #6）：离局路由已发起而本页被移走 → 停导演、引擎回 LOBBY 终态。\n"
LA, DA = E + 'features/lobby/LobbyAudio.ets', E + 'features/table/DealAudio.ets'
RP, RM = E + 'pages/Report.ets', E + 'features/report/ReportModel.ets'
PHASE_FLR = ("    if (snap === null || snap.phase === Phase.LOBBY || snap.phase === Phase.RECAP || snap.phase === Phase.END) {\n      return;\n    }\n"
             "    Logger.warn(TAG, 'table removed after leave route was issued")
LA_GUARD = "    if (LobbyAudio.preparedGen === LobbyAudio.gen) {\n      return;\n    }\n    if (LobbyAudio.context === null) {"

# (id + name, file, [(old, new), ...] or old, new, expected FAIL substring)
M = [
 ('B01 read writes back (persist on repair)', E + 'persist/RecordStore.ets',
  "      Logger.info(TAG, 'repaired in memory only — next commitOnce persists it (read never writes)');",
  "      void RecordStore.persist();", 'loadFrom never persists'),
 ('B02 read deletes bad key', E + 'persist/RecordStore.ets',
  "    RecordStore.loaded = true;\n    if (repaired) {",
  "    RecordStore.loaded = true;\n    if (repaired && RecordStore.store !== null) {\n      void RecordStore.store.delete(RecordStore.KEY_RECENT);\n    }\n    if (repaired) {", 'no delete / clear anywhere'),
 ('B01b read writes back right after the store is attached', E + 'persist/RecordStore.ets',
  "      RecordStore.store = store;\n", "      RecordStore.store = store;\n      void RecordStore.persist();\n", 'S21-47 read never writes'),
 ('B02b read deletes a key right after the store is attached', E + 'persist/RecordStore.ets',
  "      RecordStore.store = store;\n", "      RecordStore.store = store;\n      void store.delete(RecordStore.KEY_RECENT);\n", 'S21-47 read never writes'),
 ('B03 volume 37.5 rounded instead of default', E + 'persist/AudioSettings.ets',
  "if (!Number.isInteger(v) || v < AudioSettings.LEVEL_MIN", "if (v < AudioSettings.LEVEL_MIN", 'non-integer 37.5'),
 ('B04 volume 105 not treated as out of range', E + 'persist/AudioSettings.ets',
  " || v > AudioSettings.LEVEL_MAX) {\n      return fallback;", ") {\n      return fallback;", '105'),
 ('B05 settings read writes back', E + 'persist/AudioSettings.ets',
  "    AudioSettings.notify();\n  }\n\n  /** BGM", "    AudioSettings.notify();\n    void AudioSettings.persist();\n  }\n\n  /** BGM", 'lb.settings read never writes'),
 ('B06 bad summary zeroed instead of recomputed', E + 'persist/RecordStore.ets',
  "        RecordStore.summary = RecordStore.recomputeSummary(rp.list);", "        RecordStore.summary = RecordStore.zeroSummary();", 'recomputed from valid records'),
 ('B07 valid summary dropped when details all bad', E + 'persist/RecordStore.ets',
  "        RecordStore.summary = parsed;\n        Logger.warn(TAG, 'recent_v1 all invalid", "        RecordStore.summary = RecordStore.zeroSummary();\n        Logger.warn(TAG, 'recent_v1 all invalid", 'keep summary'),
 ('B08 bad last_match_id → empty instead of newest', E + 'persist/RecordStore.ets',
  "    return list.length > 0 ? list[0].matchId : '';\n  }", "    return '';\n  }", 'newest valid matchId'),
 ('B09 record v not checked', E + 'persist/RecordStore.ets',
  "    if (v !== 1 || matchId.length === 0 || endedAt", "    if (matchId.length === 0 || endedAt", 'v missing / v=2'),
 ('B10 entry A: dialog opened mid-sequence', E + 'pages/Table.ets',
  "cap ${PENDING_CAP_MS}ms)`);\n      return;\n    }", "cap ${PENDING_CAP_MS}ms)`);\n    }", 'leave-pending-entryA'),
 ('B11 leave intent not recorded', E + 'pages/Table.ets',
  "    if (st === PauseState.PENDING) {\n      this.leavePending = true;", "    if (st === PauseState.PENDING) {", 'leave-pending-entryA'),
 ('B12 entry B: already-PENDING (other reason) opens at once', E + 'pages/Table.ets',
  "    if (st === PauseState.PENDING) {", "    if (st === PauseState.PENDING && AppRuntime.director.pauseReasonNow() === PauseReasons.LEAVE_CONFIRM) {", 'leave-pending-entryB (already PENDING)'),
 ('B13 startup race not replayed', E + 'pages/Table.ets',
  "    if (AppRuntime.director.isPaused()) {\n      this.onPauseState(PauseState.PAUSED, 0);\n    }", "", 'startup-race'),
 ('B14 teardown before routing', E + 'pages/Table.ets',
  "    void this.unlockLobbyThenRoute();\n  }", "    this.teardownAfterRoute();\n    void this.unlockLobbyThenRoute();\n  }", 'route-double-fail'),
 ('B15 no routing timeout', E + 'common/LbRouter.ets',
  "        once.settle(false, 'timeout');", "        // no timeout", 'route-timeout'),
 ('B16 late replace failure still calls back()', E + 'common/LbRouter.ets',
  "          if (once.done) {\n            Logger.warn('LbRouter', 'toLobbyOrBack: replace failed after settle — no back()');\n            return;\n          }\n", "", 'route-timeout'),
 ('B17 shift ignores grace', E + 'engine/ResumeShift.ets',
  "    return need > delta ? need : delta;", "    return delta;", 'ResumeShift short pause'),
 ('B18 scheduler old per-entry floor max(remain, 600) instead of uniform shift', E + 'common/PausableScheduler.ets',
  "        this.entries[i].remainMs = this.entries[i].remainMs + extra;", "        this.entries[i].remainMs = Math.max(this.entries[i].remainMs, 600);", 'PausableScheduler + ResumeShift'),
 ('B19 PAU-3: in-flight card frozen', E + 'common/PausableScheduler.ets',
  "      if (e.atomic) {\n        // In-flight segment finishes as a unit (PAU-3); its follow-ups get held.\n        continue;\n      }\n", "", 'PAU-3 deal sim'),
 ('B20 commitOnce dedup removed (S21-17)', E + 'persist/RecordStore.ets',
  "    if (snap.matchId === RecordStore.lastMatchId || snap.matchId === RecordStore.demoClaim) {", "    if (snap.matchId === RecordStore.demoClaim) {", 'S21-17 real RecordStore'),
 ('B21 Report backstop removed', E + 'pages/Report.ets',
  "      RecordStore.commitOnce(snap, recapCommit);", "      void recapCommit;", 'Report.aboutToAppear backstop'),
 ('B22 record > 400 B', E + 'persist/RecordStore.ets',
  "      matchId: snap.matchId,\n      endedAt: endedAt,", "      matchId: snap.matchId + snap.matchId + snap.matchId + snap.matchId,\n      endedAt: endedAt,", '≤ 400 B'),
 ('B24 Builder calls DebugBuild each render', E + 'pages/Table.ets',
  "      if (this.debugPauseOn) {", "      if (DebugBuild.debugPauseShown()) {", 'debug pause button mounted'),
 ('B25 deferred SFX without gain', E + 'features/table/SoundPlayer.ets',
  "const flipGain: number = AudioSettings.sfx01(SoundPlayer.VOL_FLIP);", "const flipGain: number = SoundPlayer.VOL_FLIP;", 'mute_all=true'),
 ('B26 no pause fade-out', E + 'features/table/TableAudio.ets',
  "static readonly PAUSE_FADE_OUT_MS: number = 150;", "static readonly PAUSE_FADE_OUT_MS: number = 0;", 'pause fade-out 150 ms'),
 ('B27 mute_all non-boolean kept', E + 'persist/AudioSettings.ets',
  "    if (typeof raw !== 'boolean') {\n      return AudioSettings.DEFAULT_MUTED;\n    }\n    return raw === true;", "    return raw === true || raw === 'true' || raw === 1;", "mute_all 'true'"),
 ('B28 aboutToDisappear leave-finish removed', E + 'pages/Table.ets',
  "    this.finishLeaveIfRouted();\n", "", 'route-late-success'),
 ('B29 leave-finish also fires on RECAP → Report', E + 'pages/Table.ets',
  "    if (snap === null || snap.phase === Phase.LOBBY || snap.phase === Phase.RECAP || snap.phase === Phase.END) {\n      return;\n    }\n    Logger.warn(TAG, 'table removed",
  "    if (snap === null || snap.phase === Phase.LOBBY) {\n      return;\n    }\n    Logger.warn(TAG, 'table removed", 'normal page exits'),
 ('B30 leaveRouteIssued reset on timeout unlock', E + 'pages/Table.ets',
  "    this.leavePending = false;\n    // 局面没拆", "    this.leavePending = false;\n    this.leaveRouteIssued = false;\n    // 局面没拆", 'route-late-success'),
 ('B31 Number(x)||0 in record field parse', E + 'persist/RecordStore.ets',
  "    if (typeof v !== 'number') {\n      return -1;\n    }\n    const n: number = Number(v);", "    const n: number = Number(v) || 0;", 'string count'),
 ('B32 settings volume truncated (clamp) instead of default', E + 'persist/AudioSettings.ets',
  "    if (!Number.isInteger(v) || v < AudioSettings.LEVEL_MIN || v > AudioSettings.LEVEL_MAX) {\n      return fallback;\n    }",
  "    if (!Number.isInteger(v)) {\n      return fallback;\n    }\n    if (v < AudioSettings.LEVEL_MIN || v > AudioSettings.LEVEL_MAX) {\n      return Math.min(AudioSettings.LEVEL_MAX, Math.max(AudioSettings.LEVEL_MIN, v));\n    }", '-5 / 2.5'),
 ('B33 (a) stale leave trip never voided (reused forever)', E + 'common/LbRouter.ets',
  "        if (trip !== null && now - trip.issuedAtMs >= timeoutMs) {", "        if (false) {", 'leave-token'),
 ('B34 (a) finishLeaveOnce not once-only (token claim removed in Table)', E + 'pages/Table.ets',
  "    if (!LbRouter.claimLeaveFinish()) {\n      return false;\n    }\n", "", 'leave-token'),
 ('B35 (b) leave-finish without leave flag / phase guards', E + 'pages/Table.ets',
  "    if (!this.leaveRouteIssued) {\n      return;\n    }\n    const snap: MatchSnapshot | null = AppRuntime.engine.current();\n    if (snap === null || snap.phase === Phase.LOBBY || snap.phase === Phase.RECAP || snap.phase === Phase.END) {\n      return;\n    }\n",
  "", 'recap-normal-exit'),
 ('B36 (b) aboutToDisappear always finishes the leave', E + 'pages/Table.ets',
  "    this.finishLeaveIfRouted();\n", "    this.finishLeaveOnce('always');\n", 'recap-normal-exit'),
 ('B37 (c) leave does not release table audio', E + 'pages/Table.ets',
  "    TableAudio.clearGamePause();\n    TableAudio.leaveThenRelease();\n", "    TableAudio.clearGamePause();\n", 'audio-exit-paused'),
 ('B38 (c) leave keeps pending SFX', E + 'features/table/TableAudio.ets',
  "  static leaveThenRelease(): void {\n    TableAudio.bedsWanted = false;\n    TableAudio.clearPendings();\n", "  static leaveThenRelease(): void {\n    TableAudio.bedsWanted = false;\n", 'audio-exit-release'),
 ('B39 (c) leave resumes paused BGM', E + 'pages/Table.ets',
  "    TableAudio.clearGamePause();\n    TableAudio.leaveThenRelease();\n", "    TableAudio.resumeForGame();\n    TableAudio.leaveThenRelease();\n", 'audio-exit-paused'),
 ('B40 (c) SoundPlayer not released on leave', E + 'pages/Table.ets',
  "    DealAudio.release();\n    SoundPlayer.release();\n", "    DealAudio.release();\n", 'audio-exit-paused'),
 ('B41 (c) leaveThenRelease fades BGM back in', E + 'features/table/TableAudio.ets',
  "  static leaveThenRelease(): void {\n    TableAudio.bedsWanted = false;", "  static leaveThenRelease(): void {\n    TableAudio.startBgm(TableAudio.BGM_FADE_IN_MS);\n    TableAudio.bedsWanted = false;", 'audio-exit-paused-no-resume'),
 ('B42 (c) TableAudio.prepareBed: no generation check after createAVPlayer', E + 'features/table/TableAudio.ets',
  "      const player: media.AVPlayer = await media.createAVPlayer();\n      if (TableAudio.gen !== gen) {\n        // release 已在 createAVPlayer 挂起时发生：立刻释放，不登记、不挂回调、不播放。\n        TableAudio.dropStalePlayer(player);\n        return;\n      }\n      const rawFd: resourceManager.RawFileDescriptor = await ctx.resourceManager.getRawFd(PATH_BGM);\n      if (TableAudio.gen !== gen) {\n        TableAudio.dropStalePlayer(player);\n        ctx.resourceManager.closeRawFd(PATH_BGM).catch((err: BusinessError): void => {\n          Logger.warn(TAG, `closeRawFd fail-soft: ${err.message}`);\n        });\n        return;\n      }\n",
  "      const player: media.AVPlayer = await media.createAVPlayer();\n      const rawFd: resourceManager.RawFileDescriptor = await ctx.resourceManager.getRawFd(PATH_BGM);\n",
  'stale-prepare AVPlayer: prepare hung'),
 ('B43 (c) TableAudio.prepare: no generation check after createSoundPool', E + 'features/table/TableAudio.ets',
  "      if (TableAudio.gen !== gen) {\n        TableAudio.dropStalePool(pool);\n        return;\n      }\n", "", 'stale-prepare SoundPool'),
 ('B44 (c) DealAudio.prepare: no generation check after createSoundPool', E + 'features/table/DealAudio.ets',
  "      if (DealAudio.gen !== gen) {\n        Logger.info(TAG, 'stale deal pool (created after release) — released, not registered');", "      if (false) {\n        Logger.info(TAG, 'stale deal pool (created after release) — released, not registered');", 'stale-prepare DealAudio: prepare hung'),
 ('B45 (c) SoundPlayer: renderer created after release registered', E + 'features/table/SoundPlayer.ets',
  "        if (SoundPlayer.gen !== gen) {\n          // release 已在建 renderer 挂起时发生：立刻释放，不登记。\n          SoundPlayer.releaseOneRenderer(flip);\n          return;\n        }\n", "", 'SoundPlayer: release() bumps gen'),
 ('B46 (c) LobbyAudio: AVPlayer created after release registered', E + 'features/lobby/LobbyAudio.ets',
  "      const player: media.AVPlayer = await media.createAVPlayer();\n      if (LobbyAudio.gen !== gen) {\n        LobbyAudio.dropStalePlayer(player);\n        return true;\n      }\n", "      const player: media.AVPlayer = await media.createAVPlayer();\n", 'LobbyAudio: release() bumps gen'),
 ('B47 RecordStore static initializer calls a method again', E + 'persist/RecordStore.ets',
  "  private static summary: RecordSummaryV1 | null = null;", "  private static summary: RecordSummaryV1 | null = RecordStore.zeroSummary();", 'RecordStore: no method call in any static initializer'),
 ('B48 lb_tog_silent id renamed', E + 'common/Ids.ets',
  "static readonly SILENT: string = 'lb_tog_silent';", "static readonly SILENT: string = 'lb_tog_mute';", "ControlIds.SILENT = 'lb_tog_silent' unchanged"),
 ('B49 lb.settings key renamed (vol_bgm → bgm_vol)', E + 'persist/AudioSettings.ets',
  "  static readonly KEY_BGM: string = 'vol_bgm';", "  static readonly KEY_BGM: string = 'bgm_vol';", 'lb.settings keys vol_bgm / vol_sfx / mute_all'),
 ('B50 pause layer id not bound', E + 'pages/Table.ets',
  "    .id(ControlIds.PAUSE_LAYER)\n", "", "ControlIds.PAUSE_LAYER = 'lb_cmp_pause_layer' bound once in Table"),
 ('B51 REVEAL_HOLD_MS comment back to 5000', E + 'pages/Table.ets',
  "face-up REVEAL_HOLD_MS(3000); ban instant cut", "face-up REVEAL_HOLD_MS(5000); ban instant cut", 'REVEAL_HOLD_MS comment matches code (3000)'),
 ('B52 「静默」 back in AudioSettings comment', E + 'persist/AudioSettings.ets',
  " * 静音（mute_all）= 两轨同乘 0", " * 静默（mute_all）= 两轨同乘 0", '「静默」→「静音」'),
 # ---------------- patch round 2 / 3 (2026-10-07) ----------------
 # A / 5. leave token
 ('B53 Lobby ignores the token (stale lobby re-inits)', LB,
  "    if (!this.lobbyInit) {\n" + LB_PLAY_IF_IDLE + "      this.renderOnly();\n      return;\n    }\n", "", 'leave-token'),
 ('B54 claimLobbyInit never says render-only', LR,
  "    if (ours && LbRouter.lobbyTokenSession === LbRouter.leaveSession) {", "    if (false) {", 'leave-token'),
 ('B55 claimLeaveFinish always grants (stop / toLobby twice)', LR,
  "    if (LbRouter.finishedSession === LbRouter.leaveSession) {", "    if (false) {", 'leave-token'),
 ('B56 releaseLeaveLock auto re-sends replace (no player confirm)', T,
  "    this.resumeIfLeavePause();\n    void this.lockTableWindow();\n  }",
  "    this.resumeIfLeavePause();\n    void this.lockTableWindow();\n    void this.unlockLobbyThenRoute();\n  }", 'leave-token'),
 ('B57 re-send without top-is-Table check', LR, "          if (!LbRouter.tableOnTop()) {", "          if (false) {", 'leave-retry-top-not-table'),
 ('B58 Lobby releases audio on disappear without handover', LB,
  "    LbRouter.lobbyDisappearing(this.lobbyKey, (): void => {\n      LobbyAudio.leaveThenRelease();\n    });",
  "    LobbyAudio.leaveThenRelease();", 'leave-token'),
 ('B59 render-only lobby restarts the beds (BGM play twice)', LB,
  "    if (this.lobbyInit) {\n      // 只渲染的大厅沿用上一个大厅正在响的床，不重新 play。\n      LobbyAudio.startReturnBeds(LobbyBoot.BOOT_MS_RETURN_ENTER);\n    }",
  "    LobbyAudio.startReturnBeds(LobbyBoot.BOOT_MS_RETURN_ENTER);", 'leave-token'),
 ('B60 no-ticket lobby treated as stale (cold start / Report → Lobby)', LB,
  "    this.lobbyInit = LbRouter.claimLobbyInit(LbRouter.leaveTicketFromRoute());",
  "    this.lobbyInit = LbRouter.leaveTicketFromRoute() > 0 && LbRouter.claimLobbyInit(LbRouter.leaveTicketFromRoute());", 'leave-token controls'),
 # B / 1. pause layer mount
 ('B61 pause layer back inside the desk Stack', T,
  [(ROOT_PAUSE, ""), ("        this.homeExitChrome()\n", "        this.homeExitChrome()\n        if (this.pauseLayerOn) {\n          this.pauseLayer()\n        }\n")],
  None, 'pause layer mount'),
 ('B62 pause layer mounted before the fly card', T,
  [(ROOT_PAUSE, ""), ("      if (this.flyOn) {\n", ROOT_PAUSE + "      if (this.flyOn) {\n")], None, 'pause layer mount'),
 ('B63 pause layer not expanded over safe areas', T,
  "    .expandSafeArea([SafeAreaType.SYSTEM, SafeAreaType.CUTOUT],\n      [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM, SafeAreaEdge.START, SafeAreaEdge.END])\n    // Default",
  "    // Default", 'pause layer full screen'),
 ('B64 pause layer lets taps through (Transparent)', T,
  "    .hitTestBehavior(HitTestMode.Default)\n    .zIndex(PAUSE_LAYER_Z)", "    .hitTestBehavior(HitTestMode.Transparent)\n    .zIndex(PAUSE_LAYER_Z)", 'pause layer full screen'),
 # 2. play gating on pause
 ('B65 pause with sheet open: sheet hidden but selection / engine pick kept', T,
  "      if (this.showPlay) {\n        this.cancelPlaySheet();\n      }\n", "      if (this.showPlay) {\n        this.showPlay = false;\n      }\n", 'pause-closes-play-sheet'),
 ('B66 pause always clears the hand selection (PAU-12b)', T,
  "      if (this.showPeek) {\n        void this.closePeek();\n      }\n",
  "      if (this.showPeek) {\n        void this.closePeek();\n      }\n      this.selectedIds = [];\n", 'pause-keeps-hand-select'),
 ('B67 pause leaves peek open', T, "      if (this.showPeek) {\n        void this.closePeek();\n      }\n", "", 'pause-closes-play-sheet'),
 ('B68 Table.beginHumanPlay pause gate removed', T,
  "    if (AppRuntime.director.isPaused()) {\n      // 补丁轮 2 第 2 条：已暂停 → 不出牌（不飞牌、不放音、不 submitPlay）。\n      return;\n    }\n", "", 'pause-gate Table.beginHumanPlay'),
 ('B69 MatchEngine.submitPlay pause gate removed', ME,
  "    if (this.clockPausedAt > 0) {\n      // 补丁轮 2 第 2 条：局内暂停中不收出牌（纯加法守卫，规则 / 质疑 / 判定不变）。\n      return false;\n    }\n", "", 'pause-gate MatchEngine.submitPlay'),
 # 3. RecordStore.init / S21-47
 ('B70 RecordStore.init assigns store before the gets + persist ignores !loaded (old bug)', R,
  [("      const rawRecent: preferences.ValueType = await store.get(", "      RecordStore.store = store;\n      const rawRecent: preferences.ValueType = await store.get("),
   ("    if (store === null || !RecordStore.loaded) {", "    if (store === null) {")], None, 'RecordStore.init get throws'),
 ('B71 self-contradictory record (WIN, rank≠1) kept', R,
  "    if ((quit === 1 && result === RecordResult.WIN) || (result === RecordResult.WIN && rank !== 1)) {",
  "    if (quit === 1 && result === RecordResult.WIN) {", 'WIN but rank≠1'),
 ('B72 summary below recomputed not recomputed', R,
  "    if (total < floor.total || wins < floor.wins || quits < floor.quits || doubts < floor.doubts || doubtHits < floor.doubtHits) {",
  "    if (false) {", 'below recomputed'),
 ('B73 wins+quits > total accepted', R,
  "    if (wins > total || quits > total || wins + quits > total || doubtHits > doubts) {",
  "    if (wins > total || quits > total || doubtHits > doubts) {", 'wins+quits > total'),
 ('B74 summary above recomputed recomputed anyway (false kill)', R,
  "    if (total < floor.total || wins < floor.wins", "    if (total !== floor.total || wins < floor.wins", 'no false kill'),
 ('B75 volume 37 not rounded to 35', AS,
  "    return Math.round(v / AudioSettings.LEVEL_STEP) * AudioSettings.LEVEL_STEP;\n  }\n\n  /** mute_all",
  "    return v;\n  }\n\n  /** mute_all", '37→35'),
 ('B76 bad last_match_id crashes the read (write lost)', R,
  "  private static parseLastMatchId(raw: preferences.ValueType, list: MatchRecordV1[]): string {\n",
  "  private static parseLastMatchId(raw: preferences.ValueType, list: MatchRecordV1[]): string {\n    if (typeof raw !== 'string') {\n      throw new Error('bad last_match_id');\n    }\n",
  'bad last_match_id → next commitOnce'),
 # 4. SoundPlayer pending
 ('B77 SoundPlayer.pauseForGame keeps pendingFlip / pendingExt', SP,
  "  static pauseForGame(): void {\n    SoundPlayer.pendingFlip = 0;\n    SoundPlayer.pendingExt = 0;\n  }", "  static pauseForGame(): void {\n  }",
  'SoundPlayer.pauseForGame clears'),
 ('B78 Table pause does not call SoundPlayer.pauseForGame', T, "      SoundPlayer.pauseForGame();\n", "", 'pause-closes-play-sheet'),
 # 6 / 9. mute + SFX=0 (real AudioSettings → TableAudio / SoundPlayer)
 ('B79 AudioSettings.sfx01 ignores mute', AS,
  "    return AudioSettings.clamp01(slotVolume * AudioSettings.sfxGain());", "    return AudioSettings.clamp01(slotVolume * AudioSettings.sfx / 100);", 'mute_all=true'),
 ('B80 drainPending uses sfx01(..) || VOL_*', SP,
  [("const flipGain: number = AudioSettings.sfx01(SoundPlayer.VOL_FLIP);", "const flipGain: number = AudioSettings.sfx01(SoundPlayer.VOL_FLIP) || SoundPlayer.VOL_FLIP;"),
   ("const extGain: number = AudioSettings.sfx01(SoundPlayer.VOL_EXTINGUISH);", "const extGain: number = AudioSettings.sfx01(SoundPlayer.VOL_EXTINGUISH) || SoundPlayer.VOL_EXTINGUISH;")],
  None, 'mute_all=true'),
 ('B81 AudioSettings.bgm01 ignores mute', AS,
  "    return AudioSettings.clamp01(bedVolume * AudioSettings.bgmGain());", "    return AudioSettings.clamp01(bedVolume * AudioSettings.bgm / 100);", 'mute_all=true'),
 # 8. TableAudio quick resume
 ('B82 resumeForGame does not cancel the running pause fade-out', TA,
  "    // 作废还在跑的暂停淡出（否则它跑完照样 pause()）。\n    TableAudio.bgmFadeId = TableAudio.clearIntervalId(TableAudio.bgmFadeId);\n",
  "", 'quick resume'),
 ('B83 resumeForGame back to plain startBgm (pre-fix)', TA,
  "    // 作废还在跑的暂停淡出（否则它跑完照样 pause()）。\n    TableAudio.bgmFadeId = TableAudio.clearIntervalId(TableAudio.bgmFadeId);\n    const player: media.AVPlayer | null = TableAudio.bgmPlayer;\n    if (!TableAudio.bgmReady || player === null) {\n      TableAudio.startBgm(TableAudio.RESUME_FADE_IN_MS);\n      return;\n    }\n",
  "    TableAudio.startBgm(TableAudio.RESUME_FADE_IN_MS);\n    return;\n", 'quick resume'),
 # gate corrections
 ('B84 hard cut right after starting the pause fade', TA,
  "      TableAudio.fadeBgm(TableAudio.bgmVol, 0, TableAudio.PAUSE_FADE_OUT_MS);\n    } else {",
  "      TableAudio.fadeBgm(TableAudio.bgmVol, 0, TableAudio.PAUSE_FADE_OUT_MS);\n      TableAudio.stopBedsNow();\n    } else {", 'pause fade-out 150 ms'),
 ('B85 onLoaded pause gate removed', TA,
  "  private static onLoaded(soundId: number): void {\n    if (TableAudio.gamePaused) {\n      // 暂停中资源加载完：不补播（pauseForGame 已清挂起项，这里再挡一次）。\n      return;\n    }\n",
  "  private static onLoaded(soundId: number): void {\n", 'onLoaded gate anchored'),
 # gate coverage gaps (real MatchDirector / MatchEngine.resumeClock)
 ('B86 director never enters PENDING', MD, "    if (!hard && this.sequenceBusy(snap)) {", "    if (false) {", 'real MatchDirector: pause during a sequence'),
 ('B87 PENDING_CAP_MS never fires', MD,
  "const capped: boolean = this.pendingSinceMs > 0 && Date.now() - this.pendingSinceMs >= PENDING_CAP_MS;", "const capped: boolean = false;",
  'real MatchDirector PENDING_CAP_MS'),
 ('B88 resumeClock skips the penalty deadline', ME, "      this.penaltyEndsAtMs = this.penaltyEndsAtMs + shift;\n", "", 'real resumeFromPause'),
 # ---------------- patch round 3 / 3 (2026-10-07 night) ----------------
 # 1. pageGone (blocker): each site on its own + never set
 ('B89 pageGone check after the routing await removed', T, GONE_AWAIT, "", 'leave-pageGone ['),
 ('B90 pageGone check in releaseLeaveLock removed', T, GONE_REL, "", 'leave-pageGone sites'),
 ('B91 pageGone check in teardownAfterRoute removed', T, GONE_TEAR, "", 'leave-pageGone sites'),
 ('B92 aboutToDisappear never sets pageGone', T, GONE_SET, "", 'leave-pageGone ['),
 # 2. two matches in one run + toTable HiLog
 ('B93 toTable does not open a new leave session', LR, "    LbRouter.beginLeaveSession();\n    return LbRouter.push(PageUrls.TABLE);", "    return LbRouter.push(PageUrls.TABLE);", 'leave-two-matches'),
 ('B94 toTable HiLog for an in-flight leave replace removed', LR,
  "    if (LbRouter.tripsInFlight > 0) {\n", "    if (false) {\n", 'leave-pageGone ['),
 # 3. save-file gaps
 ('B95 quits dropped from the below-recomputed check', R, " || quits < floor.quits", "", 'only quits below recomputed'),
 ('B96 doubts dropped from the below-recomputed check', R, " || doubts < floor.doubts", "", 'only doubts below recomputed'),
 ('B97 both-bad load never marks the store loaded (next commitOnce not persisted)', R,
  "        Logger.warn(TAG, 'recent_v1 + summary_v1 both invalid — clear records (new player, 21 §2.6)');\n",
  "        Logger.warn(TAG, 'recent_v1 + summary_v1 both invalid — clear records (new player, 21 §2.6)');\n        return true;\n", 'both bad → cleared in memory'),
 ('B98 lb.settings get throws midway → stale values kept', AS,
  "      AudioSettings.bgm = AudioSettings.DEFAULT_BGM;\n      AudioSettings.sfx = AudioSettings.DEFAULT_SFX;\n      AudioSettings.muted = AudioSettings.DEFAULT_MUTED;\n      Logger.warn(TAG, 'preferences load fail-soft",
  "      Logger.warn(TAG, 'preferences load fail-soft", 'one get throws midway'),
 # 4. gain real-runs (art: full volume when gain > 0 / gain dropped)
 ('B99 SoundPlayer.playNamed full volume when gain > 0', SP,
  "    const gained: number = AudioSettings.sfx01(volume);", "    const gained: number = AudioSettings.sfx01(volume) > 0 ? volume : 0;", 'SoundPlayer.playNamed main path'),
 ('B100 (x2) SoundPlayer.playNamed drops the gain (raw VOL)', SP,
  "    const gained: number = AudioSettings.sfx01(volume);", "    const gained: number = volume;", 'SoundPlayer.playNamed main path'),
 ('B101 TableAudio.playShot full volume when gain > 0', TA,
  "    const gained: number = AudioSettings.sfx01(volume);", "    const gained: number = AudioSettings.sfx01(volume) > 0 ? volume : 0;", 'TableAudio.playShot main path'),
 ('B102 (x3) TableAudio.playShot drops the gain (raw VOL)', TA,
  "    const gained: number = AudioSettings.sfx01(volume);", "    const gained: number = volume;", 'TableAudio.playShot main path'),
 ('B103 LobbyAudio.fadeBgm full volume when gain > 0', LA,
  "      LobbyAudio.bgmVol = vol;\n      player.setVolume(AudioSettings.bgm01(vol));",
  "      LobbyAudio.bgmVol = vol;\n      player.setVolume(AudioSettings.bgm01(vol) > 0 ? vol : 0);", 'LobbyAudio gain real-run'),
 ('B104 (x4) LobbyAudio.fadeBgm drops the gain (fade target ignores gain)', LA,
  "      LobbyAudio.bgmVol = vol;\n      player.setVolume(AudioSettings.bgm01(vol));",
  "      LobbyAudio.bgmVol = vol;\n      player.setVolume(vol);", 'LobbyAudio gain real-run'),
 ('B105 TableAudio.fadeBgm full volume when gain > 0 (quick resume target)', TA,
  "      player.setVolume(AudioSettings.bgm01(vol));", "      player.setVolume(AudioSettings.bgm01(vol) > 0 ? vol : 0);", 'quick resume at gain 0.5'),
 # 5. render-only lobby: LobbyAudio.playIfIdle (PM approved)
 ('B106 render-only lobby does not call playIfIdle', LB, LB_PLAY_IF_IDLE, "", 'lobby-bgm-late-render-only'),
 ('B107 render-only lobby plays unconditionally (startReturnBeds = play() again)', LB,
  "      LobbyAudio.playIfIdle();\n", "      LobbyAudio.startReturnBeds(LobbyBoot.BOOT_MS_RETURN_ENTER);\n", 'lobby-bgm-fast-render-only'),
 ('B108 playIfIdle no-op guard removed (rebuild / re-play while BGM plays)', LA,
  "    if (LobbyAudio.preparedGen === LobbyAudio.gen) {\n      Logger.info(TAG, 'playIfIdle: lobby beds already playing",
  "    if (false) {\n      Logger.info(TAG, 'playIfIdle: lobby beds already playing", 'lobby-bgm-fast-render-only'),
 ('B109 playIfIdle does not cancel the leave-fade release', LA,
  "        clearTimeout(LobbyAudio.releaseTimer);\n        LobbyAudio.releaseTimer = -1;\n        LobbyAudio.bedsWanted = true;\n",
  "        LobbyAudio.bedsWanted = true;\n", 'lobby-bgm-late-render-only'),
 # 6. 补丁轮 3/3 追补：tripsInFlight 落地 / 失败回 0 + 防重复收尾「阶段判断」层（负责人批，进 #296）
 ('B110 reject path of the issued replace no longer calls clearTrip (failed trip stays in flight)', LR,
  "          }, (): void => {\n            LbRouter.clearTrip(issued);\n          });",
  "          }, (): void => {\n          });", 'leave-tripsInFlight replace rejects'),
 ('B111 clearTrip decrements only for the current trip (voided old trip landing never decrements)', LR,
  "    LbRouter.tripsInFlight = Math.max(0, LbRouter.tripsInFlight - 1);\n    if (LbRouter.leaveTrip === trip) {\n      LbRouter.leaveTrip = null;\n    }",
  "    if (LbRouter.leaveTrip === trip) {\n      LbRouter.tripsInFlight = Math.max(0, LbRouter.tripsInFlight - 1);\n      LbRouter.leaveTrip = null;\n    }",
  'leave-tripsInFlight voided old trip lands late'),
 ('B112 phase check removed from finishLeaveIfRouted (terminal LOBBY / RECAP / END no longer blocks a second finish)', T,
  "    if (snap === null || snap.phase === Phase.LOBBY || snap.phase === Phase.RECAP || snap.phase === Phase.END) {\n      return;\n    }\n    Logger.warn(TAG, 'table removed after leave route was issued",
  "    if (snap === null) {\n      return;\n    }\n    Logger.warn(TAG, 'table removed after leave route was issued", 'leave-phase layer'),
 # 追补：路由先成功、旧页后消失的端到端顺序（测试发现两层一起删时收尾翻倍而端到端不红）。B113 按负责人要求是「令牌 + LOBBY 分支」组合删（同一文件两处），其余均为单处。
 ('B113 leave token AND the LOBBY branch of the phase check deleted together (route-first order finishes twice)', T,
  [("    if (!LbRouter.claimLeaveFinish()) {\n      return false;\n    }\n", ""), (PHASE_FLR, PHASE_FLR.replace(" || snap.phase === Phase.LOBBY", ""))],
  None, 'leave-route-first'),
 ('B114 only the LOBBY branch of the phase check deleted (token kept)', T, PHASE_FLR, PHASE_FLR.replace(" || snap.phase === Phase.LOBBY", ""), 'leave-phase layer'),
 # 追补（美术阻塞项）：LobbyAudio.prepare() 同代守卫（本轮 playIfIdle 引入的二次 prepare）
 ('B115 prepare() same-gen guard removed → same-tick double lobby builds 2 pools / 4 players', LA, LA_GUARD, "    if (LobbyAudio.context === null) {", 'lobby-audio same-tick double lobby'),
 ('B116 prepare() same-gen guard removed → push-stay-return lobby prepares again', LA, LA_GUARD, "    if (LobbyAudio.context === null) {", 'lobby-audio push-stay-return prepare guard'),
 ('B117 prepare() guard over-blocks (ignores gen: preparedGen >= 0) → no rebuild after a real release', LA,
  "    if (LobbyAudio.preparedGen === LobbyAudio.gen) {\n      return;\n    }\n    if (LobbyAudio.context === null) {",
  "    if (LobbyAudio.preparedGen >= 0) {\n      return;\n    }\n    if (LobbyAudio.context === null) {", 'lobby-audio release-then-return'),
# 7. 进桌后大厅 BGM 淡出票（负责人，#296 之后）：onPageHide 淡出暂停 / onPageShow → playIfIdle / 同代 prepare 失败重试 / await 期间并发守卫 / 3 秒内二次离局
('B118 Lobby.onPageHide no longer fades the lobby beds out (lobby BGM keeps playing under the table)', LB,
 "  onPageHide(): void {\n    LobbyAudio.fadeOutForHide();\n  }", "  onPageHide(): void {\n  }", 'lobby-bgm-hide-on-push'),
('B119 Lobby.onPageShow does not call playIfIdle (back to the lobby stays silent)', LB,
 "    if (!LobbyAudio.isPausedByHide()) {\n      return;\n    }\n    LobbyAudio.playIfIdle();\n", "    if (!LobbyAudio.isPausedByHide()) {\n      return;\n    }\n", 'lobby-bgm-show-after-back'),
('B120 same-gen prepare failure: preparedGen reset removed (no retry in this gen)', LA,
 "    Logger.warn(TAG, 'prepare incomplete — same gen may retry on the next lobby show');\n    LobbyAudio.retryGen = gen;\n    LobbyAudio.preparedGen = -1;\n",
 "    Logger.warn(TAG, 'prepare incomplete — same gen may retry on the next lobby show');\n    LobbyAudio.retryGen = gen;\n", 'lobby-audio prepare retry after createSoundPool failure'),
('B121 createSoundPool failure branch not reported (preparePool catch returns ok → no retry)', LA,
 "      LobbyAudio.dropPool();\n      return false;", "      LobbyAudio.dropPool();\n      return true;", 'lobby-audio prepare retry after createSoundPool failure'),
('B122 bed-build failure branch not reported (prepareBed catch returns ok → no retry)', LA,
 "        LobbyAudio.dropStalePlayer(made);\n      }\n      return false;", "        LobbyAudio.dropStalePlayer(made);\n      }\n      return true;", 'lobby-audio prepare retry after createAVPlayer failure'),
('B123 prepare() guard also requires a pool (`&& pool !== null`) → 2nd prepare during the createSoundPool await builds a 2nd pool', LA, LA_GUARD,
 LA_GUARD.replace("LobbyAudio.preparedGen === LobbyAudio.gen) {", "LobbyAudio.preparedGen === LobbyAudio.gen && LobbyAudio.pool !== null) {"), 'lobby-audio prepare guard during the await'),
('B124 clearTrip only decrements tripsInFlight, does not clear leaveTrip (2nd leave within 3 s reuses the landed trip)', LR,
 "    LbRouter.tripsInFlight = Math.max(0, LbRouter.tripsInFlight - 1);\n    if (LbRouter.leaveTrip === trip) {\n      LbRouter.leaveTrip = null;\n    }",
 "    LbRouter.tripsInFlight = Math.max(0, LbRouter.tripsInFlight - 1);", 'leave-twice-within-3s'),
('B125 startReturnBeds ignores resumedOnShow (init lobby play()s again after the onPageShow resume)', LA,
 "    if (LobbyAudio.resumedOnShow) {\n      // 本次显示里", "    if (false) {\n      // 本次显示里", 'lobby-bgm-hide-on-push'),
('B126 shown again inside the 400 ms fade re-plays (no fade-back branch)', LA,
 "    if (LobbyAudio.hideTimer >= 0 && bgm !== null && LobbyAudio.bgmReady) {", "    if (false && bgm !== null) {", 'lobby-bgm-show-after-back'),
('B127 setSilent(false) while already audible re-plays the beds (begin() of the return lobby)', LA,
 "    if (wasSilent && LobbyAudio.bedsWanted) {", "    if (LobbyAudio.bedsWanted) {", 'lobby-bgm-hide-on-push'),
('B128 onPageHide pauses at once (no 400 ms fade)', LA,
 "    LobbyAudio.fadeBgm(LobbyAudio.bgmVol, 0, LobbyAudio.HIDE_FADE_MS);\n    LobbyAudio.fadeAmb(LobbyAudio.ambVol, 0, LobbyAudio.HIDE_FADE_MS);\n",
 "    LobbyAudio.stopBedsNow();\n", 'lobby-bgm-hide-on-push'),
('B129 onPageHide fades but never pauses', LA,
 "      LobbyAudio.hideTimer = -1;\n      LobbyAudio.stopBedsNow();\n", "      LobbyAudio.hideTimer = -1;\n", 'lobby-bgm-hide-on-push'),
# 结算面板 PR（2a）：RPT-11 真跑 / playLog / ReportModel / 再来一局
('B130 RPT-11 commitOnce moved from Report.aboutToAppear to the leave path', RP,
 [("      RecordStore.commitOnce(snap, recapCommit);\n", ""),
  ("    this.leaving = true;\n    AppRuntime.director.stop();\n",
   "    this.leaving = true;\n    const s0: MatchSnapshot | null = AppRuntime.engine.current();\n    if (s0 !== null) {\n"
   "      RecordStore.commitOnce(s0, { quit: false, isDemo: AppRuntime.engine.isDemoMatch(), ff: false, pausedMs: 0 });\n    }\n"
   "    AppRuntime.director.stop();\n")], None, 'RPT-11 ⓐ real Report commits on appear'),
('B131 commitOnce last_match_id dedup removed', R,
 "    if (snap.matchId === RecordStore.lastMatchId || snap.matchId === RecordStore.demoClaim) {",
 "    if (snap.matchId === RecordStore.demoClaim) {", 'RPT-11 ⓑ director wrote first'),
('B132 rollbackLastPlay does not pop playLog', ME,
 "    this.playLog.popLast(actor);\n", "", 'real engine methods: commitPicked append / rollbackLastPlay pop'),
('B133 playLog copy exposed mid-match', ME,
 "    if (this.phase !== Phase.RECAP && this.phase !== Phase.END) {\n      return [];\n    }\n    return this.playLog.entries();",
 "    return this.playLog.entries();", 'real engine methods: commitPicked append'),
('B134 replay {手} filled with card count instead of seq', RM,
 "      `${e.seq}`,\n", "      `${e.count}`,\n", 'replay target = last judged hand involving the human'),
('B135 three cards only when all three enter (failing card hidden)', RM,
 "    v.showCards = b !== null || d !== null || u !== null;", "    v.showCards = b !== null && d !== null && u !== null;", '§1.4.3a rule 1'),
('B136 fallback always hl_none (quiet case lost)', RM,
 "judged ? 'lb_str_hl_quiet' : 'lb_str_hl_none'", "'lb_str_hl_none'", '§1.4.3a rule 2 / 3'),
('B137 H1 tie-break prefers the smaller fake sum', RM,
 "      return a.fakeSum > b.fakeSum;", "      return a.fakeSum < b.fakeSum;", 'tie-breaks'),
('B138 再来一局 goes back to the lobby', RP,
 "    if (again && this.restartMatch()) {", "    if (false && again && this.restartMatch()) {", '再来一局 real Report'),
('B139 再来一局 keeps the old table audio (no release before replaceTable)', RP,
 "    TableAudio.release();\n    LbRouter.replaceTable();", "    LbRouter.replaceTable();", '再来一局 real Report'),
# #307 终审打回补闸：再来一局沿用本局 opts（21:218）/ 结算时长扣暂停（RPT-4）
('B140 再来一局 silent hard-coded false', RP,
 "silent: snap.silentMode };", "silent: false };", "再来一局 keeps this match's nickname / playerCount / silent"),
('B141 再来一局 playerCount hard-coded 4', RP,
 "playerCount: snap.seats.length,", "playerCount: 4,", "再来一局 keeps this match's nickname / playerCount / silent"),
('B142 report duration ignores pauses (pausedMs 0 into ReportModel)', RP,
 "      pausedMs: pausedMs,\n", "      pausedMs: 0,\n", 'report duration excludes pause'),
# 页栈小修（负责人）：新大厅 clear / 进桌 push 失败回滚 / replace(TABLE) 失败先锁竖屏再回落回大厅
('B143 new lobby never clears the page stack', LB,
 "      LbRouter.clearBelowLobby();\n", "", 'pagestack two matches in a row'),
('B144 clear moved before the lobby registers as audio owner', LB,
 [("      LbRouter.clearBelowLobby();\n", ""),
  ("    this.lobbyKey = LbRouter.lobbyAppeared(this.lobbyInit);\n",
   "    LbRouter.clearBelowLobby();\n    this.lobbyKey = LbRouter.lobbyAppeared(this.lobbyInit);\n")], None, 'pagestack two matches in a row'),
('B145 push-failure rollback keeps the director running', LB,
 "    Logger.warn(TAG, 'table push failed → roll back to the lobby');\n    AppRuntime.director.stop();\n",
 "    Logger.warn(TAG, 'table push failed → roll back to the lobby');\n", 'pagestack push-failure rollback (tryEnterTable)'),
('B146 push-failure rollback without portrait lock', LB,
 "    AppRuntime.engine.resetToLobby();\n    await this.lockPortraitSoft();\n    this.matchLoading = false;",
 "    AppRuntime.engine.resetToLobby();\n    this.matchLoading = false;", 'pagestack push-failure rollback (tryEnterTable)'),
('B147 push-failure rollback reveals the lobby before portrait lock', LB,
 "    await this.lockPortraitSoft();\n    this.matchLoading = false;\n    this.matchBusy = false;\n    this.matchLoadAxisDone = false;\n"
 "    this.matchLoadPersistDone = false;\n  }",
 "    this.matchLoading = false;\n    this.matchBusy = false;\n    this.matchLoadAxisDone = false;\n"
 "    this.matchLoadPersistDone = false;\n    await this.lockPortraitSoft();\n  }", 'pagestack push-failure rollback (tryEnterTable)'),
('B148 push-failure rollback fades the lobby audio', LB,
 "    Logger.warn(TAG, 'table push failed → roll back to the lobby');\n",
 "    Logger.warn(TAG, 'table push failed → roll back to the lobby');\n    LobbyAudio.fadeOutForHide();\n", 'pagestack push-failure rollback (tryEnterTable)'),
('B149 replace(TABLE) failure stays on the report (no lobby fallback)', LR,
 "      } else if (url === PageUrls.TABLE) {\n"
 "        // 页栈小修（负责人裁定 a）：再来一局 replace 到新桌失败 → 先锁竖屏、再回落回大厅（新大厅初始化停导演、引擎回 LOBBY）。\n"
 "        LbRouter.portraitThenLobby();\n      }\n", "      }\n", 'pagestack replace(TABLE) failure → lobby'),
('B150 replace(TABLE) fallback without portrait lock', LR,
 "    await LbRouter.lockPortraitSoft();\n    LbRouter.toLobby();\n", "    LbRouter.toLobby();\n", 'pagestack replace(TABLE) failure → lobby'),
('B151 replace(TABLE) fallback locks portrait after routing to the lobby', LR,
 "    await LbRouter.lockPortraitSoft();\n    LbRouter.toLobby();\n", "    LbRouter.toLobby();\n    await LbRouter.lockPortraitSoft();\n",
 'pagestack replace(TABLE) failure → lobby'),
# UI 预审：锁竖屏失败也要照常回大厅 / 露出大厅
('B152 replace(TABLE) fallback portrait lock not fail-soft (no catch)', LR,
 "    try {\n      const ctx: common.UIAbilityContext = getContext() as common.UIAbilityContext;\n      await WindowOrientation.lockPortrait(ctx);\n"
 "    } catch (err) {\n      Logger.warn('LbRouter', 'portrait request fail-soft');\n    }\n",
 "    const ctx: common.UIAbilityContext = getContext() as common.UIAbilityContext;\n    await WindowOrientation.lockPortrait(ctx);\n",
 'pagestack replace(TABLE) failure with lockPortrait rejecting'),
('B153 lobby portrait lock not fail-soft (push-failure rollback stops before reveal)', LB,
 "    try {\n      const ctx: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;\n      await WindowOrientation.lockPortrait(ctx);\n"
 "    } catch (err) {\n      Logger.warn(TAG, 'portrait request fail-soft');\n    }\n",
 "    const ctx: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;\n    await WindowOrientation.lockPortrait(ctx);\n",
 'pagestack push-failure rollback with lockPortrait rejecting'),
# 2b 结算收尾（21 §1.5 / 22 §4.2 / §4.5）
('B154 startMatch no longer resets turnWindow (stale FORCE_CHALLENGE carried into 再来一局)', ME,
 "    this.turnWindow = TurnWindow.NORMAL;\n    this.winnerSeatId = -1;\n", "    this.winnerSeatId = -1;\n",
 '2b real MatchEngine.startMatch resets turnWindow'),
('B155 OUT seat with aliveAtExit=0 shows 第 1 名 again (Math.max(1, …))', RM,
 "        rank = exited > 0 ? exited : -1;", "        rank = Math.max(1, exited);", '2b aliveAtExit=0 on an OUT seat'),
('B156 Report reads pausedTotalAt twice (record recomputes its own)', RP,
 "        pausedMs: pausedMs\n      };", "        pausedMs: AppRuntime.engine.pausedTotalAt(snap.endedAt > 0 ? snap.endedAt : Date.now())\n      };",
 '2b pausedTotalAt read once on the real Report'),
('B157 columns back to 58% / 42% widths (+12vp overflow)', E + 'features/report/ReportPanel.ets',
 "    .width('100%')\n    // 22 §4.2 两栏 ≈58 / 42 按权重分「行宽 − 12vp 栏缝」（不再 58% + 42% + 12vp 溢出）；单栏不加权。\n    .layoutWeight(this.narrow ? 0 : 58)",
 "    .width(this.narrow ? '100%' : '58%')", '2b two columns = layoutWeight(58) / (42)'),
('B158 L-fold upper bound inclusive (W/H = 1.60 treated as fold)', E + 'features/report/ReportPanel.ets',
 "ratio >= 1.20 && ratio < 1.60;", "ratio >= 1.20 && ratio <= 1.60;", '2b real ReportPanel.applyTier tiers'),
('B159 L-fold margin dropped', E + 'features/report/ReportPanel.ets',
 "    .padding({ left: this.fold ? '8%' : 0, right: this.fold ? '8%' : 0 })\n", "", '2b L-fold → root padding left / right 8%'),
('B160 head back to 36vp result bar (ff note no longer fits 72vp at 360vp)', E + 'features/report/ReportPanel.ets',
 "      .width('100%')\n      .height(30)\n      Row({ space: 12 }) {", "      .width('100%')\n      .height(36)\n      Row({ space: 12 }) {",
 '2b report head ≤ 20% with ff note at 360vp'),
]



def run_gate(cwd):
    r = subprocess.run(['node', 'scripts/prb_client_check.mjs'], cwd=cwd, capture_output=True, text=True, timeout=300)
    return r.returncode, (r.stdout + r.stderr)

tmp = tempfile.mkdtemp(prefix='prb_bt_')
try:
    for d in ['entry/src/main', 'scripts']:
        shutil.copytree(os.path.join(repo, d), os.path.join(tmp, d),
                        ignore=shutil.ignore_patterns('art_src', '*.png', '*.jpg', '*.webp', '*.mp3', '*.wav', '*.ogg', 'node_modules'))
    rc0, _ = run_gate(tmp)
    rows, bad = [], 0
    sel = [m for m in M if only in m[0]]
    for name, rel, old, new, expect in sel:
        edits = old if isinstance(old, list) else [(old, new)]
        p = os.path.join(tmp, rel)
        orig = open(p, encoding='utf-8').read()
        cur, miss = orig, ''
        for o, n in edits:
            k = cur.count(o)
            if k != 1:
                miss = f'old text found {k}x: {o[:60]!r}'
                break
            cur = cur.replace(o, n)
        if miss:
            rows.append((name, 'MUTATION-NOT-APPLIED', miss))
            bad += 1
            continue
        open(p, 'w', encoding='utf-8').write(cur)
        try:
            rc, out = run_gate(tmp)
        finally:
            open(p, 'w', encoding='utf-8').write(orig)
        fails = [l for l in out.splitlines() if l.startswith('FAIL')]
        hit = [l for l in fails if expect in l]
        status = 'RED (expected)' if rc != 0 and hit else 'NOT RED'
        if status != 'RED (expected)':
            bad += 1
        rows.append((name, status, (hit[0] if hit else (fails[0] if fails else 'no FAIL'))[:170]))
    rc1, _ = run_gate(tmp)
    for name, status, line in rows:
        print(f'{status:22s} | {name} | {line}')
    print(f'baseline copy rc={rc0}; restored copy rc={rc1}; break tests not red: {bad}/{len(sel)}')
    sys.exit(1 if bad or rc0 or rc1 else 0)
finally:
    shutil.rmtree(tmp, ignore_errors=True)
