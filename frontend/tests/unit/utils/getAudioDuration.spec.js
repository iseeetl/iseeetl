import { expect } from 'vitest';
import { getAudioDuration } from '@/utils/getAudioDuration';

describe('音声の再生時間の取得', () => {
  let originalURL;
  let originalAudio;
  let originalAudioContext;

  beforeEach(() => {
    originalURL = global.URL;
    if (!global.URL) global.URL = {};
    global.URL.createObjectURL = () => 'blob:unit-test';
    global.URL.revokeObjectURL = () => {};

    originalAudio = global.Audio;
    originalAudioContext = window.AudioContext;
  });

  afterEach(() => {
    global.Audio = originalAudio;
    window.AudioContext = originalAudioContext;
    global.URL = originalURL;
  });

  it('presetDurationSeconds があればそれを返す', async () => {
    const result = await getAudioDuration(null, 5);
    expect(result).to.equal(5);
  });

  it('Blob 以外は 0 を返す', async () => {
    const result = await getAudioDuration({ notBlob: true }, undefined);
    expect(result).to.equal(0);
  });

  it('Audio メタデータが読めれば小数1桁で返す', async () => {
    class FakeAudio {
      constructor() {
        this.preload = '';
        this.duration = 3.14;
        this.onloadedmetadata = null;
        this.onerror = null;
      }
      set src(_v) {
        setTimeout(() => {
          if (typeof this.onloadedmetadata === 'function') this.onloadedmetadata();
        }, 0);
      }
    }
    global.Audio = FakeAudio;

    const blob = new Blob(['aud'], { type: 'audio/aac' });
    const result = await getAudioDuration(blob, undefined);
    expect(result).to.equal(3.1);
  });

  it('メタデータ失敗時は AudioContext でフォールバックする', async () => {
    class FakeAudio {
      constructor() {
        this.preload = '';
        this.duration = Infinity;
        this.onloadedmetadata = null;
        this.onerror = null;
      }
      set src(_v) {
        setTimeout(() => {
          if (typeof this.onerror === 'function') this.onerror();
        }, 0);
      }
    }
    global.Audio = FakeAudio;

    window.AudioContext = class FakeAudioContext {
      decodeAudioData() {
        return Promise.resolve({ duration: 4.2 });
      }
    };

    const blob = new Blob(['aud'], { type: 'audio/aac' });
    blob.arrayBuffer = () => Promise.resolve(new ArrayBuffer(8));

    const result = await getAudioDuration(blob, undefined);
    expect(result).to.equal(4);
  });
});
