const pptxgen = require("pptxgenjs");
const path = require("path");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "谎馆项目组";
pres.title = "谎馆 - 完整项目创意与方案介绍";
pres.subject = "华为高校创新赛 · 应用创新";

const C = {
  bg: "1A0F14",
  bgCard: "2A1820",
  bgSoft: "F7F1EA",
  ink: "1A0F14",
  inkMuted: "5C4A52",
  cream: "F7F1EA",
  creamDim: "E8DDD2",
  wine: "6B1E2F",
  wineSoft: "8B3A4A",
  gold: "C4A35A",
  white: "FFFFFF",
  altRow: "F0E8E0",
};

const TOTAL = 16;

function footer(slide, page) {
  slide.addText("谎馆 LiarBar  ·  华为高校创新赛 · 应用创新  ·  完整项目方案介绍", {
    x: 0.45, y: 5.28, w: 7.6, h: 0.22,
    fontSize: 9, fontFace: "Microsoft YaHei", color: C.inkMuted, margin: 0,
  });
  slide.addText(`${page} / ${TOTAL}`, {
    x: 8.4, y: 5.28, w: 1.15, h: 0.22,
    fontSize: 9, fontFace: "Microsoft YaHei", color: C.inkMuted, align: "right", margin: 0,
  });
}
function lightBg(s) {
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.bgSoft } });
}
function darkBg(s) {
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.bg } });
}
function card(s, x, y, w, h, fill = C.white) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill }, rectRadius: 0.08 });
}
function label(s, t) {
  s.addText(t, { x: 0.5, y: 0.2, w: 9, h: 0.26, fontSize: 11, fontFace: "Microsoft YaHei", color: C.wine, margin: 0 });
}
function title(s, t) {
  s.addText(t, { x: 0.5, y: 0.45, w: 9, h: 0.42, fontSize: 21, fontFace: "Microsoft YaHei", bold: true, color: C.ink, margin: 0 });
}
function body(s, t, x, y, w, h, opt = {}) {
  s.addText(t, {
    x, y, w, h,
    fontSize: opt.size || 12,
    fontFace: "Microsoft YaHei",
    bold: !!opt.bold,
    color: opt.color || C.ink,
    margin: 0,
    align: opt.align || "left",
    valign: opt.valign || "top",
  });
}

// 1 Cover
{
  const s = pres.addSlide();
  darkBg(s);
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.16, h: 5.625, fill: { color: C.gold } });
  body(s, "华为高校创新赛  ·  应用创新赛道", 0.65, 0.9, 8.8, 0.3, { size: 13, color: C.gold });
  body(s, "谎  馆", 0.65, 1.4, 8.8, 0.85, { size: 54, bold: true, color: C.cream });
  body(s, "LiarBar  ·  AI 荷官驱动的虚张声势社交博弈应用", 0.65, 2.35, 8.8, 0.35, { size: 15, color: C.wineSoft });
  body(s, "完整项目创意与方案介绍（给指导老师）", 0.65, 3.05, 8.8, 0.35, { size: 16, color: C.creamDim });
  body(s, "本材料讲清：项目为什么做、是什么、怎么玩、互动与 AI 如何设计、鸿蒙如何落地、做成什么范围、如何推进。", 0.65, 3.6, 8.5, 0.55, { size: 12, color: "8A7A80" });
  body(s, "HarmonyOS 原生  |  手机优先  |  方案讲解版（非现场演示分镜）", 0.65, 4.65, 8.5, 0.28, { size: 11, color: "7A6A70" });
}

