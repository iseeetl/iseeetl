const express = require('express');
const request = require('supertest');

const basePath = require.resolve('../../../validates/base.validate');
const settingValidatePath = require.resolve('../../../validates/aiAnalysisSetting.validate');
const sharedPath = require.resolve('../../../middlewares/validation');
const ensureJwtPath = require.resolve('../../../middlewares/ensureJsonWebToken');
const ensureAdminPath = require.resolve('../../../middlewares/ensureAdminUser');
const controllerPath = require.resolve('../../../controllers/analysis/aiAnalysisSetting.controller');
const queryToBodyPath = require.resolve('../../../routes/_shared/queryToBody');
const routerPath = require.resolve('../../../routes/aiAnalysisSetting.route');

let baseValidate;
let settingValidate;
let controller;
let sequence;
let app;

const middlewareFactory = (label) => jest.fn(() => (req, _res, next) => {
  sequence.push(label);
  next();
});

const setup = () => {
  jest.resetModules();
  sequence = [];

  jest.doMock(basePath, () => ({
    validateMongoId: middlewareFactory('mongo-id'),
  }));
  jest.doMock(settingValidatePath, () => ({
    validateAIAnalysisSearch: middlewareFactory('search'),
    validateAdditionalPrompt: middlewareFactory('prompt'),
    validateAllowedBodyFields: middlewareFactory('allowlist'),
    validateAnalysisKind: middlewareFactory('kind'),
    validateCanonicalPage: middlewareFactory('page'),
    validateRevision: middlewareFactory('revision'),
  }));
  jest.doMock(sharedPath, () => ({
    finalize: jest.fn((req, _res, next) => {
      sequence.push('finalize');
      next();
    }),
  }));
  jest.doMock(ensureJwtPath, () => jest.fn((req, _res, next) => {
    sequence.push('jwt');
    next();
  }));
  jest.doMock(ensureAdminPath, () => jest.fn((req, _res, next) => {
    sequence.push('admin');
    next();
  }));
  jest.doMock(queryToBodyPath, () => ({
    assignQueryToBody: jest.fn((req, _res, next) => {
      sequence.push('query-to-body');
      req.body = { ...req.query };
      next();
    }),
  }));
  jest.doMock(controllerPath, () => ({
    getDefaultResultUser: jest.fn((_req, res) => {
      sequence.push('default-result-user');
      res.json(null);
    }),
    listCommon: jest.fn((req, res) => {
      sequence.push('list');
      res.json({ action: 'list', body: req.body });
    }),
    paginateCommon: jest.fn((req, res) => {
      sequence.push('paginate');
      res.json({ action: 'paginate', body: req.body });
    }),
    createCommon: jest.fn((req, res) => {
      sequence.push('create');
      res.json({ action: 'create' });
    }),
    deleteCommon: jest.fn((_req, res) => { sequence.push('delete'); res.json({ action: 'delete' }); }),
    updateCommon: jest.fn((req, res) => {
      sequence.push('update');
      res.json({ action: 'update' });
    }),
  }));

  const router = require(routerPath);
  baseValidate = require(basePath);
  settingValidate = require(settingValidatePath);
  controller = require(controllerPath);
  app = express();
  app.use(express.json());
  app.use('/settings', router);
};

describe('AI解析設定のルーティング', () => {
  beforeEach(setup);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('POST /management はJWT、管理者、body 許可リストを順に通す', async () => {
    const response = await request(app).post('/settings/management').send({});

    expect(response.status).toBe(200);
    expect(settingValidate.validateAllowedBodyFields).toHaveBeenCalledWith([]);
    expect(sequence).toEqual(['jwt', 'admin', 'allowlist', 'finalize', 'list']);
    expect(controller.listCommon).toHaveBeenCalledTimes(1);
  });

  test('GET /management/paginate はクエリをbodyへ移しページと検索語を検証する', async () => {
    const response = await request(app)
      .get('/settings/management/paginate?page=2&search=tag');

    expect(response.status).toBe(200);
    expect(response.body.body).toEqual({ page: '2', search: 'tag' });
    expect(settingValidate.validateAllowedBodyFields).toHaveBeenCalledWith([
      'page',
      'search',
    ]);
    expect(settingValidate.validateCanonicalPage).toHaveBeenCalledWith('page');
    expect(settingValidate.validateAIAnalysisSearch).toHaveBeenCalledWith('search');
    expect(sequence).toEqual([
      'query-to-body',
      'jwt',
      'admin',
      'allowlist',
      'page',
      'search',
      'finalize',
      'paginate',
    ]);
  });

  test('POST /management/create は共通設定create 項目だけを検証する', async () => {
    const response = await request(app).post('/settings/management/create').send({
      category_tag: 'category-tag-id',
      analysis_kind: 'vision',
      additional_prompt: '',
      result_user: 'result-user-id',
    });

    expect(response.status).toBe(200);
    expect(settingValidate.validateAllowedBodyFields).toHaveBeenCalledWith([
      'category_tag',
      'analysis_kind',
      'additional_prompt',
      'result_user',
    ]);
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('category_tag');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('result_user');
    expect(settingValidate.validateAnalysisKind).toHaveBeenCalledWith();
    expect(settingValidate.validateAdditionalPrompt).toHaveBeenCalledWith();
    expect(sequence.slice(0, 2)).toEqual(['jwt', 'admin']);
    expect(controller.createCommon).toHaveBeenCalledTimes(1);
  });

  test('POST /management/update はリビジョンを含む更新項目を検証する', async () => {
    const response = await request(app).post('/settings/management/update').send({
      _id: 'setting-id',
      category_tag: 'category-tag-id',
      analysis_kind: 'speech',
      additional_prompt: '',
      result_user: 'result-user-id',
      revision: 2,
    });

    expect(response.status).toBe(200);
    expect(settingValidate.validateAllowedBodyFields).toHaveBeenCalledWith([
      '_id',
      'category_tag',
      'analysis_kind',
      'additional_prompt',
      'result_user',
      'revision',
    ]);
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(settingValidate.validateRevision).toHaveBeenCalledWith();
    expect(controller.updateCommon).toHaveBeenCalledTimes(1);
  });
  test('削除は管理者認証を通し、IDとリビジョンだけを検証する', async () => {
    const response = await request(app).post('/settings/management/delete').send({
      _id: 'setting-id', revision: 2,
    });
    expect(response.status).toBe(200);
    expect(settingValidate.validateAllowedBodyFields).toHaveBeenCalledWith(['_id', 'revision']);
    expect(sequence).toEqual(['jwt', 'admin', 'allowlist', 'mongo-id', 'revision', 'finalize', 'delete']);
    expect(controller.deleteCommon).toHaveBeenCalledTimes(1);
  });

  test('初期ユーザ取得は管理者認証を要求し、検索条件を受け取らない', async () => {
    const response = await request(app).post('/settings/management/default-result-user').send({});
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(sequence).toEqual(['jwt', 'admin', 'allowlist', 'finalize', 'default-result-user']);
    expect(settingValidate.validateAllowedBodyFields).toHaveBeenCalledWith([]);
  });
});
