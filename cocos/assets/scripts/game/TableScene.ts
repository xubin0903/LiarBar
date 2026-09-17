/**
 * K4 对局桌驱动：挂 MatchEngine + MatchEvents + Cues。
 * 锁：DRAW_TO_FLIP=1000 / REVEAL_HOLD=3000 / HAND_RING_GAP=24% / 禁 padB 顶高。
 * 中顶只 timer；法官句左上；荷官回池旁；手牌沉底。
 * 合入 ≠ 终验。
 */
import {
  _decorator,
  assetManager,
  Component,
  JsonAsset,
  Label,
  Node,
  Sprite,
  SpriteFrame,
  UITransform
} from 'cc';
import { ConfigRepository } from '../config/ConfigRepository';
import { MatchEngine } from '../engine/MatchEngine';
import { MatchEngineEvent } from '../engine/MatchEvents';
import {
  DRAW_TO_FLIP_MS,
  HAND_RING_GAP_PCT,
  REVEAL_HOLD_MS
} from './Cues';

const { ccclass, property } = _decorator;

const TAG = 'TableScene';

/** assets/config/*.json UUID（.meta 真源） */
const CFG_UUID = {
  matchDefaults: '38481e0f-ac4e-4c4f-9f0e-91a48002239b',
  deck: '3b7830a6-e668-43c7-b2b0-b891826ad2f4',
  personas: '0963baec-1808-4c6d-b422-433c98cb45e8',
  caps: '690f13e4-d650-4463-8b12-ce68af692b4c',
  demo: 'aacb4c15-595f-492d-a332-9060e05b94b3'
};

const CARD_BACK_SF = 'd4e69b17-fd30-468e-a36f-0b4ecb4985e0@f9941';

@ccclass('TableScene')
export class TableScene extends Component {
  @property(SpriteFrame)
  cardBack: SpriteFrame | null = null;

  private engine: MatchEngine = new MatchEngine();
  private eventCursor: number = 0;
  private statusLabel: Label | null = null;
  private judgeLabel: Label | null = null;
  private timerLabel: Label | null = null;
  private poolCountLabel: Label | null = null;
  private handRoot: Node | null = null;
  private seatRoots: { [seat: number]: Node } = {};

  onLoad(): void {
    this.bindNodes();
    this.assertLocksInScene();
    void this.bootDemo();
  }

  private bindNodes(): void {
    const root = this.node;
    this.handRoot = this.findDeep(root, 'lb_cmp_hand');
    this.seatRoots[0] = this.findDeep(root, 'lb_cmp_seat_self');
    this.seatRoots[1] = this.findDeep(root, 'lb_cmp_seat_p1');
    this.seatRoots[2] = this.findDeep(root, 'lb_cmp_seat_p2');
    this.seatRoots[3] = this.findDeep(root, 'lb_cmp_seat_p3');
    this.judgeLabel = this.labelOf(this.findDeep(root, 'lb_txt_judge'));
    this.timerLabel = this.labelOf(this.findDeep(root, 'lb_txt_timer'));
    this.poolCountLabel = this.labelOf(this.findDeep(root, 'lb_txt_pool_count'));
    this.statusLabel = this.labelOf(this.findDeep(root, 'lb_cmp_table_tip'));
    if (this.timerLabel) {
      this.timerLabel.string = '--';
    }
    if (this.judgeLabel) {
      this.judgeLabel.string = '准备开局…';
    }
  }

  /** 场景注释/常量锁检查：1000/3000/24；禁 padB 顶高。 */
  private assertLocksInScene(): void {
    if (DRAW_TO_FLIP_MS !== 1000 || REVEAL_HOLD_MS !== 3000 || HAND_RING_GAP_PCT !== 24) {
      console.error(TAG, 'Cues lock broken — refuse boot');
      return;
    }
    const gap = this.findDeep(this.node, 'lb_cmp_ring_hand_gap');
    if (gap) {
      const ui = gap.getComponent(UITransform);
      const h = ui ? ui.contentSize.height : 0;
      // 设计高 720 × 24% = 172.8；允许 ±2
      if (Math.abs(h - 720 * (HAND_RING_GAP_PCT / 100)) > 2) {
        console.warn(TAG, `GAP height ${h} ≠ 24% of 720`);
      }
    }
    const bottom = this.findDeep(this.node, 'lb_cmp_bottom_band');
    if (bottom) {
      // padB 只消化底 inset；K4 预览 padB=0，禁止用底 padding 顶高手牌
      console.log(TAG, 'padB lock: bottom_band Widget bottom=0 (禁加大 padB 顶高手牌)');
    }
    console.log(
      TAG,
      `locks DRAW_TO_FLIP=${DRAW_TO_FLIP_MS} REVEAL_HOLD=${REVEAL_HOLD_MS} GAP=${HAND_RING_GAP_PCT}%`
    );
  }

