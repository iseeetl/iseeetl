const request = require('supertest');
const mongoose = require('mongoose');
const { buildErrorHandledApp } = require('../_helpers/app');
const { snapshotEnv, restoreEnv, ensureEnvValue, createUserToken } = require('../_helpers/auth');
const { createUser, createFloor, createRoom } = require('../_helpers/models');

const pushFilterRouter = require('../../../routes/timeline/pushFilter.route');
const PushFilter = require('../../../models/PushFilter');
const RoomMember = require('../../../models/RoomMember');

describe('プッシュ通知の絞り込み設定API', () => {
  let app;

  const ORIGINAL_ENV = snapshotEnv([
    'JWT_SECRET',
    'EXTERNAL_ONESIGNAL_ENABLED',
    'ONESIGNAL_APP_ID',
    'ONESIGNAL_REST_API_KEYS',
    'ONESIGNAL_EXTERNAL_ID_SECRET',
  ]);

  const enableOneSignal = () => {
    process.env.EXTERNAL_ONESIGNAL_ENABLED = 'true';
    process.env.ONESIGNAL_APP_ID = 'test-onesignal-app';
    process.env.ONESIGNAL_REST_API_KEYS = 'test-onesignal-rest-key';
    process.env.ONESIGNAL_EXTERNAL_ID_SECRET = 'test-onesignal-external-id-secret-32-bytes';
  };

  const buildConditions = (overrides = {}) => ({
    filterMode: 'include',
    showRange: 'all',
    keyword: null,
    keywordArray: [],
    logicalOperator: 'and',
    tags: [new mongoose.Types.ObjectId().toString()],
    tagSearchOperator: 'or',
    noTags: false,
    animation: false,
    displayOrder: [{ key: 'created_at', display: 'desc' }],
    userName: null,
    ...overrides,
  });

  beforeAll(() => {
    ensureEnvValue('JWT_SECRET', 'test-jwt-secret');
    enableOneSignal();
  });

  afterAll(() => {
    restoreEnv(ORIGINAL_ENV);
  });

  beforeEach(() => {
    enableOneSignal();
    app = buildErrorHandledApp({
      mounts: [{ path: '/timeline', handler: pushFilterRouter({}) }],
    });
  });

  test('プッシュ通知の絞り込み設定を作成・更新・削除できる', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    const token = createUserToken(user);

    const createRes = await request(app)
      .post('/timeline/pushfilter')
      .set('Authorization', `Bearer ${token}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString(), conditions: buildConditions() });

    expect(createRes.status).toBe(200);
    expect(createRes.body).toHaveProperty('_id');

    const updateRes = await request(app)
      .put(`/timeline/pushfilter/${createRes.body._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ conditions: buildConditions({ userName: 'Alice' }) });

    expect(updateRes.status).toBe(200);
    const updated = await PushFilter.findById(createRes.body._id);
    expect(updated.conditions.userName).toBe('Alice');

    const deleteRes = await request(app)
      .delete(`/timeline/pushfilter/${createRes.body._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.ok).toBe(true);
    const removed = await PushFilter.findById(createRes.body._id);
    expect(removed).toBeNull();
  });

  test('条件が重複した場合はCONFLICTを返す', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    const token = createUserToken(user);
    const conditions = buildConditions({ userName: 'Dup' });

    const first = await request(app)
      .post('/timeline/pushfilter')
      .set('Authorization', `Bearer ${token}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString(), conditions });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/timeline/pushfilter')
      .set('Authorization', `Bearer ${token}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString(), conditions });

    expect(second.status).toBe(409);
    expect(second.body?.error?.code).toBe('CONFLICT');
  });

  test('作成時に不正な条件を拒否する', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    const token = createUserToken(user);

    const res = await request(app)
      .post('/timeline/pushfilter')
      .set('Authorization', `Bearer ${token}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString(), conditions: { animation: 'bad' } });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('本人以外の更新を拒否する', async () => {
    const owner = await createUser({ role: 'Author' });
    const outsider = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);
    const filter = await PushFilter.create({
      user: owner._id,
      floor: floor._id,
      room: room._id,
      conditions: buildConditions(),
    });

    const res = await request(app)
      .put(`/timeline/pushfilter/${filter._id}`)
      .set('Authorization', `Bearer ${createUserToken(outsider)}`)
      .send({ conditions: buildConditions({ userName: 'Bob' }) });

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('INVALID_PERMISSION');
  });

  test('更新対象がなければNOT_FOUNDを返す', async () => {
    const owner = await createUser({ role: 'Author' });
    const res = await request(app)
      .put(`/timeline/pushfilter/${new mongoose.Types.ObjectId().toString()}`)
      .set('Authorization', `Bearer ${createUserToken(owner)}`)
      .send({ conditions: buildConditions({ userName: 'Alice' }) });

    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe('NOT_FOUND');
  });

  test('更新時に不正なIDを拒否する', async () => {
    const owner = await createUser({ role: 'Author' });
    const res = await request(app)
      .put('/timeline/pushfilter/invalid-id')
      .set('Authorization', `Bearer ${createUserToken(owner)}`)
      .send({ conditions: buildConditions({ userName: 'Alice' }) });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('更新時に不正な条件を拒否する', async () => {
    const owner = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);
    const filter = await PushFilter.create({
      user: owner._id,
      floor: floor._id,
      room: room._id,
      conditions: buildConditions(),
    });

    const res = await request(app)
      .put(`/timeline/pushfilter/${filter._id}`)
      .set('Authorization', `Bearer ${createUserToken(owner)}`)
      .send({ conditions: { animation: 'bad' } });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('メンバー限定ルームへの権限が失効しても本人の通知設定は削除できる', async () => {
    const floorOwner = await createUser({ role: 'Editor' });
    const filterOwner = await createUser({ role: 'Author' });
    const floor = await createFloor(floorOwner);
    const room = await createRoom(floorOwner, floor, { member_only: true });
    const membership = await RoomMember.create({
      floor: floor._id,
      room: room._id,
      user: filterOwner._id,
    });
    const filter = await PushFilter.create({
      user: filterOwner._id,
      floor: floor._id,
      room: room._id,
      conditions: buildConditions(),
    });
    await RoomMember.deleteOne({ _id: membership._id });

    const res = await request(app)
      .delete(`/timeline/pushfilter/${filter._id}`)
      .set('Authorization', `Bearer ${createUserToken(filterOwner)}`);

    expect(res.status).toBe(200);
    expect(await PushFilter.findById(filter._id)).toBeNull();
  });

  test('本人以外の削除を拒否する', async () => {
    const owner = await createUser({ role: 'Author' });
    const outsider = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);
    const filter = await PushFilter.create({
      user: owner._id,
      floor: floor._id,
      room: room._id,
      conditions: buildConditions(),
    });

    const res = await request(app)
      .delete(`/timeline/pushfilter/${filter._id}`)
      .set('Authorization', `Bearer ${createUserToken(outsider)}`);

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('INVALID_PERMISSION');
  });

  test('削除対象がなければNOT_FOUNDを返す', async () => {
    const owner = await createUser({ role: 'Author' });
    const res = await request(app)
      .delete(`/timeline/pushfilter/${new mongoose.Types.ObjectId().toString()}`)
      .set('Authorization', `Bearer ${createUserToken(owner)}`);

    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe('NOT_FOUND');
  });

  test('削除時に不正なIDを拒否する', async () => {
    const owner = await createUser({ role: 'Author' });
    const res = await request(app)
      .delete('/timeline/pushfilter/invalid-id')
      .set('Authorization', `Bearer ${createUserToken(owner)}`);

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });
});
