const express = require('express');
const request = require('supertest');

const basePath = require.resolve('../../../validates/base.validate');
const settingValidatePath = require.resolve('../../../validates/aiAnalysisSetting.validate');
const sharedPath = require.resolve('../../../middlewares/validation');
const ensureJwtPath = require.resolve('../../../middlewares/ensureJsonWebToken');
const controllerPath = require.resolve('../../../controllers/analysis/aiAnalysisSetting.controller');
const routerPath = require.resolve('../../../routes/_shared/scopedAIAnalysisSettingRoutes');

const makeFactory = () => jest.fn(() => (_req, _res, next) => next());

const setup = (type) => {
  jest.resetModules();

  jest.doMock(basePath, () => ({ validateMongoId: makeFactory() }));
  jest.doMock(settingValidatePath, () => ({
    validateAdditionalPrompt: makeFactory(),
    validateAllowedBodyFields: makeFactory(),
    validateAnalysisKind: makeFactory(),
    validateResultUserSearch: makeFactory(),
    validateRevision: makeFactory(),
  }));
  jest.doMock(sharedPath, () => ({ finalize: jest.fn((_req, _res, next) => next()) }));
  jest.doMock(ensureJwtPath, () => jest.fn((_req, _res, next) => next()));
  jest.doMock(controllerPath, () =>
    Object.fromEntries(
      [
        'getFloorDefaultResultUser',
        'getRoomDefaultResultUser',
        'listFloor',
        'createFloor',
        'updateFloor',
        'deleteFloor',
        'searchFloorResultUsers',
        'listRoom',
        'createRoom',
        'updateRoom',
        'deleteRoom',
        'searchRoomResultUsers',
      ].map((name) => [name, jest.fn((_req, res) => res.json({ action: name }))])
    )
  );

  const { buildScopedAIAnalysisSettingRouter } = require(routerPath);
  const app = express();
  app.use(express.json());
  app.use('/settings', buildScopedAIAnalysisSettingRouter({ type }));
  return {
    app,
    baseValidate: require(basePath),
    settingValidate: require(settingValidatePath),
    ensureJwt: require(ensureJwtPath),
    controller: require(controllerPath),
  };
};

describe.each([
  {
    type: 'floor',
    scopeFields: ['floor_id'],
    tagField: 'floor_tag',
    actions: {
      defaultResultUser: 'getFloorDefaultResultUser',
      list: 'listFloor',
      create: 'createFloor',
      update: 'updateFloor',
      delete: 'deleteFloor',
      searchResultUsers: 'searchFloorResultUsers',
    },
  },
  {
    type: 'room',
    scopeFields: ['floor_id', 'room_id'],
    tagField: 'room_tag',
    actions: {
      defaultResultUser: 'getRoomDefaultResultUser',
      list: 'listRoom',
      create: 'createRoom',
      update: 'updateRoom',
      delete: 'deleteRoom',
      searchResultUsers: 'searchRoomResultUsers',
    },
  },
])('$typeのAI解析設定ルート', ({ type, scopeFields, tagField, actions }) => {
  let context;

  beforeEach(() => {
    context = setup(type);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('listはJWTを要求し対象範囲だけを検証する', async () => {
    const response = await request(context.app).post('/settings/').send({
      floor_id: 'floor-id',
      ...(type === 'room' ? { room_id: 'room-id' } : {}),
    });

    expect(response.status).toBe(200);
    expect(context.ensureJwt).toHaveBeenCalledTimes(1);
    expect(context.settingValidate.validateAllowedBodyFields).toHaveBeenCalledWith(scopeFields);
    scopeFields.forEach((field) => {
      expect(context.baseValidate.validateMongoId).toHaveBeenCalledWith(field);
    });
    expect(context.controller[actions.list]).toHaveBeenCalledTimes(1);
  });

  test('createはscope/tag/kind/promptと必須result_userだけを許可する', async () => {
    const response = await request(context.app).post('/settings/create').send({});

    expect(response.status).toBe(200);
    expect(context.settingValidate.validateAllowedBodyFields).toHaveBeenCalledWith([
      ...scopeFields,
      tagField,
      'analysis_kind',
      'additional_prompt',
      'result_user',
    ]);
    expect(context.baseValidate.validateMongoId).toHaveBeenCalledWith(tagField);
    expect(context.baseValidate.validateMongoId).toHaveBeenCalledWith('result_user');
    expect(context.settingValidate.validateAnalysisKind).toHaveBeenCalledWith();
    expect(context.settingValidate.validateAdditionalPrompt).toHaveBeenCalledWith();
    expect(context.controller[actions.create]).toHaveBeenCalledTimes(1);
  });

  test('updateはID、対象範囲、タグ、kind、プロンプト、必須result_user、リビジョンを検証する', async () => {
    const response = await request(context.app).post('/settings/update').send({});

    expect(response.status).toBe(200);
    expect(context.settingValidate.validateAllowedBodyFields).toHaveBeenCalledWith([
      '_id',
      ...scopeFields,
      tagField,
      'analysis_kind',
      'additional_prompt',
      'result_user',
      'revision',
    ]);
    expect(context.baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(context.baseValidate.validateMongoId).toHaveBeenCalledWith('result_user');
    expect(context.settingValidate.validateRevision).toHaveBeenCalledWith();
    expect(context.controller[actions.update]).toHaveBeenCalledTimes(1);
  });

  test('deleteはID、対象範囲、リビジョンだけを検証する', async () => {
    const response = await request(context.app).post('/settings/delete').send({});

    expect(response.status).toBe(200);
    expect(context.settingValidate.validateAllowedBodyFields).toHaveBeenCalledWith([
      '_id',
      ...scopeFields,
      'revision',
    ]);
    expect(context.baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(context.settingValidate.validateRevision).toHaveBeenCalledWith();
    expect(context.controller[actions.delete]).toHaveBeenCalledTimes(1);
  });

  test('restore エンドポイントは公開しない', async () => {
    const response = await request(context.app).post('/settings/restore').send({});

    expect(response.status).toBe(404);
    expect(context.ensureJwt).not.toHaveBeenCalled();
  });

  test('初期ユーザ取得はJWTと対象範囲を検証する', async () => {
    const response = await request(context.app).post('/settings/default-result-user').send({});
    expect(response.status).toBe(200);
    expect(context.ensureJwt).toHaveBeenCalledTimes(1);
    expect(context.settingValidate.validateAllowedBodyFields).toHaveBeenCalledWith(scopeFields);
    scopeFields.forEach((field) => {
      expect(context.baseValidate.validateMongoId).toHaveBeenCalledWith(field);
    });
    expect(context.controller[actions.defaultResultUser]).toHaveBeenCalledTimes(1);
  });

  test('result-users/searchは対象範囲と検索語だけを検証する', async () => {
    const response = await request(context.app).post('/settings/result-users/search').send({});

    expect(response.status).toBe(200);
    expect(context.settingValidate.validateAllowedBodyFields).toHaveBeenCalledWith([
      ...scopeFields,
      'search',
    ]);
    expect(context.settingValidate.validateResultUserSearch).toHaveBeenCalledWith('search');
    expect(context.controller[actions.searchResultUsers]).toHaveBeenCalledTimes(1);
  });
});
