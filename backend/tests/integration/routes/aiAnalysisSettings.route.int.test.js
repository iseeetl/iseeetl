const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');

const ROLES = require('../../../constants/roles');
const {
  ANALYSIS_KINDS,
} = require('../../../constants/aiAnalysisSettings');
const AIAnalysisSetting = require('../../../models/AIAnalysisSetting');
const FloorAIAnalysisSetting = require('../../../models/FloorAIAnalysisSetting');
const RoomAIAnalysisSetting = require('../../../models/RoomAIAnalysisSetting');
const FloorMember = require('../../../models/FloorMember');
const RoomMember = require('../../../models/RoomMember');
const CategoryTag = require('../../../models/CategoryTag');
const FloorTag = require('../../../models/FloorTag');
const RoomTag = require('../../../models/RoomTag');
const aiAnalysisSettingRouter = require('../../../routes/aiAnalysisSetting.route');
const floorAIAnalysisSettingRouter = require('../../../routes/floor/floorAIAnalysisSetting.route');
const roomAIAnalysisSettingRouter = require('../../../routes/room/roomAIAnalysisSetting.route');
const categoryTagRouter = require('../../../routes/categoryTag.route');
const userRouter = require('../../../routes/user.route');
const { attachErrorHandler } = require('../_helpers/app');
const {
  createUserToken,
  restoreEnv,
  snapshotEnv,
} = require('../_helpers/auth');
const {
  createFloor,
  createRoom,
  createUser,
} = require('../_helpers/models');

const ORIGINAL_ENV = snapshotEnv(['JWT_SECRET', 'SUPPORT_USER_ID']);
process.env.JWT_SECRET = 'ai-analysis-settings-integration-jwt-secret';

const MODELS_BY_NAME = Object.freeze({
  AIAnalysisSetting,
  FloorAIAnalysisSetting,
  RoomAIAnalysisSetting,
});

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/aianalysissetting', aiAnalysisSettingRouter);
  app.use('/api/flooraianalysissetting', floorAIAnalysisSettingRouter);
  app.use('/api/roomaianalysissetting', roomAIAnalysisSettingRouter);
  app.use('/api/categorytag', categoryTagRouter);
  app.use('/api/user', userRouter);
  return attachErrorHandler(app);
};

const auth = (user) => ({
  Authorization: `Bearer ${createUserToken(user)}`,
});

const uniqueName = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const createCategoryTag = (admin, overrides = {}) =>
  CategoryTag.create({
    user: admin._id,
    order: 1,
    name: uniqueName('CategoryTag'),
    lang: 'ja',
    translations: [{ lang: 'en', name: uniqueName('CategoryTagEnglish') }],
    ...overrides,
  });

const createFloorTag = (editor, floor, categoryTag, overrides = {}) =>
  FloorTag.create({
    floor: floor._id,
    user: editor._id,
    order: 1,
    name: uniqueName('FloorTag'),
    lang: 'ja',
    translations: [{ user: editor._id, lang: 'en', name: uniqueName('FloorTagEnglish') }],
    source_category_tag: categoryTag?._id || null,
    ...overrides,
  });

const createRoomTag = (editor, floor, room, floorTag, overrides = {}) =>
  RoomTag.create({
    floor: floor._id,
    room: room._id,
    user: editor._id,
    order: 1,
    name: uniqueName('RoomTag'),
    lang: 'ja',
    translations: [{ user: editor._id, lang: 'en', name: uniqueName('RoomTagEnglish') }],
    source_floor_tag: floorTag?._id || null,
    ...overrides,
  });

const seedContext = async () => {
  const admin = await createUser({ role: ROLES.ADMINISTRATOR });
  const editor = await createUser({ role: ROLES.EDITOR });
  const otherEditor = await createUser({ role: ROLES.EDITOR });
  const author = await createUser({ role: ROLES.AUTHOR });
  const floorMember = await createUser({ role: ROLES.AUTHOR });
  const roomMember = await createUser({ role: ROLES.AUTHOR });
  const resultUser = await createUser({
    role: ROLES.AUTHOR,
    username: uniqueName('AnalysisResult'),
  });
  const alternateResultUser = await createUser({
    role: ROLES.AUTHOR,
    username: uniqueName('AlternateResult'),
  });
  const deletedResultUser = await createUser({
    role: ROLES.AUTHOR,
    username: uniqueName('DeletedResult'),
    delete_flg: true,
    deleted_at: new Date(),
  });
  const floor = await createFloor(editor);
  const otherFloor = await createFloor(otherEditor);
  const room = await createRoom(editor, floor);
  await FloorMember.create({ floor: floor._id, user: floorMember._id });
  await RoomMember.create({ floor: floor._id, room: room._id, user: roomMember._id });
  const categoryTag = await createCategoryTag(admin);
  const floorTag = await createFloorTag(editor, floor, categoryTag);
  const roomTag = await createRoomTag(editor, floor, room, floorTag);

  return {
    admin,
    editor,
    otherEditor,
    author,
    floorMember,
    roomMember,
    resultUser,
    alternateResultUser,
    deletedResultUser,
    floor,
    otherFloor,
    room,
    categoryTag,
    floorTag,
    roomTag,
  };
};

const commonPayload = (ctx, overrides = {}) => ({
  category_tag: ctx.categoryTag._id.toString(),
  analysis_kind: 'vision',
  additional_prompt: '',
  result_user: ctx.resultUser._id.toString(),
  ...overrides,
});

const commonUpdatePayload = (setting, ctx, overrides = {}) => ({
  _id: setting._id,
  category_tag: ctx.categoryTag._id.toString(),
  analysis_kind: setting.analysis_kind,
  additional_prompt: setting.additional_prompt,
  result_user: ctx.resultUser._id.toString(),
  revision: setting.revision,
  ...overrides,
});

const floorPayload = (ctx, overrides = {}) => ({
  floor_id: ctx.floor._id.toString(),
  floor_tag: ctx.floorTag._id.toString(),
  analysis_kind: 'vision',
  additional_prompt: '',
  result_user: ctx.resultUser._id.toString(),
  ...overrides,
});

const roomPayload = (ctx, overrides = {}) => ({
  floor_id: ctx.floor._id.toString(),
  room_id: ctx.room._id.toString(),
  room_tag: ctx.roomTag._id.toString(),
  analysis_kind: 'vision',
  additional_prompt: '',
  result_user: ctx.resultUser._id.toString(),
  ...overrides,
});

const createCommonSetting = async (app, ctx, overrides = {}) =>
  request(app)
    .post('/api/aianalysissetting/management/create')
    .set(auth(ctx.admin))
    .send(commonPayload(ctx, overrides));

