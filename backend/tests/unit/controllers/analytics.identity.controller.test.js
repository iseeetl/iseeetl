const {
  createEnsureGoogleAnalyticsEnabled,
  createGetAnalyticsIdentity,
} = require('../../../controllers/analytics/identity.controller');

describe('アクセス解析の識別情報コントローラ', () => {
  test('計測機能が無効なら認証前に機能名付きの503エラーを渡す', () => {
    const next = jest.fn();
    const middleware = createEnsureGoogleAnalyticsEnabled({ enabled: false });

    middleware({}, {}, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'EXTERNAL_FEATURE_DISABLED',
        status: 503,
        details: { feature: 'googleAnalytics' },
      })
    );
  });

  test('Capability有効時は後続認証へ進む', () => {
    const next = jest.fn();

    createEnsureGoogleAnalyticsEnabled({ enabled: true })({}, {}, next);

    expect(next).toHaveBeenCalledWith();
  });

  test('検証済みJWTだけから指定の識別情報を返す', () => {
    const identity = Object.freeze({
      analytics_user_id: `ga1_${'a'.repeat(64)}`,
      visitor_type: 'registered',
      identity_version: 'v1',
    });
    const identityService = { buildUserIdentity: jest.fn(() => identity) };
    const set = jest.fn();
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const next = jest.fn();
    const handler = createGetAnalyticsIdentity({ identityService });

    handler(
      {
        jwtPayload: { user_id: '507f1f77bcf86cd799439011' },
        body: { user_id: '507f191e810c19729de860ea' },
        query: { user_id: '507f191e810c19729de860ea' },
      },
      { set, status },
      next
    );

    expect(identityService.buildUserIdentity).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011'
    );
    expect(set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(identity);
    expect(next).not.toHaveBeenCalled();
  });

  test('サービスのエラーを共通エラー処理へ渡す', () => {
    const error = new TypeError('invalid user');
    const next = jest.fn();
    const handler = createGetAnalyticsIdentity({
      identityService: { buildUserIdentity: jest.fn(() => { throw error; }) },
    });

    handler({ jwtPayload: {} }, {}, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
