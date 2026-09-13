jest.mock('../../../../../models/User', () => ({ findOne: jest.fn() }));
jest.mock('../../../../../services/timeline/shared/notificationSender', () => ({ dispatchPushNotification: jest.fn() }));
jest.mock('../../../../../services/timeline/shared/pushFilterNotification', () => ({
  buildSnippet: jest.fn(),
  notifyPushFilterUsers: jest.fn(),
}));
jest.mock('../../../../../services/timeline/shared/notificationUtils', () => ({ buildUrl: jest.fn() }));

const User = require('../../../../../models/User');
const { dispatchPushNotification } = require('../../../../../services/timeline/shared/notificationSender');
const { buildSnippet, notifyPushFilterUsers } = require('../../../../../services/timeline/shared/pushFilterNotification');
const { buildUrl } = require('../../../../../services/timeline/shared/notificationUtils');
const NOTIFICATION_MESSAGES = require('../../../../../constants/notificationMessages');
const {
  notifySupplementAuthor,
  notifySupplementPushFilter,
} = require('../../../../../services/timeline/shared/supplementNotifications');
const { snapshotEnv, restoreEnv } = require('../../../_helpers/env');

describe('付加情報の通知', () => {
  const ORIGINAL_ENV = snapshotEnv(['VUE_APP_APPURL']);

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VUE_APP_APPURL = 'http://app.example.com';
    buildSnippet.mockReturnValue('snippet');
    buildUrl.mockReturnValue('http://app.example.com/floor/room');
  });

  afterEach(() => {
    restoreEnv(ORIGINAL_ENV);
  });

  test('付加情報の作成者が存在しなければ通知しない', async () => {
    await notifySupplementAuthor({
      authorId: null,
      excludeUserId: 'u1',
      senderName: 'Alice',
      content: 'hello',
      floorId: 'f1',
      roomId: 'r1',
      headings: { en: 'Heading' },
    });

    expect(User.findOne).not.toHaveBeenCalled();
    expect(dispatchPushNotification).not.toHaveBeenCalled();
  });

  test('付加情報の作成者が除外対象なら通知しない', async () => {
    await notifySupplementAuthor({
      authorId: 'u1',
      excludeUserId: 'u1',
      senderName: 'Alice',
      content: 'hello',
      floorId: 'f1',
      roomId: 'r1',
      headings: { en: 'Heading' },
    });

    expect(User.findOne).not.toHaveBeenCalled();
    expect(dispatchPushNotification).not.toHaveBeenCalled();
  });

  test('付加情報の作成者へプッシュ通知する', async () => {
    const selectMock = jest.fn().mockResolvedValue({ _id: 'author-1' });
    User.findOne.mockReturnValue({ select: selectMock });

    await notifySupplementAuthor({
      authorId: 'author-1',
      excludeUserId: 'other',
      senderName: 'Alice',
      content: 'hello',
      floorId: 'f1',
      roomId: 'r1',
      headings: { en: 'Heading' },
      userQuery: { delete_flg: false },
    });

    expect(User.findOne).toHaveBeenCalledWith({ _id: 'author-1', push_enabled: true, delete_flg: false });
    expect(selectMock).toHaveBeenCalledWith('_id');
    expect(buildSnippet).toHaveBeenCalledWith('hello');
    expect(buildUrl).toHaveBeenCalledWith(process.env.VUE_APP_APPURL, 'f1', 'r1');
    expect(dispatchPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['author-1'],
        roomId: 'r1',
        headings: { en: 'Heading' },
        contents: NOTIFICATION_MESSAGES.CONTENT_TEMPLATES.DEFAULT({ senderName: 'Alice', snippet: 'snippet' }),
        url: 'http://app.example.com/floor/room',
      })
    );
  });

  test('作成者への通知に失敗したらエラーを記録する', async () => {
    const selectMock = jest.fn().mockRejectedValue(new Error('fail'));
    User.findOne.mockReturnValue({ select: selectMock });
    const logger = { warn: jest.fn() };

    await notifySupplementAuthor({
      authorId: 'author-1',
      excludeUserId: 'other',
      senderName: 'Alice',
      content: 'hello',
      floorId: 'f1',
      roomId: 'r1',
      headings: { en: 'Heading' },
      logger,
      logPrefix: 'supplement-author',
    });

    expect(logger.warn).toHaveBeenCalledWith('[OneSignal] supplement-author error:', expect.any(Error));
  });

  test('条件付きの付加情報通知を共通処理へ委譲する', async () => {
    notifyPushFilterUsers.mockResolvedValue(['u1']);

    await notifySupplementPushFilter({
      roomId: 'room-1',
      floorId: 'floor-1',
      senderName: 'Alice',
      content: 'hello',
      excludeUserId: 'u2',
      headings: { en: 'Heading' },
    });

    expect(buildSnippet).toHaveBeenCalledWith('hello');
    expect(buildUrl).toHaveBeenCalledWith(process.env.VUE_APP_APPURL, 'floor-1', 'room-1');
    expect(notifyPushFilterUsers).toHaveBeenCalledWith({
      roomId: 'room-1',
      msgInfo: {
        room_tags: [],
        content: 'hello',
        username: 'Alice',
        animation: false,
      },
      excludeUserId: 'u2',
      headings: { en: 'Heading' },
      contents: NOTIFICATION_MESSAGES.CONTENT_TEMPLATES.DEFAULT({ senderName: 'Alice', snippet: 'snippet' }),
      url: 'http://app.example.com/floor/room',
    });
  });

  test('条件付きの付加情報通知に失敗したらエラーを記録する', async () => {
    const logger = { warn: jest.fn() };
    notifyPushFilterUsers.mockRejectedValue(new Error('fail'));

    await notifySupplementPushFilter({
      roomId: 'room-1',
      floorId: 'floor-1',
      senderName: 'Alice',
      content: 'hello',
      excludeUserId: 'u2',
      headings: { en: 'Heading' },
      logger,
      logPrefix: 'supplement-filter',
    });

    expect(logger.warn).toHaveBeenCalledWith('[OneSignal] supplement-filter error:', expect.any(Error));
  });
});