describe('AI解析設定APIの結合動作', () => {
  const app = buildApp();

  beforeEach(() => {
    delete process.env.SUPPORT_USER_ID;
  });

  afterEach(async () => {
    await Promise.all(Object.values(MODELS_BY_NAME).map((Model) => Model.deleteMany({})));
  });

  afterAll(async () => {
    restoreEnv(ORIGINAL_ENV);
  });

  describe.each(['common', 'floor', 'room'])('%sの初期ユーザ取得', (scope) => {
    const endpoint = scope === 'common'
      ? '/api/aianalysissetting/management/default-result-user'
      : `/api/${scope}aianalysissetting/default-result-user`;
    const payload = (ctx) => scope === 'common' ? {} : {
      floor_id: ctx.floor._id.toString(),
      ...(scope === 'room' ? { room_id: ctx.room._id.toString() } : {}),
    };
    const allowedActor = (ctx) => scope === 'common' ? ctx.admin : ctx.editor;

    test('設定操作権限がある利用者には有効ユーザの公開情報だけを返す', async () => {
      const ctx = await seedContext();
      process.env.SUPPORT_USER_ID = ctx.resultUser._id.toString();
      const response = await request(app).post(endpoint).set(auth(allowedActor(ctx))).send(payload(ctx));
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        _id: ctx.resultUser._id.toString(),
        username: ctx.resultUser.username,
        image_name: ctx.resultUser.image_name ?? null,
      });
      expect(await AIAnalysisSetting.countDocuments({})).toBe(0);
      expect(await FloorAIAnalysisSetting.countDocuments({})).toBe(0);
      expect(await RoomAIAnalysisSetting.countDocuments({})).toBe(0);
    });

    test.each(['unset', 'invalid', 'missing', 'deleted'])('%sの場合は初期選択なしを返す', async (state) => {
      const ctx = await seedContext();
      if (state === 'invalid') process.env.SUPPORT_USER_ID = 'invalid-id';
      if (state === 'missing') process.env.SUPPORT_USER_ID = '111111111111111111111111';
      if (state === 'deleted') process.env.SUPPORT_USER_ID = ctx.deletedResultUser._id.toString();
      const response = await request(app).post(endpoint).set(auth(allowedActor(ctx))).send(payload(ctx));
      expect(response.status).toBe(200);
      expect(response.body).toBeNull();
    });

    test('未ログインと設定操作権限のない利用者には初期ユーザを返さない', async () => {
      const ctx = await seedContext();
      process.env.SUPPORT_USER_ID = ctx.resultUser._id.toString();
      const unauthenticated = await request(app).post(endpoint).send(payload(ctx));
      expect(unauthenticated.status).toBe(401);
      for (const actor of [ctx.otherEditor, ctx.author, ctx.floorMember, ctx.roomMember]) {
        const response = await request(app).post(endpoint).set(auth(actor)).send(payload(ctx));
        expect(response.status).toBe(403);
        expect(response.body).not.toHaveProperty('username');
      }
      delete process.env.SUPPORT_USER_ID;
      const unset = await request(app).post(endpoint).set(auth(ctx.author)).send(payload(ctx));
      expect(unset.status).toBe(403);
    });

    test('追加フィールドを拒否する', async () => {
      const ctx = await seedContext();
      const response = await request(app).post(endpoint).set(auth(allowedActor(ctx)))
        .send({ ...payload(ctx), result_user: ctx.alternateResultUser._id.toString() });
      expect(response.status).toBe(400);
    });
  });

  test('初期ユーザ取得でもルームとフロアの組合せを検証する', async () => {
    const ctx = await seedContext();
    process.env.SUPPORT_USER_ID = ctx.resultUser._id.toString();
    const response = await request(app).post('/api/roomaianalysissetting/default-result-user')
      .set(auth(ctx.admin)).send({
        floor_id: ctx.otherFloor._id.toString(), room_id: ctx.room._id.toString(),
      });
    expect(response.status).toBe(400);
  });

  test('初期ユーザは保存APIのユーザ指定を省略する代わりにはならない', async () => {
    const ctx = await seedContext();
    process.env.SUPPORT_USER_ID = ctx.resultUser._id.toString();
    const body = commonPayload(ctx);
    delete body.result_user;
    const response = await request(app).post('/api/aianalysissetting/management/create')
      .set(auth(ctx.admin)).send(body);
    expect(response.status).toBe(400);
    const selected = await createCommonSetting(app, ctx, { result_user: ctx.alternateResultUser._id.toString() });
    expect(selected.status).toBe(200);
    expect(selected.body.result_user._id).toBe(ctx.alternateResultUser._id.toString());
  });

  test('設定が0件でも共通・フロア・ルーム一覧を正常な空配列で返す', async () => {
    const admin = await createUser({ role: ROLES.ADMINISTRATOR });
    const floor = await createFloor(admin);
    const room = await createRoom(admin, floor);
    const headers = auth(admin);
    const floorId = floor._id.toString();
    const roomId = room._id.toString();

    const emptyResponses = await Promise.all([
      request(app).post('/api/aianalysissetting/management').set(headers).send({}),
      request(app)
        .post('/api/flooraianalysissetting')
        .set(headers)
        .send({ floor_id: floorId }),
      request(app)
        .post('/api/roomaianalysissetting')
        .set(headers)
        .send({ floor_id: floorId, room_id: roomId }),
    ]);
    for (const response of emptyResponses) {
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    }
  });

  test('共通設定の作成・取得・更新・削除、検索、リビジョン、重複制約と応答項目を確認する', async () => {
    const ctx = await seedContext();
    const normalizedPrompt = 'é';
    const privatePromptToken = uniqueName('PromptMustNotBeSearchable');
    const created = await createCommonSetting(app, ctx, {
      additional_prompt: `  e\u0301 ${privatePromptToken}  `,
    });

    expect(created.status).toBe(200);
    expect(created.body).toEqual({
      _id: expect.any(String),
      scope: 'category_tag',
      tag: {
        _id: ctx.categoryTag._id.toString(),
        name: ctx.categoryTag.name,
        lang: 'ja',
        translations: ctx.categoryTag.translations.map(({ lang, name }) => ({ lang, name })),
      },
      analysis_kind: 'vision',
      additional_prompt: `${normalizedPrompt} ${privatePromptToken}`,
      result_user: {
        _id: ctx.resultUser._id.toString(),
        username: ctx.resultUser.username,
        image_name: null,
      },
      revision: 1,
    });
    expect(created.body).not.toHaveProperty('user');
    expect(created.body).not.toHaveProperty('updated_by');
    expect(created.body.result_user).not.toHaveProperty('mail');
    expect(JSON.stringify(created.body)).not.toContain(ctx.resultUser.mail);

    const duplicate = await createCommonSetting(app, ctx);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body?.error?.code).toBe('CONFLICT');

    const activePage = await request(app)
      .get('/api/aianalysissetting/management/paginate')
      .set(auth(ctx.admin))
      .query({ page: '1', search: ctx.categoryTag.translations[0].name });
    expect(activePage.status).toBe(200);
    expect(activePage.body.total).toBe(1);
    expect(activePage.body.docs[0]._id).toBe(created.body._id);

    const promptSearch = await request(app)
      .get('/api/aianalysissetting/management/paginate')
      .set(auth(ctx.admin))
      .query({ page: '1', search: privatePromptToken });
    const mailSearch = await request(app)
      .get('/api/aianalysissetting/management/paginate')
      .set(auth(ctx.admin))
      .query({ page: '1', search: ctx.resultUser.mail });
    expect(promptSearch.status).toBe(200);
    expect(mailSearch.status).toBe(200);
    expect(promptSearch.body.total).toBe(0);
    expect(mailSearch.body.total).toBe(0);

    const invalidPage = await request(app)
      .get('/api/aianalysissetting/management/paginate')
      .set(auth(ctx.admin))
      .query({ page: '01', search: '' });
    expect(invalidPage.status).toBe(400);

    const unknownField = await request(app)
      .post('/api/aianalysissetting/management/create')
      .set(auth(ctx.admin))
      .send({ ...commonPayload(ctx, { analysis_kind: 'speech' }), provider_model: 'forbidden' });
    expect(unknownField.status).toBe(400);

    const users = await request(app)
      .post('/api/user/ai-analysis-result-users/search')
      .set(auth(ctx.admin))
      .send({ search: ctx.resultUser.username });
    expect(users.status).toBe(200);
    expect(users.body).toEqual([
      {
        _id: ctx.resultUser._id.toString(),
        username: ctx.resultUser.username,
        image_name: null,
      },
    ]);

    const usersByMail = await request(app)
      .post('/api/user/ai-analysis-result-users/search')
      .set(auth(ctx.admin))
      .send({ search: ctx.resultUser.mail });
    expect(usersByMail.status).toBe(200);
    expect(usersByMail.body).toEqual([]);

    const updated = await request(app)
      .post('/api/aianalysissetting/management/update')
      .set(auth(ctx.admin))
      .send(commonUpdatePayload(created.body, ctx, { additional_prompt: 'updated' }));
    expect(updated.status).toBe(200);
    expect(updated.body.revision).toBe(2);
    expect(updated.body.additional_prompt).toBe('updated');

    const stale = await request(app)
      .post('/api/aianalysissetting/management/update')
      .set(auth(ctx.admin))
      .send(commonUpdatePayload(created.body, ctx, { additional_prompt: 'stale' }));
    expect(stale.status).toBe(409);
    expect(stale.body?.error?.code).toBe('CONFLICT');

    const staleDelete = await request(app)
      .post('/api/aianalysissetting/management/delete')
      .set(auth(ctx.admin))
      .send({ _id: created.body._id, revision: created.body.revision });
    expect(staleDelete.status).toBe(409);
    expect(await AIAnalysisSetting.findById(created.body._id).lean()).toMatchObject({ revision: 2 });

    const deleted = await request(app)
      .post('/api/aianalysissetting/management/delete')
      .set(auth(ctx.admin))
      .send({ _id: updated.body._id, revision: updated.body.revision });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ _id: updated.body._id });
    expect(await AIAnalysisSetting.findById(updated.body._id)).toBeNull();

    const page = await request(app)
      .get('/api/aianalysissetting/management/paginate')
      .set(auth(ctx.admin))
      .query({ page: '1', search: '' });
    expect(page.status).toBe(200);
    expect(page.body.total).toBe(0);
    const repeated = await request(app)
      .post('/api/aianalysissetting/management/delete')
      .set(auth(ctx.admin))
      .send({ _id: updated.body._id, revision: updated.body.revision });
    expect(repeated.status).toBe(404);
    const recreated = await createCommonSetting(app, ctx);
    expect(recreated.status).toBe(200);
    expect(recreated.body._id).not.toBe(created.body._id);
    expect(recreated.body.revision).toBe(1);
  });

  test('共通設定の物理削除は認証・権限・入力を検証し、不正な要求では設定を残す', async () => {
    const ctx = await seedContext();
    const created = await createCommonSetting(app, ctx);
    const payload = { _id: created.body._id, revision: created.body.revision };
    const endpoint = '/api/aianalysissetting/management/delete';
    expect((await request(app).post(endpoint).send(payload)).status).toBe(401);
    for (const actor of [ctx.editor, ctx.author]) {
      expect((await request(app).post(endpoint).set(auth(actor)).send(payload)).status).toBe(403);
    }
    for (const invalid of [
      { _id: payload._id }, { ...payload, revision: 0 }, { ...payload, revision: 1.5 },
      { ...payload, _id: 'invalid' }, { ...payload, delete_flg: true },
    ]) {
      expect((await request(app).post(endpoint).set(auth(ctx.admin)).send(invalid)).status).toBe(400);
    }
    for (const deleteFlag of [true, false]) {
      const obsolete = await request(app)
        .post('/api/aianalysissetting/management/update').set(auth(ctx.admin))
        .send(commonUpdatePayload(created.body, ctx, { delete_flg: deleteFlag }));
      expect(obsolete.status).toBe(400);
    }
    expect(await AIAnalysisSetting.findById(payload._id).lean()).toMatchObject({ revision: 1, delete_flg: false });
  });

  test('旧論理削除設定は再有効化せず、参照先が欠損していてもIDとリビジョンで物理削除できる', async () => {
    const ctx = await seedContext();
    const created = await createCommonSetting(app, ctx);
    const id = created.body._id;
    await AIAnalysisSetting.updateOne({ _id: id }, { $set: {
      category_tag: new mongoose.Types.ObjectId(), delete_flg: true, revision: Number.MAX_SAFE_INTEGER,
    } });
    const listed = await request(app).post('/api/aianalysissetting/management').set(auth(ctx.admin)).send({});
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([]);
    const update = await request(app).post('/api/aianalysissetting/management/update').set(auth(ctx.admin))
      .send(commonUpdatePayload(created.body, ctx, { revision: Number.MAX_SAFE_INTEGER }));
    expect(update.status).toBe(404);
    const deleted = await request(app).post('/api/aianalysissetting/management/delete').set(auth(ctx.admin))
      .send({ _id: id, revision: Number.MAX_SAFE_INTEGER });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ _id: id });
    expect(await AIAnalysisSetting.findById(id)).toBeNull();
  });

  test('共通設定一覧は旧論理削除を除外し、検索とページ分割をDB側で行う', async () => {
    const admin = await createUser({ role: ROLES.ADMINISTRATOR });
    const defaultResultUser = await createUser({
      role: ROLES.AUTHOR,
      username: uniqueName('DefaultPaginationResult'),
    });
    const searchedResultUser = await createUser({
      role: ROLES.AUTHOR,
      username: uniqueName('SearchedPaginationResult'),
    });
    const deletedReferenceUser = await createUser({
      role: ROLES.AUTHOR,
      username: uniqueName('DeletedPaginationResult'),
      delete_flg: true,
      deleted_at: new Date(),
    });
    const tagPrefix = uniqueName('DbPageTag');
    const translatedSearch = uniqueName('TranslatedBoundary');
    const tags = await CategoryTag.insertMany(
      Array.from({ length: 24 }, (_, index) => {
        const suffix = String(index).padStart(2, '0');
        return {
          user: admin._id,
          order: index + 1,
          name: `${tagPrefix}-${suffix}`,
          lang: 'ja',
          translations: [
            {
              lang: 'en',
              name: index === 23 ? translatedSearch : `${tagPrefix}-translation-${suffix}`,
            },
          ],
          delete_flg: index === 23,
          ...(index === 23 ? { deleted_at: new Date() } : {}),
        };
      })
    );
    await AIAnalysisSetting.insertMany(
      tags.map((tag, index) => ({
        category_tag: tag._id,
        analysis_kind: ANALYSIS_KINDS[index % ANALYSIS_KINDS.length],
        additional_prompt: `private-prompt-${index}`,
        result_user:
          index === 0
            ? searchedResultUser._id
            : index === 23
              ? deletedReferenceUser._id
              : defaultResultUser._id,
        revision: 1,
        user: admin._id,
        updated_by: admin._id,
        delete_flg: index === 1,
      }))
    );

    const fetchPage = (query) =>
      request(app)
        .get('/api/aianalysissetting/management/paginate')
        .set(auth(admin))
        .query(query);
    const pages = [];
    for (const page of ['1', '2', '3']) {
      const response = await fetchPage({ page, search: tagPrefix });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ total: 23, pages: 3, page: Number(page), limit: 10 });
      pages.push(response.body.docs);
    }
    expect(pages.map((docs) => docs.length)).toEqual([10, 10, 3]);
    expect(pages.flat().map(({ tag }) => tag.name)).toEqual(
      tags.filter((_, index) => index !== 1).map((tag) => tag.name)
    );
    expect(pages.flat().every((setting) => !Object.hasOwn(setting, 'delete_flg'))).toBe(true);

    const translatedPage = await fetchPage({ page: '1', search: translatedSearch });
    expect(translatedPage.status).toBe(200);
    expect(translatedPage.body.total).toBe(1);
    expect(translatedPage.body.docs[0]).toMatchObject({
      tag: { name: `${tagPrefix}-23`, delete_flg: true },
      result_user: { username: deletedReferenceUser.username, delete_flg: true },
    });
    const resultUserPage = await fetchPage({ page: '1', search: searchedResultUser.username });
    expect(resultUserPage.status).toBe(200);
    expect(resultUserPage.body.total).toBe(1);
    expect(resultUserPage.body.docs[0].tag.name).toBe(`${tagPrefix}-00`);
    expect(resultUserPage.body.docs[0]).not.toHaveProperty('user');
    expect(resultUserPage.body.docs[0]).not.toHaveProperty('updated_by');
    const kindPage = await fetchPage({ page: '1', search: 'speech' });
    expect(kindPage.status).toBe(200);
    expect(kindPage.body.total).toBe(5);
    expect(kindPage.body.docs.every(({ analysis_kind: kind }) => kind === 'speech')).toBe(true);
    const obsoleteFilter = await fetchPage({ page: '1', search: '', delete_flg: 'true' });
    expect(obsoleteFilter.status).toBe(400);
  });

  test('管理権限をAPIで検証し、作成者のフロア編集ユーザだけにフロア・ルーム設定の操作を許可する', async () => {
    const ctx = await seedContext();

    const noToken = await request(app)
      .post('/api/flooraianalysissetting')
      .send({ floor_id: ctx.floor._id.toString() });
    expect(noToken.status).toBe(401);
    expect(noToken.body?.error?.code).toBe('TOKEN_INVALID');

    const commonByAuthor = await request(app)
      .post('/api/aianalysissetting/management')
      .set(auth(ctx.author))
      .send({});
    expect(commonByAuthor.status).toBe(403);
    expect(commonByAuthor.body?.error?.code).toBe('FORBIDDEN');

    const commonByEditor = await request(app)
      .post('/api/aianalysissetting/management')
      .set(auth(ctx.editor))
      .send({});
    const resultUsersByEditor = await request(app)
      .post('/api/user/ai-analysis-result-users/search')
      .set(auth(ctx.editor))
      .send({ search: '' });
    expect(commonByEditor.status).toBe(403);
    expect(resultUsersByEditor.status).toBe(403);

    const protectedFloorSetting = await FloorAIAnalysisSetting.create({
      floor: ctx.floor._id,
      floor_tag: ctx.floorTag._id,
      analysis_kind: 'vision',
      additional_prompt: '',
      result_user: ctx.resultUser._id,
      revision: 1,
      user: ctx.editor._id,
      updated_by: ctx.editor._id,
    });
    const protectedRoomSetting = await RoomAIAnalysisSetting.create({
      floor: ctx.floor._id,
      room: ctx.room._id,
      room_tag: ctx.roomTag._id,
      analysis_kind: 'vision',
      additional_prompt: '',
      result_user: ctx.resultUser._id,
      revision: 1,
      user: ctx.editor._id,
      updated_by: ctx.editor._id,
    });
    const deletedFloorSetting = await FloorAIAnalysisSetting.create({
      floor: ctx.floor._id,
      floor_tag: ctx.floorTag._id,
      analysis_kind: 'audioScene',
      additional_prompt: '',
      result_user: ctx.resultUser._id,
      revision: 1,
      user: ctx.editor._id,
      updated_by: ctx.editor._id,
      delete_flg: true,
      deleted_at: new Date(),
    });
    const deletedRoomSetting = await RoomAIAnalysisSetting.create({
      floor: ctx.floor._id,
      room: ctx.room._id,
      room_tag: ctx.roomTag._id,
      analysis_kind: 'audioScene',
      additional_prompt: '',
      result_user: ctx.resultUser._id,
      revision: 1,
      user: ctx.editor._id,
      updated_by: ctx.editor._id,
      delete_flg: true,
      deleted_at: new Date(),
    });

    for (const actor of [ctx.author, ctx.otherEditor, ctx.floorMember, ctx.roomMember]) {
      const floorList = await request(app)
        .post('/api/flooraianalysissetting')
        .set(auth(actor))
        .send({ floor_id: ctx.floor._id.toString() });
      const roomList = await request(app)
        .post('/api/roomaianalysissetting')
        .set(auth(actor))
        .send({ floor_id: ctx.floor._id.toString(), room_id: ctx.room._id.toString() });
      const resultUserSearch = await request(app)
        .post('/api/flooraianalysissetting/result-users/search')
        .set(auth(actor))
        .send({ floor_id: ctx.floor._id.toString(), search: '' });
      const roomResultUserSearch = await request(app)
        .post('/api/roomaianalysissetting/result-users/search')
        .set(auth(actor))
        .send({
          floor_id: ctx.floor._id.toString(),
          room_id: ctx.room._id.toString(),
          search: '',
        });
      const floorCreate = await request(app)
        .post('/api/flooraianalysissetting/create')
        .set(auth(actor))
        .send(floorPayload(ctx, { analysis_kind: 'speech' }));
      const roomCreate = await request(app)
        .post('/api/roomaianalysissetting/create')
        .set(auth(actor))
        .send(roomPayload(ctx, { analysis_kind: 'speech' }));
      expect(floorList.status).toBe(403);
      expect(roomList.status).toBe(403);
      expect(resultUserSearch.status).toBe(403);
      expect(roomResultUserSearch.status).toBe(403);
      expect(floorCreate.status).toBe(403);
      expect(roomCreate.status).toBe(403);
    }

    const unauthorizedMutations = await Promise.all([
      request(app)
        .post('/api/flooraianalysissetting/update')
        .set(auth(ctx.otherEditor))
        .send({
          _id: protectedFloorSetting._id.toString(),
          ...floorPayload(ctx),
          revision: protectedFloorSetting.revision,
        }),
      request(app)
        .post('/api/flooraianalysissetting/delete')
        .set(auth(ctx.otherEditor))
        .send({
          _id: protectedFloorSetting._id.toString(),
          floor_id: ctx.floor._id.toString(),
          revision: protectedFloorSetting.revision,
        }),
      request(app)
        .post('/api/roomaianalysissetting/update')
        .set(auth(ctx.otherEditor))
        .send({
          _id: protectedRoomSetting._id.toString(),
          ...roomPayload(ctx),
          revision: protectedRoomSetting.revision,
        }),
      request(app)
        .post('/api/roomaianalysissetting/delete')
        .set(auth(ctx.otherEditor))
        .send({
          _id: protectedRoomSetting._id.toString(),
          floor_id: ctx.floor._id.toString(),
          room_id: ctx.room._id.toString(),
          revision: protectedRoomSetting.revision,
        }),
    ]);
    expect(unauthorizedMutations.map(({ status }) => status)).toEqual([403, 403, 403, 403]);

    for (const actor of [ctx.admin, ctx.editor]) {
      const floorList = await request(app)
        .post('/api/flooraianalysissetting')
        .set(auth(actor))
        .send({ floor_id: ctx.floor._id.toString() });
      const roomList = await request(app)
        .post('/api/roomaianalysissetting')
        .set(auth(actor))
        .send({ floor_id: ctx.floor._id.toString(), room_id: ctx.room._id.toString() });
      const floorResultUsers = await request(app)
        .post('/api/flooraianalysissetting/result-users/search')
        .set(auth(actor))
        .send({ floor_id: ctx.floor._id.toString(), search: ctx.resultUser.username });
      const roomResultUsers = await request(app)
        .post('/api/roomaianalysissetting/result-users/search')
        .set(auth(actor))
        .send({
          floor_id: ctx.floor._id.toString(),
          room_id: ctx.room._id.toString(),
          search: ctx.resultUser.username,
        });
      expect(floorList.status).toBe(200);
      expect(roomList.status).toBe(200);
      expect(floorList.body.map(({ _id }) => _id)).toEqual([
        protectedFloorSetting._id.toString(),
      ]);
      expect(roomList.body.map(({ _id }) => _id)).toEqual([
        protectedRoomSetting._id.toString(),
      ]);
      expect(floorList.body.map(({ _id }) => _id)).not.toContain(
        deletedFloorSetting._id.toString()
      );
      expect(roomList.body.map(({ _id }) => _id)).not.toContain(
        deletedRoomSetting._id.toString()
      );
      expect(floorList.body.every(({ delete_flg: deleteFlg }) => !deleteFlg)).toBe(true);
      expect(roomList.body.every(({ delete_flg: deleteFlg }) => !deleteFlg)).toBe(true);
      expect(floorResultUsers.status).toBe(200);
      expect(roomResultUsers.status).toBe(200);
      expect(floorResultUsers.body).toEqual([
        {
          _id: ctx.resultUser._id.toString(),
          username: ctx.resultUser.username,
          image_name: null,
        },
      ]);
      expect(roomResultUsers.body).toEqual(floorResultUsers.body);
    }

    const removedScopedContracts = await Promise.all([
      request(app)
        .post('/api/flooraianalysissetting')
        .set(auth(ctx.editor))
        .send({ floor_id: ctx.floor._id.toString(), include_deleted: true }),
      request(app)
        .post('/api/roomaianalysissetting')
        .set(auth(ctx.editor))
        .send({
          floor_id: ctx.floor._id.toString(),
          room_id: ctx.room._id.toString(),
          include_deleted: true,
        }),
      request(app)
        .post('/api/flooraianalysissetting/restore')
        .set(auth(ctx.editor))
        .send({
          _id: deletedFloorSetting._id.toString(),
          floor_id: ctx.floor._id.toString(),
          revision: deletedFloorSetting.revision,
        }),
      request(app)
        .post('/api/roomaianalysissetting/restore')
        .set(auth(ctx.editor))
        .send({
          _id: deletedRoomSetting._id.toString(),
          floor_id: ctx.floor._id.toString(),
          room_id: ctx.room._id.toString(),
          revision: deletedRoomSetting.revision,
        }),
    ]);
    expect(removedScopedContracts.map(({ status }) => status)).toEqual([400, 400, 404, 404]);
    expect(removedScopedContracts.slice(0, 2).map(({ body }) => body?.error?.code)).toEqual([
      'INVALID_PARAMS',
      'INVALID_PARAMS',
    ]);
  });

  test('管理者と作成者は親設定なしで設定を作成・更新・削除し、解析結果の投稿者を指定・変更できる', async () => {
    const ctx = await seedContext();
    const masterVision = await createCommonSetting(app, ctx);
    expect(masterVision.status).toBe(200);

    const floorVision = await request(app)
      .post('/api/flooraianalysissetting/create')
      .set(auth(ctx.editor))
      .send(floorPayload(ctx));
    expect(floorVision.status).toBe(200);
    expect(floorVision.body).toMatchObject({
      scope: 'floor',
      floor: ctx.floor._id.toString(),
      analysis_kind: 'vision',
      revision: 1,
      result_user: {
        _id: ctx.resultUser._id.toString(),
        username: ctx.resultUser.username,
        image_name: null,
      },
      source: null,
    });
    expect(floorVision.body).not.toHaveProperty('user');
    expect(floorVision.body).not.toHaveProperty('updated_by');

    const missingResultUser = await request(app)
      .post('/api/flooraianalysissetting/create')
      .set(auth(ctx.editor))
      .send({
        floor_id: ctx.floor._id.toString(),
        floor_tag: ctx.floorTag._id.toString(),
        analysis_kind: 'audioScene',
        additional_prompt: '',
      });
    const deletedResultUser = await request(app)
      .post('/api/flooraianalysissetting/create')
      .set(auth(ctx.editor))
      .send(
        floorPayload(ctx, {
          analysis_kind: 'audioScene',
          result_user: ctx.deletedResultUser._id.toString(),
        })
      );
    expect(missingResultUser.status).toBe(400);
    expect(deletedResultUser.status).toBe(400);

    const missingRoomResultUser = await request(app)
      .post('/api/roomaianalysissetting/create')
      .set(auth(ctx.editor))
      .send({
        floor_id: ctx.floor._id.toString(),
        room_id: ctx.room._id.toString(),
        room_tag: ctx.roomTag._id.toString(),
        analysis_kind: 'audioScene',
        additional_prompt: '',
      });
    const deletedRoomResultUser = await request(app)
      .post('/api/roomaianalysissetting/create')
      .set(auth(ctx.editor))
      .send(
        roomPayload(ctx, {
          analysis_kind: 'audioScene',
          result_user: ctx.deletedResultUser._id.toString(),
        })
      );
    expect(missingRoomResultUser.status).toBe(400);
    expect(deletedRoomResultUser.status).toBe(400);

    const removedPreview = await request(app)
      .post('/api/flooraianalysissetting/parent-preview')
      .set(auth(ctx.editor))
      .send({
        floor_id: ctx.floor._id.toString(),
        floor_tag: ctx.floorTag._id.toString(),
        analysis_kind: 'vision',
      });
    expect(removedPreview.status).toBe(404);

    const removedRoomPreview = await request(app)
      .post('/api/roomaianalysissetting/parent-preview')
      .set(auth(ctx.editor))
      .send({
        floor_id: ctx.floor._id.toString(),
        room_id: ctx.room._id.toString(),
        room_tag: ctx.roomTag._id.toString(),
        analysis_kind: 'vision',
      });
    expect(removedRoomPreview.status).toBe(404);

    const editorSpecifiedUser = await request(app)
      .post('/api/flooraianalysissetting/create')
      .set(auth(ctx.editor))
      .send(
        floorPayload(ctx, {
          analysis_kind: 'speech',
          result_user: ctx.alternateResultUser._id.toString(),
        })
      );
    expect(editorSpecifiedUser.status).toBe(200);
    expect(editorSpecifiedUser.body).toMatchObject({
      result_user: { _id: ctx.alternateResultUser._id.toString() },
      source: null,
    });

    const noParentTag = await createFloorTag(ctx.editor, ctx.floor, null, { order: 2 });
    const editorWithoutParent = await request(app)
      .post('/api/flooraianalysissetting/create')
      .set(auth(ctx.editor))
      .send(floorPayload(ctx, { floor_tag: noParentTag._id.toString(), analysis_kind: 'video' }));
    expect(editorWithoutParent.status).toBe(200);
    expect(editorWithoutParent.body).toMatchObject({
      result_user: { _id: ctx.resultUser._id.toString() },
      source: null,
    });

    const adminWithoutParent = await request(app)
      .post('/api/flooraianalysissetting/create')
      .set(auth(ctx.admin))
      .send(
        floorPayload(ctx, {
          floor_tag: noParentTag._id.toString(),
          analysis_kind: 'conversation',
          result_user: ctx.alternateResultUser._id.toString(),
        })
      );
    expect(adminWithoutParent.status).toBe(200);
    expect(adminWithoutParent.body).toMatchObject({
      result_user: { _id: ctx.alternateResultUser._id.toString() },
      source: null,
    });

    const deletedSourceTag = await createCategoryTag(ctx.admin, { order: 3 });
    const deletedSourceFloorTag = await createFloorTag(
      ctx.editor,
      ctx.floor,
      deletedSourceTag,
      { order: 3 }
    );
    const deletedSource = await request(app)
      .post('/api/categorytag/management/delete')
      .set(auth(ctx.admin))
      .send({ _id: deletedSourceTag._id.toString() });
    expect(deletedSource.status).toBe(200);
    const floorTagAfterSourceDelete = await FloorTag.findById(
      deletedSourceFloorTag._id
    ).lean();
    expect(floorTagAfterSourceDelete.source_category_tag.toString()).toBe(
      deletedSourceTag._id.toString()
    );

    const deletedSourcePreview = await request(app)
      .post('/api/flooraianalysissetting/parent-preview')
      .set(auth(ctx.editor))
      .send({
        floor_id: ctx.floor._id.toString(),
        floor_tag: deletedSourceFloorTag._id.toString(),
        analysis_kind: 'audioScene',
      });
    expect(deletedSourcePreview.status).toBe(404);

    const editorWithDeletedSource = await request(app)
      .post('/api/flooraianalysissetting/create')
      .set(auth(ctx.editor))
      .send(
        floorPayload(ctx, {
          floor_tag: deletedSourceFloorTag._id.toString(),
          analysis_kind: 'audioScene',
        })
      );
    expect(editorWithDeletedSource.status).toBe(200);
    expect(editorWithDeletedSource.body).toMatchObject({
      result_user: { _id: ctx.resultUser._id.toString() },
      source: null,
    });

    const duplicateFloor = await request(app)
      .post('/api/flooraianalysissetting/create')
      .set(auth(ctx.editor))
      .send(floorPayload(ctx));
    expect(duplicateFloor.status).toBe(409);

    const roomVision = await request(app)
      .post('/api/roomaianalysissetting/create')
      .set(auth(ctx.editor))
      .send(roomPayload(ctx));
    expect(roomVision.status).toBe(200);
    expect(roomVision.body).toMatchObject({
      scope: 'room',
      floor: ctx.floor._id.toString(),
      room: ctx.room._id.toString(),
      result_user: { _id: ctx.resultUser._id.toString() },
      source: null,
    });

    const duplicateRoom = await request(app)
      .post('/api/roomaianalysissetting/create')
      .set(auth(ctx.editor))
      .send(roomPayload(ctx));
    expect(duplicateRoom.status).toBe(409);

    const missingFloorUpdateResultUser = await request(app)
      .post('/api/flooraianalysissetting/update')
      .set(auth(ctx.editor))
      .send({
        _id: floorVision.body._id,
        floor_id: ctx.floor._id.toString(),
        floor_tag: ctx.floorTag._id.toString(),
        analysis_kind: floorVision.body.analysis_kind,
        additional_prompt: floorVision.body.additional_prompt,
        revision: floorVision.body.revision,
      });
    const deletedRoomUpdateResultUser = await request(app)
      .post('/api/roomaianalysissetting/update')
      .set(auth(ctx.editor))
      .send({
        _id: roomVision.body._id,
        ...roomPayload(ctx, { result_user: ctx.deletedResultUser._id.toString() }),
        revision: roomVision.body.revision,
      });
    expect(missingFloorUpdateResultUser.status).toBe(400);
    expect(deletedRoomUpdateResultUser.status).toBe(400);

    const updatedRoom = await request(app)
      .post('/api/roomaianalysissetting/update')
      .set(auth(ctx.editor))
      .send({
        _id: roomVision.body._id,
        ...roomPayload(ctx, {
          additional_prompt: 'room editor update',
          result_user: ctx.alternateResultUser._id.toString(),
        }),
        revision: roomVision.body.revision,
      });
    expect(updatedRoom.status).toBe(200);
    expect(updatedRoom.body).toMatchObject({
      revision: 2,
      additional_prompt: 'room editor update',
      result_user: { _id: ctx.alternateResultUser._id.toString() },
      source: roomVision.body.source,
    });

    const staleRoom = await request(app)
      .post('/api/roomaianalysissetting/update')
      .set(auth(ctx.editor))
      .send({
        _id: roomVision.body._id,
        ...roomPayload(ctx, { additional_prompt: 'stale room update' }),
        revision: roomVision.body.revision,
      });
    expect(staleRoom.status).toBe(409);

    const wrongCreateScope = await request(app)
      .post('/api/roomaianalysissetting/create')
      .set(auth(ctx.admin))
      .send(
        roomPayload(ctx, {
          floor_id: ctx.otherFloor._id.toString(),
          analysis_kind: 'video',
          result_user: ctx.resultUser._id.toString(),
        })
      );
    expect(wrongCreateScope.status).toBe(400);

    const updatedFloor = await request(app)
      .post('/api/flooraianalysissetting/update')
      .set(auth(ctx.editor))
      .send({
        _id: floorVision.body._id,
        ...floorPayload(ctx, {
          additional_prompt: 'editor update',
          result_user: ctx.alternateResultUser._id.toString(),
        }),
        revision: floorVision.body.revision,
      });
    expect(updatedFloor.status).toBe(200);
    expect(updatedFloor.body).toMatchObject({
      revision: 2,
      additional_prompt: 'editor update',
      result_user: { _id: ctx.alternateResultUser._id.toString() },
      source: floorVision.body.source,
    });

    const staleFloor = await request(app)
      .post('/api/flooraianalysissetting/update')
      .set(auth(ctx.editor))
      .send({
        _id: floorVision.body._id,
        ...floorPayload(ctx, { additional_prompt: 'stale' }),
        revision: floorVision.body.revision,
      });
    expect(staleFloor.status).toBe(409);

    const wrongUpdateScope = await request(app)
      .post('/api/flooraianalysissetting/update')
      .set(auth(ctx.admin))
      .send({
        _id: floorVision.body._id,
        ...floorPayload(ctx, {
          floor_id: ctx.otherFloor._id.toString(),
          result_user: ctx.resultUser._id.toString(),
        }),
        revision: updatedFloor.body.revision,
      });
    expect(wrongUpdateScope.status).toBe(400);
  });

  test('共通設定を物理削除しても子は残り、その後で子を物理削除でき、一覧から除外して同じ設定を再作成できる', async () => {
    const ctx = await seedContext();
    const master = await createCommonSetting(app, ctx);
    expect(master.status).toBe(200);

    const floorSetting = await request(app)
      .post('/api/flooraianalysissetting/create')
      .set(auth(ctx.editor))
      .send(floorPayload(ctx));
    const roomSetting = await request(app)
      .post('/api/roomaianalysissetting/create')
      .set(auth(ctx.editor))
      .send(roomPayload(ctx));
    expect(floorSetting.status).toBe(200);
    expect(roomSetting.status).toBe(200);

    await Promise.all([
      FloorAIAnalysisSetting.updateOne(
        { _id: floorSetting.body._id },
        {
          $set: {
            source_master_setting: master.body._id,
            source_master_revision: master.body.revision,
          },
        }
      ),
      RoomAIAnalysisSetting.updateOne(
        { _id: roomSetting.body._id },
        {
          $set: {
            source_floor_setting: floorSetting.body._id,
            source_floor_revision: floorSetting.body.revision,
          },
        }
      ),
    ]);

    const deletedMaster = await request(app)
      .post('/api/aianalysissetting/management/delete')
      .set(auth(ctx.admin))
      .send({ _id: master.body._id, revision: master.body.revision });
    expect(deletedMaster.status).toBe(200);
    expect(deletedMaster.body).toEqual({ _id: master.body._id });
    expect(await AIAnalysisSetting.findById(master.body._id)).toBeNull();
    expect(await FloorAIAnalysisSetting.findById(floorSetting.body._id).lean()).toMatchObject({ revision: 1, delete_flg: false });
    expect(await RoomAIAnalysisSetting.findById(roomSetting.body._id).lean()).toMatchObject({ revision: 1, delete_flg: false });

    const deletedFloor = await request(app)
      .post('/api/flooraianalysissetting/delete')
      .set(auth(ctx.editor))
      .send({
        _id: floorSetting.body._id,
        floor_id: ctx.floor._id.toString(),
        revision: floorSetting.body.revision,
      });
    expect(deletedFloor.status).toBe(200);
    expect(deletedFloor.body).toEqual({ _id: floorSetting.body._id });

    const deletedRoom = await request(app)
      .post('/api/roomaianalysissetting/delete')
      .set(auth(ctx.editor))
      .send({
        _id: roomSetting.body._id,
        floor_id: ctx.floor._id.toString(),
        room_id: ctx.room._id.toString(),
        revision: roomSetting.body.revision,
      });
    expect(deletedRoom.status).toBe(200);
    expect(deletedRoom.body).toEqual({ _id: roomSetting.body._id });

    const [storedDeletedFloor, storedDeletedRoom, floorListAfterDelete, roomListAfterDelete] =
      await Promise.all([
        FloorAIAnalysisSetting.findById(floorSetting.body._id).lean(),
        RoomAIAnalysisSetting.findById(roomSetting.body._id).lean(),
        request(app)
          .post('/api/flooraianalysissetting')
          .set(auth(ctx.editor))
          .send({ floor_id: ctx.floor._id.toString() }),
        request(app)
          .post('/api/roomaianalysissetting')
          .set(auth(ctx.editor))
          .send({
            floor_id: ctx.floor._id.toString(),
            room_id: ctx.room._id.toString(),
          }),
      ]);
    expect(storedDeletedFloor).toBeNull();
    expect(storedDeletedRoom).toBeNull();
    expect(floorListAfterDelete.status).toBe(200);
    expect(roomListAfterDelete.status).toBe(200);
    expect(floorListAfterDelete.body).toEqual([]);
    expect(roomListAfterDelete.body).toEqual([]);

    const repeatedRoomDelete = await request(app)
      .post('/api/roomaianalysissetting/delete')
      .set(auth(ctx.editor))
      .send({
        _id: roomSetting.body._id,
        floor_id: ctx.floor._id.toString(),
        room_id: ctx.room._id.toString(),
        revision: roomSetting.body.revision,
      });
    expect(repeatedRoomDelete.status).toBe(404);

    const recreatedFloor = await request(app)
      .post('/api/flooraianalysissetting/create')
      .set(auth(ctx.editor))
      .send(floorPayload(ctx));
    const recreatedRoom = await request(app)
      .post('/api/roomaianalysissetting/create')
      .set(auth(ctx.editor))
      .send(roomPayload(ctx));
    expect(recreatedFloor.status).toBe(200);
    expect(recreatedRoom.status).toBe(200);
    expect(recreatedFloor.body).toMatchObject({ revision: 1, source: null });
    expect(recreatedRoom.body).toMatchObject({ revision: 1, source: null });
    expect(recreatedFloor.body._id).not.toBe(floorSetting.body._id);
    expect(recreatedRoom.body._id).not.toBe(roomSetting.body._id);

    const [floorListAfterRecreate, roomListAfterRecreate, floorSettingCount, roomSettingCount] =
      await Promise.all([
        request(app)
          .post('/api/flooraianalysissetting')
          .set(auth(ctx.editor))
          .send({ floor_id: ctx.floor._id.toString() }),
        request(app)
          .post('/api/roomaianalysissetting')
          .set(auth(ctx.editor))
          .send({
            floor_id: ctx.floor._id.toString(),
            room_id: ctx.room._id.toString(),
          }),
        FloorAIAnalysisSetting.countDocuments({
          floor: ctx.floor._id,
          floor_tag: ctx.floorTag._id,
          analysis_kind: 'vision',
        }),
        RoomAIAnalysisSetting.countDocuments({
          floor: ctx.floor._id,
          room: ctx.room._id,
          room_tag: ctx.roomTag._id,
          analysis_kind: 'vision',
        }),
      ]);
    expect(floorListAfterRecreate.status).toBe(200);
    expect(roomListAfterRecreate.status).toBe(200);
    expect(floorListAfterRecreate.body.map(({ _id }) => _id)).toEqual([
      recreatedFloor.body._id,
    ]);
    expect(roomListAfterRecreate.body.map(({ _id }) => _id)).toEqual([
      recreatedRoom.body._id,
    ]);
    expect(floorSettingCount).toBe(1);
    expect(roomSettingCount).toBe(1);
  });

  test('有効な共通設定が100件ある場合は作成を拒否し、削除後は作成できる', async () => {
    const ctx = await seedContext();
    const tags = await CategoryTag.insertMany(
      Array.from({ length: 21 }, (_, index) => ({
        user: ctx.admin._id,
        order: index + 1,
        name: uniqueName(`CapacityTag${index}`),
        lang: 'ja',
      }))
    );
    const activeSettings = tags.slice(0, 20).flatMap((tag) =>
      ANALYSIS_KINDS.map((analysisKind) => ({
        category_tag: tag._id,
        analysis_kind: analysisKind,
        additional_prompt: '',
        result_user: ctx.resultUser._id,
        revision: 1,
        user: ctx.admin._id,
        updated_by: ctx.admin._id,
        delete_flg: false,
      }))
    );
    expect(activeSettings).toHaveLength(100);
    await AIAnalysisSetting.insertMany(activeSettings);

    const overCapacity = await request(app)
      .post('/api/aianalysissetting/management/create')
      .set(auth(ctx.admin))
      .send({
        category_tag: tags[20]._id.toString(),
        analysis_kind: 'vision',
        additional_prompt: '',
        result_user: ctx.resultUser._id.toString(),
      });
    expect(overCapacity.status).toBe(409);

    const target = await AIAnalysisSetting.findOne({ category_tag: tags[0]._id }).lean();
    const deleted = await request(app)
      .post('/api/aianalysissetting/management/delete')
      .set(auth(ctx.admin))
      .send({ _id: target._id.toString(), revision: target.revision });
    expect(deleted.status).toBe(200);
    const afterDelete = await createCommonSetting(app, ctx, { category_tag: tags[20]._id.toString() });
    expect(afterDelete.status).toBe(200);
    expect(await AIAnalysisSetting.countDocuments({})).toBe(100);
  });

  test('設定作成と参照タグ削除が競合しても、有効な設定が削除済みタグを参照しない', async () => {
    const admin = await createUser({ role: ROLES.ADMINISTRATOR });
    const resultUser = await createUser({ role: ROLES.AUTHOR });
    const categoryTag = await createCategoryTag(admin);
    const ctx = { admin, resultUser, categoryTag };
    const createRequest = request(app)
      .post('/api/aianalysissetting/management/create')
      .set(auth(ctx.admin))
      .send(commonPayload(ctx));
    const deleteRequest = request(app)
      .post('/api/categorytag/management/delete')
      .set(auth(ctx.admin))
      .send({
        _id: ctx.categoryTag._id.toString(),
      });

    const [createResponse, deleteResponse] = await Promise.all([createRequest, deleteRequest]);
    const statuses = [createResponse.status, deleteResponse.status];
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect([400, 409]).toContain(statuses.find((status) => status !== 200));

    const [tag, setting] = await Promise.all([
      CategoryTag.findById(ctx.categoryTag._id).lean(),
      AIAnalysisSetting.findOne({
        category_tag: ctx.categoryTag._id,
        analysis_kind: 'vision',
      }).lean(),
    ]);
    expect(Boolean(setting && !setting.delete_flg && !tag)).toBe(false);
  });
});
