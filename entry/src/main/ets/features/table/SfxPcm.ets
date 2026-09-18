import { audio } from '@kit.AudioKit';

/**
 * EXP 2 helpers: parse rawfile wav headers + optional in-memory resample.
 * Does NOT trim leading/trailing silence (flip lead-in ≈ 7ms is not the 80–130ms late onset).
 * Does NOT invent art. Non-PCM16 → null so SoundPlayer can ask @LiarBar美术.
 */
export class SfxWavClip {
  path: string = '';
  sampleRate: number = 0;
  channels: number = 0;
  bits: number = 0;
  pcm: ArrayBuffer = new ArrayBuffer(0);
  durationMs: number = 0;
  resampled: boolean = false;
}

export class SfxPcm {
  static parseWav(bytes: Uint8Array, path: string): SfxWavClip | null {
    if (bytes.length < 44) {
      return null;
    }
    if (SfxPcm.fourEq(bytes, 0, 0x52, 0x49, 0x46, 0x46) === false) {
      return null;
    }
    if (SfxPcm.fourEq(bytes, 8, 0x57, 0x41, 0x56, 0x45) === false) {
      return null;
    }
    const view: DataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let off: number = 12;
    let fmt: number = 0;
    let channels: number = 0;
    let rate: number = 0;
    let bits: number = 0;
    let dataOff: number = -1;
    let dataLen: number = 0;
    while (off + 8 <= bytes.length) {
      const size: number = view.getUint32(off + 4, true);
      const body: number = off + 8;
      if (SfxPcm.fourEq(bytes, off, 0x66, 0x6d, 0x74, 0x20)) {
        if (size < 16 || body + 16 > bytes.length) {
          return null;
        }
        fmt = view.getUint16(body, true);
        channels = view.getUint16(body + 2, true);
        rate = view.getUint32(body + 4, true);
        bits = view.getUint16(body + 14, true);
      } else if (SfxPcm.fourEq(bytes, off, 0x64, 0x61, 0x74, 0x61)) {
        dataOff = body;
        dataLen = size;
        break;
      }
      off = body + size + (size & 1);
    }
    if (fmt !== 1 || channels < 1 || rate < 8000 || bits !== 16 || dataOff < 0 || dataLen < 2) {
      return null;
    }
    if (dataOff + dataLen > bytes.length) {
      dataLen = bytes.length - dataOff;
    }
    if ((dataLen & 1) === 1) {
      dataLen = dataLen - 1;
    }
    const pcm: ArrayBuffer = new ArrayBuffer(dataLen);
    const dest: Uint8Array = new Uint8Array(pcm);
    for (let i = 0; i < dataLen; i++) {
      dest[i] = bytes[dataOff + i];
    }
    const clip: SfxWavClip = new SfxWavClip();
    clip.path = path;
    clip.sampleRate = rate;
    clip.channels = channels;
    clip.bits = bits;
    clip.pcm = pcm;
    clip.durationMs = SfxPcm.durationOf(dataLen, rate, channels);
    clip.resampled = false;
    return clip;
  }

  /** Linear resample. Copies every sample — no silence crop. */
  static resampleTo(clip: SfxWavClip, dstRate: number): SfxWavClip {
    if (clip.sampleRate === dstRate || dstRate < 8000 || clip.pcm.byteLength < 2) {
      return clip;
    }
    const src: Int16Array = new Int16Array(clip.pcm);
    const ch: number = clip.channels;
    const srcFrames: number = Math.floor(src.length / ch);
    if (srcFrames < 1) {
      return clip;
    }
    const dstFrames: number = Math.floor(srcFrames * dstRate / clip.sampleRate);
    if (dstFrames < 1) {
      return clip;
    }
    const out: ArrayBuffer = new ArrayBuffer(dstFrames * ch * 2);
    const dst: Int16Array = new Int16Array(out);
    for (let i = 0; i < dstFrames; i++) {
      const srcPos: number = i * clip.sampleRate / dstRate;
      let i0: number = Math.floor(srcPos);
      if (i0 >= srcFrames) {
        i0 = srcFrames - 1;
      }
      let i1: number = i0 + 1;
      if (i1 >= srcFrames) {
        i1 = srcFrames - 1;
      }
      const frac: number = srcPos - i0;
      for (let c = 0; c < ch; c++) {
        const s0: number = src[i0 * ch + c];
        const s1: number = src[i1 * ch + c];
        dst[i * ch + c] = Math.round(s0 + (s1 - s0) * frac);
      }
    }
    const next: SfxWavClip = new SfxWavClip();
    next.path = clip.path;
    next.sampleRate = dstRate;
    next.channels = ch;
    next.bits = 16;
    next.pcm = out;
    next.durationMs = SfxPcm.durationOf(out.byteLength, dstRate, ch);
    next.resampled = true;
    return next;
  }

