const request = require('supertest');

const floorTagRouter = require('../../../routes/floor/floorTag.route');
const categoryTagRouter = require('../../../routes/categoryTag.route');
const FloorTag = require('../../../models/FloorTag');
const CategoryTag = require('../../../models/CategoryTag');
const FloorAIAnalysisSetting = require('../../../models/FloorAIAnalysisSetting');
const { buildErrorHandledApp } = require('../_helpers/app');
const {
  snapshotEnv,
  restoreEnv,
  ensureEnvValue,
  createUserToken: buildToken,
} = require('../_helpers/auth');
const { createUser, createFloor: createFloorFixture } = require('../_helpers/models');

describe('フロアタグAPI', () => {
  let app;

  const originalEnv = snapshotEnv(['JWT_SECRET']);
  const createFloor = (owner, overrides = {}) =>
    createFloorFixture(owner, { description: undefined, ...overrides });

  beforeAll(() => {
    ensureEnvValue('JWT_SECRET', 'test-jwt-secret');
  });

  afterAll(() => {
    restoreEnv(originalEnv);
  });

  beforeEach(() => {
    app = buildErrorHandledApp({
      mounts: [
        { path: '/floortag', handler: floorTagRouter },
        { path: '/categorytag', handler: categoryTagRouter },
      ],
    });
  });

  test('フロア作成者はタグを作成・取得・更新・削除できる', async () => {
    const owner = await createUser({ role: 'Editor' });
    const floor = await createFloor(owner);
    const token = buildToken(owner);

    const createRes = await request(app)
      .post('/floortag/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ floor_id: floor._id.toString(), order: 1, name: 'Tag A', lang: 'ja' });
    expect(createRes.status).toBe(200);

    const listRes = await request(app)
      .post('/floortag')
      .set('Authorization', `Bearer ${token}`)
      .send({ floor_id: floor._id.toString() });
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(1);

    const updateRes = await request(app)
      .post('/floortag/update')
      .set('Authorization', `Bearer ${token}`)
      .send({ _id: createRes.body._id, order: 2, name: 'Tag B', lang: 'ja' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.name).toBe('Tag B');

    const deleteRes = await request(app)
      .post('/floortag/delete')
      .set('Authorization', `Bearer ${token}`)
      .send({ _id: createRes.body._id });
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toEqual({ _id: createRes.body._id });
    expect(await FloorTag.findById(deleteRes.body._id)).toBeNull();
  });

  test('フロア作成者はタグのCSV取込と初期化ができる', async () => {
    const owner = await createUser({ role: 'Editor' });
    const floor = await createFloor(owner);
    const token = buildToken(owner);
    const keptTag = await FloorTag.create({
      floor: floor._id,
      user: owner._id,
      order: 10,
      name: 'Tag A',
      lang: 'ja',
    });
    const removedTag = await FloorTag.create({
      floor: floor._id,
      user: owner._id,
      order: 20,
      name: 'Tag X',
      lang: 'ja',
    });

    const importRes = await request(app)
      .post('/floortag/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        floor_id: floor._id.toString(),
        csv: [
          [1, 'Tag A'],
          [2, 'Tag B'],
        ],
      });
    expect(importRes.status).toBe(200);
    const imported = await FloorTag.find({ floor: floor._id, delete_flg: false }).sort({ order: 1 });
    expect(imported.length).toBe(2);
    expect(imported[0]._id.toString()).toBe(keptTag._id.toString());
    expect(imported[0].order).toBe(1);

    const logicallyDeleted = await FloorTag.findById(removedTag._id);
    expect(logicallyDeleted).toBeNull();
    expect(await FloorTag.countDocuments({ floor: floor._id })).toBe(2);

    await CategoryTag.create({ user: owner._id, order: 1, name: 'Tag A', lang: 'ja' });
    await CategoryTag.create({ user: owner._id, order: 1, name: 'Category A', lang: 'ja' });
    const initRes = await request(app)
      .post('/floortag/init')
      .set('Authorization', `Bearer ${token}`)
      .send({ floor_id: floor._id.toString() });
    expect(initRes.status).toBe(200);
    expect(initRes.body.length).toBe(2);
    expect(initRes.body.find((tag) => tag.name === 'Tag A')._id).toBe(keptTag._id.toString());
  });

  test('CSV内の名前が重複していれば既存タグを変えず拒否する', async () => {
    const owner = await createUser({ role: 'Editor' });
    const floor = await createFloor(owner);
    const token = buildToken(owner);
    const existing = await FloorTag.create({
      floor: floor._id,
      user: owner._id,
      order: 1,
      name: 'Existing',
      lang: 'ja',
    });

    const importRes = await request(app)
      .post('/floortag/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        floor_id: floor._id.toString(),
        csv: [
          [1, 'Duplicate'],
          [2, 'Duplicate'],
        ],
      });

    expect(importRes.status).toBe(400);
    expect(await FloorTag.countDocuments({ floor: floor._id })).toBe(1);
    const unchanged = await FloorTag.findById(existing._id);
    expect(unchanged.name).toBe('Existing');
    expect(unchanged.delete_flg).toBe(false);
  });

  test('管理用タグ一覧では検索語と削除状態の条件を総数・ページ数・一覧へ反映する', async () => {
    const admin = await createUser({ role: 'Administrator' });
    const owner = await createUser({ role: 'Editor' });
    const floor = await createFloor(owner, { title: 'Filter Floor' });
    const sourceCategoryTag = await CategoryTag.create({
      user: admin._id,
      order: 1,
      name: 'Filter Source Category Tag',
    });
    const prefix = 'FloorTagLifecycleFilter';
    await FloorTag.create([
      ...Array.from({ length: 11 }, (_, index) => ({
        floor: floor._id,
        user: owner._id,
        order: index + 1,
        name: `${prefix} Active ${index}`,
        lang: 'ja',
        source_category_tag: sourceCategoryTag._id,
        delete_flg: false,
      })),
      ...Array.from({ length: 2 }, (_, index) => ({
        floor: floor._id,
        user: owner._id,
        order: index + 20,
        name: `${prefix} Deleted ${index}`,
        lang: 'ja',
        source_category_tag: sourceCategoryTag._id,
        delete_flg: true,
        deleted_at: new Date(),
      })),
    ]);
    const paginate = (payload) =>
      request(app)
        .post('/floortag/management/paginate')
        .set('Authorization', `Bearer ${buildToken(admin)}`)
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
    expect(all.body.docs.every((tag) => tag.floor.title === 'Filter Floor')).toBe(true);
    expect(all.body.docs.every((tag) => tag.floor.delete_flg === false)).toBe(true);
    expect(
      all.body.docs.every(
        (tag) =>
          tag.source_category_tag.name === 'Filter Source Category Tag' &&
          tag.source_category_tag.delete_flg === false
      )
    ).toBe(true);
  });

  test('未使用タグを物理削除し、有効なAI解析設定からの参照があれば拒否する', async () => {
    const admin = await createUser({ role: 'Administrator' });
    const owner = await createUser({ role: 'Editor' });
    const floor = await createFloor(owner);
    const tag = await FloorTag.create({
      floor: floor._id,
      user: owner._id,
      order: 7,
      name: 'Lifecycle Floor Tag',
      lang: 'ja',
      translations: [{ user: owner._id, lang: 'en', name: 'Lifecycle floor tag' }],
    });
    const remove = (target) =>
      request(app)
        .post('/floortag/management/delete')
        .set('Authorization', `Bearer ${buildToken(admin)}`)
        .send({ _id: target._id.toString() });

    const deleted = await remove(tag);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ _id: tag._id.toString() });
    expect(await FloorTag.findById(tag._id)).toBeNull();
    expect((await remove(tag)).status).toBe(404);

    const referencedTag = await FloorTag.create({
      floor: floor._id,
      user: owner._id,
      order: 8,
      name: 'Referenced Floor Tag',
      lang: 'ja',
    });
    await FloorAIAnalysisSetting.create({
      floor: floor._id,
      floor_tag: referencedTag._id,
      analysis_kind: 'vision',
      additional_prompt: '',
      result_user: owner._id,
      user: admin._id,
      updated_by: admin._id,
    });
    const beforeReferencedDelete = await FloorTag.findById(referencedTag._id).lean();

    const guarded = await remove(referencedTag);
    expect(guarded.status).toBe(409);
    expect(guarded.body?.error).toMatchObject({
      code: 'CONFLICT',
      details: {
        reason: 'ACTIVE_AI_ANALYSIS_REFERENCE',
        resource_type: 'floor-tag',
      },
    });
    expect(await FloorTag.findById(referencedTag._id).lean()).toEqual(beforeReferencedDelete);


  });

  test('元の共通タグは有効なフロアタグを残して削除でき、フロアタグは独立して物理削除できる', async () => {
    const admin = await createUser({ role: 'Administrator' });
    const owner = await createUser({ role: 'Editor' });
    const floor = await createFloor(owner);
    const sourceCategoryTag = await CategoryTag.create({
      user: admin._id,
      order: 1,
      name: 'Source integrity category tag',
    });
    const childTag = await FloorTag.create({
      floor: floor._id,
      source_category_tag: sourceCategoryTag._id,
      user: owner._id,
      order: 1,
      name: 'Source integrity floor tag',
      lang: 'ja',
    });
    const authorization = `Bearer ${buildToken(admin)}`;

    const parentDelete = await request(app)
      .post('/categorytag/management/delete')
      .set('Authorization', authorization)
      .send({ _id: sourceCategoryTag._id.toString() });
    expect(parentDelete.status).toBe(200);
    expect(await CategoryTag.findById(sourceCategoryTag._id)).toBeNull();
    const activeChild = await FloorTag.findById(childTag._id).lean();
    expect(activeChild.delete_flg).toBe(false);
    expect(activeChild.source_category_tag.toString()).toBe(
      sourceCategoryTag._id.toString()
    );

    const childDelete = await request(app)
      .post('/floortag/management/delete')
      .set('Authorization', authorization)
      .send({ _id: childTag._id.toString() });
    expect(childDelete.status).toBe(200);

    expect(await FloorTag.findById(childTag._id)).toBeNull();
  });

  test('管理者はタグを一覧取得・更新できる', async () => {
    const admin = await createUser({ role: 'Administrator' });
    const owner = await createUser({ role: 'Editor' });
    const floor = await createFloor(owner);
    const tag = await FloorTag.create({
      floor: floor._id,
      user: owner._id,
      order: 1,
      name: 'Tag A',
      lang: 'ja',
    });

    const paginateRes = await request(app)
      .post('/floortag/management/paginate')
      .set('Authorization', `Bearer ${buildToken(admin)}`)
      .send({ page: 1, search: null });
    expect(paginateRes.status).toBe(200);

    const updateRes = await request(app)
      .post('/floortag/management/update')
      .set('Authorization', `Bearer ${buildToken(admin)}`)
      .send({
        _id: tag._id.toString(),
        order: 2,
        name: 'Tag B',
        lang: 'ja',
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body).toMatchObject({ order: 2, name: 'Tag B', delete_flg: false });

    const conflictRes = await request(app)
      .post('/floortag/management/update')
      .set('Authorization', `Bearer ${buildToken(admin)}`)
      .send({
        _id: tag._id.toString(),
        order: 3,
        name: 'Stale Tag',
        lang: 'ja',
        delete_flg: true,
      });
    expect(conflictRes.status).toBe(400);
    const unchanged = await FloorTag.findById(tag._id).lean();
    expect(unchanged).toMatchObject({ order: 2, name: 'Tag B', delete_flg: false });
    expect(unchanged.deleted_at).toBeNull();
  });
});
