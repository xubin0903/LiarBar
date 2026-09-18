import {
  Label,
  Node,
  Prefab,
  Sprite,
  SpriteFrame,
  instantiate
} from 'cc';
import { SF } from './ArtIds';
import {
  AVATAR_SIZE,
  CARD_H,
  CARD_W,
  CHALLENGE_BTN_H,
  CHALLENGE_BTN_W,
  DEALER_H,
  DEALER_W,
  DESIGN_H,
  DESIGN_W,
  HAND_SLOTS,
  LIFE_GAP,
  LIFE_SEAT_H,
  LIFE_SEAT_W,
  LIFE_SELF_H,
  LIFE_SELF_W,
  TableStage
} from './Layout';
import { ensureUi, findDeep } from './Nodes';

export interface TablePrefabs {
  seat: Prefab | null;
  card: Prefab | null;
  dealer: Prefab | null;
  challenge: Prefab | null;
  reveal: Prefab | null;
  life: Prefab | null;
}

const SEAT_FACE: { [seat: number]: string } = {
  0: SF.playerIdle,
  1: SF.timidIdle,
  2: SF.sharkIdle,
  3: SF.karenIdle
};

function spawn(prefab: Prefab | null, name: string, layer?: number): Node {
  if (prefab) {
    const n = instantiate(prefab);
    n.name = name;
    if (layer !== undefined) {
      n.layer = layer;
    }
    return n;
  }
  const empty = new Node(name);
  if (layer !== undefined) {
    empty.layer = layer;
  }
  return empty;
}

function addSprite(n: Node, sf: SpriteFrame | null, w: number, h: number): Sprite {
  ensureUi(n, w, h);
  let sp = n.getComponent(Sprite);
  if (!sp) {
    sp = n.addComponent(Sprite);
  }
  sp.sizeMode = Sprite.SizeMode.CUSTOM;
  if (sf) {
    sp.spriteFrame = sf;
  }
  return sp;
}

export class TableFactory {
  constructor(
    private prefabs: TablePrefabs,
    private frames: { [uuid: string]: SpriteFrame }
  ) {}

  frame(id: string): SpriteFrame | null {
    return this.frames[id] || null;
  }

  ensureHandCards(hand: Node | null): Node[] {
    if (!hand) {
      return [];
    }
    const out: Node[] = [];
    for (let i = 0; i < HAND_SLOTS; i++) {
      const name = `lb_cmp_card_${i}`;
      let card = hand.getChildByName(name);
      if (!card) {
        card = spawn(this.prefabs.card, name, hand.layer);
        hand.addChild(card);
        addSprite(card, this.frame(SF.cardBack), CARD_W, CARD_H);
      }
      card.layer = hand.layer;
      out.push(card);
    }
    return out;
  }

  ensureSeat(parent: Node | null, seat: number, name: string): Node | null {
    if (!parent) {
      return null;
    }
    let node = findDeep(parent, name);
    if (node) {
      return node;
    }
    node = spawn(this.prefabs.seat, name);
    parent.addChild(node);
    return node;
  }

  ensureSelfSeat(self: Node | null): void {
    if (!self) {
      return;
    }
    let avatar = self.getChildByName('lb_cmp_seat_self_avatar');
    if (!avatar) {
      avatar = new Node('lb_cmp_seat_self_avatar');
      avatar.layer = self.layer;
      self.addChild(avatar);
      addSprite(avatar, this.frame(SF.playerIdle), AVATAR_SIZE, AVATAR_SIZE);
      avatar.setPosition(0, 16, 0);
    }
    let nameN = self.getChildByName('lb_cmp_seat_self_name');
    if (!nameN) {
      nameN = new Node('lb_cmp_seat_self_name');
      nameN.layer = self.layer;
      self.addChild(nameN);
      ensureUi(nameN, 120, 22);
      const lab = nameN.addComponent(Label);
      lab.fontSize = 18;
      lab.string = '你';
      nameN.setPosition(0, -56, 0);
    }
  }

  dressTable(stage: TableStage): void {
    this.dressBg(stage.bg);
    this.dressDealer(stage.dealer);
    this.dressAvatar(stage.seats[0], 'lb_cmp_seat_self_avatar', 0);
    this.dressAvatar(stage.seats[1], 'lb_cmp_seat_p1_avatar', 1);
    this.dressAvatar(stage.seats[2], 'lb_cmp_seat_p2_avatar', 2);
    this.dressAvatar(stage.seats[3], 'lb_cmp_seat_p3_avatar', 3);
    this.dressPool(stage.pool);
    if (stage.poolCount) {
      stage.poolCount.active = false;
    }
    this.ensureLives(stage);
  }

  ensureLives(stage: TableStage): void {
    this.fillLife(stage.lifeSelf || this.makeLife(stage.seatSelf, 'lb_cmp_life_self'), false);
    this.fillLife(this.makeLife(stage.seats[1], 'lb_cmp_life_seat_p1'), true);
    this.fillLife(this.makeLife(stage.seats[2], 'lb_cmp_life_seat_p2'), true);
    this.fillLife(this.makeLife(stage.seats[3], 'lb_cmp_life_seat_p3'), true);
  }

