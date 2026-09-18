/**
 * 局内相对几何 · 真源 docs/21 + TableLayout.ets。
 * 设计 1280×720，原点=桌心；禁 padB 顶高；GAP 只在心下→牌上。
 */
import { Node, UITransform, Widget } from 'cc';
import { HAND_RING_GAP_PCT } from './Cues';
import { findDeep, uiOf } from './Nodes';

export const DESIGN_W = 1280;
export const DESIGN_H = 720;
export const TOPBAR_PCT = 12;
export const SELF_SLOT_PCT = 16;
export const HAND_BAND_PCT = 19;
export const CARD_W = 88;
export const CARD_H = 124;
export const CARD_GAP = 16;
export const HAND_SLOTS = 5;
export const SEAT_W = 150;
export const SEAT_H = 210;
export const AVATAR_SIZE = 110;
export const DEALER_W = 110;
export const DEALER_H = 124;
export const POOL_W = 100;
export const POOL_H = 114;
export const LIFE_SELF = 62;
export const LIFE_SEAT = 50;
export const LIFE_SELF_W = 28;
export const LIFE_SELF_H = 62;
export const LIFE_SEAT_W = 24;
export const LIFE_SEAT_H = 54;
export const LIFE_GAP = 4;
export const CHALLENGE_BTN_W = 168;
export const CHALLENGE_BTN_H = 56;
export const REVEAL_OFFSET_Y = -56;

export interface TableStage {
  root: Node;
  bg: Node | null;
  safe: Node | null;
  topbar: Node | null;
  claim: Node | null;
  tip: Node | null;
  judge: Node | null;
  timer: Node | null;
  home: Node | null;
  playfield: Node | null;
  heart: Node | null;
  dealer: Node | null;
  pool: Node | null;
  poolCount: Node | null;
  gap: Node | null;
  bottom: Node | null;
  seatSelf: Node | null;
  lifeSelf: Node | null;
  lives: { [seat: number]: Node | null };
  hand: Node | null;
  cards: Node[];
  seats: { [seat: number]: Node | null };
  challenge: Node | null;
  doubt: Node | null;
  believe: Node | null;
  revealDim: Node | null;
  revealStage: Node | null;
}

export class LayoutService {
  collect(root: Node): TableStage {
    const cards: Node[] = [];
    for (let i = 0; i < HAND_SLOTS; i++) {
      const card = findDeep(root, `lb_cmp_card_${i}`);
      if (card) {
        cards.push(card);
      }
    }
    return {
      root,
      bg: findDeep(root, 'lb_cmp_table_bg'),
      safe: findDeep(root, 'lb_cmp_safe_frame'),
      topbar: findDeep(root, 'lb_cmp_topbar'),
      claim: findDeep(root, 'lb_txt_claim'),
      tip: findDeep(root, 'lb_cmp_table_tip'),
      judge: findDeep(root, 'lb_txt_judge'),
      timer: findDeep(root, 'lb_txt_timer'),
      home: findDeep(root, 'lb_btn_home'),
      playfield: findDeep(root, 'lb_cmp_playfield'),
      heart: findDeep(root, 'lb_cmp_table_heart'),
      dealer: findDeep(root, 'lb_cmp_dealer'),
      pool: findDeep(root, 'lb_cmp_pool'),
      poolCount: findDeep(root, 'lb_txt_pool_count'),
      gap: findDeep(root, 'lb_cmp_ring_hand_gap'),
      bottom: findDeep(root, 'lb_cmp_bottom_band'),
      seatSelf: findDeep(root, 'lb_cmp_seat_self'),
      lifeSelf: findDeep(root, 'lb_cmp_life_self'),
      lives: {
        0: findDeep(root, 'lb_cmp_life_self'),
        1: findDeep(root, 'lb_cmp_life_seat_p1'),
        2: findDeep(root, 'lb_cmp_life_seat_p2'),
        3: findDeep(root, 'lb_cmp_life_seat_p3')
      },
      hand: findDeep(root, 'lb_cmp_hand'),
      cards,
      seats: {
        0: findDeep(root, 'lb_cmp_seat_self'),
        1: findDeep(root, 'lb_cmp_seat_p1'),
        2: findDeep(root, 'lb_cmp_seat_p2'),
        3: findDeep(root, 'lb_cmp_seat_p3')
      },
      challenge: findDeep(root, 'lb_cmp_challenge_entry'),
      doubt: findDeep(root, 'lb_btn_challenge_doubt'),
      believe: findDeep(root, 'lb_btn_challenge_believe'),
      revealDim: findDeep(root, 'lb_cmp_reveal_dim'),
      revealStage: findDeep(root, 'lb_cmp_reveal_stage')
    };
  }

