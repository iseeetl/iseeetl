import { expect, vi } from 'vitest';
import { timelinePresentationMethods } from '@/features/timeline/presentationMethods';

describe('タイムラインのアニメーションと読み上げの設定', () => {
  it('アニメーション速度を既存のdurationへ変換する', () => {
    expect(timelinePresentationMethods.getAnimationDuration('slow')).to.equal(18_000);
    expect(timelinePresentationMethods.getAnimationDuration('fast')).to.equal(6_000);
    expect(timelinePresentationMethods.getAnimationDuration('very_fast')).to.equal(3_000);
    expect(timelinePresentationMethods.getAnimationDuration('normal')).to.equal(12_000);
  });

  it('読み上げが未設定ならダイアログを開き、有効なら停止して保存する', () => {
    const showSpeechDialog = vi.fn();
    const persistFilters = vi.fn();
    const context = {
      timeline: { filters: [{}, { speech: true }] },
      ui: { audio: { speechColumnIndex: null } },
      showSpeechDialog,
      persistFilters,
    };

    timelinePresentationMethods.toggleColumnSpeech.call(context, 0);
    expect(context.ui.audio.speechColumnIndex).to.equal(0);
    expect(showSpeechDialog).toHaveBeenCalledOnce();

    timelinePresentationMethods.toggleColumnSpeech.call(context, 1);
    expect(context.timeline.filters[1].speech).to.equal(false);
    expect(persistFilters).toHaveBeenCalledOnce();
  });
});