  ensureChallenge(parent: Node | null): Node | null {
    if (!parent) {
      return null;
    }
    let entry = findDeep(parent, 'lb_cmp_challenge_entry');
    if (!entry) {
      entry = spawn(this.prefabs.challenge, 'lb_cmp_challenge_entry', parent.layer);
      parent.addChild(entry);
    }
    if (!entry.getChildByName('lb_btn_challenge_doubt')) {
      const doubt = new Node('lb_btn_challenge_doubt');
      entry.addChild(doubt);
      addSprite(doubt, this.frame(SF.doubt), CHALLENGE_BTN_W, CHALLENGE_BTN_H);
      const believe = new Node('lb_btn_challenge_believe');
      entry.addChild(believe);
      addSprite(believe, this.frame(SF.believe), CHALLENGE_BTN_W, CHALLENGE_BTN_H);
    }
    entry.active = false;
    return entry;
  }

  private dressBg(bg: Node | null): void {
    if (!bg) {
      return;
    }
    const land = this.frame(SF.tableBgLand);
    const felt = land || this.frame(SF.tableBg);
    addSprite(bg, felt, DESIGN_W, DESIGN_H);
  }

  private dressDealer(dealer: Node | null): void {
    if (!dealer) {
      return;
    }
    addSprite(dealer, this.frame(SF.dealerIdle), DEALER_W, DEALER_H);
  }

  private dressPool(pool: Node | null): void {
    if (!pool) {
      return;
    }
    const slot = pool.getComponent(Sprite);
    if (slot) {
      slot.enabled = false;
      slot.spriteFrame = null;
    }
  }

  private dressAvatar(seat: Node | null, childName: string, id: number): void {
    if (!seat) {
      return;
    }
    this.hideExtraPortraits(seat);
    let avatar = findDeep(seat, childName);
    if (!avatar) {
      avatar = new Node(childName);
      avatar.layer = seat.layer;
      seat.addChild(avatar);
    }
    addSprite(avatar, this.frame(SEAT_FACE[id]), AVATAR_SIZE, AVATAR_SIZE);
  }

  /** 只留 lb_cmp_seat_*_avatar 大半身，预制体残留的小 avatar / 座位根节点 Sprite 关掉。 */
  private hideExtraPortraits(seat: Node): void {
    const rootSp = seat.getComponent(Sprite);
    if (rootSp) {
      rootSp.enabled = false;
      rootSp.spriteFrame = null;
    }
    const leftover = seat.getChildByName('avatar');
    if (leftover) {
      leftover.active = false;
    }
  }

  private makeLife(parent: Node | null, name: string): Node | null {
    if (!parent) {
      return findDeep(null, name);
    }
    let g = findDeep(parent, name);
    if (!g) {
      g = spawn(this.prefabs.life, name, parent.layer);
      parent.addChild(g);
    }
    g.layer = parent.layer;
    return g;
  }

  private fillLife(group: Node | null, compact: boolean): void {
    if (!group) {
      return;
    }
    const pipW = compact ? LIFE_SEAT_W : LIFE_SELF_W;
    const pipH = compact ? LIFE_SEAT_H : LIFE_SELF_H;
    const rootSp = group.getComponent(Sprite);
    if (rootSp) {
      rootSp.enabled = false;
    }
    let frame = group.getChildByName('lb_cmp_life_self_frame');
    if (!frame && !compact) {
      frame = new Node('lb_cmp_life_self_frame');
      frame.layer = group.layer;
      group.addChild(frame);
    }
    const host = frame || group;
    host.layer = group.layer;
    ensureUi(host, pipW * 3 + LIFE_GAP * 2 + 4, pipH + 10);
    for (let i = 0; i < 3; i++) {
      const pipName = `lb_cmp_life_pip_${i}`;
      let n = host.getChildByName(pipName) || group.getChildByName(pipName);
      if (!n) {
        n = new Node(pipName);
        host.addChild(n);
      }
      n.layer = group.layer;
      n.setPosition((i - 1) * (pipW + LIFE_GAP), 0, 0);
      const pipSp = n.getComponent(Sprite);
      if (pipSp) {
        pipSp.enabled = false;
        pipSp.spriteFrame = null;
      }
      const oldFace = n.getChildByName(`lb_cmp_life_face_${i}`);
      if (oldFace) {
        oldFace.active = false;
      }
      const oldDraw = n.getChildByName(`lb_cmp_life_draw_${i}`);
      if (oldDraw) {
        oldDraw.active = false;
      }
      ensureUi(n, pipW, pipH);
      let body = n.getChildByName(`lb_cmp_life_body_${i}`);
      if (!body) {
        body = new Node(`lb_cmp_life_body_${i}`);
        n.addChild(body);
      }
      body.layer = group.layer;
      body.active = false;
      let flame = n.getChildByName(`lb_cmp_life_flame_${i}`);
      if (!flame) {
        flame = new Node(`lb_cmp_life_flame_${i}`);
        n.addChild(flame);
      }
      flame.layer = group.layer;
      flame.active = true;
      flame.setPosition(0, 0, 0);
      addSprite(
        flame,
        this.frame(SF.flameBurn0) || this.frame(SF.candleStem) || this.frame(SF.candleFace),
        pipW,
        pipH
      );
      n.active = true;
    }
  }
}