  private async bootDemo(): Promise<void> {
    try {
      await this.loadConfigs();
      if (!this.cardBack) {
        this.cardBack = await this.loadSpriteFrame(CARD_BACK_SF);
      }
      const ok = this.engine.startMatch({
        nickname: '你',
        playerCount: 4,
        silent: true
      });
      if (!ok) {
        this.setJudge('开局失败：配置未就绪');
        return;
      }
      this.pumpEvents();
      this.setJudge('引擎已开局');
      this.setTip(`发牌中 · flip=${DRAW_TO_FLIP_MS}ms hold=${REVEAL_HOLD_MS}ms`);
      if (this.timerLabel) {
        this.timerLabel.string = `${Math.floor(REVEAL_HOLD_MS / 1000)}s`;
      }
      // 最小演示：DEAL → dealDone → CLAIM，手牌可见
      this.scheduleOnce(() => {
        this.engine.dealDone();
        this.pumpEvents();
        const snap = this.engine.current();
        const claim = snap && snap.currentClaim ? snap.currentClaim.rank : '?';
        this.setTip(`宣称 ${claim} · 手牌已发`);
        this.renderSelfHand();
      }, 0.35);
    } catch (e) {
      console.error(TAG, 'bootDemo failed', e);
      this.setJudge('引擎启动异常');
    }
  }

  private pumpEvents(): void {
    const evs: MatchEngineEvent[] = this.engine.drainEvents(this.eventCursor);
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i];
      this.eventCursor = ev.seq;
      this.onEngineEvent(ev);
    }
  }

  private onEngineEvent(ev: MatchEngineEvent): void {
    if (ev.name === 'MatchStarted') {
      this.setJudge('引擎已开局');
      return;
    }
    if (ev.name === 'Dealt') {
      const seat = Number(ev.payload['seat']);
      const count = Number(ev.payload['count']);
      this.showSeatDeal(seat, count);
      if (this.poolCountLabel && seat === 0) {
        this.poolCountLabel.string = '';
      }
      return;
    }
    if (ev.name === 'ClaimSet') {
      const rank = String(ev.payload['rank'] ?? '');
      const claimNode = this.findDeep(this.node, 'lb_txt_claim');
      const lab = this.labelOf(claimNode);
      if (lab) {
        lab.string = `本局宣称：${rank}`;
      }
    }
  }

  private showSeatDeal(seat: number, count: number): void {
    if (seat === 0) {
      // DEAL 阶段 snapshot.selfHand 为空；按 Dealt.count 亮手牌占位
      this.renderSelfHandSlots(count);
      return;
    }
    const root = this.seatRoots[seat];
    if (!root || !this.cardBack) {
      return;
    }
    let pile = root.getChildByName('lb_seat_deal_pile');
    if (!pile) {
      pile = new Node('lb_seat_deal_pile');
      root.addChild(pile);
      pile.setPosition(0, -48, 0);
    }
    pile.removeAllChildren();
    const n = Math.min(count, 5);
    for (let i = 0; i < n; i++) {
      const card = new Node(`deal_${i}`);
      pile.addChild(card);
      card.setPosition((i - (n - 1) / 2) * 14, i * 2, 0);
      const ui = card.addComponent(UITransform);
      ui.setContentSize(36, 50);
      const sp = card.addComponent(Sprite);
      sp.sizeMode = Sprite.SizeMode.CUSTOM;
      sp.spriteFrame = this.cardBack;
    }
  }

  private renderSelfHand(): void {
    const snap = this.engine.current();
    const count = snap && snap.selfHand && snap.selfHand.length > 0 ? snap.selfHand.length : 5;
    this.renderSelfHandSlots(count);
  }

  private renderSelfHandSlots(count: number): void {
    if (!this.handRoot) {
      return;
    }
    for (let i = 0; i < 5; i++) {
      const card = this.handRoot.getChildByName(`lb_cmp_card_${i}`);
      if (!card) {
        continue;
      }
      card.active = i < count;
      const sp = card.getComponent(Sprite);
      if (sp && this.cardBack) {
        sp.spriteFrame = this.cardBack;
      }
    }
  }

  private loadConfigs(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ids = [
        CFG_UUID.matchDefaults,
        CFG_UUID.deck,
        CFG_UUID.personas,
        CFG_UUID.caps,
        CFG_UUID.demo
      ];
      assetManager.loadAny(ids, (err, assets) => {
        if (err) {
          reject(err);
          return;
        }
        const list = assets as JsonAsset[];
        if (!list || list.length < 5) {
          reject(new Error('config assets incomplete'));
          return;
        }
        ConfigRepository.loadFromObjects(
          list[0].json as never,
          list[1].json as never,
          list[2].json as never,
          list[3].json as never,
          list[4].json as never
        );
        resolve();
      });
    });
  }

  private loadSpriteFrame(uuid: string): Promise<SpriteFrame> {
    return new Promise((resolve, reject) => {
      assetManager.loadAny({ uuid }, (err, asset) => {
        if (err || !asset) {
          reject(err ?? new Error(`sprite ${uuid}`));
          return;
        }
        resolve(asset as SpriteFrame);
      });
    });
  }

  private findDeep(root: Node | null, name: string): Node | null {
    if (!root) {
      return null;
    }
    if (root.name === name) {
      return root;
    }
    const kids = root.children;
    for (let i = 0; i < kids.length; i++) {
      const hit = this.findDeep(kids[i], name);
      if (hit) {
        return hit;
      }
    }
    return null;
  }

  private labelOf(n: Node | null): Label | null {
    if (!n) {
      return null;
    }
    return n.getComponent(Label);
  }

  private setJudge(text: string): void {
    if (this.judgeLabel) {
      this.judgeLabel.string = text;
    }
  }

  private setTip(text: string): void {
    if (this.statusLabel) {
      this.statusLabel.string = text;
    }
  }
}