// 2 Agenda
{
  const s = pres.addSlide();
  lightBg(s);
  label(s, "CONTENTS");
  title(s, "介绍结构：把整个项目讲完整");
  const items = [
    ["01", "为什么做", "痛点、赛题机会、切入角度"],
    ["02", "项目是什么", "定位、用户、原则、不做清单"],
    ["03", "怎么玩", "规则、牌局、循环、判定"],
    ["04", "互动系统", "四层环、出牌包、质疑、旁观"],
    ["05", "AI 方案", "荷官 / 牌友 / 读心官与公平边界"],
    ["06", "鸿蒙落地", "特性映射与赛题契合"],
    ["07", "范围与架构", "MVP、页面、技术取舍"],
    ["08", "推进计划", "里程碑、现状、请老师关注点"],
  ];
  items.forEach((it, i) => {
    const col = i < 4 ? 0 : 1;
    const row = i % 4;
    const x = 0.5 + col * 4.75;
    const y = 1.1 + row * 0.95;
    card(s, x, y, 4.5, 0.85);
    body(s, it[0], x + 0.2, y + 0.22, 0.55, 0.4, { size: 16, bold: true, color: C.wine });
    body(s, it[1], x + 0.9, y + 0.15, 3.3, 0.3, { size: 14, bold: true });
    body(s, it[2], x + 0.9, y + 0.48, 3.3, 0.28, { size: 11, color: C.inkMuted });
  });
  footer(s, 2);
}

// 3 Why pains
{
  const s = pres.addSlide();
  lightBg(s);
  label(s, "01  为什么做");
  title(s, "聚会博弈有需求，线上却常被「按钮化」");
  body(s, "虚张声势类聚会游戏线下很爽，搬到手机后组织成本高、隐私差、互动薄。我们抓住这四个可产品化的问题：", 0.5, 1.05, 9, 0.4, { size: 12, color: C.inkMuted });
  const pains = [
    ["缺主持", "要有人当庄控流程。一人掉线或没人愿意当庄，局就散。"],
    ["凑不齐", "3～6 人即时局经常凑不满，想玩也开不起来。"],
    ["怕偷看", "手机看手牌时旁边一瞟就穿帮，寝室/饭局尤其尴尬。"],
    ["只剩按钮", "很多线上版只剩出牌/质疑，丢失「演、读、压」的核心乐趣。"],
  ];
  pains.forEach((p, i) => {
    const y = 1.55 + i * 0.78;
    card(s, 0.5, y, 9, 0.7);
    s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y, w: 0.1, h: 0.7, fill: { color: C.wine } });
    body(s, p[0], 0.8, y + 0.18, 1.5, 0.35, { size: 14, bold: true, color: C.wine });
    body(s, p[1], 2.4, y + 0.18, 6.8, 0.4, { size: 13 });
  });
  footer(s, 3);
}

// 4 Opportunity
{
  const s = pres.addSlide();
  lightBg(s);
  label(s, "01  为什么做");
  title(s, "赛题机会与项目切入角度");
  card(s, 0.5, 1.1, 4.4, 3.75);
  body(s, "赛题我们怎么读", 0.75, 1.3, 3.9, 0.35, { size: 14, bold: true });
  [
    "小而美鸿蒙应用，可落地可答辩",
    "场景实用：社交情感等明确点名",
    "鼓励与 AI 创新融合",
    "建议集成 3 个及以上鸿蒙特性",
    "体验新颖，特性服务体验而非贴标",
  ].forEach((t, i) => body(s, "▸  " + t, 0.75, 1.85 + i * 0.5, 3.9, 0.4, { size: 13, color: C.inkMuted }));

  card(s, 5.1, 1.1, 4.4, 3.75, C.bg);
  body(s, "我们的切入", 5.35, 1.3, 3.9, 0.35, { size: 14, bold: true, color: C.gold });
  [
    "选骗子酒吧内核：局短、规则轻、张力强",
    "AI 解决「谁当庄 / 人不够」",
    "互动层还原线下「演与读」",
    "鸿蒙防窥、实况窗服务博弈刚需",
    "砍掉全场景与 3D，优先可交付",
  ].forEach((t, i) => body(s, (i + 1) + ".  " + t, 5.35, 1.85 + i * 0.5, 3.9, 0.45, { size: 12, color: C.creamDim }));
  footer(s, 4);
}

