const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const userRouter = require('../../../routes/user.route');
const ensureJsonWebToken = require('../../../middlewares/ensureJsonWebToken');
const ensureAdminUser = require('../../../middlewares/ensureAdminUser');
const { attachErrorHandler } = require('../_helpers/app');
const User = require('../../../models/User');

const ORIGINAL_ENV = {
  JWT_SECRET: process.env.JWT_SECRET,
};

if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/user', userRouter);
  app.get('/api/admin-probe', ensureJsonWebToken, ensureAdminUser, (_req, res) => {
    res.sendStatus(204);
  });
  return attachErrorHandler(app);
};

const buildToken = (payload, options = {}) => {
  if (options.expired) {
    const exp = Math.floor(Date.now() / 1000) - 10;
    return jwt.sign({ ...payload, exp }, process.env.JWT_SECRET);
  }
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('JWT認証と管理者の権限確認', () => {
  let app;

  afterAll(() => {
    if (ORIGINAL_ENV.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_ENV.JWT_SECRET;
  });

  beforeEach(() => {
    app = buildApp();
  });

  test('トークンがなければTOKEN_INVALIDを返す', async () => {
    const res = await request(app).get('/api/user/detail');

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOKEN_INVALID');
  });

  test('認証方式が不正ならTOKEN_INVALIDを返す', async () => {
    const res = await request(app).get('/api/user/detail').set('Authorization', 'Token abc');

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOKEN_INVALID');
  });

  test('期限切れのトークンにはTOKEN_EXPIREDを返す', async () => {
    const user = await User.create({
      username: 'ExpiredUser',
      mail: `expired-${Date.now()}@example.com`,
      lang: 'ja',
    });

    const token = buildToken({ user_id: user._id.toString(), user_role: 'Author' }, { expired: true });
    const res = await request(app).get('/api/user/detail').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOKEN_EXPIRED');
  });

  test('有効なトークンならアクセスを許可する', async () => {
    const user = await User.create({
      username: 'ValidUser',
      mail: `valid-${Date.now()}@example.com`,
      lang: 'ja',
    });

    const token = buildToken({ user_id: user._id.toString(), user_role: 'Author' });
    const res = await request(app).get('/api/user/detail').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('username', 'ValidUser');
  });

  test('ensureJsonWebToken: ユーザの世代更新後は変更前JWTを拒否する', async () => {
    const user = await User.create({
      username: 'RevokedUser',
      mail: `revoked-${Date.now()}@example.com`,
      lang: 'ja',
    });
    const oldToken = buildToken({
      user_id: user._id.toString(),
      user_role: 'Author',
    });
    await User.updateOne({ _id: user._id }, { $inc: { session_version: 1 } });

    const res = await request(app)
      .get('/api/user/detail')
      .set('Authorization', `Bearer ${oldToken}`);

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOKEN_INVALID');
  });

  test('管理者以外にはFORBIDDENを返す', async () => {
    const owner = await User.create({
      username: 'Owner',
      mail: `owner-${Date.now()}@example.com`,
      lang: 'ja',
    });

    const token = buildToken({ user_id: owner._id.toString(), user_role: 'Author' });
    const res = await request(app).get('/api/admin-probe').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });

  test('ensureAdminUser: 現在のユーザの権限が欠落している場合はINVALID_PERMISSIONを返す', async () => {
    const owner = await User.create({
      username: 'NoRole',
      mail: `norole-${Date.now()}@example.com`,
      lang: 'ja',
    });
    await User.collection.updateOne({ _id: owner._id }, { $set: { role: null } });

    const token = buildToken({ user_id: owner._id.toString() });
    const res = await request(app).get('/api/admin-probe').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('INVALID_PERMISSION');
  });

  test('管理者は認証が必要なルートへアクセスできる', async () => {
    const admin = await User.create({
      username: 'Admin',
      mail: `admin-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Administrator',
    });

    const token = buildToken({ user_id: admin._id.toString(), user_role: 'Administrator' });
    const res = await request(app).get('/api/admin-probe').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });
});