  static upmixMonoToStereo(clip: SfxWavClip): SfxWavClip {
    if (clip.channels !== 1 || clip.pcm.byteLength < 2) {
      return clip;
    }
    const src: Int16Array = new Int16Array(clip.pcm);
    const out: ArrayBuffer = new ArrayBuffer(src.length * 4);
    const dst: Int16Array = new Int16Array(out);
    for (let i = 0; i < src.length; i++) {
      dst[i * 2] = src[i];
      dst[i * 2 + 1] = src[i];
    }
    const next: SfxWavClip = new SfxWavClip();
    next.path = clip.path;
    next.sampleRate = clip.sampleRate;
    next.channels = 2;
    next.bits = 16;
    next.pcm = out;
    next.durationMs = clip.durationMs;
    next.resampled = clip.resampled;
    return next;
  }

  static toSamplingRate(hz: number): audio.AudioSamplingRate {
    if (hz === 8000) {
      return audio.AudioSamplingRate.SAMPLE_RATE_8000;
    }
    if (hz === 11025) {
      return audio.AudioSamplingRate.SAMPLE_RATE_11025;
    }
    if (hz === 12000) {
      return audio.AudioSamplingRate.SAMPLE_RATE_12000;
    }
    if (hz === 16000) {
      return audio.AudioSamplingRate.SAMPLE_RATE_16000;
    }
    if (hz === 22050) {
      return audio.AudioSamplingRate.SAMPLE_RATE_22050;
    }
    if (hz === 24000) {
      return audio.AudioSamplingRate.SAMPLE_RATE_24000;
    }
    if (hz === 32000) {
      return audio.AudioSamplingRate.SAMPLE_RATE_32000;
    }
    if (hz === 44100) {
      return audio.AudioSamplingRate.SAMPLE_RATE_44100;
    }
    if (hz === 64000) {
      return audio.AudioSamplingRate.SAMPLE_RATE_64000;
    }
    if (hz === 96000) {
      return audio.AudioSamplingRate.SAMPLE_RATE_96000;
    }
    return audio.AudioSamplingRate.SAMPLE_RATE_48000;
  }

  static toChannel(ch: number): audio.AudioChannel {
    if (ch === 1) {
      return audio.AudioChannel.CHANNEL_1;
    }
    return audio.AudioChannel.CHANNEL_2;
  }

  static pickDeviceRate(rates: Array<number>): number {
    for (let i = 0; i < rates.length; i++) {
      if (rates[i] === 48000) {
        return 48000;
      }
    }
    if (rates.length > 0 && rates[0] >= 8000) {
      return rates[0];
    }
    return 48000;
  }

  static joinRates(rates: Array<number>): string {
    let out: string = '';
    for (let i = 0; i < rates.length; i++) {
      if (i > 0) {
        out = `${out},`;
      }
      out = `${out}${rates[i]}`;
    }
    if (out.length === 0) {
      return '-';
    }
    return out;
  }

  static durationOf(byteLen: number, rate: number, channels: number): number {
    if (rate < 1 || channels < 1) {
      return 0;
    }
    return Math.round(byteLen * 1000 / (rate * channels * 2));
  }

  private static fourEq(bytes: Uint8Array, off: number, a: number, b: number, c: number, d: number): boolean {
    if (off + 3 >= bytes.length) {
      return false;
    }
    return bytes[off] === a && bytes[off + 1] === b && bytes[off + 2] === c && bytes[off + 3] === d;
  }
}