// 5 Positioning
{
  const s = pres.addSlide();
  lightBg(s);
  label(s, "02  项目是什么");
  title(s, "产品定位：一句话讲清谎馆");
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 1.1, w: 9, h: 1.35, fill: { color: C.bg }, rectRadius: 0.1 });
  body(s, "一句话定位", 0.75, 1.25, 8.5, 0.25, { size: 11, color: C.gold });
  body(s, "不用真人主持、手牌防偷窥、回合节奏可触达的鸿蒙「骗子酒吧」。玩家用动作演、用舆论压；AI 荷官负责控场、凑局与复盘。", 0.75, 1.6, 8.5, 0.6, { size: 14, color: C.cream });

  const meta = [
    ["项目名", "谎馆\nLiarBar"],
    ["赛道", "应用创新"],
    ["形态", "HarmonyOS\n原生 · 手机优先"],
    ["品类", "轻量社交博弈\n虚张声势"],
    ["主用户", "高校学生\n寝室/饭局/社团"],
    ["单局", "3～8 分钟\n约 60 秒上手"],
  ];
  meta.forEach((m, i) => {
    const x = 0.5 + i * 1.55;
    card(s, x, 2.75, 1.48, 1.85);
    body(s, m[0], x + 0.1, 2.9, 1.28, 0.3, { size: 11, color: C.wine });
    body(s, m[1], x + 0.1, 3.35, 1.28, 1.0, { size: 12, bold: true });
  });
  footer(s, 5);
}

// 6 Principles
{
  const s = pres.addSlide();
  lightBg(s);
  label(s, "02  项目是什么");
  title(s, "产品原则与明确不做");
  body(s, "四条原则写进方案，用来约束功能取舍与答辩口径：", 0.5, 1.0, 9, 0.3, { size: 12, color: C.inkMuted });
  const pr = [
    ["公平第一", "胜负只认牌面规则与状态机，不让大模型当裁判"],
    ["表演第二", "动作与表情鼓励欺骗和误读，但不提供透视"],
    ["单机可玩", "1 真人 + AI 即可完整体验与介绍，不绑多设备"],
    ["特性服务玩法", "鸿蒙能力解决真实痛点，拒绝为堆特性而堆"],
  ];
  pr.forEach((p, i) => {
    const x = 0.5 + (i % 2) * 4.7;
    const y = 1.4 + Math.floor(i / 2) * 0.9;
    card(s, x, y, 4.5, 0.8);
    body(s, p[0], x + 0.2, y + 0.12, 4.1, 0.28, { size: 13, bold: true, color: C.wine });
    body(s, p[1], x + 0.2, y + 0.42, 4.1, 0.3, { size: 12, color: C.inkMuted });
  });
  card(s, 0.5, 3.35, 9, 1.5, C.bgCard);
  body(s, "明确不做（防止范围爆炸）", 0.75, 3.5, 8.5, 0.3, { size: 13, bold: true, color: C.gold });
  body(s, "全场景接续作为主流程  ·  3D / 3DGS / 空间建模  ·  碰一碰作为必选组队  ·  复杂养成与技能板  ·  LLM 直接判定牌真假或胜负  ·  真金赌博  ·  首版强制语音房", 0.75, 3.95, 8.5, 0.65, { size: 13, color: C.creamDim });
  footer(s, 6);
}

// 7 Rules
{
  const s = pres.addSlide();
  lightBg(s);
  label(s, "03  怎么玩");
  title(s, "规则内核：宣称 → 扣牌 → 质疑 → 淘汰");
  body(s, "内核对齐大众「骗子酒吧」类玩法，并做教学向简化：符号牌替代完整扑克，60 秒能讲懂。", 0.5, 1.0, 9, 0.35, { size: 12, color: C.inkMuted });
  const steps = [
    ["1 宣称", "荷官指定本轮目标\n例：本轮声称都出 A\nJoker 永远算合法"],
    ["2 出牌", "轮流出 1～3 张\n扣着出，他人不可见\n可真可假，可带姿态"],
    ["3 质疑", "下家可继续或开牌\n只验上家「本手」\n第一手不可质疑"],
    ["4 结算", "有假：被质疑者掉命\n全真：质疑者掉命\n命尽出局，最后存活胜"],
  ];
  steps.forEach((st, i) => {
    const x = 0.45 + i * 2.4;
    card(s, x, 1.5, 2.25, 3.2);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: x + 0.15, y: 1.7, w: 1.95, h: 0.4, fill: { color: C.wine }, rectRadius: 0.05,
    });
    body(s, st[0], x + 0.15, 1.75, 1.95, 0.3, { size: 13, bold: true, color: C.cream, align: "center" });
    body(s, st[1], x + 0.18, 2.35, 1.9, 2.0, { size: 12 });
  });
  footer(s, 7);
}

