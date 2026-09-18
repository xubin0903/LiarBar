/**
 * 对局桌入口：只挂舞台 + Presenter。
 * 锁：DRAW_TO_FLIP=1000 / REVEAL_HOLD=3000 / HAND_RING_GAP=24% / 禁 padB 顶高。
 * 场景是舞台；座位/牌/入口/烛来自 Prefab 或已有挂点。
 */
import { _decorator, assetManager, Button, Component, JsonAsset, Node, Prefab, SpriteFrame } from 'cc';
import { ConfigRepository } from '../config/ConfigRepository';
import { MatchEngine } from '../engine/MatchEngine';
import { MatchDirector } from '../common/MatchDirector';
import { LbRouter } from '../common/LbRouter';
import { SF } from './ArtIds';
import { DRAW_TO_FLIP_MS, HAND_RING_GAP_PCT, REVEAL_HOLD_MS } from './Cues';
import { LayoutService } from './Layout';
import { findDeep } from './Nodes';
import { TableFactory, TablePrefabs } from './TableFactory';
import { TablePresenter } from './TablePresenter';
import { CardView } from './views/CardView';
import { HandView } from './views/HandView';
import { PoolView } from './views/PoolView';
import { SeatView } from './views/SeatView';

const { ccclass, property } = _decorator;

const TAG = 'TableScene';

const CFG_UUID = {
  matchDefaults: '38481e0f-ac4e-4c4f-9f0e-91a48002239b',
  deck: '3b7830a6-e668-43c7-b2b0-b891826ad2f4',
  personas: '0963baec-1808-4c6d-b422-433c98cb45e8',
  caps: '690f13e4-d650-4463-8b12-ce68af692b4c',
  demo: 'aacb4c15-595f-492d-a332-9060e05b94b3'
};

const PREFAB_UUID = {
  seat: '4d9b2e31-7c5e-4f0b-b382-5e6f8a9b0123',
  card: '3c8a1f20-6b4d-4e9a-a271-4d5e7f8a9012',
  dealer: '5e0c3f42-8d6f-401c-c493-6f7a9b0c1234',
  challenge: '6f1d4053-9e70-412d-d5a4-708bac1d2345',
  reveal: '702e5164-0f81-423e-e6b5-819cbd2e3456',
  life: '813f6275-1a92-434f-f7c6-92adce3f4567'
};

@ccclass('TableScene')
export class TableScene extends Component {
  @property(SpriteFrame)
  cardBack: SpriteFrame | null = null;

  private engine: MatchEngine = new MatchEngine();
  private director: MatchDirector = new MatchDirector();
  private layout = new LayoutService();
  private presenter: TablePresenter | null = null;
  private btnHome: Node | null = null;

  onLoad(): void {
    if (DRAW_TO_FLIP_MS !== 1000 || REVEAL_HOLD_MS !== 3000 || HAND_RING_GAP_PCT !== 24) {
      console.error(TAG, 'Cues lock broken — refuse boot');
      return;
    }
    void this.boot();
  }

  onDestroy(): void {
    this.director.stop();
  }

