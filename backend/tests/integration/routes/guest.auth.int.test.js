const express = require('express');
const request = require('supertest');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const ORIGINAL_ENV = {
  GUEST_JWT_SECRET: process.env.GUEST_JWT_SECRET,
  GUEST_REFRESH_SECRET: process.env.GUEST_REFRESH_SECRET,
};

if (!process.env.GUEST_JWT_SECRET) process.env.GUEST_JWT_SECRET = 'test-guest-secret';
if (!process.env.GUEST_REFRESH_SECRET) process.env.GUEST_REFRESH_SECRET = 'test-guest-refresh-secret';

const guestRouter = require('../../../routes/guest.route');
const { attachErrorHandler } = require('../_helpers/app');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/guest', guestRouter);
  return attachErrorHandler(app);
};

const createExpiredRefreshToken = (guestId) => {
  const exp = Math.floor(Date.now() / 1000) - 10;
  return jwt.sign({ guest_id: guestId, exp }, process.env.GUEST_REFRESH_SECRET);
};

describe('ゲスト認証API', () => {
  let app;

  afterAll(() => {
    if (ORIGINAL_ENV.GUEST_JWT_SECRET === undefined) delete process.env.GUEST_JWT_SECRET;
    else process.env.GUEST_JWT_SECRET = ORIGINAL_ENV.GUEST_JWT_SECRET;
    if (ORIGINAL_ENV.GUEST_REFRESH_SECRET === undefined) delete process.env.GUEST_REFRESH_SECRET;
    else process.env.GUEST_REFRESH_SECRET = ORIGINAL_ENV.GUEST_REFRESH_SECRET;
  });

  beforeEach(() => {
    app = buildApp();
  });

  test('初期化でゲストトークンと更新用Cookieを返す', async () => {
    const res = await request(app).post('/guest/bootstrap').send({ guest_name: 'Guest', lang: 'ja' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('guest_id');
    expect(res.body).toHaveProperty('guest_token');
    expect(res.body).toHaveProperty('expires_in');

    const cookies = res.headers['set-cookie'] || [];
    expect(cookies.some((cookie) => cookie.startsWith('guest_refresh='))).toBe(true);
  });

  test('ゲスト名が不正なら初期化を拒否する', async () => {
    const res = await request(app).post('/guest/bootstrap').send({ guest_name: '', lang: 'ja' });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('言語が不正なら初期化を拒否する', async () => {
    const res = await request(app).post('/guest/bootstrap').send({ guest_name: 'Guest', lang: 'zz' });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('更新用CookieがなければTOKEN_INVALIDを返す', async () => {
    const res = await request(app).post('/guest/refresh');

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOKEN_INVALID');
  });

  test('更新用Cookieが不正ならTOKEN_INVALIDを返す', async () => {
    const res = await request(app).post('/guest/refresh').set('Cookie', 'guest_refresh=invalid');

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOKEN_INVALID');
  });

  test('更新用Cookieが期限切れならTOKEN_EXPIREDを返す', async () => {
    const expiredToken = createExpiredRefreshToken('guest-expired');
    const res = await request(app)
      .post('/guest/refresh')
      .set('Cookie', `guest_refresh=${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOKEN_EXPIRED');
  });

  test('有効なCookieで更新すると新しいゲストトークンを返す', async () => {
    const agent = request.agent(app);
    const bootstrap = await agent.post('/guest/bootstrap').send({ guest_name: 'RefreshUser', lang: 'ja' });

    expect(bootstrap.status).toBe(200);

    const refresh = await agent.post('/guest/refresh');

    expect(refresh.status).toBe(200);
    expect(refresh.body).toHaveProperty('guest_id', bootstrap.body.guest_id);
    expect(refresh.body).toHaveProperty('guest_token');
    expect(refresh.body).toHaveProperty('expires_in');
  });
});
