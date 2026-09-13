jest.mock('../../../../../models/Chat', () => ({ findOneAndUpdate: jest.fn() }));
jest.mock('../../../../../services/spam.service', () => ({ replaceSpams: jest.fn() }));
jest.mock('../../../../../services/timeline/shared/timelineSerializer', () => jest.fn((v) => v));

const Chat = require('../../../../../models/Chat');
const { replaceSpams } = require('../../../../../services/spam.service');
const serializeTimeline = require('../../../../../services/timeline/shared/timelineSerializer');
const { createTimelineReply } = require('../../../../../services/timeline/shared/replyCreate');

describe('返信作成の共通処理', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('返信を作成して結果を返す', async () => {
    replaceSpams.mockResolvedValue('clean');
    const populated = { _id: 'c1', replies: [{ _id: 'r1' }] };
    Chat.findOneAndUpdate.mockResolvedValue({ populate: jest.fn().mockResolvedValue(populated) });

    const buildReply = jest.fn(({ replacedContent }) => ({ content: replacedContent }));
    const res = await createTimelineReply({
      postId: 'p1',
      content: 'raw',
      buildReply,
      populate: 'replies',
    });

    expect(replaceSpams).toHaveBeenCalledWith('raw');
    expect(Chat.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'p1', delete_flg: false },
      { $push: { replies: { content: 'clean', analysis_source_revision: 1 } } },
      { new: true, runValidators: true }
    );
    expect(serializeTimeline).toHaveBeenCalledWith(populated);
    expect(res).toEqual(
      expect.objectContaining({
        responseChat: populated,
        replacedContent: 'clean',
      })
    );
  });

  test('スパム語句の置換に失敗したらエラーを伝播する', async () => {
    const err = new Error('spam-fail');
    replaceSpams.mockRejectedValue(err);

    await expect(
      createTimelineReply({
        postId: 'p1',
        content: 'raw',
        buildReply: jest.fn(),
      })
    ).rejects.toBe(err);

    expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('更新に失敗したらエラーを伝播する', async () => {
    replaceSpams.mockResolvedValue('clean');
    const err = new Error('update-fail');
    Chat.findOneAndUpdate.mockRejectedValue(err);

    await expect(
      createTimelineReply({
        postId: 'p1',
        content: 'raw',
        buildReply: jest.fn(({ replacedContent }) => ({ content: replacedContent })),
      })
    ).rejects.toBe(err);
  });

});
