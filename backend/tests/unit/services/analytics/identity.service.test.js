const {
  ANALYTICS_IDENTITY_VERSION,
  createAnalyticsIdentityService,
} = require('../../../../services/analytics/identity.service');

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f191e810c19729de860ea';
const SECRET_A = 'a'.repeat(32);
const SECRET_B = 'b'.repeat(32);

describe('アクセス解析用の識別情報', () => {
  test('固定のドメインとHMAC-SHA-256からバージョン付きの登録ユーザ識別情報を返す', () => {
    const service = createAnalyticsIdentityService({ userIdSecret: SECRET_A });

    expect(service.buildUserIdentity(USER_ID)).toEqual({
      analytics_user_id:
        'ga1_87dcb72eb78e85a7dc0a0f08a9d7a331cc98a52a918f34212bb065327b28ff8a',
      visitor_type: 'registered',
      identity_version: 'v1',
    });
    expect(ANALYTICS_IDENTITY_VERSION).toBe('v1');
  });

  test('同じユーザと秘密値は同じ値、ユーザまたは秘密値が変われば別の値になる', () => {
    const serviceA = createAnalyticsIdentityService({ userIdSecret: SECRET_A });
    const serviceB = createAnalyticsIdentityService({ userIdSecret: SECRET_B });

    const first = serviceA.buildUserIdentity(USER_ID).analytics_user_id;
    expect(serviceA.buildUserIdentity(USER_ID.toUpperCase()).analytics_user_id).toBe(first);
    expect(serviceA.buildUserIdentity(OTHER_USER_ID).analytics_user_id).not.toBe(first);
    expect(serviceB.buildUserIdentity(USER_ID).analytics_user_id).not.toBe(first);
    expect(first).toMatch(/^ga1_[a-f\d]{64}$/);
  });

  test.each([undefined, null, '', 'guest-id', '550e8400-e29b-41d4-a716-446655440000'])
  ('登録ユーザ ObjectId以外はHMAC入力として受理しない', (userId) => {
    const service = createAnalyticsIdentityService({ userIdSecret: SECRET_A });

    expect(() => service.buildUserIdentity(userId)).toThrow(
      'Analytics identity requires a registered user ID'
    );
  });

  test('検証済み秘密値注入を必須としprocess.env変更を再読込しない', () => {
    expect(() => createAnalyticsIdentityService()).toThrow(
      'createAnalyticsIdentityService requires validated private config'
    );
    expect(() => createAnalyticsIdentityService({ userIdSecret: 'a'.repeat(31) })).toThrow(
      'createAnalyticsIdentityService requires validated private config'
    );
    const service = createAnalyticsIdentityService({ userIdSecret: SECRET_A });
    const before = process.env.GA4_USER_ID_SECRET;

    try {
      process.env.GA4_USER_ID_SECRET = SECRET_B;
      expect(service.buildUserIdentity(USER_ID).analytics_user_id).toBe(
        'ga1_87dcb72eb78e85a7dc0a0f08a9d7a331cc98a52a918f34212bb065327b28ff8a'
      );
    } finally {
      if (before === undefined) delete process.env.GA4_USER_ID_SECRET;
      else process.env.GA4_USER_ID_SECRET = before;
    }
  });
});
