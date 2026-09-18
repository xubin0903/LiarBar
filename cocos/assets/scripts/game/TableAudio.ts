import { AudioClip, AudioSource, assetManager } from 'cc';
import { PlayStyle } from '../engine/Phase';

export class TableAudio {
  static readonly BGM_UUID = '1fc0a637-b370-4ad7-84ef-eb00e4d5aade';
  static readonly DEAL_UUID = '7a66dd69-7385-45cb-938c-0fd677934452';
  static readonly CLAIM_UUID = 'bf797a5d-37b5-44da-a24c-9cdd5ace1b27';
  static readonly LAUNCH_UUID = 'ab29247f-3c80-4058-9328-c041d1dde428';
  static readonly LAND_UUID = '30b2b5d3-617d-4343-bc0b-7506645837a9';
  static readonly SOFT_UUID = '8d9aa1f0-e325-454c-9569-ef0df0e454d7';
  static readonly SLAM_UUID = 'f13ffef2-1267-4e62-a930-c657eb0c85b0';
  static readonly HESITATE_UUID = '9472d7b6-16af-408e-b3b4-3d035df82502';
  static readonly CH_ENTER_UUID = 'aff721f9-0552-4cf7-ba2b-a08afa2d8e5e';
  static readonly CH_COMMIT_UUID = 'bf67a4a1-514b-4c6e-886d-846ac13f0ba0';
  static readonly REVEAL_DRAW_UUID = '02f4e8ec-e2fc-44fe-b857-4360a9b18c9e';
  static readonly REVEAL_FLIP_UUID = 'a928980e-6403-4d52-b749-399c1c4fb757';
  static readonly EXTINGUISH_UUID = '4e00e4d9-fc22-421b-aef7-1896a3ae92b0';
  static readonly TURN_UUID = '250d3083-23a9-4cc8-a22a-f94df1b83a7f';
  static readonly WIN_UUID = '6e85f137-7e49-47b9-8fcd-7fdb74598eb5';
  static readonly LOSE_UUID = '2f6b8441-c0fa-4443-af3d-2adb4c7eb7fd';
  static readonly CARD_FLIP_UUID = '70cc7deb-4f64-4fc9-a5a6-7ee14281fe71';
  static readonly REV_CLICK_UUID = 'a79137fa-7507-4ae4-bea1-b707245f3a5e';
  static readonly REV_SHOT_UUID = '63b04ce0-ec4d-4e48-859d-3cc6b88953ed';
  static readonly REV_SPIN_UUID = '5e407265-3a30-4415-a8d2-a3abb4f0799a';

  private static clips: Map<string, AudioClip> = new Map();
  private static bgmSource: AudioSource | null = null;
  private static sfxSource: AudioSource | null = null;
  private static silent: boolean = false;

  static init(bgm: AudioSource, sfx: AudioSource): void {
    TableAudio.bgmSource = bgm;
    TableAudio.sfxSource = sfx;
    TableAudio.preload();
  }

  static setSilent(on: boolean): void {
    TableAudio.silent = on;
    if (TableAudio.bgmSource) {
      TableAudio.bgmSource.volume = on ? 0 : 0.20;
    }
  }

  static preload(): void {
    const list = [
      TableAudio.BGM_UUID,
      TableAudio.DEAL_UUID,
      TableAudio.CLAIM_UUID,
      TableAudio.LAUNCH_UUID,
      TableAudio.LAND_UUID,
      TableAudio.SOFT_UUID,
      TableAudio.SLAM_UUID,
      TableAudio.HESITATE_UUID,
      TableAudio.CH_ENTER_UUID,
      TableAudio.CH_COMMIT_UUID,
      TableAudio.REVEAL_DRAW_UUID,
      TableAudio.REVEAL_FLIP_UUID,
      TableAudio.EXTINGUISH_UUID,
      TableAudio.TURN_UUID,
      TableAudio.WIN_UUID,
      TableAudio.LOSE_UUID,
      TableAudio.CARD_FLIP_UUID,
      TableAudio.REV_CLICK_UUID,
      TableAudio.REV_SHOT_UUID,
      TableAudio.REV_SPIN_UUID
    ];
    for (const uuid of list) {
      assetManager.loadAny({ uuid }, (err, clip) => {
        if (!err && clip instanceof AudioClip) {
          TableAudio.clips.set(uuid, clip);
        }
      });
    }
  }

