const express = require('express');
const request = require('supertest');

const { attachErrorHandler } = require('../_helpers/app');
const {
  snapshotEnv,
  restoreEnv,
  ensureEnvValue,
  createUserToken,
} = require('../_helpers/auth');
const { createUser } = require('../_helpers/models');

const ORIGINAL_ENV = snapshotEnv(['JWT_SECRET', 'GUEST_JWT_SECRET', 'GUEST_REFRESH_SECRET']);

ensureEnvValue('JWT_SECRET', 'analytics-identity-test-jwt-secret');
ensureEnvValue('GUEST_JWT_SECRET', 'analytics-identity-test-guest-secret');
ensureEnvValue('GUEST_REFRESH_SECRET', 'analytics-identity-test-refresh-secret');

const { buildAccessToken, createGuestId } = require('../../../services/guestAuth.service');
const createAnalyticsRoute = require('../../../routes/analytics.route');

const MEASUREMENT_ID = 'G-IDENTITY01';
const SECRET = 'analytics-identity-private-dummy-secret';

const buildApp = ({ enabled = true } = {}) => {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/analytics',
    createAnalyticsRoute({
      capabilities: { googleAnalytics: enabled },
      analyticsConfig: {
        measurementId: enabled ? MEASUREMENT_ID : null,
        userIdSecret: enabled ? SECRET : null,
      },
    })
  );
  return attachErrorHandler(app);
};

describe('アクセス解析の識別情報API', () => {
  afterAll(() => {
    restoreEnv(ORIGINAL_ENV);
  });

  test('登録ユーザのトークンからno-store付きで指定の識別情報だけを返す', async () => {
    const user = await createUser();
    const token = createUserToken(user);

    const response = await request(buildApp())
      .get('/api/analytics/identity')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.body).toEqual({
      analytics_user_id: expect.stringMatching(/^ga1_[a-f\d]{64}$/),
      visitor_type: 'registered',
      identity_version: 'v1',
    });
    expect(response.text).not.toContain(user._id.toString());
    expect(response.text).not.toContain(token);
    expect(response.text).not.toContain(SECRET);
  });

  test('クエリとbodyの偽IDを無視し検証済みトークン主体だけを使用する', async () => {
    const user = await createUser();
    const other = await createUser();
    const token = createUserToken(user);
    const app = buildApp();

    const base = await request(app)
      .get('/api/analytics/identity')
      .set('Authorization', `Bearer ${token}`);
    const forged = await request(app)
      .get(`/api/analytics/identity?user_id=${other._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ user_id: other._id.toString() });

    expect(forged.status).toBe(200);
    expect(forged.body.analytics_user_id).toBe(base.body.analytics_user_id);
  });

  test.each([
    ['資格情報なし', null],
    ['不正token', 'not-a-token'],
  ])('%sは成功しない', async (_label, token) => {
    const pending = request(buildApp()).get('/api/analytics/identity');
    if (token) pending.set('Authorization', `Bearer ${token}`);

    const response = await pending;

    expect(response.status).toBe(401);
    expect(response.body?.error?.code).toBe('TOKEN_INVALID');
  });

  test('期限切れユーザトークンはTOKEN_EXPIREDとなる', async () => {
    const user = await createUser();
    const token = createUserToken(user, process.env.JWT_SECRET, {}, { expiresIn: -1 });

    const response = await request(buildApp())
      .get('/api/analytics/identity')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body?.error?.code).toBe('TOKEN_EXPIRED');
  });

  test('ゲストトークンは登録ユーザ識別情報を返さない', async () => {
    const token = buildAccessToken(createGuestId());

    const response = await request(buildApp())
      .get('/api/analytics/identity')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body?.error?.code).toBe('TOKEN_INVALID');
  });

  test('Capability無効は認証より先にfeature付き503を返す', async () => {
    const response = await request(buildApp({ enabled: false }))
      .get('/api/analytics/identity')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(503);
    expect(response.body?.error?.code).toBe('EXTERNAL_FEATURE_DISABLED');
    expect(response.body?.error?.details).toEqual({ feature: 'googleAnalytics' });
  });
});