// 8 Numbers
{
  const s = pres.addSlide();
  lightBg(s);
  label(s, "03  怎么玩");
  title(s, "牌局结构与默认数值");
  const left = [
    ["人数", "默认 4 人（可 AI 补位），支持 3～6"],
    ["生命", "每人 3 命；归零出局成为幽灵旁观"],
    ["手牌", "每人 5 张；单次出 1～3 张"],
    ["牌面", "符号牌 A / K / Q + 万能 Joker"],
    ["4 人牌堆", "A×8、K×8、Q×8、Joker×4（共 28，发 20）"],
    ["时限", "单回合约 15 秒；超时自动出 1 张"],
    ["判定", "合法 ⇔ 牌面=宣称 或 牌面=Joker"],
  ];
  left.forEach((r, i) => {
    const y = 1.05 + i * 0.52;
    card(s, 0.5, y, 5.7, 0.47);
    body(s, r[0], 0.7, y + 0.1, 1.3, 0.28, { size: 12, bold: true, color: C.wine });
    body(s, r[1], 2.1, y + 0.1, 3.9, 0.28, { size: 12 });
  });
  card(s, 6.4, 1.05, 3.1, 3.65, C.bg);
  body(s, "设计意图", 6.65, 1.3, 2.6, 0.3, { size: 13, bold: true, color: C.gold });
  body(s, "用符号牌降低教学成本；用 3 命控制单局 3～8 分钟；用 AI 补位保证随时可开桌；用「只验本手」让规则干净、状态机好写。", 6.65, 1.8, 2.6, 2.4, { size: 13, color: C.creamDim });
  footer(s, 8);
}

// 9 Loop
{
  const s = pres.addSlide();
  lightBg(s);
  label(s, "03  怎么玩");
  title(s, "核心循环与关键规则选择");
  const flow = ["开桌补位", "发牌", "公布宣称", "出牌/质疑", "翻验结算", "扣命出局", "新一轮/战报"];
  flow.forEach((t, i) => {
    const x = 0.35 + i * 1.35;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y: 1.2, w: 1.22, h: 0.95,
      fill: { color: i === 3 || i === 4 ? C.wine : C.bgCard }, rectRadius: 0.08,
    });
    body(s, t, x, 1.4, 1.22, 0.55, { size: 11, bold: true, color: C.cream, align: "center" });
  });
  card(s, 0.5, 2.5, 9, 2.35);
  body(s, "写进 GDD 的关键选择（避免后期扯皮）", 0.75, 2.7, 8.5, 0.3, { size: 13, bold: true });
  [
    "本轮第一手只能出牌，不能质疑（没有可验对象）",
    "质疑只针对上家「刚刚那一手」，不是历史全部出牌",
    "结算后清空本轮，荷官重新公布宣称（若仍有 ≥2 人存活）",
    "出局者成为幽灵：可起哄/押面子，不可看他人手牌与出牌内容",
    "默认「社交桌」：动作与舆论不改变牌真假，保证公平可解释",
  ].forEach((t, i) => body(s, (i + 1) + ".  " + t, 0.75, 3.15 + i * 0.3, 8.5, 0.28, { size: 12, color: C.inkMuted }));
  footer(s, 9);
}

// 10 Interaction layers
{
  const s = pres.addSlide();
  lightBg(s);
  label(s, "04  互动系统");
  title(s, "四层互动环：说谎不止两个按钮");
  body(s, "目标：把线下最爽的看牌表情、出牌姿态、全桌起哄、质疑对峙系统化；默认不破坏公平。", 0.5, 1.0, 9, 0.35, { size: 12, color: C.inkMuted });
  const layers = [
    ["1", "牌面操作层", "出真 / 出假 / 质疑", "规则本体，直接决定胜负"],
    ["2", "动作暗示层", "表情 · 出牌姿态 · 手势暗语", "可伪装、可误读的社交语言"],
    ["3", "社交施压层", "点名 · 敲桌 · 站队 · 押面子", "玩家对玩家，不是人对 UI"],
    ["4", "系统节奏层", "倒计时 · 氛围 · 实况窗", "不靠吼也能制造压迫感"],
  ];
  layers.forEach((L, i) => {
    const y = 1.5 + i * 0.8;
    card(s, 0.5, y, 9, 0.7);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.65, y: y + 0.15, w: 0.45, h: 0.4, fill: { color: C.wine }, rectRadius: 0.05,
    });
    body(s, L[0], 0.65, y + 0.2, 0.45, 0.3, { size: 14, bold: true, color: C.cream, align: "center" });
    body(s, L[1], 1.3, y + 0.18, 2.3, 0.35, { size: 14, bold: true });
    body(s, L[2], 3.7, y + 0.18, 2.9, 0.35, { size: 12, color: C.wineSoft });
    body(s, L[3], 6.7, y + 0.18, 2.6, 0.35, { size: 12, color: C.inkMuted });
  });
  footer(s, 10);
}

