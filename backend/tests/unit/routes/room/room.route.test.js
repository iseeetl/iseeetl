const express = require('express');
const request = require('supertest');

const basePath = require.resolve('../../../../validates/base.validate');
const roomPath = require.resolve('../../../../validates/room.validate');
const mediaPath = require.resolve('../../../../validates/media.validate');
const userPath = require.resolve('../../../../validates/user.validate');
const sharedPath = require.resolve('../../../../middlewares/validation');
const ensureJwtPath = require.resolve('../../../../middlewares/ensureJsonWebToken');
const ensureAdminUserPath = require.resolve('../../../../middlewares/ensureAdminUser');
const controllerPath = require.resolve('../../../../controllers/room/room.controller');
const queryToBodyPath = require.resolve('../../../../routes/_shared/queryToBody');
const routerPath = require.resolve('../../../../routes/room/room.route');

let baseValidate,
  roomValidate,
  mediaValidate,
  userValidate,
  sharedMiddleware,
  ensureJwt,
  ensureAdminUser,
  ctrl,
  queryToBody,
  router,
  app;

const buildApp = () => {
  const a = express();
  a.use(express.json());
  a.use('/room', router);
  return a;
};

const setupWithMocks = () => {
  jest.resetModules();
  const pass = () => (req, res, next) => next();

  jest.doMock(basePath, () => ({
    validateMongoId: jest.fn(() => pass()),
    validateLang: jest.fn(() => pass()),
    validatePage: jest.fn(() => pass()),
  }));
  jest.doMock(roomPath, () => ({
    validateRoomTitle: jest.fn(() => pass()),
    validateRoomDescription: jest.fn(() => pass()),
    validateRoomSearch: jest.fn(() => pass()),
    validateGuestReactionOnly: jest.fn(() => pass()),
    validateMemberOnly: jest.fn(() => pass()),
    validateRoomDisplayHidden: jest.fn(() => pass()),
    validateNotification: jest.fn(() => pass()),
    validateRoomDisplayOrders: jest.fn(() => pass()),
    validateRoomDisplayOrder: jest.fn(() => pass()),
    validateRoomExternalSnsButton: jest.fn(() => pass()),
  }));
  jest.doMock(mediaPath, () => ({
    validateImageName: jest.fn(() => pass()),
  }));
  jest.doMock(userPath, () => ({
    validateDeleteFlg: jest.fn(() => pass()),
    validateOptionalDeleteFlg: jest.fn(() => pass()),
    validateOptionalQueryDeleteFlg: jest.fn(() => pass()),
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
    guestList: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'guestList' })),
    list: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'list' })),
    detail: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'detail' })),
    create: jest.fn((req, res) => res.status(201).json({ ok: true, action: 'create' })),
    update: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'update' })),
    updateRoomDisplayHidden: jest.fn((req, res) =>
      res.status(200).json({ ok: true, action: 'updateRoomDisplayHidden' })
    ),
    updateDisplayOrder: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'updateDisplayOrder' })),
    delete: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'delete' })),
    managementPaginate: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'managementPaginate' })),
    managementUpdate: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'managementUpdate' })),
    managementSetDeleteState: jest.fn((req, res) =>
      res.status(200).json({ ok: true, action: 'managementSetDeleteState' })
    ),
  }));

  queryToBody = require(queryToBodyPath);
  jest.spyOn(queryToBody, 'assignQueryToBody');
  router = require(routerPath);
  baseValidate = require(basePath);
  roomValidate = require(roomPath);
  mediaValidate = require(mediaPath);
  userValidate = require(userPath);
  sharedMiddleware = require(sharedPath);
  ensureJwt = require(ensureJwtPath);
  ensureAdminUser = require(ensureAdminUserPath);
  ctrl = require(controllerPath);

  app = buildApp();
};

const clearAllMocks = () => {
  const maybeClear = (obj) => obj && Object.values(obj).forEach((fn) => fn && fn.mockClear && fn.mockClear());
  maybeClear(baseValidate);
  maybeClear(roomValidate);
  maybeClear(mediaValidate);
  maybeClear(userValidate);
  maybeClear(sharedMiddleware);
  if (ensureJwt && ensureJwt.mockClear) ensureJwt.mockClear();
  if (ensureAdminUser && ensureAdminUser.mockClear) ensureAdminUser.mockClear();
  maybeClear(ctrl);
  queryToBody?.assignQueryToBody?.mockRestore?.();
};

beforeEach(() => setupWithMocks());
afterEach(() => clearAllMocks());

