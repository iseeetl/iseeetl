jest.mock('../../../../../models/PushFilter', () => ({ find: jest.fn() }));
jest.mock('../../../../../services/timeline/shared/matchConditions', () => jest.fn());
jest.mock('../../../../../integrations/onesignal/notification.client', () => ({ dispatchNotification: jest.fn() }));
jest.mock('../../../../../services/room/roomAccess.service', () => ({
  filterAuthorizedRoomUserIds: jest.fn(),
}));
const mockGetOneSignalConfig = jest.fn(() => ({
  appId: 'dummy',
  externalIdSecret: 'test-onesignal-external-id-secret-32-bytes',
}));
jest.mock('../../../../../config/featureFlags', () => ({
  getOneSignalConfig: mockGetOneSignalConfig,
  isOneSignalEnabled: jest.fn(() => true),
}));

const PushFilter = require('../../../../../models/PushFilter');
const matchConditions = require('../../../../../services/timeline/shared/matchConditions');
const { dispatchNotification } = require('../../../../../integrations/onesignal/notification.client');
const { buildOneSignalExternalId } = require('../../../../../integrations/onesignal/identity');
const { filterAuthorizedRoomUserIds } = require('../../../../../services/room/roomAccess.service');
const {
  buildSnippet,
  notifyPushFilterUsers,
} = require('../../../../../services/timeline/shared/pushFilterNotification');
const { snapshotEnv, restoreEnv } = require('../../../_helpers/env');

const buildPopulate = (result) => ({ populate: jest.fn().mockResolvedValue(result) });

describe('pushFilterNotificationの検証', () => {
  const ORIGINAL_ENV = snapshotEnv([
    'ONESIGNAL_APP_ID',
    'ONESIGNAL_REST_API_KEYS',
    'ONESIGNAL_HOST',
    'ONESIGNAL_PORT',
    'ONESIGNAL_PATH',
    'ONESIGNAL_EXTERNAL_ID_SECRET',
  ]);

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetOneSignalConfig.mockReturnValue({
      appId: 'dummy',
      externalIdSecret: 'test-onesignal-external-id-secret-32-bytes',
    });
    process.env.ONESIGNAL_APP_ID = 'dummy';
    process.env.ONESIGNAL_REST_API_KEYS = 'rest-key';
    process.env.ONESIGNAL_HOST = 'onesignal.test';
    process.env.ONESIGNAL_PORT = '443';
    process.env.ONESIGNAL_PATH = '/api/v1/notifications';
    process.env.ONESIGNAL_EXTERNAL_ID_SECRET = 'test-onesignal-external-id-secret-32-bytes';
    filterAuthorizedRoomUserIds.mockImplementation(async (userIds) => userIds);
  });

  afterEach(() => {
    restoreEnv(ORIGINAL_ENV);
  });

  test('buildSnippet は 40 文字で切り詰める', () => {
    const content = 'a'.repeat(50);
    expect(buildSnippet(content)).toBe(`${'a'.repeat(40)}…`);
    expect(buildSnippet('')).toBe('');
  });

  test('notifyPushFilterUsers: 条件一致ユーザに通知', async () => {
    const filters = [
      { user: { _id: 'u1', push_enabled: true }, conditions: [{ k: 'x' }] },
      { user: { _id: 'u2', push_enabled: false }, conditions: [{ k: 'y' }] },
      { user: { _id: 'u3', push_enabled: true }, conditions: [{ k: 'z' }] },
    ];
    PushFilter.find.mockReturnValue(buildPopulate(filters));
    matchConditions.mockImplementation((msgInfo, conds) => conds[0].k === 'x');

    const targets = await notifyPushFilterUsers({
      roomId: 'r1',
      msgInfo: { content: 'hello' },
      excludeUserId: 'u3',
      headings: { ja: 'h' },
      contents: { ja: 'c' },
      url: 'https://example.com',
    });

    expect(targets).toEqual(['u1']);
    expect(filterAuthorizedRoomUserIds).toHaveBeenCalledWith(['u1'], 'r1');
    expect(dispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        app_id: 'dummy',
        include_external_user_ids: [buildOneSignalExternalId('u1')],
        headings: { ja: 'h' },
        contents: { ja: 'c' },
        url: 'https://example.com',
      })
    );
  });

  test('notifyPushFilterUsers: 対象が無ければ通知しない', async () => {
    PushFilter.find.mockReturnValue(
      buildPopulate([{ user: { _id: 'u1', push_enabled: true }, conditions: [] }])
    );
    matchConditions.mockReturnValue(false);

    const targets = await notifyPushFilterUsers({
      roomId: 'r1',
      msgInfo: { content: 'hello' },
      headings: { ja: 'h' },
      contents: { ja: 'c' },
      url: 'https://example.com',
    });

    expect(targets).toEqual([]);
    expect(dispatchNotification).not.toHaveBeenCalled();
  });
});
