const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const roleRouter = require('../../../routes/timeline/role.route');
const { attachErrorHandler } = require('../_helpers/app');
const User = require('../../../models/User');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const FloorMember = require('../../../models/FloorMember');
const RoomMember = require('../../../models/RoomMember');

describe('タイムラインの有効ロール取得API', () => {
  let app;

  const ORIGINAL_ENV = {
    JWT_SECRET: process.env.JWT_SECRET,
  };

  const ensureEnv = () => {
    if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';
  };

  const restoreEnv = () => {
    if (ORIGINAL_ENV.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_ENV.JWT_SECRET;
  };

  const buildToken = (user) =>
    jwt.sign({ user_id: user._id.toString(), user_role: user.role }, process.env.JWT_SECRET);

  const buildApp = () => {
    const a = express();
    a.use(express.json());
    a.use('/timeline', roleRouter({}));
    return attachErrorHandler(a);
  };

  const createUser = (overrides = {}) =>
    User.create({
      username: `user-${Date.now()}-${Math.random()}`,
      mail: `user-${Date.now()}-${Math.random()}@example.com`,
      lang: 'ja',
      ...overrides,
    });

  const createFloor = (owner, overrides = {}) =>
    Floor.create({
      user: owner._id,
      title: 'Floor',
      lang: 'ja',
      target_langs: [],
      ...overrides,
    });

  const createRoom = (owner, floor, overrides = {}) =>
    Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Room',
      lang: 'ja',
      member_only: false,
      ...overrides,
    });

  beforeAll(() => {
    ensureEnv();
  });

  afterAll(() => {
    restoreEnv();
  });

  beforeEach(() => {
    app = buildApp();
  });

  test('管理者にはAdministratorを返す', async () => {
    const admin = await createUser({ role: 'Administrator' });
    const floor = await createFloor(admin);
    const room = await createRoom(admin, floor);

    const res = await request(app)
      .post('/timeline/role')
      .set('Authorization', `Bearer ${buildToken(admin)}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('Administrator');
  });

  test('フロア作成者にはFloorEditorを返す', async () => {
    const owner = await createUser({ role: 'Editor' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);

    const res = await request(app)
      .post('/timeline/role')
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('FloorEditor');
  });

  test('フロアメンバーにはFloorMemberを返す', async () => {
    const owner = await createUser({ role: 'Editor' });
    const member = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);
    await FloorMember.create({ floor: floor._id, user: member._id });

    const res = await request(app)
      .post('/timeline/role')
      .set('Authorization', `Bearer ${buildToken(member)}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('FloorMember');
  });

  test('ルームメンバーにはRoomMemberを返す', async () => {
    const owner = await createUser({ role: 'Editor' });
    const member = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);
    await RoomMember.create({ floor: floor._id, room: room._id, user: member._id });

    const res = await request(app)
      .post('/timeline/role')
      .set('Authorization', `Bearer ${buildToken(member)}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('RoomMember');
  });

  test('メンバー以外の一般ユーザにはAuthorを返す', async () => {
    const owner = await createUser({ role: 'Editor' });
    const author = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);

    const res = await request(app)
      .post('/timeline/role')
      .set('Authorization', `Bearer ${buildToken(author)}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('Author');
  });
});