  private async boot(): Promise<void> {
    try {
      await this.loadConfigs();
      const frames = await this.loadFrames([
        SF.cardBack,
        SF.cardA,
        SF.cardK,
        SF.cardQ,
        SF.cardJoker,
        SF.doubt,
        SF.believe,
        SF.playerIdle,
        SF.dealerIdle,
        SF.sharkIdle,
        SF.karenIdle,
        SF.timidIdle,
        SF.candleFull,
        SF.candleBody,
        SF.candleFace,
        SF.candleStem,
        SF.flameFull0,
        SF.flameFull1,
        SF.flameFull2,
        SF.flameFull3,
        SF.flameBurn0,
        SF.flameBurn1,
        SF.flameBurn2,
        SF.flameBurn3,
        SF.poolSlot,
        SF.tableBg,
        SF.tableBgLand
      ]);
      const prefabs = await this.loadPrefabs();
      console.log(
        TAG,
        prefabs card= seat= dealer= life= challenge=
      );
      if (!this.cardBack) {
        this.cardBack = frames[SF.cardBack] || null;
      }
      const factory = new TableFactory(prefabs, frames);
      const stage = this.layout.collect(this.node);
      factory.ensureHandCards(stage.hand);
      factory.ensureSelfSeat(stage.seatSelf);
      factory.ensureChallenge(this.node);
      factory.dressTable(stage);
      const filled = this.layout.collect(this.node);
      this.layout.apply(filled);

      const cards = filled.cards.map((n) => new CardView(n));
      const hand = new HandView(cards);
      const seats: SeatView[] = [];
      for (const id of [0, 1, 2, 3]) {
        const n = filled.seats[id];
        if (n) {
          seats.push(new SeatView(n, id, prefabs.card, this.cardBack));
        }
      }
      const pool = filled.pool ? new PoolView(filled.pool, prefabs.card, this.cardBack) : null;
      this.presenter = new TablePresenter(this.engine, filled, hand, seats, this.cardBack, pool);
      
      const rankFrames: { [rank: string]: SpriteFrame } = {
        'A': frames[SF.cardA],
        'K': frames[SF.cardK],
        'Q': frames[SF.cardQ],
        'JOKER': frames[SF.cardJoker]
      };
      this.presenter.setRankFrames(rankFrames);

      const burn = [
        frames[SF.flameBurn0] || frames[SF.flameFull0],
        frames[SF.flameBurn1] || frames[SF.flameFull1],
        frames[SF.flameBurn2] || frames[SF.flameFull2],
        frames[SF.flameBurn3] || frames[SF.flameFull3]
      ].filter((sf): sf is SpriteFrame => !!sf);
      this.presenter.setBurnFrames(burn);
      this.presenter.resetCopy();
      this.unschedule(this.onFlameTick);
      this.schedule(this.onFlameTick, 0.14);

      // Bind Home Button
      this.btnHome = findDeep(this.node, 'lb_btn_home');
      if (this.btnHome) {
        this.btnHome.on(Button.EventType.CLICK, () => {
          this.director.stop();
          LbRouter.toLobby();
        });
      }

      // Hand selection tap / double-tap to play
      hand.onSelectionChanged((count) => {
        if (count > 0 && this.engine.current()?.currentSeatId === 0) {
          // Play selected cards
          this.presenter?.playSelectedCards();
        }
      });

      const ok = this.engine.startMatch({
        nickname: '你',
        playerCount: 4,
        silent: true
      });
      if (!ok) {
        return;
      }
      this.presenter.pump();
      this.scheduleOnce(() => {
        this.engine.dealDone();
        if (this.presenter) {
          this.presenter.pump();
        }
        // Start AI director loop
        this.director.bind(this.engine, () => {
          if (this.presenter) {
            this.presenter.pump();
          }
        });
        this.director.start();
      }, 0.35);

      console.log(
        TAG,
        locks DRAW_TO_FLIP= REVEAL_HOLD= GAP=%
      );
    } catch (e) {
      console.error(TAG, 'boot failed', e);
    }
  }

  private onFlameTick(): void {
    if (this.presenter) {
      this.presenter.tickLives();
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

  private loadPrefabs(): Promise<TablePrefabs> {
    const keys = Object.keys(PREFAB_UUID) as (keyof typeof PREFAB_UUID)[];
    const ids = keys.map((k) => ({ uuid: PREFAB_UUID[k] }));
    return new Promise((resolve) => {
      assetManager.loadAny(ids, (err, assets) => {
        const empty: TablePrefabs = {
          seat: null,
          card: null,
          dealer: null,
          challenge: null,
          reveal: null,
          life: null
        };
        if (err) {
          console.warn(TAG, 'prefab load warning', err);
        }
        const list = (assets as Prefab[]) || [];
        const out: TablePrefabs = { ...empty };
        for (let i = 0; i < keys.length; i++) {
          const uuid = PREFAB_UUID[keys[i]];
          out[keys[i]] = this.pickPrefab(list, uuid);
        }
        resolve(out);
      });
    });
  }

  private pickPrefab(list: Prefab[], uuid: string): Prefab | null {
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p) {
        continue;
      }
      const u = (p as unknown as { _uuid?: string; uuid?: string })._uuid || p.uuid;
      if (u === uuid) {
        return p;
      }
    }
    return null;
  }

  private loadFrames(ids: string[]): Promise<{ [uuid: string]: SpriteFrame }> {
    return new Promise((resolve, reject) => {
      const valid = ids.filter((id) => !!id);
      assetManager.loadAny(
        valid.map((uuid) => ({ uuid })),
        (err, assets) => {
          if (err) {
            console.warn(TAG, 'frame load partial', err);
          }
          const map: { [uuid: string]: SpriteFrame } = {};
          const list = (assets as SpriteFrame[]) || [];
          for (let i = 0; i < list.length; i++) {
            const sf = list[i];
            if (!sf) {
              continue;
            }
            const u = (sf as unknown as { _uuid?: string })._uuid || sf.uuid;
            if (u) {
              map[u] = sf;
              const bare = u.split('@')[0];
              map[bare] = sf;
            }
          }
          for (let j = 0; j < valid.length; j++) {
            if (list[j] && !map[valid[j]]) {
              map[valid[j]] = list[j];
            }
          }
          if (Object.keys(map).length === 0 && err) {
            reject(err);
            return;
          }
          resolve(map);
        }
      );
    });
  }
}