  apply(stage: TableStage): void {
    const topH = DESIGN_H * (TOPBAR_PCT / 100);
    const bottomH = DESIGN_H * (HAND_BAND_PCT / 100);
    const gapH = DESIGN_H * (HAND_RING_GAP_PCT / 100);
    const selfW = DESIGN_W * (SELF_SLOT_PCT / 100);

    this.sizeAt(stage.root, DESIGN_W, DESIGN_H, 0, 0);
    this.place(stage.bg, 0, 0, DESIGN_W, DESIGN_H);
    this.place(stage.safe, 0, 0, DESIGN_W, DESIGN_H);
    this.place(stage.topbar, 0, DESIGN_H / 2 - topH / 2, DESIGN_W, topH);
    this.place(stage.bottom, 0, -DESIGN_H / 2 + bottomH / 2, DESIGN_W, bottomH);
    this.place(stage.gap, 0, -DESIGN_H / 2 + bottomH + gapH / 2, DESIGN_W, gapH);

    const playTop = DESIGN_H / 2 - topH;
    const playBot = -DESIGN_H / 2 + bottomH + gapH;
    const playH = playTop - playBot;
    const playY = (playTop + playBot) / 2;
    this.place(stage.playfield, 0, playY, DESIGN_W, playH);
    this.place(stage.heart, 0, -playY, 360, 200);

    this.place(stage.claim, -DESIGN_W / 2 + 120, 18, 360, 32);
    this.place(stage.tip, -DESIGN_W / 2 + 120, -12, 360, 26);
    this.place(stage.judge, -DESIGN_W / 2 + 120, -38, 360, 26);
    this.place(stage.timer, 0, 8, 160, 48);
    this.place(stage.home, DESIGN_W / 2 - 48, 0, 44, 44);

    // 桌心横排：荷官略左，右侧只放一个齐整的放牌槽。
    this.place(stage.dealer, -76, 8, DEALER_W, DEALER_H);
    this.place(stage.pool, 52, 6, POOL_W, POOL_H);
    this.place(stage.poolCount, 58, -86, 80, 20);

    this.place(stage.seats[2], 0, playH / 2 - 12, SEAT_W, SEAT_H);
    this.place(stage.seats[3], -DESIGN_W / 2 + 118, -50, SEAT_W, SEAT_H);
    this.place(stage.seats[1], DESIGN_W / 2 - 118, -50, SEAT_W, SEAT_H);

    this.place(stage.seatSelf, -DESIGN_W / 2 + selfW / 2, 8, selfW, bottomH - 8);
    this.place(stage.lifeSelf, -DESIGN_W / 2 + selfW + 52, 8, LIFE_SELF_W * 3 + LIFE_GAP * 2 + 8, LIFE_SELF_H + 8);
    this.place(stage.lives[2], 78, 34, LIFE_SEAT_W * 3 + LIFE_GAP * 2 + 8, LIFE_SEAT_H + 8);
    this.place(stage.lives[1], -118, -28, LIFE_SEAT_W * 3 + LIFE_GAP * 2 + 8, LIFE_SEAT_H + 8);
    this.place(stage.lives[3], 118, -28, LIFE_SEAT_W * 3 + LIFE_GAP * 2 + 8, LIFE_SEAT_H + 8);
    this.place(stage.hand, 0, 4, HAND_SLOTS * CARD_W + (HAND_SLOTS - 1) * CARD_GAP, CARD_H);
    this.layoutAvatars(stage);
    this.layoutHand(stage.cards);

    this.place(stage.challenge, 0, -DESIGN_H / 2 + bottomH + 40, 380, 64);
    this.place(stage.doubt, -CHALLENGE_BTN_W / 2 - 12, 0, CHALLENGE_BTN_W, CHALLENGE_BTN_H);
    this.place(stage.believe, CHALLENGE_BTN_W / 2 + 12, 0, CHALLENGE_BTN_W, CHALLENGE_BTN_H);

    this.place(stage.revealDim, 0, 0, DESIGN_W, DESIGN_H);
    this.place(stage.revealStage, 0, REVEAL_OFFSET_Y, CARD_W * 0.9, CARD_H * 0.9);

    this.stripStretchWidget(stage.safe);
    this.stripStretchWidget(stage.topbar);
    this.stripStretchWidget(stage.playfield);
    this.stripStretchWidget(stage.gap);
    this.stripStretchWidget(stage.bottom);
    this.stripStretchWidget(stage.challenge);
    this.stripStretchWidget(stage.hand);
    this.stripStretchWidget(stage.seatSelf);
  }

