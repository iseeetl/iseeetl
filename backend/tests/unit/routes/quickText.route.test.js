const express = require('express');
const request = require('supertest');

const quickTextValidatePath = require.resolve('../../../validates/quickText.validate');
const ensureJwtPath = require.resolve('../../../middlewares/ensureJsonWebToken');
const ensureAdminUserPath = require.resolve('../../../middlewares/ensureAdminUser');
const controllerPath = require.resolve('../../../controllers/quickText.controller');
const routerPath = require.resolve('../../../routes/quickText.route');

let validators, ensureJwt, ensureAdminUser, ctrl, app;

const buildApp = (router) => {
  const a = express();
  a.use(express.json());
  a.use('/quicktext', router);
  return a;
};

const setupWithMocks = () => {
  jest.resetModules();

  const pass = (req, res, next) => next();

  validators = {
    groupList: jest.fn(pass),
    groupCreate: jest.fn(pass),
    groupUpdate: jest.fn(pass),
    groupRemove: jest.fn(pass),
    itemList: jest.fn(pass),
    itemCreate: jest.fn(pass),
    itemUpdate: jest.fn(pass),
    itemRemove: jest.fn(pass),
  };

  jest.doMock(quickTextValidatePath, () => ({
    master: {
      group: {
        list: [validators.groupList],
        create: [validators.groupCreate],
        update: [validators.groupUpdate],
        remove: [validators.groupRemove],
      },
      item: {
        list: [validators.itemList],
        create: [validators.itemCreate],
        update: [validators.itemUpdate],
        remove: [validators.itemRemove],
      },
    },
  }));

  jest.doMock(ensureJwtPath, () => jest.fn((req, res, next) => next()));
  jest.doMock(ensureAdminUserPath, () => jest.fn((req, res, next) => next()));

  jest.doMock(controllerPath, () => ({
    listAllGroups: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'listAllGroups' })),
    paginateGroups: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'paginateGroups' })),
    createGroup: jest.fn((req, res) => res.status(201).json({ ok: true, action: 'createGroup' })),
    updateGroup: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'updateGroup' })),
    deleteGroup: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'deleteGroup' })),
    listItems: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'listItems' })),
    createItem: jest.fn((req, res) => res.status(201).json({ ok: true, action: 'createItem' })),
    updateItem: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'updateItem' })),
    deleteItem: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'deleteItem' })),
  }));

  const router = require(routerPath);
  ensureJwt = require(ensureJwtPath);
  ensureAdminUser = require(ensureAdminUserPath);
  ctrl = require(controllerPath);

  app = buildApp(router);
};

const clearAll = () => {
  const maybeClear = (obj) => obj && Object.values(obj).forEach((fn) => fn?.mockClear && fn.mockClear());
  maybeClear(validators);
  ensureJwt?.mockClear?.();
  ensureAdminUser?.mockClear?.();
  maybeClear(ctrl);
};

beforeEach(setupWithMocks);
afterEach(clearAll);

describe('quickTextのルーティング', () => {
  test('GET /management/quick-text/groups/all は JWT認証と管理者権限を必須とし、group.listを呼ぶ', async () => {
    const res = await request(app).get('/quicktext/management/quick-text/groups/all');

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('listAllGroups');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(validators.groupList).toHaveBeenCalled();
    expect(ctrl.listAllGroups).toHaveBeenCalled();
  });

  test('GET /management/quick-text/groups は JWT認証と管理者権限を必須とし、group.listを呼ぶ', async () => {
    const res = await request(app).get('/quicktext/management/quick-text/groups');

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('paginateGroups');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(validators.groupList).toHaveBeenCalled();
    expect(ctrl.paginateGroups).toHaveBeenCalled();
  });

  test('POST /management/quick-text/groups は JWT認証と管理者権限を必須とし、group.createを呼ぶ', async () => {
    const res = await request(app)
      .post('/quicktext/management/quick-text/groups')
      .send({ title: 'g1', lang: 'ja' });

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('createGroup');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(validators.groupCreate).toHaveBeenCalled();
    expect(ctrl.createGroup).toHaveBeenCalled();
  });

  test('PATCH /management/quick-text/groups/:id は JWT認証と管理者権限を必須とし、group.updateを呼ぶ', async () => {
    const res = await request(app)
      .patch('/quicktext/management/quick-text/groups/507f1f77bcf86cd799439011')
      .send({ title: 'g2' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('updateGroup');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(validators.groupUpdate).toHaveBeenCalled();
    expect(ctrl.updateGroup).toHaveBeenCalled();
  });

  test('DELETE /management/quick-text/groups/:id は JWT認証と管理者権限を必須とし、group.removeを呼ぶ', async () => {
    const res = await request(app).delete('/quicktext/management/quick-text/groups/507f1f77bcf86cd799439011');

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('deleteGroup');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(validators.groupRemove).toHaveBeenCalled();
    expect(ctrl.deleteGroup).toHaveBeenCalled();
  });

  test('GET /management/quick-text/groups/:groupId/items は JWT認証と管理者権限を必須とし、item.listを呼ぶ', async () => {
    const res = await request(app).get('/quicktext/management/quick-text/groups/507f1f77bcf86cd799439011/items');

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('listItems');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(validators.itemList).toHaveBeenCalled();
    expect(ctrl.listItems).toHaveBeenCalled();
  });

  test('POST /management/quick-text/groups/:groupId/items は JWT認証と管理者権限を必須とし、item.createを呼ぶ', async () => {
    const res = await request(app)
      .post('/quicktext/management/quick-text/groups/507f1f77bcf86cd799439011/items')
      .send({ label: 'l1', lang: 'ja' });

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('createItem');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(validators.itemCreate).toHaveBeenCalled();
    expect(ctrl.createItem).toHaveBeenCalled();
  });

  test('PATCH /management/quick-text/items/:id は JWT認証と管理者権限を必須とし、item.updateを呼ぶ', async () => {
    const res = await request(app)
      .patch('/quicktext/management/quick-text/items/507f1f77bcf86cd799439011')
      .send({ label: 'l2' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('updateItem');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(validators.itemUpdate).toHaveBeenCalled();
    expect(ctrl.updateItem).toHaveBeenCalled();
  });

  test('DELETE /management/quick-text/items/:id は JWT認証と管理者権限を必須とし、item.removeを呼ぶ', async () => {
    const res = await request(app).delete('/quicktext/management/quick-text/items/507f1f77bcf86cd799439011');

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('deleteItem');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(validators.itemRemove).toHaveBeenCalled();
    expect(ctrl.deleteItem).toHaveBeenCalled();
  });
});
