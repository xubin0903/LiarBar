import {
  _decorator,
  Component,
  Node,
  Sprite,
  SpriteFrame,
  EditBox,
  Label,
  Toggle,
  Button,
  AudioSource,
  tween,
  Vec3,
  Color,
  director,
  assetManager,
  UIOpacity
} from 'cc';
import { ControlIds, OverlayIds, ScreenIds } from '../common/Ids';
import { DealerIdleKind, DealerIdleMachine } from './DealerIdleMachine';
import { LobbyAudio } from './LobbyAudio';
import { BootMarks, LobbyBoot, LobbySession } from './LobbyBoot';
import { MatchLoad } from './MatchLoad';

const { ccclass, property } = _decorator;

const DEALER_FRAMES = {
  idle: 'ef4c044d-3c50-4c65-9cd5-3db74cd52ca6@f9941',
  blink: '36c2b805-d090-48d1-a8c1-467f66d08e7b@f9941',
  nod: '06666ced-6cd1-401f-9bc1-3e5c03e4063c@f9941',
  cup: '9c775da8-9af2-44b8-9f97-91e7f6222f19@f9941',
  mask: '43f5949d-b5af-4ead-8797-a233ffaa425a@f9941',
  announce: '27921f84-3761-436f-96d7-7db2a5c918d1@f9941'
};

const FLAME_FRAMES = [
  '3c91b217-b748-4448-ba2e-9ee7f736d9b3@f9941',
  'da883676-f947-4fcf-bb04-ef08ed74a8f7@f9941',
  '5f80cb2e-73f7-4610-8f9b-ba9c27c73638@f9941',
  'eb8c7a0b-0c0d-4e41-8d8a-6e78362acd77@f9941'
];

@ccclass('LobbyScene')
export class LobbyScene extends Component {
  @property(Node)
  nodeBg: Node | null = null;

  @property(Node)
  nodeSplash: Node | null = null;

  @property(Node)
  nodeDust: Node | null = null;

  @property(Node)
  nodeDealer: Node | null = null;

  @property(Node)
  nodeCandle: Node | null = null;

  @property(Node)
  nodeFlame: Node | null = null;

  @property(Node)
  nodeTopbar: Node | null = null;

  @property(Node)
  nodePanel: Node | null = null;

  @property(EditBox)
  editNickname: EditBox | null = null;

  @property(Label)
  lblPlayerCount: Label | null = null;

  @property(Toggle)
  toggleSilent: Toggle | null = null;

  @property(Button)
  btnQuickStart: Button | null = null;

  @property(Button)
  btnPeekTable: Button | null = null;

  @property(Node)
  nodeMatchLoad: Node | null = null;

  @property(AudioSource)
  audioBgm: AudioSource | null = null;

  @property(AudioSource)
  audioAmb: AudioSource | null = null;

  @property(AudioSource)
  audioSfx: AudioSource | null = null;

  private dealerSprites: Map<string, SpriteFrame> = new Map();
  private flameSprites: SpriteFrame[] = [];
  private idleMachine: DealerIdleMachine = new DealerIdleMachine();
  private flameIndex: number = 0;
  private isBootReady: boolean = false;
  private isMatchLoading: boolean = false;
  private currentDealerKind: string = DealerIdleKind.IDLE;

  onLoad(): void {
    if (this.audioBgm && this.audioAmb && this.audioSfx) {
      LobbyAudio.init(this.audioBgm, this.audioAmb, this.audioSfx);
    }
    this.bindControls();
    this.loadAssetsAndBoot();
  }

  private bindControls(): void {
    if (this.btnQuickStart) {
      this.btnQuickStart.node.on(Button.EventType.CLICK, this.onQuickStartClick, this);
    }
    if (this.btnPeekTable) {
      this.btnPeekTable.node.on(Button.EventType.CLICK, this.onPeekTableClick, this);
    }
    if (this.toggleSilent) {
      this.toggleSilent.node.on('toggle', this.onSilentToggle, this);
    }
    if (this.editNickname) {
      this.editNickname.string = '你';
    }
    if (this.lblPlayerCount) {
      this.lblPlayerCount.string = '人数 4 · 命 3';
    }
    if (this.nodeMatchLoad) {
      this.nodeMatchLoad.active = false;
    }
  }

  private async loadAssetsAndBoot(): Promise<void> {
    const dealerUuids = Object.values(DEALER_FRAMES);
    for (const [key, uuid] of Object.entries(DEALER_FRAMES)) {
      assetManager.loadAny({ uuid }, (err, sf) => {
        if (!err && sf instanceof SpriteFrame) {
          this.dealerSprites.set(key, sf);
        }
      });
    }

    for (let i = 0; i < FLAME_FRAMES.length; i++) {
      assetManager.loadAny({ uuid: FLAME_FRAMES[i] }, (err, sf) => {
        if (!err && sf instanceof SpriteFrame) {
          this.flameSprites[i] = sf;
        }
      });
    }

    this.schedule(this.tickFlame, 0.12);
    this.startBootAnimation();
  }

