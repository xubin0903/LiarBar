#!/usr/bin/env node
/**
 * PR-A static gate (负责人分派单 v1 · 2026-10-07):
 *  ① 结算高光：collectRedeal 先快照 challenge/lastPlay 再清空；{n}=手数（不是张数）
 *  ② 大厅「战绩」不走输音效（Report 仅 RECAP/END 才 playResult）
 *  ③ Report 结算页：顶区固定 + 主体是唯一 Scroll + 按钮条固定、不在 Scroll 内（结算面板 PR 改写 · 21 §1.6-2 / 22 §4.2 / S21-28）；战绩空态仍可滚
 *  ④ lb_btn_home / 系统返回键 先过离局二次确认；goHome 出口按方法逐路径白名单（PR-B 改写 goHomeCalls===1）+ 离局锁
 *  ⑤ string.json 必需键都在 + 无重复 name（不比对 git 基线、不查临时串文案；只增不删放 PR 正文自查）
 *  ⑥ 结算页回大厅 id = lb_btn_report_lobby；lb_btn_home 只留局内退出键
 * Box has no DevEco — this is not CompileArkTS. 合入 ≠ 终验.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripCommentsAndStrings } from './lib/ets_scan.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFileSync(join(root, rel), 'utf8');

function fail(msg) {
  console.error('FAIL', msg);
  process.exitCode = 1;
}

function pass(msg) {
  console.log('PASS', msg);
}

/** Body of a method `name(...) {` up to the next line that starts a sibling member at 2-space indent. */
function methodBody(text, sig) {
  const at = text.indexOf(sig);
  if (at < 0) {
    return '';
  }
  const rest = text.slice(at);
  const end = rest.search(/\n  [}]\n/);
  return end < 0 ? rest : rest.slice(0, end);
}

const engine = src('entry/src/main/ets/engine/MatchEngine.ets');
const lines = src('entry/src/main/ets/engine/DealerLines.ets');
const lobby = src('entry/src/main/ets/pages/Lobby.ets');
const router = src('entry/src/main/ets/common/LbRouter.ets');
const report = src('entry/src/main/ets/pages/Report.ets');
const table = src('entry/src/main/ets/pages/Table.ets');
const STR = 'entry/src/main/resources/base/element/string.json';

// ① snapshot before clear
const redeal = methodBody(engine, '  collectRedeal(): boolean {');
const capAt = redeal.indexOf('this.captureHighlightBeforeClear()');
const clrPlay = redeal.indexOf('this.lastPlay = null');
const clrCh = redeal.indexOf('this.challenge = null');
const recapAt = redeal.indexOf('this.toRecap()');
if (capAt >= 0 && clrPlay > capAt && clrCh > capAt && recapAt > capAt) {
  pass('collectRedeal snapshots highlight before clearing lastPlay/challenge and before toRecap');
} else {
  fail(`collectRedeal snapshot order cap=${capAt} clrPlay=${clrPlay} clrCh=${clrCh} recap=${recapAt}`);
}
const hl = methodBody(engine, '  private buildHighlight(): string {');
if (hl.length > 0 && !hl.includes('this.challenge') && !hl.includes('this.lastPlay') &&
  !hl.includes('buildSnapshot') && hl.includes('hlSlamCaught') && hl.includes('hlFail') && hl.includes('hlLast')) {
  pass('buildHighlight reads only the pre-clear snapshot (no live challenge/lastPlay/buildSnapshot)');
} else {
  fail('buildHighlight still reads live challenge/lastPlay or snapshot');
}
const cap = methodBody(engine, '  private captureHighlightBeforeClear(): void {');
if (cap.includes('handNo: this.matchHandNo()') && !/handNo:\s*[^,\n]*\.count/.test(cap)) {
  pass('{n} source = match hand ordinal (matchHandNo), not lastPlay.count');
} else {
  fail('{n} highlight source is not hand ordinal');
}
const hlFn = methodBody(lines, 'export function highlightLineFor(');
if (hlFn.includes("replace('{n}'") && hlFn.includes('handNo') && !hlFn.includes('.count')) {
  pass('DealerLines.highlightLineFor fills {n} with handNo');
} else {
  fail('DealerLines.highlightLineFor missing or uses card count');
}
for (const key of ['lb_str_dlr_hl_slam_caught', 'lb_str_dlr_hl_fallback']) {
  const m = new RegExp(`'${key}'\\)\\s*\\{\\s*return '([^']*)'`).exec(lines);
  if (m && m[1].includes('第 {n} 手')) {
    pass(`${key} template means 第 {n} 手 (hand count)`);
  } else {
    fail(`${key} template changed / not hand semantics`);
  }
}

