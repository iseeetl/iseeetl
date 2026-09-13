const request = require('supertest');
const mongoose = require('mongoose');

const floorQuickTextRouter = require('../../../routes/floor/floorQuickText.route');
const FloorQuickTextGroup = require('../../../models/FloorQuickTextGroup');
const FloorQuickTextItem = require('../../../models/FloorQuickTextItem');
const { buildErrorHandledApp } = require('../_helpers/app');
const {
  snapshotEnv,
  restoreEnv,
  ensureEnvValue,
  createUserToken: buildToken,
} = require('../_helpers/auth');
const { createUser, createFloor: createFloorFixture } = require('../_helpers/models');

describe('フロアの単語API', () => {
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
      mounts: [{ path: '/', handler: floorQuickTextRouter }],
    });
  });

  test('フロア作成者は単語グループと単語を管理できる', async () => {
    const owner = await createUser({ role: 'Editor' });
    const floor = await createFloor(owner);
    const token = buildToken(owner);

    const groupRes = await request(app)
      .post(`/floors/${floor._id}/quick-text/groups`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Group A', lang: 'ja' });
    expect(groupRes.status).toBe(200);

    const listRes = await request(app)
      .get(`/floors/${floor._id}/quick-text/groups`)
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(1);

    const itemRes = await request(app)
      .post(`/floors/${floor._id}/quick-text/groups/${groupRes.body._id}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Item A', lang: 'ja' });
    expect(itemRes.status).toBe(200);

    const itemListRes = await request(app)
      .get(`/floors/${floor._id}/quick-text/groups/${groupRes.body._id}/items`)
      .set('Authorization', `Bearer ${token}`);
    expect(itemListRes.status).toBe(200);
    expect(itemListRes.body.length).toBe(1);

    const groupUpdateRes = await request(app)
      .patch(`/floors/${floor._id}/quick-text/groups/${groupRes.body._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Group B' });
    expect(groupUpdateRes.status).toBe(200);
    expect(groupUpdateRes.body.title).toBe('Group B');

    const itemUpdateRes = await request(app)
      .patch(`/floors/${floor._id}/quick-text/items/${itemRes.body._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Item B' });
    expect(itemUpdateRes.status).toBe(200);
    expect(itemUpdateRes.body.label).toBe('Item B');

    const itemDeleteRes = await request(app)
      .delete(`/floors/${floor._id}/quick-text/items/${itemRes.body._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(itemDeleteRes.status).toBe(200);
    expect(itemDeleteRes.body.ok).toBe(true);

    const groupDeleteRes = await request(app)
      .delete(`/floors/${floor._id}/quick-text/groups/${groupRes.body._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(groupDeleteRes.status).toBe(200);
    expect(groupDeleteRes.body.ok).toBe(true);
  });

  test('グループを削除しても別のフロアの単語を削除しない', async () => {
    const owner = await createUser({ role: 'Editor' });
    const floor = await createFloor(owner);
    const otherFloor = await createFloor(owner, { title: 'Other Floor' });
    const token = buildToken(owner);

    const [groupA, groupB, otherFloorGroup] = await FloorQuickTextGroup.create([
      { floor: floor._id, user: owner._id, order: 1, title: 'Group A', lang: 'ja' },
      { floor: floor._id, user: owner._id, order: 2, title: 'Group B', lang: 'ja' },
      { floor: otherFloor._id, user: owner._id, order: 1, title: 'Other Floor Group', lang: 'ja' },
    ]);
    const [itemA, itemB, otherFloorItem] = await FloorQuickTextItem.create([
      { floor: floor._id, group: groupA._id, order: 1, label: 'Item A', lang: 'ja' },
      { floor: floor._id, group: groupB._id, order: 1, label: 'Item B', lang: 'ja' },
      {
        floor: otherFloor._id,
        group: otherFloorGroup._id,
        order: 1,
        label: 'Other Floor Item',
        lang: 'ja',
      },
    ]);

    const deleteRes = await request(app)
      .delete(`/floors/${floor._id}/quick-text/groups/${groupA._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.status).toBe(200);
    expect(await FloorQuickTextGroup.exists({ _id: groupA._id })).toBeNull();
    expect(await FloorQuickTextItem.exists({ _id: itemA._id })).toBeNull();
    expect(await FloorQuickTextGroup.exists({ _id: groupB._id })).not.toBeNull();
    expect(await FloorQuickTextItem.exists({ _id: itemB._id })).not.toBeNull();
    expect(await FloorQuickTextGroup.exists({ _id: otherFloorGroup._id })).not.toBeNull();
    expect(await FloorQuickTextItem.exists({ _id: otherFloorItem._id })).not.toBeNull();

    const wrongFloorRes = await request(app)
      .delete(`/floors/${floor._id}/quick-text/groups/${otherFloorGroup._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(wrongFloorRes.status).toBe(404);
    expect(await FloorQuickTextItem.exists({ _id: itemB._id })).not.toBeNull();
    expect(await FloorQuickTextItem.exists({ _id: otherFloorItem._id })).not.toBeNull();

    const missingGroupRes = await request(app)
      .delete(`/floors/${floor._id}/quick-text/groups/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', `Bearer ${token}`);

    expect(missingGroupRes.status).toBe(404);
    expect(await FloorQuickTextItem.exists({ _id: itemB._id })).not.toBeNull();
  });

  test('無関係のユーザの操作を拒否する', async () => {
    const owner = await createUser({ role: 'Editor' });
    const outsider = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);

    const res = await request(app)
      .get(`/floors/${floor._id}/quick-text/groups`)
      .set('Authorization', `Bearer ${buildToken(outsider)}`);

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });
});
