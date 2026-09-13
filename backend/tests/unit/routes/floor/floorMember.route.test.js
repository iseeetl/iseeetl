const express = require('express');
const request = require('supertest');

const basePath = require.resolve('../../../../validates/base.validate');
const memberPath = require.resolve('../../../../validates/member.validate');
const sharedPath = require.resolve('../../../../middlewares/validation');
const ensureJwtPath = require.resolve('../../../../middlewares/ensureJsonWebToken');
const ensureAdminUserPath = require.resolve('../../../../middlewares/ensureAdminUser');
const controllerPath = require.resolve('../../../../controllers/floor/floorMember.controller');
const queryToBodyPath = require.resolve('../../../../routes/_shared/queryToBody');
const routerPath = require.resolve('../../../../routes/floor/floorMember.route');

let baseValidate, memberValidate, sharedMiddleware, ensureJwt, ensureAdminUser, ctrl, queryToBody, router, app, io;

const buildApp = () => {
  const a = express();
  a.use(express.json());
  a.use('/floormember', router);
  return a;
};

const setupWithMocks = () => {
  jest.resetModules();

  const pass = () => (req, res, next) => next();

  jest.doMock(basePath, () => ({
    validateMongoId: jest.fn(() => pass()),
    validatePage: jest.fn(() => pass()),
  }));
  jest.doMock(memberPath, () => ({
    validatePeriod: jest.fn(() => pass()),
    validateFloorMemberInviteToken: jest.fn(() => pass()),
  }));
  jest.doMock(sharedPath, () => ({
    finalize: jest.fn(pass()),
  }));

  jest.doMock(ensureJwtPath, () => {
    const ensureJwtMock = jest.fn((req, res, next) => next());
    return ensureJwtMock;
  });

  jest.doMock(ensureAdminUserPath, () => {
    const ensureAdminUserMock = jest.fn((req, res, next) => next());
    return ensureAdminUserMock;
  });

  jest.doMock(controllerPath, () => ({
    list: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'list' })),
    invite: jest.fn((req, res) => res.status(201).json({ ok: true, action: 'invite' })),
    create: jest.fn((req, res) => res.status(201).json({ ok: true, action: 'create' })),
    delete: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'delete' })),
    leave: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'leave' })),
    managementPaginate: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'managementPaginate' })),
    managementDelete: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'managementDelete' })),
  }));

  queryToBody = require(queryToBodyPath);
  jest.spyOn(queryToBody, 'assignQueryToBody');
  io = {};
  const buildRouter = require(routerPath);
  router = buildRouter(io);
  baseValidate = require(basePath);
  memberValidate = require(memberPath);
  sharedMiddleware = require(sharedPath);
  ensureJwt = require(ensureJwtPath);
  ensureAdminUser = require(ensureAdminUserPath);
  ctrl = require(controllerPath);

  app = buildApp();
};

const clearAllMocks = () => {
  const maybeClear = (obj) => Object.values(obj).forEach((fn) => fn && fn.mockClear && fn.mockClear());
  maybeClear(baseValidate);
  maybeClear(memberValidate);
  maybeClear(sharedMiddleware);
  ensureJwt && ensureJwt.mockClear && ensureJwt.mockClear();
  ensureAdminUser && ensureAdminUser.mockClear && ensureAdminUser.mockClear();
  maybeClear(ctrl);
  queryToBody?.assignQueryToBody?.mockRestore?.();
};

beforeEach(() => {
  setupWithMocks();
});

afterEach(() => {
  clearAllMocks();
});

describe('floorMemberのルーティング', () => {
  test('POST / は JWTを必須とし、floor_idを検証する', async () => {
    const res = await request(app).post('/floormember/').send({ floor_id: '507f1f77bcf86cd799439011' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('list');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(ctrl.list).toHaveBeenCalled();
  });

  test('POST /invite は JWTを必須とし、floor_id/periodを検証する', async () => {
    const res = await request(app)
      .post('/floormember/invite')
      .send({ floor_id: '507f1f77bcf86cd799439011', period: { days: 7 } });

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('invite');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(memberValidate.validatePeriod).toHaveBeenCalledWith('period');
    expect(ctrl.invite).toHaveBeenCalled();
  });

  test('POST /create は JWTを必須とし、floor_id/invite_tokenを検証する', async () => {
    const res = await request(app)
      .post('/floormember/create')
      .send({ floor_id: '507f1f77bcf86cd799439011', invite_token: 'tok_xxx' });

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('create');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(memberValidate.validateFloorMemberInviteToken).toHaveBeenCalledWith('invite_token');
    expect(ctrl.create).toHaveBeenCalled();
  });

  test('POST /delete は JWTを必須とし、_id と floor_idを検証する', async () => {
    const res = await request(app)
      .post('/floormember/delete')
      .send({ _id: '507f1f77bcf86cd799439011', floor_id: '507f1f77bcf86cd799439012' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('delete');

    expect(ensureJwt).toHaveBeenCalled();
    // _idとfloor_idの両方にID検証を適用する（実行順は問わない）。
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(ctrl.delete).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), expect.any(Function), io);
  });

  test('POST /leave は JWTを必須とし、floor_idを検証する', async () => {
    const res = await request(app).post('/floormember/leave').send({ floor_id: '507f1f77bcf86cd799439011' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('leave');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(ctrl.leave).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), expect.any(Function), io);
  });

  test('POST /management/paginate は body を使い JWT認証と管理者権限を確認し、ページを検証する', async () => {
    const body = { page: { limit: 10, offset: 0 } };
    const res = await request(app)
      .post('/floormember/management/paginate')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('managementPaginate');

    expect(queryToBody.assignQueryToBody).toHaveBeenCalledTimes(1);
    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(sharedMiddleware.finalize).toHaveBeenCalled();
    expect(baseValidate.validatePage).toHaveBeenCalledWith('page');
    expect(ctrl.managementPaginate).toHaveBeenCalled();
    expect(ctrl.managementPaginate.mock.calls[0][0].body).toEqual(body);
  });

  test('GET /management/paginate はクエリを body に割り当てて同じミドルウェア列を通る', async () => {
    const res = await request(app).get('/floormember/management/paginate?page=6');

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('managementPaginate');
    expect(queryToBody.assignQueryToBody).toHaveBeenCalledTimes(1);
    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(sharedMiddleware.finalize).toHaveBeenCalled();
    expect(ctrl.managementPaginate).toHaveBeenCalled();
    expect(ctrl.managementPaginate.mock.calls[0][0].body).toEqual({ page: '6' });
  });

  test.each(['put', 'patch', 'delete'])(
    '%s /management/paginate は 404 となり対象ミドルウェアとコントローラへ到達しない',
    async (method) => {
      const res = await request(app)[method]('/floormember/management/paginate').send({ page: 6 });

      expect(res.status).toBe(404);
      expect(queryToBody.assignQueryToBody).not.toHaveBeenCalled();
      expect(ensureJwt).not.toHaveBeenCalled();
      expect(ensureAdminUser).not.toHaveBeenCalled();
      expect(sharedMiddleware.finalize).not.toHaveBeenCalled();
      expect(ctrl.managementPaginate).not.toHaveBeenCalled();
    }
  );

  test('POST /management/delete は JWT認証と管理者権限を必須とし、_idを検証する', async () => {
    const res = await request(app)
      .post('/floormember/management/delete')
      .send({ _id: '507f1f77bcf86cd799439099' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('managementDelete');
    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(ctrl.managementDelete).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.any(Function),
      io
    );
  });
});