// 11 Play bundle & challenge
{
  const s = pres.addSlide();
  lightBg(s);
  label(s, "04  互动系统");
  title(s, "两个核心交互：出牌包与质疑三拍");
  card(s, 0.45, 1.1, 4.5, 3.75);
  body(s, "出牌包 Play Bundle", 0.7, 1.3, 4.0, 0.35, { size: 15, bold: true, color: C.wine });
  body(s, "一次出牌 = 选牌 + 方式 + 话术 + 点名", 0.7, 1.7, 4.0, 0.3, { size: 12, color: C.inkMuted });
  [
    "选 1～3 张；长按看牌并触发防窥",
    "方式 ≥3：轻推 / 甩出 / 犹豫拍",
    "可选带话：装真、挑衅，或故意沉默",
    "可点名一人施压（对方强提示）",
    "看牌时可放表情：装惊喜 / 装绝望",
    "强表演方式有每局次数上限，防刷",
  ].forEach((t, i) => body(s, (i + 1) + ".  " + t, 0.7, 2.2 + i * 0.38, 4.0, 0.35, { size: 12 }));

  card(s, 5.1, 1.1, 4.45, 3.75);
  body(s, "质疑三拍（全桌高潮）", 5.35, 1.3, 4.0, 0.35, { size: 15, bold: true, color: C.wine });
  const ch = [
    ["拍1 指控", "质疑者选姿态与台词"],
    ["拍2 对峙", "被质疑者选死撑/破防/反嘲"],
    ["拍3 翻牌", "逐张翻开，旁观可跟节奏"],
    ["旁观押注", "翻牌前短窗押真/假（面子分）"],
    ["公平边界", "默认不改「扣谁命」"],
    ["战报素材", "破防瞬间写入局后高光"],
  ];
  ch.forEach((r, i) => {
    body(s, r[0], 5.35, 1.85 + i * 0.42, 1.45, 0.35, { size: 12, bold: true, color: C.wine });
    body(s, r[1], 6.85, 1.85 + i * 0.42, 2.4, 0.35, { size: 12 });
  });
  footer(s, 11);
}

// 12 Spectator & privacy
{
  const s = pres.addSlide();
  lightBg(s);
  label(s, "04  互动系统");
  title(s, "旁观不挂机 · 动作可教 · 看牌要藏");
  const blocks = [
    {
      t: "非回合参与",
      d: ["敲桌催促 / 长按盯人", "对某人站队标记", "起哄短句", "倒计时末段集体催", "幽灵出局后仍可起哄押注", "每回合动作有次数上限"],
    },
    {
      t: "动作词典（教学）",
      d: ["装真：轻推+微笑+点自己", "装疯：甩出+钓鱼姿态", "带节奏：敲桌+否标记+起哄", "死撑：淡定+少说话", "教程 60 秒必须教会", "FaceAR 与手动轮盘等价"],
    },
    {
      t: "看牌隐私",
      d: ["默认牌背，长按才揭开", "揭开瞬间绑定系统防窥", "松手立即收回", "他人只见表情符号不见牌", "无摄像头也完整体验", "静默局可关强表现"],
    },
  ];
  blocks.forEach((b, i) => {
    const x = 0.45 + i * 3.15;
    card(s, x, 1.1, 3.0, 3.75);
    body(s, b.t, x + 0.18, 1.3, 2.65, 0.4, { size: 14, bold: true, color: C.wine });
    b.d.forEach((line, j) => body(s, "·  " + line, x + 0.18, 1.9 + j * 0.42, 2.65, 0.38, { size: 12 }));
  });
  footer(s, 12);
}

