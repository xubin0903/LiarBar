import { AudioClip, AudioSource, assetManager } from 'cc';

export class LobbyAudio {
  static readonly BGM_UUID: string = '12f8bdef-0021-4fe7-9916-a89b2b0d73f1';
  static readonly AMB_UUID: string = 'c9864e46-7acc-462e-9426-446f3cd328df';
  static readonly HIT_UUID: string = 'd3b28e84-17ac-495b-8d12-e2623ae97259';
  static readonly CTA_UUID: string = 'bede82d0-586d-42f1-b2b3-c5ff4fd1d7d1';
  static readonly MATCH_OPEN_UUID: string = '3a3ec1b2-6490-4749-8baf-730c5c03ae72';
  static readonly VO_UUID: string = '40aab13e-4e54-4314-8839-45bf1533fc03';

  static readonly VOL_BGM_OPEN: number = 0.25;
  static readonly VOL_BGM_STEADY: number = 0.20;
  static readonly VOL_AMB: number = 0.13;
  static readonly VOL_HIT: number = 0.50;
  static readonly VOL_CTA: number = 0.32;
  static readonly VOL_CTA_PEEK: number = 0.226;
  static readonly VOL_VO: number = 0.40;
  static readonly DUCK_FACTOR: number = 0.42;

  private static clips: Map<string, AudioClip> = new Map();
  private static bgmSource: AudioSource | null = null;
  private static ambSource: AudioSource | null = null;
  private static sfxSource: AudioSource | null = null;
  private static silent: boolean = false;

  static init(bgmSrc: AudioSource, ambSrc: AudioSource, sfxSrc: AudioSource): void {
    LobbyAudio.bgmSource = bgmSrc;
    LobbyAudio.ambSource = ambSrc;
    LobbyAudio.sfxSource = sfxSrc;
    LobbyAudio.preload();
  }

  static setSilent(on: boolean): void {
    LobbyAudio.silent = on;
    if (LobbyAudio.bgmSource) {
      LobbyAudio.bgmSource.volume = on ? 0 : LobbyAudio.VOL_BGM_STEADY;
    }
    if (LobbyAudio.ambSource) {
      LobbyAudio.ambSource.volume = on ? 0 : LobbyAudio.VOL_AMB;
    }
    if (LobbyAudio.sfxSource) {
      LobbyAudio.sfxSource.volume = on ? 0 : 1.0;
    }
  }

  static preload(): void {
    const list = [
      LobbyAudio.BGM_UUID,
      LobbyAudio.AMB_UUID,
      LobbyAudio.HIT_UUID,
      LobbyAudio.CTA_UUID,
      LobbyAudio.MATCH_OPEN_UUID,
      LobbyAudio.VO_UUID
    ];
    for (const uuid of list) {
      assetManager.loadAny({ uuid }, (err, clip) => {
        if (!err && clip instanceof AudioClip) {
          LobbyAudio.clips.set(uuid, clip);
        }
      });
    }
  }

  static playBootHit(): void {
    if (LobbyAudio.silent) return;
    LobbyAudio.playOneShot(LobbyAudio.HIT_UUID, LobbyAudio.VOL_HIT);
  }

  static playCtaTap(secondary: boolean): void {
    if (LobbyAudio.silent) return;
    LobbyAudio.playOneShot(LobbyAudio.CTA_UUID, secondary ? LobbyAudio.VOL_CTA_PEEK : LobbyAudio.VOL_CTA);
  }

  static playVoGreet(): void {
    if (LobbyAudio.silent) return;
    LobbyAudio.playOneShot(LobbyAudio.VO_UUID, LobbyAudio.VOL_VO);
  }

  static playMatchOpen(): void {
    if (LobbyAudio.silent) return;
    LobbyAudio.playOneShot(LobbyAudio.MATCH_OPEN_UUID, 0.46);
  }

  static startAmb(fadeMs: number): void {
    if (LobbyAudio.silent || !LobbyAudio.ambSource) return;
    const clip = LobbyAudio.clips.get(LobbyAudio.AMB_UUID);
    if (clip) {
      LobbyAudio.ambSource.clip = clip;
      LobbyAudio.ambSource.loop = true;
      LobbyAudio.ambSource.volume = LobbyAudio.VOL_AMB;
      LobbyAudio.ambSource.play();
    } else {
      assetManager.loadAny({ uuid: LobbyAudio.AMB_UUID }, (err, res) => {
        if (!err && res instanceof AudioClip && LobbyAudio.ambSource) {
          LobbyAudio.clips.set(LobbyAudio.AMB_UUID, res);
          LobbyAudio.ambSource.clip = res;
          LobbyAudio.ambSource.loop = true;
          LobbyAudio.ambSource.volume = LobbyAudio.VOL_AMB;
          LobbyAudio.ambSource.play();
        }
      });
    }
  }

  static startBgm(fadeMs: number, toSteady: boolean): void {
    if (LobbyAudio.silent || !LobbyAudio.bgmSource) return;
    const vol = toSteady ? LobbyAudio.VOL_BGM_STEADY : LobbyAudio.VOL_BGM_OPEN;
    const clip = LobbyAudio.clips.get(LobbyAudio.BGM_UUID);
    if (clip) {
      LobbyAudio.bgmSource.clip = clip;
      LobbyAudio.bgmSource.loop = true;
      LobbyAudio.bgmSource.volume = vol;
      LobbyAudio.bgmSource.play();
    } else {
      assetManager.loadAny({ uuid: LobbyAudio.BGM_UUID }, (err, res) => {
        if (!err && res instanceof AudioClip && LobbyAudio.bgmSource) {
          LobbyAudio.clips.set(LobbyAudio.BGM_UUID, res);
          LobbyAudio.bgmSource.clip = res;
          LobbyAudio.bgmSource.loop = true;
          LobbyAudio.bgmSource.volume = vol;
          LobbyAudio.bgmSource.play();
        }
      });
    }
  }

  static duckBgmForVo(): void {
    if (LobbyAudio.silent || !LobbyAudio.bgmSource) return;
    LobbyAudio.bgmSource.volume = LobbyAudio.VOL_BGM_STEADY * LobbyAudio.DUCK_FACTOR;
  }

  static unduckBgmToSteady(): void {
    if (LobbyAudio.silent || !LobbyAudio.bgmSource) return;
    LobbyAudio.bgmSource.volume = LobbyAudio.VOL_BGM_STEADY;
  }

  static leaveThenRelease(): void {
    if (LobbyAudio.bgmSource) {
      LobbyAudio.bgmSource.stop();
    }
    if (LobbyAudio.ambSource) {
      LobbyAudio.ambSource.stop();
    }
    if (LobbyAudio.sfxSource) {
      LobbyAudio.sfxSource.stop();
    }
  }

  private static playOneShot(uuid: string, vol: number): void {
    if (!LobbyAudio.sfxSource) return;
    const clip = LobbyAudio.clips.get(uuid);
    if (clip) {
      LobbyAudio.sfxSource.playOneShot(clip, vol);
    } else {
      assetManager.loadAny({ uuid }, (err, res) => {
        if (!err && res instanceof AudioClip && LobbyAudio.sfxSource) {
          LobbyAudio.clips.set(uuid, res);
          LobbyAudio.sfxSource.playOneShot(res, vol);
        }
      });
    }
  }
}
