import { Button, Color, Label, Node, Sprite, SpriteFrame, UIOpacity, UITransform, Vec3, assetManager, tween } from 'cc';
import { findDeep } from '../Nodes';
import { LbRouter } from '../../common/LbRouter';
import { TableAudio } from '../TableAudio';

const BANNER_WIN_UUID = '0152a34a-e2b1-488f-a4df-c8efe7aa184f@f9941';
const BANNER_LOSE_UUID = '74159097-90f9-45c0-9d73-01e65bc6afd6@f9941';

export class ReportView {
  readonly root: Node;
  private bannerSprite: Sprite | null = null;
  private lblWinner: Label | null = null;
  private lblHighlight: Label | null = null;
  private lblRecap: Label | null = null;
  private btnAgain: Node | null = null;
  private btnHome: Node | null = null;
  private winSf: SpriteFrame | null = null;
  private loseSf: SpriteFrame | null = null;
  private onPlayAgainCb: (() => void) | null = null;

  constructor(stageNode: Node) {
    this.root = new Node('lb_ovl_report');
    const ui = this.root.addComponent(UITransform);
    ui.setContentSize(1280, 720);
    const op = this.root.addComponent(UIOpacity);
    op.opacity = 0;

    // Dark dim background
    const dim = new Node('report_dim');
    const dimUi = dim.addComponent(UITransform);
    dimUi.setContentSize(1280, 720);
    const dimSp = dim.addComponent(Sprite);
    dimSp.color = new Color(0, 0, 0, 200);
    this.root.addChild(dim);

    // Panel box
    const panel = new Node('report_panel');
    const panelUi = panel.addComponent(UITransform);
    panelUi.setContentSize(560, 480);
    const panelSp = panel.addComponent(Sprite);
    panelSp.color = new Color(25, 20, 16, 240);
    this.root.addChild(panel);

    // Winner/Loser banner
    const banner = new Node('report_banner');
    const bannerUi = banner.addComponent(UITransform);
    bannerUi.setContentSize(480, 64);
    this.bannerSprite = banner.addComponent(Sprite);
    banner.setPosition(0, 180, 0);
    panel.addChild(banner);

    // Winner label
    const winnerNode = new Node('lb_txt_winner');
    const winnerUi = winnerNode.addComponent(UITransform);
    winnerUi.setContentSize(480, 40);
    this.lblWinner = winnerNode.addComponent(Label);
    this.lblWinner.fontSize = 28;
    this.lblWinner.string = '胜者：你';
    this.lblWinner.color = new Color(255, 220, 140, 255);
    winnerNode.setPosition(0, 110, 0);
    panel.addChild(winnerNode);

    // Highlight text
    const hlNode = new Node('lb_txt_highlight');
    const hlUi = hlNode.addComponent(UITransform);
    hlUi.setContentSize(480, 32);
    this.lblHighlight = hlNode.addComponent(Label);
    this.lblHighlight.fontSize = 20;
    this.lblHighlight.string = '精彩时刻：极致心理博弈，成功反杀！';
    this.lblHighlight.color = new Color(220, 190, 130, 255);
    hlNode.setPosition(0, 70, 0);
    panel.addChild(hlNode);

    // Recap stats list
    const recapNode = new Node('lb_list_recap');
    const recapUi = recapNode.addComponent(UITransform);
    recapUi.setContentSize(480, 120);
    this.lblRecap = recapNode.addComponent(Label);
    this.lblRecap.fontSize = 18;
    this.lblRecap.lineHeight = 24;
    this.lblRecap.string = '战局战报：\n你：出牌 5 次 · 诈唬 2 次 · 质疑命中 1 次\n老千：出牌 4 次 · 诈唬 3 次\n杠精：出牌 3 次 · 怀疑 2 次';
    this.lblRecap.color = new Color(210, 200, 190, 255);
    recapNode.setPosition(0, -10, 0);
    panel.addChild(recapNode);

    // Play Again button
    this.btnAgain = new Node('lb_btn_again');
    const againUi = this.btnAgain.addComponent(UITransform);
    againUi.setContentSize(220, 52);
    const againSp = this.btnAgain.addComponent(Sprite);
    againSp.color = new Color(180, 140, 60, 255);
    const againBtn = this.btnAgain.addComponent(Button);
    const againLblNode = new Node('again_lbl');
    const againLbl = againLblNode.addComponent(Label);
    againLbl.fontSize = 22;
    againLbl.string = '再来一局';
    againLbl.color = new Color(20, 15, 10, 255);
    this.btnAgain.addChild(againLblNode);
    this.btnAgain.setPosition(-120, -160, 0);
    panel.addChild(this.btnAgain);

    // Return to Lobby button
    this.btnHome = new Node('lb_btn_home');
    const homeUi = this.btnHome.addComponent(UITransform);
    homeUi.setContentSize(220, 52);
    const homeSp = this.btnHome.addComponent(Sprite);
    homeSp.color = new Color(60, 50, 45, 255);
    const homeBtn = this.btnHome.addComponent(Button);
    const homeLblNode = new Node('home_lbl');
    const homeLbl = homeLblNode.addComponent(Label);
    homeLbl.fontSize = 22;
    homeLbl.string = '返回大厅';
    homeLbl.color = new Color(220, 210, 200, 255);
    this.btnHome.addChild(homeLblNode);
    this.btnHome.setPosition(120, -160, 0);
    panel.addChild(this.btnHome);

    this.root.active = false;
    stageNode.addChild(this.root);

    this.preloadBanners();
    this.bindButtons();
  }

  private preloadBanners(): void {
    assetManager.loadAny({ uuid: BANNER_WIN_UUID }, (err, sf) => {
      if (!err && sf instanceof SpriteFrame) this.winSf = sf;
    });
    assetManager.loadAny({ uuid: BANNER_LOSE_UUID }, (err, sf) => {
      if (!err && sf instanceof SpriteFrame) this.loseSf = sf;
    });
  }

  private bindButtons(): void {
    if (this.btnAgain) {
      this.btnAgain.on(Button.EventType.CLICK, () => {
        this.hide();
        if (this.onPlayAgainCb) {
          this.onPlayAgainCb();
        }
      });
    }
    if (this.btnHome) {
      this.btnHome.on(Button.EventType.CLICK, () => {
        this.hide();
        TableAudio.stopBgm();
        LbRouter.toLobby();
      });
    }
  }

  onPlayAgain(cb: () => void): void {
    this.onPlayAgainCb = cb;
  }

  show(winnerName: string, humanWon: boolean, highlight?: string, recapText?: string): void {
    if (this.lblWinner) {
      this.lblWinner.string = 对局获胜者：\;
    }
    if (this.bannerSprite) {
      this.bannerSprite.spriteFrame = humanWon ? this.winSf : this.loseSf;
    }
    if (highlight && this.lblHighlight) {
      this.lblHighlight.string = highlight;
    }
    if (recapText && this.lblRecap) {
      this.lblRecap.string = recapText;
    }

    this.root.active = true;
    const op = this.root.getComponent(UIOpacity);
    if (op) {
      op.opacity = 0;
      tween(op).to(0.3, { opacity: 255 }).start();
    }
  }

  hide(): void {
    this.root.active = false;
  }
}
