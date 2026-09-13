jest.mock('../../../../../models/Chat', () => ({ create: jest.fn() }));
jest.mock('../../../../../services/spam.service', () => ({ replaceSpams: jest.fn() }));
jest.mock('../../../../../services/timeline/shared/postNotifications', () => ({
  emitPostCreate: jest.fn(),
  notifyPostFilterMatch: jest.fn(),
}));

const Chat = require('../../../../../models/Chat');
const { replaceSpams } = require('../../../../../services/spam.service');
const { emitPostCreate, notifyPostFilterMatch } = require('../../../../../services/timeline/shared/postNotifications');
const { createTimelinePost } = require('../../../../../services/timeline/shared/postCreate');

describe('投稿作成の共通処理', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('投稿を作成して通知とSocket通知を行う', async () => {
    replaceSpams.mockResolvedValue('replaced');
    Chat.create.mockResolvedValue({ _id: 'c1', room: { _id: 'r1' } });

    const buildCreateData = jest.fn(({ replacedContent }) => ({ content: replacedContent }));
    const buildResult = jest.fn(async (created) => ({ ...created, extra: true }));
    const notify = { roomId: 'r1', floorId: 'f1', username: 'u' };
    const io = { to: jest.fn(() => ({ emit: jest.fn() })) };

    const res = await createTimelinePost({
      content: 'bad',
      buildCreateData,
      buildResult,
      notify,
      io,
    });

    expect(replaceSpams).toHaveBeenCalledWith('bad');
    expect(Chat.create).toHaveBeenCalledWith({
      content: 'replaced',
      analysis_source_revision: 1,
    });
    expect(notifyPostFilterMatch).toHaveBeenCalledWith({ ...notify, content: 'replaced' });
    expect(emitPostCreate).toHaveBeenCalledWith(io, { _id: 'c1', room: { _id: 'r1' }, extra: true });
    expect(res).toEqual(
      expect.objectContaining({
        responseChat: { _id: 'c1', room: { _id: 'r1' }, extra: true },
        replacedContent: 'replaced',
        createdChat: { _id: 'c1', room: { _id: 'r1' } },
      })
    );
  });

  test('スパム語句の置換に失敗したらエラーを伝播する', async () => {
    const err = new Error('spam-fail');
    replaceSpams.mockRejectedValue(err);

    await expect(
      createTimelinePost({
        content: 'bad',
        buildCreateData: jest.fn(),
      })
    ).rejects.toBe(err);

    expect(Chat.create).not.toHaveBeenCalled();
  });

  test('通知に失敗したらエラーを伝播する', async () => {
    replaceSpams.mockResolvedValue('replaced');
    Chat.create.mockResolvedValue({ _id: 'c1', room: { _id: 'r1' } });
    const err = new Error('notify-fail');
    notifyPostFilterMatch.mockRejectedValue(err);

    await expect(
      createTimelinePost({
        content: 'bad',
        buildCreateData: jest.fn(({ replacedContent }) => ({ content: replacedContent })),
        notify: { roomId: 'r1', floorId: 'f1', username: 'u' },
        io: { to: jest.fn(() => ({ emit: jest.fn() })) },
      })
    ).rejects.toBe(err);

    expect(emitPostCreate).not.toHaveBeenCalled();
  });
});
