#!/usr/bin/env node
/**
 * PR-A static gate (负责人分派单 v1 · 2026-10-07):
 *  ① 结算高光：collectRedeal 先快照 challenge/lastPlay 再清空；{n}=手数（不是张数）
 *  ② 大厅「战绩」不走输音效（Report 仅 RECAP/END 才 playResult）
 *  ③ Report 内容包 Scroll，横屏底部按钮可滚到
 *  ④ lb_btn_home / 系统返回键 先过离局二次确认
 *  ⑤ string.json 必需键都在 + 无重复 name（不比对 git 基线、不查临时串文案；只增不删放 PR 正文自查）
 *  ⑥ 结算页回大厅 id = lb_btn_report_lobby；lb_btn_home 只留局内退出键
 * Box has no DevEco — this is not CompileArkTS. 合入 ≠ 终验.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// ③ Report wrapped in Scroll
const build = methodBody(report, '  build() {');
if (/^\s*build\(\) \{\s*\n\s*Scroll\(\) \{/m.test(build + '\n') && build.includes('ScrollDirection.Vertical') &&
  build.indexOf('ReportPanel(') > build.indexOf('Scroll()')) {
  pass('Report root is a vertical Scroll wrapping ReportPanel / empty state');
} else {
  fail('Report not wrapped in Scroll');
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
const goHomeCalls = (table.match(/this\.goHome\(\)/g) || []).length;
const confirmed = methodBody(table, '  private onLeaveConfirmed(): void {');
if (goHomeCalls === 1 && confirmed.includes('this.goHome()')) {
  pass('goHome only reachable from onLeaveConfirmed');
} else {
  fail(`goHome call sites=${goHomeCalls} (expected 1, inside onLeaveConfirmed)`);
}
const req = methodBody(table, '  private requestLeave(): void {');
if (req.includes('if (this.leaveConfirmOpen)') && req.includes('showAlertDialog(') &&
  req.includes('lb_str_leave_confirm_title') && req.includes('lb_str_leave_confirm_body') &&
  req.includes('lb_str_leave_confirm_ok') && req.includes('lb_str_leave_confirm_cancel')) {
  pass('requestLeave: AlertDialog with 4 lb_str_leave_confirm_* keys; re-entry guarded');
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