  private layoutAvatars(stage: TableStage): void {
    this.sizeChild(stage.seats[0], 'lb_cmp_seat_self_avatar', 0, 16, AVATAR_SIZE, AVATAR_SIZE);
    this.sizeChild(stage.seats[0], 'lb_cmp_seat_self_name', 0, -56, 120, 22);
    for (const id of [1, 2, 3]) {
      this.sizeChild(stage.seats[id], `lb_cmp_seat_p${id}_avatar`, 0, 36, AVATAR_SIZE, AVATAR_SIZE);
      this.sizeChild(stage.seats[id], `lb_cmp_seat_p${id}_name`, 0, -36, 120, 22);
    }
  }

  private sizeChild(parent: Node | null, name: string, x: number, y: number, w: number, h: number): void {
    if (!parent) {
      return;
    }
    const n = findDeep(parent, name);
    this.place(n, x, y, w, h);
  }

  layoutHand(cards: Node[]): void {
    const rowW = HAND_SLOTS * CARD_W + (HAND_SLOTS - 1) * CARD_GAP;
    const left = -rowW / 2 + CARD_W / 2;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (!card) {
        continue;
      }
      this.place(card, left + i * (CARD_W + CARD_GAP), 0, CARD_W, CARD_H);
    }
  }

  assertLocks(): string[] {
    const errors: string[] = [];
    if (HAND_RING_GAP_PCT !== 24) {
      errors.push('HAND_RING_GAP broken');
    }
    return errors;
  }

  private place(n: Node | null, x: number, y: number, w: number, h: number): void {
    if (!n) {
      return;
    }
    this.sizeAt(n, w, h, x, y);
  }

  private sizeAt(n: Node, w: number, h: number, x: number, y: number): void {
    let ui = n.getComponent(UITransform);
    if (!ui) {
      ui = n.addComponent(UITransform);
    }
    ui.setContentSize(w, h);
    ui.setAnchorPoint(0.5, 0.5);
    n.setPosition(x, y, 0);
  }

  /** 禁用 Widget 底 padding 顶高手牌。 */
  private stripStretchWidget(n: Node | null): void {
    if (!n) {
      return;
    }
    const w = n.getComponent(Widget);
    if (w) {
      w.enabled = false;
    }
    const ui = uiOf(n);
    if (ui && n.name === 'lb_cmp_ring_hand_gap') {
      const expect = DESIGN_H * (HAND_RING_GAP_PCT / 100);
      if (Math.abs(ui.contentSize.height - expect) > 2) {
        ui.setContentSize(ui.contentSize.width, expect);
      }
    }
  }
}
