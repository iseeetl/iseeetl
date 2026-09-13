const request = require('supertest');
const bcrypt = require('bcrypt');

const mockSendMail = jest.fn().mockResolvedValue(true);
jest.mock('../../../integrations/mail/mailer', () => ({
  createMailTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

const { buildErrorHandledApp } = require('../_helpers/app');
const { snapshotEnv, restoreEnv, ensureEnvValue } = require('../_helpers/auth');
const User = require('../../../models/User');

describe('ログインAPI', () => {
  let app;
  const ORIGINAL_ENV = snapshotEnv([
    'JWT_SECRET',
    'LOGIN_RATE_LIMIT_MAX',
    'LOGIN_RATE_LIMIT_WINDOW_MS',
    'RESET_MAIL_RATE_LIMIT_MAX',
    'RESET_MAIL_RATE_LIMIT_WINDOW_MS',
    'RESET_MAIL_IP_RATE_LIMIT_MAX',
    'NODE_ENV',
    'VUE_APP_APPURL',
    'VUE_APP_APPNAME',
    'SEND_MAIL_HOST',
    'SEND_MAIL_PORT',
    'NO_REPLY_MAIL',
    'MAIL_DELIVERY_MODE',
    'EXTERNAL_MAIL_DELIVERY_ENABLED',
    'EXTERNAL_ONESIGNAL_ENABLED',
    'ONESIGNAL_APP_ID',
    'ONESIGNAL_REST_API_KEYS',
    'ONESIGNAL_EXTERNAL_ID_SECRET',
  ]);

  const loadAuthRouter = () => {
    const modulePath = require.resolve('../../../routes/auth.route');
    delete require.cache[modulePath];
    return require('../../../routes/auth.route');
  };

  const seedUser = async (overrides = {}) => {
    const password = overrides.password || 'Passw0rd';
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: overrides.username || 'Alice',
      mail: overrides.mail || 'alice@example.com',
      password: hashed,
      lang: overrides.lang || 'ja',
      role: overrides.role || 'User',
    });
    return { user, password };
  };

  afterAll(() => {
    restoreEnv(ORIGINAL_ENV);
  });

  beforeEach(() => {
    ensureEnvValue('JWT_SECRET', 'test-jwt-secret');
    process.env.EXTERNAL_MAIL_DELIVERY_ENABLED = 'true';
    process.env.EXTERNAL_ONESIGNAL_ENABLED = 'true';
    process.env.ONESIGNAL_APP_ID = 'test-onesignal-app';
    process.env.ONESIGNAL_REST_API_KEYS = 'test-onesignal-rest-key';
    process.env.ONESIGNAL_EXTERNAL_ID_SECRET = 'test-onesignal-external-id-secret-32-bytes';
    process.env.LOGIN_RATE_LIMIT_MAX = '10';
    process.env.LOGIN_RATE_LIMIT_WINDOW_MS = '60000';
    process.env.RESET_MAIL_RATE_LIMIT_MAX = '5';
    process.env.RESET_MAIL_RATE_LIMIT_WINDOW_MS = '3600000';
    process.env.RESET_MAIL_IP_RATE_LIMIT_MAX = '20';
    process.env.NODE_ENV = 'production';
    process.env.VUE_APP_APPURL = 'http://localhost:3000';
    process.env.VUE_APP_APPNAME = 'TestApp';
    process.env.SEND_MAIL_HOST = 'smtp.example.invalid';
    process.env.SEND_MAIL_PORT = '1025';
    process.env.NO_REPLY_MAIL = 'noreply@example.invalid';
    delete process.env.MAIL_DELIVERY_MODE;
    mockSendMail.mockClear();
    app = buildErrorHandledApp({
      mounts: [{ path: '/api/auth', handler: loadAuthRouter() }],
    });
    app.set('trust proxy', 1);
  });

  test('ログイン成功時にHTTP 200を返す', async () => {
    const { user, password } = await seedUser();
    const res = await request(app).post('/api/auth/login').send({ mail: 'alice@example.com', password });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user_id');
    expect(res.body.onesignal_external_id).toMatch(/^osv1_[a-f0-9]{64}$/);
    expect(res.body.onesignal_external_id).not.toContain(user._id.toString());
  });

  test('通知用IDは認証済みユーザにだけ同じExternal IDを返す', async () => {
    const { password } = await seedUser();
    const login = await request(app).post('/api/auth/login').send({ mail: 'alice@example.com', password });

    const unauthorized = await request(app).get('/api/auth/push-identity');
    expect(unauthorized.status).toBe(401);

    const authorized = await request(app)
      .get('/api/auth/push-identity')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(authorized.status).toBe(200);
    expect(authorized.body.onesignal_external_id).toBe(login.body.onesignal_external_id);
  });

  test('OneSignalが無効なら通知用IDに503を返し、ログイン状態を変えない', async () => {
    const { password } = await seedUser();
    const login = await request(app).post('/api/auth/login').send({ mail: 'alice@example.com', password });
    process.env.EXTERNAL_ONESIGNAL_ENABLED = 'false';

    const response = await request(app)
      .get('/api/auth/push-identity')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(login.status).toBe(200);
    expect(response.status).toBe(503);
    expect(response.body?.error?.code).toBe('EXTERNAL_FEATURE_DISABLED');
    expect(response.body?.error?.details).toEqual({ feature: 'oneSignalPush' });
  });

  test('パスワードが不正ならINVALID_PARAMSを返す（HTTP 400）', async () => {
    await seedUser({ password: 'Passw0rd' });
    const res = await request(app).post('/api/auth/login').send({ mail: 'alice@example.com', password: 'Wrongpass1' });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('未登録のメールアドレスにはINVALID_PARAMSを返す（HTTP 400）', async () => {
    const res = await request(app).post('/api/auth/login').send({ mail: 'missing@example.com', password: 'Passw0rd' });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('パスワードが未指定ならINVALID_PARAMSを返す（HTTP 400）', async () => {
    const res = await request(app).post('/api/auth/login').send({ mail: 'alice@example.com' });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('ログインの連続失敗が上限に達したら制限する（HTTP 429）', async () => {
    await seedUser({ password: 'Passw0rd' });
    const rateLimitIp = '203.0.113.10';
    const attempts = [];
    for (let i = 0; i < 15; i += 1) {
      const response = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', rateLimitIp)
        .send({ mail: 'alice@example.com', password: 'Wrongpass1' });
      attempts.push(response.status);
      if (response.status === 429) break;
    }

    expect(attempts).toContain(400);
    expect(attempts).toContain(429);
  });

  test('再設定メールの制限は大文字小文字と前後の空白が異なる宛先でも共有する（HTTP 429）', async () => {
    await User.create({ username: 'ResetUser', mail: 'reset@example.com', lang: 'ja' });
    const variants = [
      'reset@example.com',
      'Reset@example.com',
      'RESET@example.com',
      ' reset@example.com',
      'reset@example.com ',
      ' RESET@example.com ',
    ];

    const statuses = [];
    for (const mail of variants) {
      const response = await request(app)
        .post('/api/auth/resetpassword/sendmail')
        .set('X-Forwarded-For', '203.0.113.20')
        .send({ mail });
      statuses.push(response.status);
    }

    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  test('同じIPから複数の宛先へ再設定メールを要求した場合も制限する（HTTP 429）', async () => {
    const statuses = [];
    for (let index = 0; index <= 20; index += 1) {
      const response = await request(app)
        .post('/api/auth/resetpassword/sendmail')
        .set('X-Forwarded-For', '203.0.113.21')
        .send({ mail: `ip-limit-${index}@example.com` });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 20)).toEqual(Array(20).fill(200));
    expect(statuses[20]).toBe(429);
  });
});