// 13 AI
{
  const s = pres.addSlide();
  lightBg(s);
  label(s, "05  AI 方案");
  title(s, "三层 AI：控场、凑局、复盘");
  body(s, "融合方式强调「场景化、可控、可解释」——让 AI 解决组织与氛围问题，而不是替代玩家思考或破坏公平。", 0.5, 0.95, 9, 0.35, { size: 12, color: C.inkMuted });
  const ai = [
    {
      n: "01",
      t: "AI 荷官（必须硬）",
      lines: [
        "洗牌发牌、公布宣称、推进回合、超时处理、质疑结算、节点播报",
        "实现：规则状态机 + 模板播报；LLM 只可润色文案，失败回落模板",
        "铁律：胜负与真假判定 100% 走规则引擎，禁止 LLM 当裁判",
      ],
    },
    {
      n: "02",
      t: "AI 牌友（补位可关）",
      lines: [
        "人格：怂货（少骗少质疑）/ 老千（中后期爱骗）/ 杠精（爱质疑爱起哄）",
        "决策：概率表 + 手牌启发式，不追求完美最优，追求像人且会演",
        "必须会甩出、点名、敲桌、反应表情，保证 1 真人 3 AI 不冷场",
      ],
    },
    {
      n: "03",
      t: "AI 读心官（局后）",
      lines: [
        "统计掺假手数、质疑命中、最大连骗、高光动作事件",
        "输出一页战报 + 一句可读叙事（模板或 LLM）",
        "对局中「直觉提示」默认关闭，避免变成作弊辅助",
      ],
    },
  ];
  ai.forEach((a, i) => {
    const y = 1.4 + i * 1.15;
    card(s, 0.5, y, 9, 1.05);
    body(s, a.n, 0.7, y + 0.12, 0.55, 0.3, { size: 15, bold: true, color: C.wine });
    body(s, a.t, 1.35, y + 0.14, 7.8, 0.28, { size: 13, bold: true });
    a.lines.forEach((line, j) => body(s, "· " + line, 1.35, y + 0.45 + j * 0.2, 7.9, 0.2, { size: 11, color: C.inkMuted }));
  });
  footer(s, 13);
}

// 14 Harmony + contest
{
  const s = pres.addSlide();
  lightBg(s);
  label(s, "06  鸿蒙落地与赛题契合");
  title(s, "特性贴着玩法痛点长，而不是贴标签");
  card(s, 0.45, 1.05, 9.1, 0.42, C.bg);
  ["特性", "服务的玩法问题", "优先级"].forEach((h, i) => {
    body(s, h, [0.65, 2.5, 7.7][i], 1.12, [1.7, 5.0, 1.5][i], 0.28, { size: 12, bold: true, color: C.cream });
  });
  const rows = [
    ["隐私防窥", "看手牌时防侧方偷窥", "P0 必做"],
    ["实况窗", "回合/质疑倒计时，熄屏也可触达", "P0 必做"],
    ["智能填充", "昵称与开桌配置降低建房摩擦", "P0 必做"],
    ["互动卡片", "进行中牌桌、再开一局入口", "P1 增强"],
    ["沉浸光感 UI", "酒馆夜感与质疑氛围", "P1 增强"],
    ["智感握姿", "单手快捷区改侧、换手表演点", "P1 增强"],
  ];
  rows.forEach((r, i) => {
    const y = 1.55 + i * 0.48;
    card(s, 0.45, y, 9.1, 0.44, i % 2 ? C.altRow : C.white);
    body(s, r[0], 0.65, y + 0.08, 1.7, 0.28, { size: 12, bold: true });
    body(s, r[1], 2.5, y + 0.08, 5.0, 0.28, { size: 12 });
    body(s, r[2], 7.7, y + 0.08, 1.5, 0.28, { size: 12, bold: true, color: r[2].includes("P0") ? C.wine : C.inkMuted });
  });
  footer(s, 14);
}