  static startBgm(): void {
    if (TableAudio.silent || !TableAudio.bgmSource) return;
    const clip = TableAudio.clips.get(TableAudio.BGM_UUID);
    if (clip) {
      TableAudio.bgmSource.clip = clip;
      TableAudio.bgmSource.loop = true;
      TableAudio.bgmSource.volume = 0.20;
      TableAudio.bgmSource.play();
    } else {
      assetManager.loadAny({ uuid: TableAudio.BGM_UUID }, (err, res) => {
        if (!err && res instanceof AudioClip && TableAudio.bgmSource) {
          TableAudio.clips.set(TableAudio.BGM_UUID, res);
          TableAudio.bgmSource.clip = res;
          TableAudio.bgmSource.loop = true;
          TableAudio.bgmSource.volume = 0.20;
          TableAudio.bgmSource.play();
        }
      });
    }
  }

  static stopBgm(): void {
    if (TableAudio.bgmSource) {
      TableAudio.bgmSource.stop();
    }
  }

  static playDeal(): void {
    TableAudio.playOneShot(TableAudio.DEAL_UUID, 0.46);
  }

  static playClaim(): void {
    TableAudio.playOneShot(TableAudio.CLAIM_UUID, 0.40);
  }

  static playCardFlip(): void {
    TableAudio.playOneShot(TableAudio.CARD_FLIP_UUID, 0.50);
  }

  static playLaunch(): void {
    TableAudio.playOneShot(TableAudio.LAUNCH_UUID, 0.40);
  }

  static playLand(): void {
    TableAudio.playOneShot(TableAudio.LAND_UUID, 0.40);
  }

  static playStyle(style: PlayStyle): void {
    if (style === PlayStyle.SLAM) {
      TableAudio.playOneShot(TableAudio.SLAM_UUID, 0.60);
    } else if (style === PlayStyle.HESITATE) {
      TableAudio.playOneShot(TableAudio.HESITATE_UUID, 0.35);
    } else {
      TableAudio.playOneShot(TableAudio.SOFT_UUID, 0.35);
    }
  }

  static playChallengeEnter(): void {
    TableAudio.playOneShot(TableAudio.CH_ENTER_UUID, 0.45);
  }

  static playChallengeCommit(): void {
    TableAudio.playOneShot(TableAudio.CH_COMMIT_UUID, 0.55);
  }

  static playRevealDraw(): void {
    TableAudio.playOneShot(TableAudio.REVEAL_DRAW_UUID, 0.40);
  }

  static playRevealFlip(): void {
    TableAudio.playOneShot(TableAudio.REVEAL_FLIP_UUID, 0.50);
  }

  static playExtinguish(): void {
    TableAudio.playOneShot(TableAudio.EXTINGUISH_UUID, 0.60);
  }

  static playTurnTick(): void {
    TableAudio.playOneShot(TableAudio.TURN_UUID, 0.30);
  }

  static playWin(): void {
    TableAudio.playOneShot(TableAudio.WIN_UUID, 0.60);
  }

  static playLose(): void {
    TableAudio.playOneShot(TableAudio.LOSE_UUID, 0.60);
  }

  static playRevolverClick(): void {
    TableAudio.playOneShot(TableAudio.REV_CLICK_UUID, 0.50);
  }

  static playRevolverShot(): void {
    TableAudio.playOneShot(TableAudio.REV_SHOT_UUID, 0.70);
  }

  static playRevolverSpin(): void {
    TableAudio.playOneShot(TableAudio.REV_SPIN_UUID, 0.45);
  }

  private static playOneShot(uuid: string, vol: number): void {
    if (TableAudio.silent || !TableAudio.sfxSource) return;
    const clip = TableAudio.clips.get(uuid);
    if (clip) {
      TableAudio.sfxSource.playOneShot(clip, vol);
    } else {
      assetManager.loadAny({ uuid }, (err, res) => {
        if (!err && res instanceof AudioClip && TableAudio.sfxSource) {
          TableAudio.clips.set(uuid, res);
          TableAudio.sfxSource.playOneShot(res, vol);
        }
      });
    }
  }
}
