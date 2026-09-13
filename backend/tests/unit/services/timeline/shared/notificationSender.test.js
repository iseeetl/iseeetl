jest.mock('../../../../../integrations/onesignal/notification.client', () => ({ dispatchNotification: jest.fn() }));

jest.mock('../../../../../services/room/roomAccess.service', () => ({
  filterAuthorizedRoomUserIds: jest.fn(),
}));
jest.mock('../../../../../utils/logger', () => ({ warn: jest.fn() }));
const mockIsOneSignalEnabled = jest.fn(() => true);
const mockGetOneSignalConfig = jest.fn(() => ({
  appId: 'default-app',
  externalIdSecret: 'test-onesignal-external-id-secret-32-bytes',
}));
jest.mock('../../../../../config/featureFlags', () => ({
  getOneSignalConfig: mockGetOneSignalConfig,
  isOneSignalEnabled: mockIsOneSignalEnabled,
}));

const { dispatchNotification } = require('../../../../../integrations/onesignal/notification.client');
const { dispatchPushNotification } = require('../../../../../services/timeline/shared/notificationSender');
const { buildOneSignalExternalId } = require('../../../../../integrations/onesignal/identity');
const { filterAuthorizedRoomUserIds } = require('../../../../../services/room/roomAccess.service');
const logger = require('../../../../../utils/logger');
const { snapshotEnv, restoreEnv } = require('../../../_helpers/env');

describe('notificationSenderの検証', () => {
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
    mockIsOneSignalEnabled.mockReturnValue(true);
    mockGetOneSignalConfig.mockReturnValue({
      appId: 'default-app',
      externalIdSecret: 'test-onesignal-external-id-secret-32-bytes',
    });
    process.env.ONESIGNAL_APP_ID = 'default-app';
    process.env.ONESIGNAL_REST_API_KEYS = 'rest-key';
    process.env.ONESIGNAL_HOST = 'onesignal.test';
    process.env.ONESIGNAL_PORT = '443';
    process.env.ONESIGNAL_PATH = '/api/v1/notifications';
    process.env.ONESIGNAL_EXTERNAL_ID_SECRET = 'test-onesignal-external-id-secret-32-bytes';
    filterAuthorizedRoomUserIds.mockImplementation(async (userIds) => Array.from(new Set(userIds)));
  });

  afterEach(() => {
    restoreEnv(ORIGINAL_ENV);
  });

  test('dispatchPushNotification: userIds が空なら送信しない', async () => {
    await dispatchPushNotification({
      userIds: [],
      roomId: 'r1',
      headings: { ja: 'h' },
      contents: { ja: 'c' },
      url: 'x',
    });
    expect(dispatchNotification).not.toHaveBeenCalled();
  });

  test('dispatchPushNotification: app_id をデフォルトで送る', async () => {
    await dispatchPushNotification({
      userIds: ['u1'],
      headings: { ja: 'h' },
      contents: { ja: 'c' },
      roomId: 'r1',
      url: 'https://example.com',
    });

    expect(dispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        app_id: 'default-app',
        include_external_user_ids: [buildOneSignalExternalId('u1')],
        channel_for_external_user_ids: 'push',
        headings: { ja: 'h' },
        contents: { ja: 'c' },
        url: 'https://example.com',
      })
    );
  });

  test('dispatchPushNotification: appId が指定されていれば優先する', async () => {
    await dispatchPushNotification({
      userIds: ['u1'],
      headings: { ja: 'h' },
      contents: { ja: 'c' },
      url: 'https://example.com',
      roomId: 'r1',
      appId: 'custom-app',
    });

    expect(dispatchNotification).toHaveBeenCalledWith(expect.objectContaining({ app_id: 'custom-app' }));
  });

  test('dispatchPushNotification: OneSignal無効時はルーム再認可も送信もしない', async () => {
    mockIsOneSignalEnabled.mockReturnValue(false);

    await dispatchPushNotification({
      userIds: ['u1'],
      roomId: 'r1',
      headings: { ja: 'h' },
      contents: { ja: 'c' },
      url: 'https://example.com',
    });

    expect(filterAuthorizedRoomUserIds).not.toHaveBeenCalled();
    expect(dispatchNotification).not.toHaveBeenCalled();
  });

  test('dispatchPushNotification: 無効時は生ユーザIDへフォールバックしない', async () => {
    mockIsOneSignalEnabled.mockReturnValue(false);

    await dispatchPushNotification({
      userIds: ['u1'],
      headings: { ja: 'h' },
      roomId: 'r1',
      contents: { ja: 'c' },
      url: 'https://example.com',
    });

    expect(dispatchNotification).not.toHaveBeenCalled();
  });

  test('dispatchPushNotification: 送信直前のルーム再認可を通過したユーザだけへ送信する', async () => {
    filterAuthorizedRoomUserIds.mockResolvedValue(['u2']);

    const result = await dispatchPushNotification({
      userIds: ['u1', 'u2'],
      roomId: 'r1',
      headings: { ja: 'h' },
      contents: { ja: 'c' },
      url: 'https://example.com',
    });

    expect(filterAuthorizedRoomUserIds).toHaveBeenCalledWith(['u1', 'u2'], 'r1');
    expect(dispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        include_external_user_ids: [buildOneSignalExternalId('u2')],
      })
    );
    expect(result).toEqual(['u2']);
  });

  test('dispatchPushNotification: ルーム再認可に失敗した場合は送信せず空配列を返す', async () => {
    filterAuthorizedRoomUserIds.mockRejectedValue(new Error('room unavailable'));

    const result = await dispatchPushNotification({
      userIds: ['u1'],
      roomId: 'r1',
      headings: { ja: 'h' },
      contents: { ja: 'c' },
      url: 'https://example.com',
    });

    expect(dispatchNotification).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      '[OneSignal] recipient authorization failed for room r1:',
      'room unavailable'
    );
    expect(result).toEqual([]);
  });

  test('dispatchPushNotification: roomIdが無ければ再認可も送信もしない', async () => {
    const result = await dispatchPushNotification({
      userIds: ['u1'],
      headings: { ja: 'h' },
      contents: { ja: 'c' },
      url: 'https://example.com',
    });

    expect(filterAuthorizedRoomUserIds).not.toHaveBeenCalled();
    expect(dispatchNotification).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