// 15 MVP + tech
{
  const s = pres.addSlide();
  lightBg(s);
  label(s, "07  范围与技术取舍");
  title(s, "MVP 做什么，技术怎么兜住");
  card(s, 0.45, 1.05, 4.5, 3.8);
  body(s, "MVP 功能（首版承诺）", 0.7, 1.2, 4.0, 0.3, { size: 14, bold: true, color: C.wine });
  [
    "人机快速开桌（1 真人 + 3 AI）",
    "完整规则局：宣称/出牌/质疑/胜负",
    "长按看牌 + 隐私防窥",
    "出牌包（方式≥3 + 话术/点名）",
    "质疑三拍 + 旁观敲桌/站队/押面子",
    "手动表情轮盘（不强制摄像头）",
    "实况窗倒计时 + 智能填充",
    "AI 荷官播报 + 局后战报",
    "60 秒教学（含动作词典）",
  ].forEach((t, i) => body(s, "· " + t, 0.7, 1.65 + i * 0.32, 4.0, 0.3, { size: 12 }));

  card(s, 5.1, 1.05, 4.45, 3.8);
  body(s, "技术取舍（务实）", 5.35, 1.2, 4.0, 0.3, { size: 14, bold: true, color: C.wine });
  [
    "客户端：HarmonyOS + ArkTS",
    "MVP 人机局：规则与 AI 可全本地",
    "荷官：状态机，不把胜负交给 LLM",
    "AI 牌友：概率表 + 启发式",
    "复盘/播报：模板优先，LLM 可选",
    "联网好友房、语音房：后置",
    "页面：首页/等待/对局/战报/设置",
    "配置表驱动数值，避免魔法数",
    "静默局与权限拒绝路径必须可用",
  ].forEach((t, i) => body(s, "· " + t, 5.35, 1.65 + i * 0.32, 4.0, 0.3, { size: 12 }));
  footer(s, 15);
}

// 16 Roadmap + close ask
{
  const s = pres.addSlide();
  lightBg(s);
  label(s, "08  推进计划与请老师关注");
  title(s, "阶段里程碑与当前状态");

  const ms = [
    ["M0", "文档锁规则", "一页纸/PRD/GDD\n互动与数值定稿"],
    ["M1", "可玩规则局", "人机完整胜负\n状态机跑通"],
    ["M2", "互动 P0", "出牌包·三拍\n旁观站队"],
    ["M3", "特性接入", "防窥·实况窗\n战报与填充"],
    ["M4", "材料冻结", "说明书·视频\n答辩叙事"],
  ];
  s.addShape(pres.shapes.RECTANGLE, { x: 0.7, y: 1.55, w: 8.6, h: 0.035, fill: { color: C.gold } });
  ms.forEach((m, i) => {
    const x = 0.45 + i * 1.9;
    s.addShape(pres.shapes.OVAL, { x: x + 0.6, y: 1.42, w: 0.3, h: 0.3, fill: { color: C.wine } });
    body(s, m[0], x, 1.0, 1.7, 0.3, { size: 13, bold: true, color: C.wine, align: "center" });
    body(s, m[1], x, 1.9, 1.7, 0.35, { size: 13, bold: true, align: "center" });
    body(s, m[2], x, 2.3, 1.7, 0.7, { size: 11, color: C.inkMuted, align: "center" });
  });

  card(s, 0.5, 3.2, 9, 1.65, C.bg);
  body(s, "当前进度", 0.75, 3.4, 8.5, 0.28, { size: 13, bold: true, color: C.gold });
  body(s, "第 1～2 批文档已完成：立项一页纸、PRD 骨架、完整 GDD、互动方案、数值配置；并形成本介绍材料。下一步需人工审核锁定规则后进入研发。", 0.75, 3.8, 8.5, 0.45, { size: 12, color: C.creamDim });
  body(s, "请老师重点审：规则是否够「小而美」· 互动是否过重 · AI 边界是否稳 · 特性是否够赛题 · 范围是否可在赛期内交付。", 0.75, 4.35, 8.5, 0.35, { size: 12, color: C.cream });
  footer(s, 16);
}

const out = path.join(__dirname, "谎馆-项目创意介绍.pptx");
pres.writeFile({ fileName: out })
  .then(() => console.log("OK", out))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
