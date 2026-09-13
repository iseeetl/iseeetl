const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const CategoryTag = require('../../../models/CategoryTag');
const User = require('../../../models/User');
const AIAnalysisSetting = require('../../../models/AIAnalysisSetting');
const router = require('../../../routes/categoryTag.route');
const { attachErrorHandler } = require('../_helpers/app');

describe('共通タグ管理API', () => {
  let app;
  let admin;
  let adminToken;
  let userToken;
  const ORIGINAL_ENV = {
    JWT_SECRET: process.env.JWT_SECRET,
  };

  const buildApp = () => {
    const a = express();
    a.use(express.json());
    a.use('/categoryTag', router);
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
    admin = await createUser({ role: 'Administrator' });
    const user = await createUser({ role: 'User' });
    adminToken = buildToken(admin);
    userToken = buildToken(user);
  });

  afterAll(() => {
    if (ORIGINAL_ENV.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_ENV.JWT_SECRET;
  });

  describe('CSV出力用の共通タグ一覧取得', () => {
    test('有効なタグだけを返す（HTTP 200）', async () => {
      const uid = new mongoose.Types.ObjectId();
      await CategoryTag.create([
        { user: uid, order: 1, name: 'alive', delete_flg: false },
        { user: uid, order: 2, name: 'deleted', delete_flg: true },
      ]);
      const res = await request(app).post('/categoryTag/management').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const names = res.body.map((d) => d.name);
      expect(names).toEqual(expect.arrayContaining(['alive']));
      expect(names).not.toEqual(expect.arrayContaining(['deleted']));
    });

    test('一般ユーザには権限エラーを返す（HTTP 403）', async () => {
      const res = await request(app).post('/categoryTag/management').set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
      expect(res.body?.error?.code).toBe('FORBIDDEN');
    });

    test('トークンが未指定なら認証エラーを返す（HTTP 401）', async () => {
      const res = await request(app).post('/categoryTag/management');
      expect(res.status).toBe(401);
      expect(res.body?.error?.code).toBe('TOKEN_INVALID');
    });

    test('期限切れのトークンにはTOKEN_EXPIREDを返す（HTTP 401）', async () => {
      const expiredToken = jwt.sign(
        { user_id: new mongoose.Types.ObjectId().toString(), user_role: 'Administrator' },
        process.env.JWT_SECRET,
        { expiresIn: -1 }
      );
      const res = await request(app).post('/categoryTag/management').set('Authorization', `Bearer ${expiredToken}`);
      expect(res.status).toBe(401);
      expect(res.body?.error?.code).toBe('TOKEN_EXPIRED');
    });

    test('改ざんされたトークンにはTOKEN_INVALIDを返す（HTTP 401）', async () => {
      const brokenToken = `${adminToken}tamper`;
      const res = await request(app).post('/categoryTag/management').set('Authorization', `Bearer ${brokenToken}`);
      expect(res.status).toBe(401);
      expect(res.body?.error?.code).toBe('TOKEN_INVALID');
    });
  });

  describe('共通タグのページ指定一覧取得', () => {
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
        .post('/categoryTag/management/paginate')
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
        .post('/categoryTag/management/paginate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ page: 1, search: '   a+b   ' });
      expect(res.status).toBe(200);
      const names = res.body.docs.map((d) => d.name);
      expect(names).toEqual(expect.arrayContaining(['a+b']));
    });

    test('200: 検索結果に旧削除済みタグを含めず、旧削除状態の指定を拒否する', async () => {
      const prefix = 'CategoryLifecycleFilter';
      await CategoryTag.create([
        ...Array.from({ length: 11 }, (_, index) => ({
          user: admin._id,
          order: index + 10,
          name: `${prefix} Active ${index}`,
          lang: 'ja',
          delete_flg: false,
        })),
        ...Array.from({ length: 2 }, (_, index) => ({
          user: admin._id,
          order: index + 30,
          name: `${prefix} Deleted ${index}`,
          lang: 'ja',
          delete_flg: true,
          deleted_at: new Date(),
        })),
      ]);
      const paginate = (payload) =>
        request(app)
          .post('/categoryTag/management/paginate')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ page: 1, search: prefix, ...payload });

      const [active, deleted, all] = await Promise.all([
        paginate({}),
        paginate({ delete_flg: true }),
        paginate({}),
      ]);

      expect(active.status).toBe(200);
      expect(active.body).toMatchObject({ total: 11, pages: 2, page: 1 });
      expect(active.body.docs).toHaveLength(10);
      expect(active.body.docs.every((tag) => tag.delete_flg === false)).toBe(true);
      expect(deleted.status).toBe(400);
      expect(all.status).toBe(200);
      expect(all.body).toMatchObject({ total: 11, pages: 2, page: 1 });
      expect(all.body.docs).toHaveLength(10);
      expect(all.body.docs.every((tag) => tag.name.includes(prefix))).toBe(true);
    });

    test('page=0を入力エラーとして拒否する（HTTP 400）', async () => {
      const res = await request(app)
        .post('/categoryTag/management/paginate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ page: 0 });
      expect(res.status).toBe(400);
    });

    test.each([
      ['小数page', { page: 1.5, search: '' }],
      ['garbage付きpage', { page: '1page', search: '' }],
      ['safe integer超過page', { page: Number.MAX_SAFE_INTEGER + 1, search: '' }],
      ['文字列delete_flg', { page: 1, search: '', delete_flg: 'false' }],
    ])('400: POST paginateは%sを拒否する', async (_label, body) => {
      const res = await request(app)
        .post('/categoryTag/management/paginate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(body);

      expect(res.status).toBe(400);
    });

    test('400: GET paginateはtrue/false以外のdelete_flgを拒否する', async () => {
      const res = await request(app)
        .get('/categoryTag/management/paginate')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: '1', search: '', delete_flg: '1' });

      expect(res.status).toBe(400);
    });

    test('403: 一般ユーザは権限エラー', async () => {
      const res = await request(app)
        .post('/categoryTag/management/paginate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ page: 1 });
      expect(res.status).toBe(403);
      expect(res.body?.error?.code).toBe('FORBIDDEN');
    });
  });

  describe('共通タグの削除状態の変更', () => {
    test('未使用タグを物理削除し、復元用APIは受け付けない', async () => {
      const tag = await CategoryTag.create({ user: admin._id, order: 7, name: 'Tag' });
      const deleted = await request(app).post('/categoryTag/management/delete')
        .set('Authorization', `Bearer ${adminToken}`).send({ _id: tag._id.toString() });
      expect(deleted.status).toBe(200);
      expect(deleted.body).toEqual({ _id: tag._id.toString() });
      expect(await CategoryTag.findById(tag._id)).toBeNull();
      const restored = await request(app).post('/categoryTag/management/delete-state')
        .set('Authorization', `Bearer ${adminToken}`).send({ _id: tag._id.toString(), delete_flg: false });
      expect(restored.status).toBe(404);
    });

    test('有効なAI解析設定から参照されるタグは削除できない（HTTP 409）', async () => {
      const resultUser = await createUser({ role: 'Author' });
      const tag = await CategoryTag.create({
        user: admin._id,
        order: 8,
        name: 'Referenced Category Tag',
        lang: 'ja',
      });
      await AIAnalysisSetting.create({
        category_tag: tag._id,
        analysis_kind: 'vision',
        additional_prompt: '',
        result_user: resultUser._id,
        user: admin._id,
        updated_by: admin._id,
      });
      const before = await CategoryTag.findById(tag._id).lean();

      const response = await request(app)
        .post('/categoryTag/management/delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ _id: tag._id.toString() });

      expect(response.status).toBe(409);
      expect(response.body?.error).toMatchObject({
        code: 'CONFLICT',
        details: {
          reason: 'ACTIVE_AI_ANALYSIS_REFERENCE',
          resource_type: 'category-tag',
        },
      });
      expect(await CategoryTag.findById(tag._id).lean()).toEqual(before);
    });
  });

  describe('共通タグの作成・更新・CSV取込', () => {
    test('共通タグを作成できる（HTTP 200）', async () => {
      const res = await request(app)
        .post('/categoryTag/management/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ order: 10, name: 'cat-1' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('_id');
      expect(res.body.order).toBe(10);
      expect(res.body.name).toBe('cat-1');
    });

    test('update: 編集でき、旧削除状態の指定は400で拒否する', async () => {
      const created = await CategoryTag.create({ user: new mongoose.Types.ObjectId(), order: 3, name: 'upd' });
      const res = await request(app)
        .post('/categoryTag/management/update')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ _id: created._id, order: 4, name: 'upd-2' });
      expect(res.status).toBe(200);
      expect(res.body.order).toBe(4);
      expect(res.body.name).toBe('upd-2');
      expect(res.body.delete_flg).toBe(false);
      expect(res.body.updated_at).toBeTruthy();
      expect(res.body.deleted_at).toBeNull();

      const conflict = await request(app)
        .post('/categoryTag/management/update')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ _id: created._id, order: 5, name: 'stale', delete_flg: true });
      expect(conflict.status).toBe(400);
      const unchanged = await CategoryTag.findById(created._id).lean();
      expect(unchanged).toMatchObject({ order: 4, name: 'upd-2', delete_flg: false });
      expect(unchanged.deleted_at).toBeNull();
    });

    test('import: 同名IDを維持し、対象外タグを物理削除する', async () => {
      const userId = new mongoose.Types.ObjectId();
      const keptTag = await CategoryTag.create({ user: userId, order: 99, name: 'One' });
      const removedTag = await CategoryTag.create({ user: userId, order: 98, name: 'Removed' });
      const csv = [
        [2, 'Two'],
        [1, 'One'],
      ];
      const res = await request(app)
        .post('/categoryTag/management/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ csv });
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body.find(({ name }) => name === 'One')._id).toBe(keptTag._id.toString());

      const keptAfterImport = await CategoryTag.findById(keptTag._id).lean();
      const removedAfterImport = await CategoryTag.findById(removedTag._id).lean();
      expect(keptAfterImport.order).toBe(1);
      expect(keptAfterImport.delete_flg).toBe(false);
      expect(removedAfterImport).toBeNull();
      expect(await CategoryTag.countDocuments({ delete_flg: false })).toBe(2);
      expect(await CategoryTag.countDocuments()).toBe(2);
    });

    test('import: 重複名称は既存タグを変更せず400にする', async () => {
      const existingTag = await CategoryTag.create({
        user: new mongoose.Types.ObjectId(),
        order: 1,
        name: 'Existing',
      });

      const res = await request(app)
        .post('/categoryTag/management/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          csv: [
            [1, 'Duplicate'],
            [2, 'Duplicate'],
          ],
        });

      expect(res.status).toBe(400);
      const unchangedTag = await CategoryTag.findById(existingTag._id).lean();
      expect(unchangedTag).not.toBeNull();
      expect(unchangedTag.delete_flg).toBe(false);
      expect(await CategoryTag.countDocuments()).toBe(1);
    });

    test('作成時のorder=0を拒否する（HTTP 400）', async () => {
      const res = await request(app)
        .post('/categoryTag/management/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ order: 0, name: 'x' });
      expect(res.status).toBe(400);
    });

    test('403: create は権限なしで 403', async () => {
      const res = await request(app)
        .post('/categoryTag/management/create')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ order: 1, name: 'ok' });
      expect(res.status).toBe(403);
      expect(res.body?.error?.code).toBe('FORBIDDEN');
    });
  });
});
