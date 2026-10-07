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
  "      const player: media.AVPlayer = await media.createAVPlayer();\n      if (LobbyAudio.gen !== gen) {\n        LobbyAudio.dropStalePlayer(player);\n        return;\n      }\n", "      const player: media.AVPlayer = await media.createAVPlayer();\n", 'LobbyAudio: release() bumps gen'),
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
  "    if (!this.lobbyInit) {\n      this.renderOnly();\n      return;\n    }\n", "", 'leave-token'),
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
