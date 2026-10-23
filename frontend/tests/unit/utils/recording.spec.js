import { expect } from 'vitest';
import {
  startRecording,
  stopRecording,
  handleDeviceReady,
  handleDeviceError,
  handleRecordingBlob,
  transcribeAudio,
} from '@/utils/recording';

describe('録音と文字起こしの共通処理', () => {
  let originalSetTimeout;
  let originalClearTimeout;
  let originalURL;
  let originalFile;
  let originalWindow;

  beforeEach(() => {
    originalSetTimeout = global.setTimeout;
    originalClearTimeout = global.clearTimeout;
    originalURL = global.URL;
    originalFile = global.File;
    originalWindow = global.window;

    global.URL = {
      createObjectURL: () => 'blob:test',
      revokeObjectURL: () => {},
    };
    global.window = { URL: global.URL };

    if (!global.File) {
      global.File = class File {
        constructor(parts, name, options) {
          this.name = name;
          this.type = options && options.type;
          this.size = Array.isArray(parts) && parts[0] && parts[0].size ? parts[0].size : 0;
        }
      };
    }
  });

  afterEach(() => {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    global.URL = originalURL;
    global.File = originalFile;
    global.window = originalWindow;
  });

  it('startRecording は状態とタイマーを設定する', async () => {
    global.setTimeout = () => 123;

    const ctx = {
      waveformVisible: false,
      micReady: true,
      recording: false,
      recordingTimeoutId: null,
      $refs: {
        recorder: { start: () => Promise.resolve() },
      },
    };

    await startRecording(ctx);

    expect(ctx.waveformVisible).to.equal(true);
    expect(ctx.micReady).to.equal(true);
    expect(ctx.recording).to.equal(true);
    expect(ctx.recordingTimeoutId).to.equal(123);
  });

  it('stopRecording はタイマーを解除して録音フラグを戻す', async () => {
    const cleared = [];
    global.clearTimeout = (id) => cleared.push(id);

    const ctx = {
      recording: true,
      recordingTimeoutId: 555,
      $refs: { recorder: { stop: () => Promise.resolve() } },
    };

    await stopRecording(ctx);

    expect(ctx.recording).to.equal(false);
    expect(ctx.recordingTimeoutId).to.equal(null);
    expect(cleared).to.deep.equal([555]);
  });

  it('handleDeviceReady はマイク状態を更新する', () => {
    const ctx = { micReady: false, recording: false };
    handleDeviceReady(ctx);

    expect(ctx.micReady).to.equal(true);
    expect(ctx.recording).to.equal(true);
  });

  it('handleDeviceError は録音状態を戻してコールバックを呼ぶ', () => {
    const ctx = { recording: true, waveformVisible: true };
    let called = false;

    handleDeviceError(ctx, { onError: () => (called = true) });

    expect(ctx.recording).to.equal(false);
    expect(ctx.waveformVisible).to.equal(false);
    expect(called).to.equal(true);
  });

  it('handleRecordingBlob は音声データを設定してコールバックを呼ぶ', () => {
    const ctx = {
      recording: true,
      transcribing: false,
      audioData: null,
      audioFile: null,
      audioSize: null,
      audioDuration: null,
    };
    const blob = new Blob(['test'], { type: 'audio/webm' });
    let transcribeFile = null;

    handleRecordingBlob(ctx, {
      blob,
      duration: 10,
      onTranscribe: (file) => {
        transcribeFile = file;
      },
    });

    expect(ctx.recording).to.equal(false);
    expect(ctx.transcribing).to.equal(true);
    expect(ctx.audioData).to.equal('blob:test');
    expect(ctx.audioSize).to.equal(blob.size);
    expect(ctx.audioDuration).to.equal(10);
    expect(transcribeFile).to.equal(ctx.audioFile);
  });

  it('文字起こしコールバックなしでも音声を保持し待機状態を残さない', () => {
    const ctx = {
      recording: true,
      transcribing: true,
      waveformVisible: true,
      audioData: null,
      audioFile: null,
      audioSize: null,
      audioDuration: null,
    };
    const blob = new Blob(['test'], { type: 'audio/webm' });

    handleRecordingBlob(ctx, { blob, duration: 3 });

    expect(ctx.recording).to.equal(false);
    expect(ctx.transcribing).to.equal(false);
    expect(ctx.waveformVisible).to.equal(false);
    expect(ctx.audioData).to.equal('blob:test');
    expect(ctx.audioFile).not.to.equal(null);
    expect(ctx.audioDuration).to.equal(3);
  });

  it.each(['ja', 'en'])('空結果は案内し本文を書き換えない: %s', async (locale) => {
    const messages = [];
    const expected = locale === 'ja' ? '発話を検出できませんでした' : 'No speech was detected.';
    const ctx = { content: 'keep', transcribing: true, waveformVisible: true, $i18n: { locale },
      $t: () => expected, $store: { getters: { roomId: 'room-1' }, dispatch: (_name, value) => messages.push(value) } };
    let changed = false;
    await transcribeAudio(ctx, { file: new Blob(['x']), transcribeApi: async () => ({ data: { text: '' } }), onText: () => { changed = true; } });
    expect(ctx.content).to.equal('keep');
    expect(changed).to.equal(false);
    expect(messages).to.deep.equal([{ message: expected, role: 'status' }]);
    expect(ctx.transcribing).to.equal(false);
  });

  it('欠落textや通信失敗を未検出の通知にしない', async () => {
    for (const transcribeApi of [async () => ({ data: {} }), async () => { throw new Error('failed'); }]) {
      const messages = []; let errors = 0;
      const ctx = { content: 'keep', transcribing: true, $i18n: { locale: 'ja' },
        $store: { getters: { roomId: 'room-1' }, dispatch: (...args) => messages.push(args) } };
      await transcribeAudio(ctx, { file: new Blob(['x']), transcribeApi, onError: () => { errors++; } });
      expect(errors).to.equal(1); expect(messages).to.have.length(0); expect(ctx.content).to.equal('keep');
    }
  });

  it('transcribeAudio はテキストを反映して状態を戻す', async () => {
    const ctx = {
      content: 'a',
      transcribing: true,
      waveformVisible: true,
      $i18n: { locale: 'ja' },
      $store: { getters: { roomId: 'room-1' } },
    };

    const transcribeApi = () => Promise.resolve({ data: { text: 'b' } });

    await transcribeAudio(ctx, { file: new Blob(['x'], { type: 'audio/webm' }), transcribeApi });

    expect(ctx.content).to.equal('a\nb');
    expect(ctx.transcribing).to.equal(false);
    expect(ctx.waveformVisible).to.equal(false);
  });
});
