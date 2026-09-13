const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

const { validatePage, validateMongoId } = require('../../../validates/base.validate');
const { validateSpamSearch, validateSpamWord } = require('../../../validates/spam.validate');
const { finalize } = require('../../../middlewares/validation');
const ensureAdminUser = require('../../../middlewares/ensureAdminUser');
const controller = require('../../../controllers/spam.controller');
const Spam = require('../../../models/Spam');
const { attachErrorHandler } = require('../_helpers/app');

// テストごとに認証情報を切り替えられるよう、モック内ではglobalの値を参照する。
jest.mock('../../../middlewares/ensureJsonWebToken', () => {
  return (req, _res, next) => {
    if (!global.__mockUserIdHex) {
      const m = require('mongoose');
      global.__mockUserIdHex = new m.Types.ObjectId().toHexString();
    }
    const role = global.__mockRole || 'Administrator';
    req.jwtPayload = { user_id: global.__mockUserIdHex, user_role: role };
    next();
  };
});
const ensureJsonWebToken = require('../../../middlewares/ensureJsonWebToken');

describe('スパムワードコントローラの結合動作', () => {
  let app;

  const buildApp = () => {
    const a = express();
    a.use(express.json());

    a.post(
      '/ctrl/spam/management/paginate',
      ensureJsonWebToken,
      ensureAdminUser,
      validatePage('page'),
      validateSpamSearch('search'),
      finalize,
      controller.getSpamList
    );

    a.post(
      '/ctrl/spam/management/create',
      ensureJsonWebToken,
      ensureAdminUser,
      validateSpamWord('word'),
      finalize,
      controller.createSpam
    );

    a.post(
      '/ctrl/spam/management/update',
      ensureJsonWebToken,
      ensureAdminUser,
      validateMongoId('_id'),
      validateSpamWord('word'),
      finalize,
      controller.updateSpam
    );

    a.post(
      '/ctrl/spam/management/delete',
      ensureJsonWebToken,
      ensureAdminUser,
      validateMongoId('_id'),
      finalize,
      controller.deleteSpam
    );

    return attachErrorHandler(a);
  };

  beforeEach(() => {
    global.__mockRole = 'Administrator';
    global.__mockUserIdHex = new mongoose.Types.ObjectId().toHexString();
    app = buildApp();
  });

  describe('スパムワードの一覧取得', () => {
    beforeEach(async () => {
      const uid = new mongoose.Types.ObjectId();
      await Spam.create([
        { user: uid, word: 'bad' },
        { user: uid, word: 'a+b' },
        { user: uid, word: 'neutral' },
      ]);
    });

    test('検索語を省略して1ページ目を取得できる（HTTP 200）', async () => {
      const res = await request(app).post('/ctrl/spam/management/paginate').send({ page: 1 });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('docs');
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('pages');
      expect(res.body).toHaveProperty('total');
    });

    test('検索語の前後の空白を除き、記号を含むa+bを検索できる（HTTP 200）', async () => {
      const res = await request(app).post('/ctrl/spam/management/paginate').send({ page: 1, search: '   a+b   ' });
      expect(res.status).toBe(200);
      const words = res.body.docs.map((d) => d.word);
      expect(words).toEqual(expect.arrayContaining(['a+b']));
    });

    test('page=0を入力エラーとして拒否する（HTTP 400）', async () => {
      const res = await request(app).post('/ctrl/spam/management/paginate').send({ page: 0 });
      expect(res.status).toBe(400);
    });

    test('一般ユーザには権限エラーを返す（HTTP 403）', async () => {
      global.__mockRole = 'User';
      const res = await request(app).post('/ctrl/spam/management/paginate').send({ page: 1 });
      expect(res.status).toBe(403);
    });
  });

  describe('スパムワードの作成・更新・削除', () => {
    test('作成・更新・削除の成功時にHTTP 200を返す', async () => {
      const c = await request(app).post('/ctrl/spam/management/create').send({ word: '  ok  ' });
      expect(c.status).toBe(200);
      expect(c.body).toHaveProperty('_id');
      expect(c.body.word).toBe('ok');

      const u = await request(app).post('/ctrl/spam/management/update').send({ _id: c.body._id, word: 'good' });
      expect(u.status).toBe(200);
      expect(u.body).toHaveProperty('word', 'good');

      const d = await request(app).post('/ctrl/spam/management/delete').send({ _id: c.body._id });
      expect(d.status).toBe(200);
      expect(d.body).toHaveProperty('_id', c.body._id);
    });

    test('51文字のスパムワードの作成を拒否する（HTTP 400）', async () => {
      const res = await request(app)
        .post('/ctrl/spam/management/create')
        .send({ word: 'a'.repeat(51) });
      expect(res.status).toBe(400);
    });

    test('権限がないユーザの作成を拒否する（HTTP 403）', async () => {
      global.__mockRole = 'User';
      const res = await request(app).post('/ctrl/spam/management/create').send({ word: 'ok' });
      expect(res.status).toBe(403);
    });
  });
});