describe('ルームのルーティング', () => {
  test('POST /guest は JWT認証を要求せず、floor_idを検証する', async () => {
    const res = await request(app).post('/room/guest').send({ floor_id: '507f1f77bcf86cd799439011' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('guestList');

    expect(ensureJwt).not.toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(ctrl.guestList).toHaveBeenCalled();
  });

  test('POST / は JWTを必須とし、floor_idを検証する', async () => {
    const res = await request(app).post('/room/').send({ floor_id: '507f1f77bcf86cd799439011' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('list');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(ctrl.list).toHaveBeenCalled();
  });

  test('POST /detail は JWT認証を要求せず、_idを検証する', async () => {
    const res = await request(app).post('/room/detail').send({ _id: '507f1f77bcf86cd799439099' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('detail');

    expect(ensureJwt).not.toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(ctrl.detail).toHaveBeenCalled();
  });

  test('POST /create は JWTを必須とし、すべての作成項目を検証する', async () => {
    const payload = {
      floor_id: '507f1f77bcf86cd799439011',
      title: 'Room A',
      description: 'desc',
      lang: 'ja',
      guest_reaction_only: false,
      member_only: false,
      room_display_hidden: false,
      notification: false,
      external_sns_button: false,
    };
    const res = await request(app).post('/room/create').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('create');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(roomValidate.validateRoomTitle).toHaveBeenCalledWith('title');
    expect(roomValidate.validateRoomDescription).toHaveBeenCalledWith('description');
    expect(baseValidate.validateLang).toHaveBeenCalledWith('lang');
    expect(roomValidate.validateGuestReactionOnly).toHaveBeenCalledWith('guest_reaction_only');
    expect(roomValidate.validateMemberOnly).toHaveBeenCalledWith('member_only');
    expect(roomValidate.validateRoomDisplayHidden).toHaveBeenCalledWith('room_display_hidden');
    expect(roomValidate.validateNotification).toHaveBeenCalledWith('notification');
    expect(roomValidate.validateRoomExternalSnsButton).toHaveBeenCalledWith('external_sns_button');
    expect(ctrl.create).toHaveBeenCalled();
  });

  test('POST /update は JWTを必須とし、すべての更新項目を検証する', async () => {
    const payload = {
      _id: '507f1f77bcf86cd799439099',
      title: 'Room B',
      description: 'desc2',
      lang: 'en',
      image_name: 'img.png',
      guest_reaction_only: true,
      member_only: true,
      room_display_hidden: true,
      notification: true,
      external_sns_button: true,
    };
    const res = await request(app).post('/room/update').send(payload);

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('update');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(roomValidate.validateRoomTitle).toHaveBeenCalledWith('title');
    expect(roomValidate.validateRoomDescription).toHaveBeenCalledWith('description');
    expect(baseValidate.validateLang).toHaveBeenCalledWith('lang');
    expect(mediaValidate.validateImageName).toHaveBeenCalledWith('image_name');
    expect(roomValidate.validateGuestReactionOnly).toHaveBeenCalledWith('guest_reaction_only');
    expect(roomValidate.validateMemberOnly).toHaveBeenCalledWith('member_only');
    expect(roomValidate.validateRoomDisplayHidden).toHaveBeenCalledWith('room_display_hidden');
    expect(roomValidate.validateNotification).toHaveBeenCalledWith('notification');
    expect(roomValidate.validateRoomExternalSnsButton).toHaveBeenCalledWith('external_sns_button');
    expect(ctrl.update).toHaveBeenCalled();
  });

  test('POST /update/roomdisplayhidden は JWTを必須とし、floor_id/room_display_hiddenを検証する', async () => {
    const res = await request(app)
      .post('/room/update/roomdisplayhidden')
      .send({ floor_id: '507f1f77bcf86cd799439011', room_display_hidden: false });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('updateRoomDisplayHidden');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(roomValidate.validateRoomDisplayHidden).toHaveBeenCalledWith('room_display_hidden');
    expect(ctrl.updateRoomDisplayHidden).toHaveBeenCalled();
  });

  test('POST /update/displayorder は JWTを必須とし、displayordersを検証する', async () => {
    const payload = {
      floor_id: '507f1f77bcf86cd799439011',
      displayorders: [
        { _id: '507f1f77bcf86cd799439111', display_order: 1 },
        { _id: '507f1f77bcf86cd799439112', display_order: 2 },
      ],
    };
    const res = await request(app).post('/room/update/displayorder').send(payload);

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('updateDisplayOrder');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(roomValidate.validateRoomDisplayOrders).toHaveBeenCalledWith('displayorders');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('displayorders.*._id');
    expect(roomValidate.validateRoomDisplayOrder).toHaveBeenCalledWith('displayorders.*.display_order');
    expect(ctrl.updateDisplayOrder).toHaveBeenCalled();
  });

  test('POST /delete は JWTを必須とし、floor_id/floor_title/_id/titleを検証する', async () => {
    const payload = {
      _id: '507f1f77bcf86cd799439099',
    };
    const res = await request(app).post('/room/delete').send(payload);

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('delete');

    expect(ensureJwt).toHaveBeenCalled();

    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');

    expect(ctrl.delete).toHaveBeenCalled();
  });

  test('POST /management/paginate は body を使い JWT認証と管理者権限を確認し、page/search/floor_idを検証する', async () => {
    const body = { page: 10, search: '', floor_id: '507f1f77bcf86cd799439011' };
    const res = await request(app)
      .post('/room/management/paginate')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('managementPaginate');

    expect(queryToBody.assignQueryToBody).toHaveBeenCalledTimes(1);
    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(sharedMiddleware.finalize).toHaveBeenCalled();
    expect(baseValidate.validatePage).toHaveBeenCalledWith('page');
    expect(roomValidate.validateRoomSearch).toHaveBeenCalledWith('search');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id', { required: false });
    expect(userValidate.validateOptionalDeleteFlg).toHaveBeenCalledWith('delete_flg');
    expect(ctrl.managementPaginate).toHaveBeenCalled();
    expect(ctrl.managementPaginate.mock.calls[0][0].body).toEqual(body);
  });

  test('GET /management/paginate はクエリを body に割り当てて同じミドルウェア列を通る', async () => {
    const floorId = '507f1f77bcf86cd799439011';
    const res = await request(app).get(`/room/management/paginate?page=4&search=room&floor_id=${floorId}`);

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('managementPaginate');
    expect(queryToBody.assignQueryToBody).toHaveBeenCalledTimes(1);
    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(sharedMiddleware.finalize).toHaveBeenCalled();
    expect(ctrl.managementPaginate).toHaveBeenCalled();
    expect(ctrl.managementPaginate.mock.calls[0][0].body).toEqual({
      page: '4',
      search: 'room',
      floor_id: floorId,
    });
  });

  test.each(['put', 'patch', 'delete'])(
    '%s /management/paginate は 404 となり対象ミドルウェアとコントローラへ到達しない',
    async (method) => {
      const res = await request(app)[method]('/room/management/paginate').send({ page: 4 });

      expect(res.status).toBe(404);
      expect(queryToBody.assignQueryToBody).not.toHaveBeenCalled();
      expect(ensureJwt).not.toHaveBeenCalled();
      expect(ensureAdminUser).not.toHaveBeenCalled();
      expect(sharedMiddleware.finalize).not.toHaveBeenCalled();
      expect(ctrl.managementPaginate).not.toHaveBeenCalled();
    }
  );

  test('POST /management/update は JWTを必須とし、管理画面の入力項目を検証する', async () => {
    const res = await request(app).post('/room/management/update').send({
      _id: '507f1f77bcf86cd799439099',
      title: 'Rm',
      description: 'desc',
      image_name: 'x.png',
      guest_reaction_only: false,
      member_only: true,
      room_display_hidden: false,
      notification: false,
      external_sns_button: false,
      delete_flg: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('managementUpdate');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(roomValidate.validateRoomTitle).toHaveBeenCalledWith('title');
    expect(roomValidate.validateRoomDescription).toHaveBeenCalledWith('description');
    expect(mediaValidate.validateImageName).toHaveBeenCalledWith('image_name');
    expect(roomValidate.validateGuestReactionOnly).toHaveBeenCalledWith('guest_reaction_only');
    expect(roomValidate.validateMemberOnly).toHaveBeenCalledWith('member_only');
    expect(roomValidate.validateRoomDisplayHidden).toHaveBeenCalledWith('room_display_hidden');
    expect(roomValidate.validateNotification).toHaveBeenCalledWith('notification');
    expect(roomValidate.validateRoomExternalSnsButton).toHaveBeenCalledWith('external_sns_button');
    expect(userValidate.validateDeleteFlg).toHaveBeenCalledWith('delete_flg');
    expect(ctrl.managementUpdate).toHaveBeenCalled();
  });

  test('POST /management/delete-state は JWT認証と管理者権限を確認し、_id/delete_flgを検証する', async () => {
    const res = await request(app).post('/room/management/delete-state').send({
      _id: '507f1f77bcf86cd799439099',
      delete_flg: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('managementSetDeleteState');
    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(userValidate.validateDeleteFlg).toHaveBeenCalledWith('delete_flg');
    expect(ctrl.managementSetDeleteState).toHaveBeenCalled();
  });
});
