jest.mock('../../../../../services/timeline/timelineTranslation.service', () => ({
  translateReplyIfNeeded: jest.fn(),
  translateGuestReplyIfNeeded: jest.fn(),
}));
jest.mock('../../../../../utils/logger', () => ({ warn: jest.fn() }));

const {
  translateReplyIfNeeded,
  translateGuestReplyIfNeeded,
} = require('../../../../../services/timeline/timelineTranslation.service');
const replyPostProcess = require('../../../../../services/timeline/shared/replyPostProcess');
const { attachReplyNotificationEvent, emitReplyCreate, translateReplyAfterCreate } = replyPostProcess;

describe('返信作成後の共通処理', () => {
  test('通知用データの生成に失敗しても元の返信を変更せずエラーを記録する', async () => {
    const result = { room: 'room1', replies: [{ _id: 'reply1' }], toJSON: () => { throw new Error('serialize failed'); } };
    const io = { to: jest.fn() };
    await expect(emitReplyCreate(io, result, { includeNotifyAll: true, notifyAll: true })).resolves.toBeUndefined();
    expect(result.replies).toEqual([{ _id: 'reply1' }]);
    expect(io.to).not.toHaveBeenCalled();
    expect(require('../../../../../utils/logger').warn).toHaveBeenCalledWith('[SOCKET] publication failed', { event: 'REPLY_CREATE' });
  });
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('明示した通知ごとに異なる通知IDを付与する', () => {
    const firstReply = { _id: 'r1' };
    const secondReply = { _id: 'r1' };

    attachReplyNotificationEvent(firstReply, true, {
      createId: () => 'event-1',
      createTimestamp: () => '2026-07-18T00:00:01.000Z',
    });
    attachReplyNotificationEvent(secondReply, true, {
      createId: () => 'event-2',
      createTimestamp: () => '2026-07-18T00:00:02.000Z',
    });

    expect(firstReply).toEqual({
      _id: 'r1',
      notify_all: true,
      notification_event_id: 'event-1',
      notified_at: '2026-07-18T00:00:01.000Z',
    });
    expect(secondReply).toEqual({
      _id: 'r1',
      notify_all: true,
      notification_event_id: 'event-2',
      notified_at: '2026-07-18T00:00:02.000Z',
    });
  });

  test('明示した通知がなければ通知IDを付与しない', () => {
    const reply = { _id: 'r1' };

    attachReplyNotificationEvent(reply, false);

    expect(reply).toEqual({ _id: 'r1', notify_all: false });
  });

  test('全員通知が有効なら返信作成イベントにnotify_allを加える', () => {
    const emit = jest.fn();
    const io = { to: jest.fn(() => ({ emit })) };
    const result = { room: 'r1', replies: [{ _id: 'r1' }, { _id: 'r2' }] };

    emitReplyCreate(io, result, { includeNotifyAll: true, notifyAll: true });

    const emitted = emit.mock.calls[0][1];
    expect(emitted.replies[1].notify_all).toBe(true);
    expect(emitted.replies[1].notification_event_id).toEqual(expect.any(String));
    expect(emitted.replies[1].notified_at).toEqual(expect.any(String));
    expect(result.replies[1]).toEqual({ _id: 'r2' });
  });

  test('ゲストの返信はゲスト用の翻訳処理を使う', async () => {
    const updatedChat = { _id: 'c1', replies: [{ _id: 'r1' }] };

    await translateReplyAfterCreate({
      result: { _id: 'c1' },
      updatedChat,
      targetLangs: ['en'],
      actor: { type: 'guest', id: 'g1' },
    });

    expect(translateGuestReplyIfNeeded).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: 'c1', guestId: 'g1' })
    );
    expect(translateReplyIfNeeded).not.toHaveBeenCalled();
  });

  test('ユーザの返信はユーザ用の翻訳処理を使う', async () => {
    const updatedChat = { _id: 'c1', replies: [{ _id: 'r1' }] };

    await translateReplyAfterCreate({
      result: { _id: 'c1' },
      updatedChat,
      targetLangs: ['en'],
      actor: { type: 'user', id: 'u1' },
    });

    expect(translateReplyIfNeeded).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: 'c1', userId: 'u1' })
    );
  });
});
