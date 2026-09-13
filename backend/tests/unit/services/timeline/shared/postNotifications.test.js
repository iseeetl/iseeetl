jest.mock('../../../../../utils/logger', () => ({ warn: jest.fn() }));
jest.mock('../../../../../services/timeline/shared/pushFilterNotification', () => ({
  buildSnippet: jest.fn(() => 'snippet'),
  notifyPushFilterUsers: jest.fn(),
}));

const logger = require('../../../../../utils/logger');
const { buildSnippet, notifyPushFilterUsers } = require('../../../../../services/timeline/shared/pushFilterNotification');
const { notifyPostFilterMatch, emitPostCreate } = require('../../../../../services/timeline/shared/postNotifications');
const { snapshotEnv, restoreEnv } = require('../../../_helpers/env');

describe('投稿通知の共通処理', () => {
  const ORIGINAL_ENV = snapshotEnv(['VUE_APP_APPURL']);

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VUE_APP_APPURL = 'https://example.com';
  });

  afterEach(() => {
    restoreEnv(ORIGINAL_ENV);
  });

  test('通知条件に一致した投稿の通知データを生成する', async () => {
    notifyPushFilterUsers.mockResolvedValue([]);
    await notifyPostFilterMatch({
      roomId: 'r1',
      floorId: 'f1',
      content: 'hello',
      roomTags: ['t1'],
      username: 'user',
      animation: true,
      excludeUserId: 'u2',
    });

    expect(buildSnippet).toHaveBeenCalledWith('hello');
    expect(notifyPushFilterUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: 'r1',
        excludeUserId: 'u2',
        url: 'https://example.com/floor/f1/room/r1',
      })
    );
  });

  test('通知に失敗したらエラーを記録して処理を続ける', async () => {
    notifyPushFilterUsers.mockRejectedValue(new Error('fail'));
    await notifyPostFilterMatch({ roomId: 'r1', floorId: 'f1', content: 'hello', username: 'user' });
    expect(logger.warn).toHaveBeenCalled();
  });

  test('Socket.IOがあれば投稿作成を通知する', () => {
    const io = { to: jest.fn(() => ({ emit: jest.fn() })) };
    emitPostCreate(io, { _id: 'p1', room: 'r1' });
    expect(io.to).toHaveBeenCalledWith('r1');
  });

  test('Socket.IOがなければ投稿作成を通知しない', () => {
    emitPostCreate(null, { _id: 'p1', room: 'r1' });
  });
});