// ② lobby 战绩 → no lose SFX
const recBtn = lobby.slice(lobby.indexOf('.id(ControlIds.RECORDS)'), lobby.indexOf('.id(ControlIds.RECORDS)') + 600);
if (recBtn.includes('LbRouter.toRecords()') && !/playResult|playLose|sfx_.*lose/i.test(recBtn)) {
  pass('Lobby 战绩 → LbRouter.toRecords(), no result/lose SFX on the click path');
} else {
  fail('Lobby 战绩 click path not toRecords or plays SFX');
}
if (router.includes('static toRecords(): void')) {
  pass('LbRouter.toRecords present');
} else {
  fail('LbRouter.toRecords missing');
}
const appear = methodBody(report, '  aboutToAppear(): void {');
const guardAt = appear.search(/snap\.phase !== Phase\.RECAP && snap\.phase !== Phase\.END/);
const earlyRet = appear.indexOf('return;', guardAt);
const playAt = appear.indexOf('TableAudio.playResult(');
if (guardAt >= 0 && earlyRet > guardAt && playAt > earlyRet && appear.includes('this.recordsMode = true')) {
  pass('Report plays result SFX only for RECAP/END; lobby entry → recordsMode empty state');
} else {
  fail('Report may still play lose SFX from lobby entry');
}
if (report.includes("$r('app.string.lb_str_records_empty')")) {
  pass('records empty-state string bound');
} else {
  fail('records empty-state not shown');
}

