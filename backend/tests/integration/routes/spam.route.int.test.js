const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Spam = require('../../../models/Spam');
const User = require('../../../models/User');
const router = require('../../../routes/spam.route');
const { attachErrorHandler } = require('../_helpers/app');

describe('スパムワード管理API', () => {
  let app;
  let adminToken;
  let userToken;
  const ORIGINAL_ENV = {
    JWT_SECRET: process.env.JWT_SECRET,
  };

  const buildApp = () => {
    const a = express();
    a.use(express.json());
    a.use('/spam', router);
    return attachErrorHandler(a);
  };

  const createUser = (overrides = {}) =>
    User.create({
      username: `user-${Date.now()}-${Math.random()}`,
      mail: `user-${Date.now()}-${Math.random()}@example.com`,
      lang: 'ja',
      role: 'User',
      ...overrides,
    });

  const buildToken = (user) =>
    jwt.sign({ user_id: user._id.toString(), user_role: user.role }, process.env.JWT_SECRET);

  beforeAll(() => {
    if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';
  });

  beforeEach(async () => {
    app = buildApp();
    const admin = await createUser({ role: 'Administrator' });
    const user = await createUser({ role: 'User' });
    adminToken = buildToken(admin);
    userToken = buildToken(user);
  });

  afterAll(() => {
    if (ORIGINAL_ENV.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_ENV.JWT_SECRET;
  });

  describe('スパムワードのページ指定一覧取得', () => {
    beforeEach(async () => {
      const uid = new mongoose.Types.ObjectId();
      await Spam.create([
        { user: uid, word: 'bad' },
        { user: uid, word: 'a+b' },
        { user: uid, word: 'neutral' },
      ]);
    });

    test('検索語を省略して1ページ目を取得できる（HTTP 200）', async () => {
      const res = await request(app)
        .post('/spam/management/paginate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ page: 1 });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('docs');
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('pages');
      expect(res.body).toHaveProperty('total');
    });

    test('前後の空白を除き、記号を含むa+bを検索できる（HTTP 200）', async () => {
      const res = await request(app)
        .post('/spam/management/paginate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ page: 1, search: '   a+b   ' });
      expect(res.status).toBe(200);
      expect(res.body.docs.map((d) => d.word)).toEqual(expect.arrayContaining(['a+b']));
    });

    test('page=0を入力エラーとして拒否する（HTTP 400）', async () => {
      const res = await request(app)
        .post('/spam/management/paginate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ page: 0 });
      expect(res.status).toBe(400);
    });

    test('一般ユーザには権限エラーを返す（HTTP 403）', async () => {
      const res = await request(app)
        .post('/spam/management/paginate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ page: 1 });
      expect(res.status).toBe(403);
      expect(res.body?.error?.code).toBe('FORBIDDEN');
    });

    test('トークンが未指定なら認証エラーを返す（HTTP 401）', async () => {
      const res = await request(app).post('/spam/management/paginate').send({ page: 1 });
      expect(res.status).toBe(401);
      expect(res.body?.error?.code).toBe('TOKEN_INVALID');
    });

    test('期限切れのトークンにはTOKEN_EXPIREDを返す（HTTP 401）', async () => {
      const expiredToken = jwt.sign(
        { user_id: new mongoose.Types.ObjectId().toString(), user_role: 'Administrator' },
        process.env.JWT_SECRET,
        { expiresIn: -1 }
      );
      const res = await request(app)
        .post('/spam/management/paginate')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ page: 1 });
      expect(res.status).toBe(401);
      expect(res.body?.error?.code).toBe('TOKEN_EXPIRED');
    });

    test('改ざんされたトークンにはTOKEN_INVALIDを返す（HTTP 401）', async () => {
      const brokenToken = `${adminToken}tamper`;
      const res = await request(app)
        .post('/spam/management/paginate')
        .set('Authorization', `Bearer ${brokenToken}`)
        .send({ page: 1 });
      expect(res.status).toBe(401);
      expect(res.body?.error?.code).toBe('TOKEN_INVALID');
    });
  });

  describe('スパムワードの作成・更新・削除', () => {
    test('作成・更新・削除の成功時にHTTP 200を返す', async () => {
      const c = await request(app)
        .post('/spam/management/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ word: '  ok  ' });
      expect(c.status).toBe(200);
      expect(c.body).toHaveProperty('_id');
      expect(c.body.word).toBe('ok');

      const u = await request(app)
        .post('/spam/management/update')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ _id: c.body._id, word: 'good' });
      expect(u.status).toBe(200);
      expect(u.body).toHaveProperty('word', 'good');

      const d = await request(app)
        .post('/spam/management/delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ _id: c.body._id });
      expect(d.status).toBe(200);
      expect(d.body).toHaveProperty('_id', c.body._id);
    });

    test('51文字のスパムワードの作成を拒否する（HTTP 400）', async () => {
      const res = await request(app)
        .post('/spam/management/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ word: 'a'.repeat(51) });
      expect(res.status).toBe(400);
    });

    test('権限がないユーザの作成を拒否する（HTTP 403）', async () => {
      const res = await request(app)
        .post('/spam/management/create')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ word: 'ok' });
      expect(res.status).toBe(403);
      expect(res.body?.error?.code).toBe('FORBIDDEN');
    });
  });
});
