jest.mock('../../../../../models/User', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
}));
jest.mock('../../../../../integrations/onesignal/notification.client', () => ({
  dispatchNotification: jest.fn(),
}));
jest.mock('../../../../../utils/logger', () => ({ warn: jest.fn() }));
jest.mock('../../../../../services/room/roomAccess.service', () => ({
  filterAuthorizedRoomUserIds: jest.fn(),
}));
jest.mock('../../../../../services/timeline/shared/pushFilterNotification', () => ({
  buildSnippet: jest.fn(() => 'SNIP'),
}));

const {
  notifyReplyPostAuthor,
  notifyReplyRepliers,
} = require('../../../../../services/timeline/shared/replyParticipantNotifications');
const User = require('../../../../../models/User');
const { dispatchNotification } = require('../../../../../integrations/onesignal/notification.client');
const { buildOneSignalExternalId } = require('../../../../../integrations/onesignal/identity');
const { filterAuthorizedRoomUserIds } = require('../../../../../services/room/roomAccess.service');

describe('返信参加者への通知', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      EXTERNAL_ONESIGNAL_ENABLED: 'true',
      VUE_APP_APPURL: 'https://example.com',
      ONESIGNAL_APP_ID: 'app',
      ONESIGNAL_REST_API_KEYS: 'rest-key',
      ONESIGNAL_HOST: 'onesignal.test',
      ONESIGNAL_PORT: '443',
      ONESIGNAL_PATH: '/api/v1/notifications',
      ONESIGNAL_EXTERNAL_ID_SECRET: 'test-onesignal-external-id-secret-32-bytes',
    };
    filterAuthorizedRoomUserIds.mockImplementation(async (userIds) => userIds);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  test('投稿者が存在すれば通知する', async () => {
    User.findOne.mockImplementation(() => ({
      select: jest.fn().mockResolvedValue({ _id: 'author1' }),
    }));

    await notifyReplyPostAuthor({
      foundChat: { user: 'author1' },
      foundFloor: { _id: 'floor1' },
      foundRoom: { _id: 'room1' },
      senderName: 'Alice',
      replacedContent: 'hello',
      excludeUserId: 'someone',
    });

    expect(filterAuthorizedRoomUserIds).toHaveBeenCalledWith(['author1'], 'room1');
    expect(dispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        include_external_user_ids: [buildOneSignalExternalId('author1')],
        url: 'https://example.com/floor/floor1/room/room1',
      })
    );
  });

  test('投稿者が除外対象なら通知しない', async () => {
    User.findOne.mockImplementation(() => ({
      select: jest.fn().mockResolvedValue({ _id: 'author1' }),
    }));

    await notifyReplyPostAuthor({
      foundChat: { user: 'author1' },
      foundFloor: { _id: 'floor1' },
      foundRoom: { _id: 'room1' },
      senderName: 'Alice',
      replacedContent: 'hello',
      excludeUserId: 'author1',
    });

    expect(dispatchNotification).not.toHaveBeenCalled();
  });

  test('条件で絞り込んだ返信者へ通知する', async () => {
    User.find.mockImplementation(() => ({
      select: jest.fn().mockResolvedValue([{ _id: 'u2' }]),
    }));

    await notifyReplyRepliers({
      foundChat: { user: 'owner', replies: [{ user: 'u2' }, { user: 'u3' }, { user: 'owner' }] },
      foundFloor: { _id: 'floor1' },
      foundRoom: { _id: 'room1' },
      senderName: 'Guest',
      replacedContent: 'hello',
      excludeUserId: 'u3',
      buildContents: ({ senderName, snippet }) => ({
        ja: `${senderName}:${snippet}`,
        en: 'EN',
      }),
    });

    expect(filterAuthorizedRoomUserIds).toHaveBeenCalledWith(['u2'], 'room1');
    expect(dispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        include_external_user_ids: [buildOneSignalExternalId('u2')],
        contents: { ja: 'Guest:SNIP', en: 'EN' },
      })
    );
  });
});
