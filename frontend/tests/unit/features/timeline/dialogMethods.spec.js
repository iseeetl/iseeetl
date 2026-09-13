import { expect, vi } from 'vitest';
import { timelineDialogMethods } from '@/features/timeline/dialogMethods';
import { createTimelineViewState } from '@/features/timeline/viewState';

describe('タイムラインのダイアログ操作', () => {
  it('ダイアログを開閉して値を初期状態へ戻す', () => {
    const context = { dialogs: createTimelineViewState({ windowObject: null }).dialogs };

    timelineDialogMethods.showDeletePostDialog.call(context, { _id: 'post-1' });
    expect(context.dialogs.post.delete.visible).to.equal(true);

    timelineDialogMethods.closeDeletePostDialog.call(context);
    expect(context.dialogs.post.delete).to.deep.equal({
      visible: false,
      value: null,
      operationToken: null,
    });
  });

  it('投稿ダイアログ表示前にゲスト規約を確認する', async () => {
    const context = {
      dialogs: createTimelineViewState({ windowObject: null }).dialogs,
      ensureGuestRules: vi.fn(() => Promise.resolve(false)),
      getPreviousOwnPostTagIds: vi.fn(() => ['tag-1']),
      setTargetLangs: vi.fn(),
      $refs: { dialogsRef: { openEditPostDialogAndFocus: vi.fn() } },
    };

    await timelineDialogMethods.showEditPostDialog.call(context);

    expect(context.dialogs.post.edit.visible).to.equal(false);
    expect(context.setTargetLangs).not.toHaveBeenCalled();
  });

  it('投稿ダイアログへ第3引数のタグ IDsを渡す', async () => {
    const context = {
      dialogs: createTimelineViewState({ windowObject: null }).dialogs,
      ensureGuestRules: vi.fn(() => Promise.resolve(true)),
      getPreviousOwnPostTagIds: vi.fn(() => []),
      setTargetLangs: vi.fn(),
      $refs: { dialogsRef: { openEditPostDialogAndFocus: vi.fn() } },
      captureTimelineOperation: vi.fn(() => ({ generation: 1, roomId: 'room-1' })),
    };

    await timelineDialogMethods.showEditPostDialog.call(context, null, false, ['tag-1']);

    expect(context.dialogs.post.edit.presetTagIds).to.deep.equal(['tag-1']);
    expect(context.dialogs.post.edit.operationToken).to.deep.equal({
      generation: 1,
      roomId: 'room-1',
    });
  });

  it('通知音の確認操作はタイムラインが所有する音声要素を同期的に再生する', async () => {
    const state = createTimelineViewState({ windowObject: null });
    const audioRef = {
      currentTime: 4,
      play: vi.fn().mockResolvedValue(undefined),
    };
    const context = {
      ui: state.ui,
      $refs: { newAudio: audioRef },
      setSnackbar: vi.fn(),
      $t: (key) => key,
    };
    context.handleNotificationAudioSuccess = () =>
      timelineDialogMethods.handleNotificationAudioSuccess.call(context);
    context.handleNotificationAudioError = () =>
      timelineDialogMethods.handleNotificationAudioError.call(context);

    const result = timelineDialogMethods.confirmSoundCaution.call(context);

    expect(audioRef.currentTime).to.equal(0);
    expect(audioRef.play).toHaveBeenCalledOnce();
    expect(await result).to.equal(true);
    expect(context.setSnackbar).not.toHaveBeenCalled();
  });

  it('通知音の再生拒否を通知し、Socket受信が続いても同じ失敗を重複表示しない', async () => {
    const state = createTimelineViewState({ windowObject: null });
    const context = {
      ui: state.ui,
      $refs: {
        newAudio: {
          currentTime: 0,
          play: vi.fn().mockRejectedValue(new Error('autoplay blocked')),
        },
      },
      setSnackbar: vi.fn(),
      $t: (key) => key,
    };
    context.handleNotificationAudioSuccess = () =>
      timelineDialogMethods.handleNotificationAudioSuccess.call(context);
    context.handleNotificationAudioError = () =>
      timelineDialogMethods.handleNotificationAudioError.call(context);

    expect(await timelineDialogMethods.confirmSoundCaution.call(context)).to.equal(false);
    timelineDialogMethods.handleNotificationAudioError.call(context);

    expect(context.setSnackbar).toHaveBeenCalledOnce();
    expect(context.setSnackbar).toHaveBeenCalledWith(
      '通知音を再生できませんでした。ブラウザの音声設定を確認して、もう一度お試しください',
      'alert'
    );
  });

});
