const crypto = require('crypto');
const TEST_SECRET = 'test-onesignal-external-id-secret-32-bytes';
const mockGetOneSignalConfig = jest.fn(() => ({ externalIdSecret: TEST_SECRET }));
jest.mock('../../../../config/featureFlags', () => ({
  getOneSignalConfig: mockGetOneSignalConfig,
}));
const {
  buildOneSignalExternalId,
  EXTERNAL_ID_PREFIX,
} = require('../../../../integrations/onesignal/identity');

describe('OneSignalのExternal ID生成', () => {
  beforeEach(() => {
    mockGetOneSignalConfig.mockReturnValue({ externalIdSecret: TEST_SECRET });
  });

  test('同じユーザIDから安定したHMAC External IDを生成する', () => {
    const expectedDigest = crypto
      .createHmac('sha256', TEST_SECRET)
      .update('iseeetl:onesignal:user:user-1')
      .digest('hex');

    expect(buildOneSignalExternalId('user-1')).toBe(`${EXTERNAL_ID_PREFIX}${expectedDigest}`);
    expect(buildOneSignalExternalId('user-1')).not.toContain('user-1');
  });

  test('異なるユーザIDには異なるExternal IDを生成する', () => {
    expect(buildOneSignalExternalId('user-1')).not.toBe(buildOneSignalExternalId('user-2'));
  });

  test.each([
    [undefined, 'user-1'],
    ['', 'user-1'],
    ['short-secret', 'user-1'],
    ['test-onesignal-external-id-secret-32-bytes', ''],
  ])('秘密値またはユーザIDが不正ならnullを返す', (secret, userId) => {
    mockGetOneSignalConfig.mockReturnValue(
      typeof secret === 'undefined' ? null : { externalIdSecret: secret }
    );

    expect(buildOneSignalExternalId(userId)).toBeNull();
  });
});