  private startBootAnimation(): void {
    const isCold = LobbySession.takeColdStart();
    const totalMs = isCold ? LobbyBoot.BOOT_MS_TOTAL : LobbyBoot.BOOT_MS_RETURN_ENTER;
    const plan = LobbyBoot.plan(totalMs);

    const splashOp = this.nodeSplash?.getComponent(UIOpacity);
    const topbarOp = this.nodeTopbar?.getComponent(UIOpacity);
    const panelOp = this.nodePanel?.getComponent(UIOpacity);
    const ctaOp = this.btnQuickStart?.node.getComponent(UIOpacity);
    const peekOp = this.btnPeekTable?.node.getComponent(UIOpacity);

    if (splashOp) splashOp.opacity = 255;
    if (topbarOp) topbarOp.opacity = 0;
    if (panelOp) panelOp.opacity = 0;
    if (ctaOp) ctaOp.opacity = 0;
    if (peekOp) peekOp.opacity = 0;

    // T0: Fade out splash
    if (this.nodeSplash && splashOp) {
      tween(splashOp)
        .delay(plan.t0Ms / 1000)
        .to(plan.t1Ms / 1000, { opacity: 0 })
        .call(() => {
          if (this.nodeSplash) this.nodeSplash.active = false;
        })
        .start();
    }

    // Hit SFX
    this.scheduleOnce(() => {
      LobbyAudio.playBootHit();
    }, plan.hitAt / 1000);

    // AMB & BGM
    this.scheduleOnce(() => {
      LobbyAudio.startAmb(plan.ambFadeMs);
    }, plan.ambAt / 1000);

    this.scheduleOnce(() => {
      LobbyAudio.startBgm(plan.bgmFadeMs, false);
    }, plan.bgmAt / 1000);

    // Dealer Voice
    this.scheduleOnce(() => {
      this.playDealerAnnounce();
      LobbyAudio.playVoGreet();
    }, plan.t4At / 1000);

    // UI Stagger in
    this.scheduleOnce(() => {
      if (topbarOp) {
        tween(topbarOp).to(0.3, { opacity: 255 }).start();
      }
      if (panelOp) {
        tween(panelOp).to(0.35, { opacity: 255 }).start();
      }
      if (ctaOp) {
        tween(ctaOp).to(0.4, { opacity: 255 }).start();
      }
      if (peekOp) {
        tween(peekOp).to(0.4, { opacity: 255 }).start();
      }
    }, plan.t5At / 1000);

    // Clickable Ready
    this.scheduleOnce(() => {
      this.isBootReady = true;
      this.idleMachine.reset(Date.now());
      this.schedule(this.tickDealerIdle, 2.5);
    }, plan.clickableAt / 1000);
  }

  private playDealerAnnounce(): void {
    this.setDealerSprite('announce');
    this.scheduleOnce(() => {
      this.setDealerSprite('idle');
    }, 2.5);
  }

  private tickDealerIdle(): void {
    if (!this.isBootReady || this.isMatchLoading) return;
    const now = Date.now();
    const action = this.idleMachine.pick(now, false);
    if (action === DealerIdleKind.BLINK) {
      this.setDealerSprite('blink');
      this.idleMachine.markPlayed(action, now);
      this.scheduleOnce(() => this.setDealerSprite('idle'), 0.2);
    } else if (action === DealerIdleKind.NOD) {
      this.setDealerSprite('nod');
      this.idleMachine.markPlayed(action, now);
      this.scheduleOnce(() => this.setDealerSprite('idle'), 0.6);
    } else if (action === DealerIdleKind.CUP) {
      this.setDealerSprite('cup');
      this.idleMachine.markPlayed(action, now);
      this.scheduleOnce(() => this.setDealerSprite('idle'), 1.2);
    } else if (action === DealerIdleKind.MASK) {
      this.setDealerSprite('mask');
      this.idleMachine.markPlayed(action, now);
      this.scheduleOnce(() => this.setDealerSprite('idle'), 0.8);
    }
  }

  private setDealerSprite(name: string): void {
    if (!this.nodeDealer) return;
    const sp = this.nodeDealer.getComponent(Sprite);
    const sf = this.dealerSprites.get(name);
    if (sp && sf) {
      sp.spriteFrame = sf;
    }
  }

  private tickFlame(): void {
    if (!this.nodeFlame || this.flameSprites.length === 0) return;
    const sp = this.nodeFlame.getComponent(Sprite);
    if (sp) {
      this.flameIndex = (this.flameIndex + 1) % this.flameSprites.length;
      if (this.flameSprites[this.flameIndex]) {
        sp.spriteFrame = this.flameSprites[this.flameIndex];
      }
    }
  }

  private onSilentToggle(toggle: Toggle): void {
    LobbyAudio.setSilent(toggle.isChecked);
  }

  private onQuickStartClick(): void {
    if (!this.isBootReady || this.isMatchLoading) return;
    this.isMatchLoading = true;
    LobbyAudio.playCtaTap(false);
    LobbyAudio.playMatchOpen();

    if (this.nodeMatchLoad) {
      this.nodeMatchLoad.active = true;
      const op = this.nodeMatchLoad.getComponent(UIOpacity);
      if (op) {
        op.opacity = 0;
        tween(op).to(0.2, { opacity: 255 }).start();
      }
    }

    const loadTimeMs = MatchLoad.axisMs();
    this.scheduleOnce(() => {
      LobbyAudio.leaveThenRelease();
      director.loadScene('Table');
    }, loadTimeMs / 1000);
  }

  private onPeekTableClick(): void {
    if (!this.isBootReady || this.isMatchLoading) return;
    LobbyAudio.playCtaTap(true);
    LobbyAudio.leaveThenRelease();
    director.loadScene('Table');
  }
}
