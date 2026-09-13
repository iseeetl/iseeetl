jest.mock('../../../../../utils/logger', () => ({ warn: jest.fn() }));
jest.mock('../../../../../services/timeline/shared/pushFilterNotification', () => ({
  buildSnippet: jest.fn(() => 'snippet'),
  notifyPushFilterUsers: jest.fn(),
}));

const logger = require('../../../../../utils/logger');
const { notifyPushFilterUsers } = require('../../../../../services/timeline/shared/pushFilterNotification');
const { notifyReplyFilterMatch } = require('../../../../../services/timeline/shared/replyNotifications');
const { snapshotEnv, restoreEnv } = require('../../../_helpers/env');

describe('返信通知の共通処理', () => {
  const ORIGINAL_ENV = snapshotEnv(['VUE_APP_APPURL']);

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VUE_APP_APPURL = 'https://example.com';
  });

  afterEach(() => {
    restoreEnv(ORIGINAL_ENV);
  });

  test('返信の条件付き通知を対象ユーザへの通知処理へ委譲する', async () => {
    notifyPushFilterUsers.mockResolvedValue(['u1']);
    const res = await notifyReplyFilterMatch({
      roomId: 'r1',
      floorId: 'f1',
      content: 'hello',
      username: 'user',
      roomTags: [],
    });
    expect(notifyPushFilterUsers).toHaveBeenCalled();
    expect(res).toEqual(['u1']);
  });

  test('返信の通知に失敗したら空配列を返す', async () => {
    notifyPushFilterUsers.mockRejectedValue(new Error('fail'));
    const res = await notifyReplyFilterMatch({ roomId: 'r1', floorId: 'f1', content: 'hello', username: 'user' });
    expect(logger.warn).toHaveBeenCalled();
    expect(res).toEqual([]);
  });
});