// ③ Report layout — rewritten in the 结算面板 PR (22 §4.2 · S21-28 / S22-02): the old "root Scroll wraps everything incl. the
// buttons" made the buttons scroll-reachable, not fixed. Now: Report root is a plain Column; the records empty state keeps its
// own vertical Scroll; the match report is ReportPanel = head (fixed) → Scroll (the ONLY scroll area) → btnBar (fixed, after the
// Scroll's closing brace, holding AGAIN + REPORT_LOBBY).
const reportPanel = src('entry/src/main/ets/features/report/ReportPanel.ets');
/** Index just past the brace block that opens at the first '{' at/after `from` (comments/strings stripped text). */
function blockEnd(text, from) {
  const open = text.indexOf('{', from);
  if (open < 0) return -1;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) return i + 1; }
  }
  return -1;
}
const build = methodBody(report, '  build() {');
const recBranch = build.indexOf('if (this.recordsMode) {');
const recScroll = build.indexOf('Scroll()', recBranch);
const recEnd = blockEnd(build, recBranch);
const panelAt = build.indexOf('ReportPanel(');
if (/^\s*build\(\) \{\s*\n\s*Column\(\) \{/m.test(build + '\n') && recBranch >= 0 && recScroll > recBranch && recScroll < recEnd &&
  build.includes('ScrollDirection.Vertical') && panelAt > recEnd && build.lastIndexOf('Scroll()') < recEnd) {
  pass('Report root = Column; records empty state in its own vertical Scroll; match report = ReportPanel (not inside a Scroll)');
} else {
  fail(`Report layout: root Column / records Scroll / ReportPanel outside Scroll (rec=${recBranch} scroll=${recScroll} end=${recEnd} panel=${panelAt})`);
}
const pb = stripCommentsAndStrings(methodBody(reportPanel, '  build() {'));
const headAt = pb.indexOf('this.head()');
const scrollAt = pb.indexOf('Scroll()');
const scrollEnd = scrollAt < 0 ? -1 : blockEnd(pb, scrollAt);
const scrollTail = scrollEnd < 0 ? '' : pb.slice(scrollEnd, pb.indexOf('this.btnBar()'));
const barAt = pb.indexOf('this.btnBar()');
const bar = stripCommentsAndStrings(methodBody(reportPanel, '  btnBar() {'));
if (headAt >= 0 && scrollAt > headAt && scrollEnd > scrollAt && barAt > scrollEnd && (pb.match(/Scroll\(\)/g) || []).length === 1 &&
  scrollTail.includes('.id(ControlIds.REPORT_SCROLL)') && scrollTail.includes('ScrollDirection.Vertical') && scrollTail.includes('.layoutWeight(1)') &&
  !pb.slice(scrollAt, scrollEnd).includes('btnBar') && bar.includes('.id(ControlIds.REPORT_BTNBAR)') &&
  bar.indexOf('ControlIds.REPORT_LOBBY') >= 0 && bar.indexOf('ControlIds.AGAIN') > bar.indexOf('ControlIds.REPORT_LOBBY')) {
  pass('ReportPanel: head fixed → one vertical Scroll (lb_cmp_report_scroll, layoutWeight 1) → btnBar fixed outside the Scroll; left 回大厅, right 再来一局 (22 §4.2)');
} else {
  fail(`ReportPanel layout: head=${headAt} scroll=${scrollAt}..${scrollEnd} btnBar=${barAt} (button bar must be outside the only Scroll)`);
}
if (report.includes('WindowOrientation.lockPortrait(') && report.includes('LbRouter.toLobby()') &&
  report.indexOf('WindowOrientation.lockPortrait(') < report.lastIndexOf('LbRouter.toLobby()')) {
  pass('Report → lobby locks portrait before routing (matches Table.unlockLobbyThenRoute)');
} else {
  fail('Report → lobby orientation restore missing');
}
if (/onBackPress\(\): boolean \{[\s\S]*?recordsMode[\s\S]*?return true;/.test(report)) {
  pass('Report onBackPress handled (match mode consumes, records mode default back)');
} else {
  fail('Report onBackPress not handled');
}

// ④ leave confirm
const back = methodBody(table, '  onBackPress(): boolean {');
if (back.includes('this.requestLeave()') && !back.includes('this.goHome()') && back.includes('return true')) {
  pass('Table onBackPress → requestLeave (confirm), returns true');
} else {
  fail('Table onBackPress bypasses confirm');
}
const homeChrome = methodBody(table, '  homeExitChrome() {');
if (homeChrome.includes('this.requestLeave()') && !homeChrome.includes('this.goHome()')) {
  pass('lb_btn_home → requestLeave (confirm)');
} else {
  fail('lb_btn_home bypasses confirm');
}
// goHome exit paths — rewritten in PR-B (负责人 2026-10-07: 「goHomeCalls===1 要正式改掉，不许绕开」).
// Instead of one global count, every `this.goHome()` / `this.onLeaveConfirmed()` / `this.requestLeave()` call
// is attributed to its enclosing Table method (comments/strings stripped) and must match the allowlist
// EXACTLY (no extra path, no missing path, same count per path). Each allowed goHome path must set the
// leaving lock (`this.leaving = true`) before calling goHome, and goHome itself must be idempotent.
// Report → lobby does NOT go through Table.goHome: Report.ets routes on its own (checked in ③ above).
// TODO(UI 22): 暂停层「结束游戏 / 回大厅」接进来后会新增 goHome 路径 —— 在 GOHOME_EXIT_PATHS 登记
// 新方法名与次数，并给新路径同样补离局锁 / 中退一次的断言；不许删表或放宽成计数≥1。
const GOHOME_EXIT_PATHS = { onLeaveConfirmed: 1 };
// PR-B 离局待停（21 §3.1 P06）：弹框从 requestLeave 拆到 openLeaveConfirm（requestLeave 直弹 / 待停结束由 onPauseState 调）。
const LEAVE_OK_PATHS = { openLeaveConfirm: 1 };
const LEAVE_REQUEST_PATHS = { homeExitChrome: 1, onBackPress: 1 };
const tableCode = stripCommentsAndStrings(table);
function callSitesByMethod(code, callRe) {
  const sigRe = /^  (?:private |public |protected |static |async )*(\w+)\s*\([^)\n]*\)\s*(?::\s*[\w<>\[\]| ]+)?\s*\{\s*$/gm;
  const sigs = [];
  let m;
  while ((m = sigRe.exec(code)) !== null) {
    sigs.push({ at: m.index, name: m[1] });
  }
  const out = {};
  const re = new RegExp(callRe.source, 'g');
  while ((m = re.exec(code)) !== null) {
    let owner = '?';
    for (const sg of sigs) {
      if (sg.at < m.index) {
        owner = sg.name;
      } else {
        break;
      }
    }
    out[owner] = (out[owner] || 0) + 1;
  }
  return out;
}
const sameMap = (a, b) => {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
};
const show = (o) => JSON.stringify(o);
const goHomeSites = callSitesByMethod(tableCode, /this\.goHome\(\)/);
if (sameMap(goHomeSites, GOHOME_EXIT_PATHS)) {
  pass(`goHome exit paths per method = ${show(goHomeSites)} (allowlist exact)`);
} else {
  fail(`goHome exit paths ${show(goHomeSites)} != allowlist ${show(GOHOME_EXIT_PATHS)}`);
}
const okSites = callSitesByMethod(tableCode, /this\.onLeaveConfirmed\(\)/);
const reqBody = methodBody(table, '  private openLeaveConfirm(): void {');
if (sameMap(okSites, LEAVE_OK_PATHS) && /secondaryButton:[\s\S]*?this\.onLeaveConfirmed\(\)/.test(reqBody)) {
  pass('onLeaveConfirmed only from the leave dialog OK (secondaryButton) in openLeaveConfirm');
} else {
  fail(`onLeaveConfirmed call sites ${show(okSites)} (expected dialog OK only)`);
}
const reqSites = callSitesByMethod(tableCode, /this\.requestLeave\(\)/);
if (sameMap(reqSites, LEAVE_REQUEST_PATHS)) {
  pass(`requestLeave entries = ${show(reqSites)} (lb_btn_home + system back only)`);
} else {
  fail(`requestLeave entries ${show(reqSites)} != ${show(LEAVE_REQUEST_PATHS)}`);
}
for (const path of Object.keys(GOHOME_EXIT_PATHS)) {
  const b = stripCommentsAndStrings(methodBody(table, `  private ${path}(`));
  const lockAt = b.indexOf('this.leaving = true');
  const homeAt = b.indexOf('this.goHome()');
  if (lockAt >= 0 && homeAt > lockAt) {
    pass(`${path}: leaving lock set before goHome`);
  } else {
    fail(`${path}: leaving lock not set before goHome (lock=${lockAt} home=${homeAt})`);
  }
}
const goHomeBody = stripCommentsAndStrings(methodBody(table, '  private goHome(): void {'));
if (/^\s*\{?\s*if \(this\.homeRouting\) \{\s*return;\s*\}\s*this\.homeRouting = true;/.test(goHomeBody.slice(goHomeBody.indexOf('{') + 1))) {
  pass('goHome idempotent: first statement guards homeRouting, second call is a no-op');
} else {
  fail('goHome not idempotent (missing homeRouting guard at top)');
}
// Lock reset: only allowed inside releaseLeaveLock (routing replace + back both failed), nowhere else.
const resetSites = callSitesByMethod(tableCode, /this\.(?:leaving|homeRouting) = false/);
const releaseSites = callSitesByMethod(tableCode, /this\.releaseLeaveLock\(\)/);
if (sameMap(resetSites, { releaseLeaveLock: 2 }) && sameMap(releaseSites, { unlockLobbyThenRoute: 1 })) {
  pass('leaving / homeRouting reset only in releaseLeaveLock (called once, from unlockLobbyThenRoute on routing failure)');
} else {
  fail(`lock reset sites ${show(resetSites)} / releaseLeaveLock callers ${show(releaseSites)} (only the routing-failure branch may unlock)`);
}
if (!/goHome\(/.test(stripCommentsAndStrings(report))) {
  pass('Report → lobby path does not call Table.goHome (routes itself)');
} else {
  fail('Report references goHome');
}
const req = methodBody(table, '  private requestLeave(): void {') + methodBody(table, '  private openLeaveConfirm(): void {');
if (req.includes('if (this.leaveConfirmOpen || this.leavePending)') && req.includes('if (this.leaving || this.leaveConfirmOpen)') && req.includes('showAlertDialog(') &&
  req.includes('lb_str_leave_confirm_title') && req.includes('lb_str_leave_confirm_body') &&
  req.includes('lb_str_leave_confirm_ok') && req.includes('lb_str_leave_confirm_cancel')) {
  pass('requestLeave/openLeaveConfirm: AlertDialog with 4 lb_str_leave_confirm_* keys; re-entry guarded (open / pending)');
} else {
  fail('requestLeave dialog incomplete');
}

// ⑥ Report back-to-lobby id split from in-table lb_btn_home (负责人 2026-10-07)
const ids = src('entry/src/main/ets/common/Ids.ets');
const panel = src('entry/src/main/ets/features/report/ReportPanel.ets');
if (ids.includes("static readonly REPORT_LOBBY: string = 'lb_btn_report_lobby'") &&
  ids.includes("static readonly HOME: string = 'lb_btn_home'")) {
  pass('Ids: REPORT_LOBBY=lb_btn_report_lobby, HOME=lb_btn_home kept');
} else {
  fail('Ids REPORT_LOBBY / HOME wrong');
}
const reportSide = panel + report;
if (reportSide.includes('.id(ControlIds.REPORT_LOBBY)') && !reportSide.includes('ControlIds.HOME') &&
  !reportSide.includes('lb_btn_home') && !reportSide.includes("app.string.lb_str_home'")) {
  pass('Report/ReportPanel use lb_btn_report_lobby only (no lb_btn_home / lb_str_home)');
} else {
  fail('Report side still uses lb_btn_home / lb_str_home');
}
if (table.includes('.id(ControlIds.HOME)') && !table.includes('REPORT_LOBBY')) {
  pass('Table keeps lb_btn_home for in-table exit only');
} else {
  fail('Table lb_btn_home changed or REPORT_LOBBY leaked into table');
}

// ⑤ string.json: required keys present + no duplicate names (负责人 #293 打回 2026-10-07).
// No git baseline: 策划 21 will replace the PR-A 临时串 values in place, so text is not checked.
const headJson = JSON.parse(src(STR));
const names = headJson.string.map((x) => x.name);
const dup = names.filter((n, i) => names.indexOf(n) !== i);
if (dup.length === 0) {
  pass('string.json no duplicate keys');
} else {
  fail(`duplicate string keys: ${dup.join(',')}`);
}
for (const k of ['lb_str_records_empty', 'lb_str_report_lobby', 'lb_str_home', 'lb_str_leave_confirm_title', 'lb_str_leave_confirm_body',
  'lb_str_leave_confirm_ok', 'lb_str_leave_confirm_cancel']) {
  if (names.includes(k)) {
    pass(`string key ${k}`);
  } else {
    fail(`missing string key ${k}`);
  }
}

// ArkTS strict hygiene on touched files
for (const [rel, text] of [['MatchEngine', engine], ['DealerLines', lines], ['Report', report]]) {
  if (/:\s*(any|unknown)\b|\bESObject\b/.test(text)) {
    fail(`${rel}: any/unknown/ESObject`);
  }
}
const prA = methodBody(table, '  private requestLeave(): void {') + methodBody(table, '  private onLeaveCancel(): void {');
if (/:\s*(any|unknown)\b|\bESObject\b/.test(prA)) {
  fail('Table PR-A leave block: any/unknown/ESObject');
} else {
  pass('PR-A code: no any/unknown/ESObject');
}

if (process.exitCode === 1) {
  console.error('pra_client_check FAILED');
} else {
  console.log('pra_client_check OK');
}
