import { expect, vi } from 'vitest';
import { playAudioIfMatch, playNotificationAudio, speakIfNeeded } from '@/features/timeline/audio';

describe('タイムラインの通知音と読み上げ', () => {
  it('playNotificationAudio は同じ音声要素を同期的に先頭から再生する', async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const audioRef = {
      currentTime: 12,
      play: vi.fn(),
    };

    const result = playNotificationAudio({ audioRef, onSuccess, onError });

    expect(audioRef.currentTime).to.equal(0);
    expect(audioRef.play).toHaveBeenCalledOnce();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(await result).to.equal(true);
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it('playNotificationAudio は非同期の再生成功を通知する', async () => {
    const onSuccess = vi.fn();
    const audioRef = {
      currentTime: 3,
      play: vi.fn().mockResolvedValue(undefined),
    };

    expect(await playNotificationAudio({ audioRef, onSuccess })).to.equal(true);
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('playNotificationAudio はplayのPromise拒否を吸収して失敗を通知する', async () => {
    const error = new Error('autoplay blocked');
    const onError = vi.fn();
    const audioRef = {
      currentTime: 3,
      play: vi.fn().mockRejectedValue(error),
    };

    expect(await playNotificationAudio({ audioRef, onError })).to.equal(false);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('playNotificationAudio はplayの同期例外を吸収して失敗を通知する', async () => {
    const error = new Error('play failed');
    const onError = vi.fn();
    const audioRef = {
      currentTime: 3,
      play: vi.fn(() => {
        throw error;
      }),
    };

    expect(await playNotificationAudio({ audioRef, onError })).to.equal(false);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('playNotificationAudio は音声要素がなければ失敗を通知する', async () => {
    const onError = vi.fn();

    expect(await playNotificationAudio({ audioRef: null, onError })).to.equal(false);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).to.be.instanceOf(Error);
  });

  it('playAudioIfMatch はタグが一致した場合に再生結果を返す', async () => {
    const audioRef = {
      currentTime: 12,
      play: vi.fn().mockResolvedValue(undefined),
    };

    const result = await playAudioIfMatch({
      postTags: ['tag-a'],
      roomTags: [],
      soundTags: ['tag-a'],
      audioRef,
    });

    expect(audioRef.currentTime).to.equal(0);
    expect(audioRef.play).toHaveBeenCalledOnce();
    expect(result).to.equal(true);
  });

  it('playAudioIfMatch はタグ不一致なら再生せずfalseを返す', async () => {
    const audioRef = {
      currentTime: 5,
      play: vi.fn(),
    };

    const result = await playAudioIfMatch({
      postTags: ['tag-a'],
      roomTags: [],
      soundTags: ['tag-b'],
      audioRef,
    });

    expect(audioRef.currentTime).to.equal(5);
    expect(audioRef.play).not.toHaveBeenCalled();
    expect(result).to.equal(false);
  });

  it('speakIfNeeded は条件一致時に読み上げを行う', () => {
    const win = global.window || (global.window = {});
    const originalSpeech = win.speechSynthesis;
    const originalUtterance = global.SpeechSynthesisUtterance;

    const spoken = [];
    win.speechSynthesis = {
      speak: (utterance) => spoken.push(utterance),
    };
    global.SpeechSynthesisUtterance = function SpeechSynthesisUtterance() {
      this.text = '';
      this.lang = '';
      this.rate = 1;
    };

    speakIfNeeded({
      text: 'hello',
      lang: 'ja',
      filters: [{ speech: true, conditions: null }],
      matchFn: () => true,
      speed: 1.2,
    });

    expect(spoken).to.have.lengthOf(1);
    expect(spoken[0].text).to.equal('hello');
    expect(spoken[0].lang).to.equal('ja');
    expect(spoken[0].rate).to.equal(1.2);

    win.speechSynthesis = originalSpeech;
    global.SpeechSynthesisUtterance = originalUtterance;
  });

  it('speakIfNeeded は条件不一致なら読み上げしない', () => {
    const win = global.window || (global.window = {});
    const originalSpeech = win.speechSynthesis;
    const originalUtterance = global.SpeechSynthesisUtterance;

    const spoken = [];
    win.speechSynthesis = {
      speak: (utterance) => spoken.push(utterance),
    };
    global.SpeechSynthesisUtterance = function SpeechSynthesisUtterance() {
      this.text = '';
      this.lang = '';
      this.rate = 1;
    };

    speakIfNeeded({
      text: 'hello',
      lang: 'ja',
      filters: [{ speech: true, conditions: { tag: 'x' } }],
      matchFn: () => false,
      speed: 1.2,
    });

    expect(spoken).to.have.length(0);

    win.speechSynthesis = originalSpeech;
    global.SpeechSynthesisUtterance = originalUtterance;
  });

  it('speakIfNeeded は filters が配列でなければ何もしない', () => {
    const win = global.window || (global.window = {});
    const originalSpeech = win.speechSynthesis;

    let calls = 0;
    win.speechSynthesis = {
      speak: () => {
        calls += 1;
      },
    };

    speakIfNeeded({
      text: 'skip',
      lang: 'ja',
      filters: null,
      matchFn: () => true,
      speed: 1,
    });

    expect(calls).to.equal(0);

    win.speechSynthesis = originalSpeech;
  });
});
