const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const { validatePage, validateMongoId } = require('../../../validates/base.validate');
const {
  validateCategoryTagSearch,
  validateCategoryTagOrder,
  validateCategoryTagName,
  validateCategoryTagCsv,
} = require('../../../validates/tag.validate');
const { body } = require('express-validator');
const { finalize } = require('../../../middlewares/validation');
const ensureJsonWebToken = require('../../../middlewares/ensureJsonWebToken');
const ensureAdminUser = require('../../../middlewares/ensureAdminUser');
const controller = require('../../../controllers/categoryTag.controller');
const CategoryTag = require('../../../models/CategoryTag');
const User = require('../../../models/User');
const { attachErrorHandler } = require('../_helpers/app');

describe('共通タグコントローラの結合動作', () => {
  let app;
  let adminToken;
  let userToken;

  const SECRET = process.env.JWT_SECRET || 'test-secret';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = SECRET;

  beforeEach(async () => {
    const [admin, user] = await User.create([
      { username: 'Admin', mail: 'admin@example.com', lang: 'ja', role: 'Administrator' },
      { username: 'User', mail: 'user@example.com', lang: 'ja', role: 'User' },
    ]);
    adminToken = jwt.sign(
      { user_id: admin._id.toString(), user_role: admin.role },
      SECRET
    );
    userToken = jwt.sign(
      { user_id: user._id.toString(), user_role: user.role },
      SECRET
    );

    app = express();
    app.use(express.json());

    app.post('/ctrl/management', ensureJsonWebToken, ensureAdminUser, controller.list);

    app.post(
      '/ctrl/management/paginate',
      ensureJsonWebToken,
      ensureAdminUser,
      validatePage('page'),
      validateCategoryTagSearch('search'),
      finalize,
      controller.paginate
    );

    app.post(
      '/ctrl/management/create',
      ensureJsonWebToken,
      ensureAdminUser,
      validateCategoryTagOrder('order'),
      validateCategoryTagName('name'),
      finalize,
      controller.create
    );

    app.post(
      '/ctrl/management/update',
      ensureJsonWebToken,
      ensureAdminUser,
      validateMongoId('_id'),
      validateCategoryTagOrder('order'),
      validateCategoryTagName('name'),
      body('delete_flg').not().exists(),
      finalize,
      controller.update
    );

    app.post(
      '/ctrl/management/delete',
      ensureJsonWebToken,
      ensureAdminUser,
      validateMongoId('_id'),
      body('delete_flg').not().exists(),
      finalize,
      controller.delete
    );

    app.post(
      '/ctrl/management/import',
      ensureJsonWebToken,
      ensureAdminUser,
      validateCategoryTagCsv('csv'),
      validateCategoryTagOrder('csv.*.0'),
      validateCategoryTagName('csv.*.1'),
      finalize,
      controller.import
    );

    attachErrorHandler(app);
  });

  describe('一覧取得', () => {
    test('有効なタグだけを返す（HTTP 200）', async () => {
      const uid = new mongoose.Types.ObjectId();
      await CategoryTag.create([
        { user: uid, order: 1, name: 'alive', delete_flg: false },
        { user: uid, order: 2, name: 'deleted', delete_flg: true },
      ]);
      const res = await request(app).post('/ctrl/management').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const names = res.body.map((d) => d.name);
      expect(names).toEqual(expect.arrayContaining(['alive']));
      expect(names).not.toEqual(expect.arrayContaining(['deleted']));
    });

    test('一般ユーザには権限エラーを返す（HTTP 403）', async () => {
      const res = await request(app).post('/ctrl/management').set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('ページ指定の一覧取得', () => {
    beforeEach(async () => {
      const uid = new mongoose.Types.ObjectId();
      await CategoryTag.create([
        { user: uid, order: 1, name: 'alpha' },
        { user: uid, order: 2, name: 'a+b' },
        { user: uid, order: 3, name: 'ab' },
      ]);
    });

    test('検索語を省略して1ページ目を取得できる（HTTP 200）', async () => {
      const res = await request(app)
        .post('/ctrl/management/paginate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ page: 1 });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('docs');
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('pages');
      expect(res.body).toHaveProperty('total');
    });

    test('検索語の前後の空白を除き、a+bを検索できる（HTTP 200）', async () => {
      const res = await request(app)
        .post('/ctrl/management/paginate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ page: 1, search: '   a+b   ' });
      expect(res.status).toBe(200);
      const names = res.body.docs.map((d) => d.name);
      expect(names).toEqual(expect.arrayContaining(['a+b']));
      expect(names).not.toContain('ab');
    });

    test('page=0を入力エラーとして拒否する（HTTP 400）', async () => {
      const res = await request(app)
        .post('/ctrl/management/paginate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ page: 0 });
      expect(res.status).toBe(400);
    });

    test('一般ユーザには権限エラーを返す（HTTP 403）', async () => {
      const res = await request(app)
        .post('/ctrl/management/paginate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ page: 1 });
      expect(res.status).toBe(403);
    });
  });

  describe('共通タグの作成・更新・CSV取込', () => {
    test('共通タグを作成できる（HTTP 200）', async () => {
      const res = await request(app)
        .post('/ctrl/management/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ order: 10, name: 'cat-1' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('_id');
      expect(res.body.order).toBe(10);
      expect(res.body.name).toBe('cat-1');
    });

    test('内容の更新と物理削除を別の操作として扱う', async () => {
      const created = await CategoryTag.create({ user: new mongoose.Types.ObjectId(), order: 5, name: 'upd' });
      const res = await request(app)
        .post('/ctrl/management/update')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ _id: created._id, order: 6, name: 'upd-2' });
      expect(res.status).toBe(200);
      expect(res.body.order).toBe(6);
      expect(res.body.name).toBe('upd-2');
      expect(res.body.delete_flg).toBe(false);
      expect(res.body.updated_at).toBeTruthy();
      expect(res.body.deleted_at).toBeNull();

      const deleted = await request(app)
        .post('/ctrl/management/delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ _id: created._id });
      expect(deleted.status).toBe(200);
      expect(deleted.body).toEqual({ _id: created._id.toString() });
      expect(await CategoryTag.findById(created._id)).toBeNull();
    });

    test('有効タグをCSVに合わせ、CSVにないタグを物理削除する（HTTP 200）', async () => {
      const oldTag = await CategoryTag.create({ user: new mongoose.Types.ObjectId(), order: 99, name: 'old' });
      const csv = [
        [1, 'One'],
        [2, 'Two'],
      ];
      const res = await request(app)
        .post('/ctrl/management/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ csv });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(await CategoryTag.countDocuments({ delete_flg: false })).toBe(2);

      const deletedOldTag = await CategoryTag.findById(oldTag._id);
      expect(deletedOldTag).toBeNull();
    });

    test('作成時のorder=0を拒否する（HTTP 400）', async () => {
      const res = await request(app)
        .post('/ctrl/management/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ order: 0, name: 'x' });
      expect(res.status).toBe(400);
    });
  });
});
