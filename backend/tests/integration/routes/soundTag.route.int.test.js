const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const soundTagRouter = require('../../../routes/soundTag.route');
const { attachErrorHandler } = require('../_helpers/app');
const User = require('../../../models/User');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const RoomTag = require('../../../models/RoomTag');
const SoundTag = require('../../../models/SoundTag');

describe('音タグAPI', () => {
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
    a.use('/soundtag', soundTagRouter);
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

  const createRoomTag = (owner, floor, room, order, overrides = {}) =>
    RoomTag.create({
      floor: floor._id,
      room: room._id,
      user: owner._id,
      order,
      name: `Tag ${order}`,
      lang: 'ja',
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

  test('有効なルームタグを重複させず登録・取得・更新できる', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    const token = buildToken(user);
    const tagA = await createRoomTag(user, floor, room, 1);
    const tagB = await createRoomTag(user, floor, room, 2);

    const createRes = await request(app)
      .post('/soundtag/create')
      .set('Authorization', `Bearer ${token}`)
      .send({
        floor_id: floor._id.toString(),
        room_id: room._id.toString(),
        tags: [tagA._id.toString(), tagA._id.toString()],
      });
    expect(createRes.status).toBe(200);
    expect(createRes.body).toHaveProperty('_id');
    expect(createRes.body.tags).toEqual([tagA._id.toString()]);

    const upsertRes = await request(app)
      .post('/soundtag/create')
      .set('Authorization', `Bearer ${token}`)
      .send({
        floor_id: floor._id.toString(),
        room_id: room._id.toString(),
        tags: [tagB._id.toString()],
      });
    expect(upsertRes.status).toBe(200);
    expect(upsertRes.body._id).toBe(createRes.body._id);
    expect(await SoundTag.countDocuments({ floor: floor._id, room: room._id, user: user._id })).toBe(1);

    const getRes = await request(app)
      .post('/soundtag')
      .set('Authorization', `Bearer ${token}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString() });
    expect(getRes.status).toBe(200);
    expect(getRes.body._id).toBe(createRes.body._id);
    expect(getRes.body.tags).toEqual([tagB._id.toString()]);

    const updateRes = await request(app)
      .post('/soundtag/update')
      .set('Authorization', `Bearer ${token}`)
      .send({ _id: createRes.body._id, tags: [tagA._id.toString(), tagB._id.toString()] });
    expect(updateRes.status).toBe(200);

    const updated = await SoundTag.findById(createRes.body._id);
    expect(updated.tags.map(String)).toEqual([tagA._id.toString(), tagB._id.toString()]);
  });

  test('フロアが一致しない場合やルームタグが不正な場合は設定を作らず拒否する', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const otherFloor = await createFloor(user, { title: 'Other Floor' });
    const room = await createRoom(user, floor);
    const otherRoom = await createRoom(user, floor, { title: 'Other Room' });
    const validTag = await createRoomTag(user, floor, room, 1);
    const otherRoomTag = await createRoomTag(user, floor, otherRoom, 1);
    const deletedTag = await createRoomTag(user, floor, room, 2, { delete_flg: true });
    const token = buildToken(user);

    const mismatchRes = await request(app)
      .post('/soundtag/create')
      .set('Authorization', `Bearer ${token}`)
      .send({
        floor_id: otherFloor._id.toString(),
        room_id: room._id.toString(),
        tags: [validTag._id.toString()],
      });
    expect(mismatchRes.status).toBe(400);

    const otherRoomTagRes = await request(app)
      .post('/soundtag/create')
      .set('Authorization', `Bearer ${token}`)
      .send({
        floor_id: floor._id.toString(),
        room_id: room._id.toString(),
        tags: [otherRoomTag._id.toString()],
      });
    expect(otherRoomTagRes.status).toBe(400);

    const deletedTagRes = await request(app)
      .post('/soundtag/create')
      .set('Authorization', `Bearer ${token}`)
      .send({
        floor_id: floor._id.toString(),
        room_id: room._id.toString(),
        tags: [deletedTag._id.toString()],
      });
    expect(deletedTagRes.status).toBe(400);
    expect(await SoundTag.countDocuments({ user: user._id })).toBe(0);
  });

  test('無効なユーザやメンバー限定ルームの権限がないユーザを拒否する', async () => {
    const owner = await createUser({ role: 'Editor' });
    const outsider = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor, { member_only: true });
    const tag = await createRoomTag(owner, floor, room, 1);

    const forbiddenRes = await request(app)
      .post('/soundtag/create')
      .set('Authorization', `Bearer ${buildToken(outsider)}`)
      .send({
        floor_id: floor._id.toString(),
        room_id: room._id.toString(),
        tags: [tag._id.toString()],
      });
    expect(forbiddenRes.status).toBe(401);

    const inactiveToken = buildToken(owner);
    await User.updateOne({ _id: owner._id }, { $set: { delete_flg: true } });
    const inactiveRes = await request(app)
      .post('/soundtag/create')
      .set('Authorization', `Bearer ${inactiveToken}`)
      .send({
        floor_id: floor._id.toString(),
        room_id: room._id.toString(),
        tags: [tag._id.toString()],
      });
    expect(inactiveRes.status).toBe(401);
    expect(inactiveRes.body?.error?.code).toBe('TOKEN_INVALID');
  });

  test('本人以外の音タグ更新を拒否する', async () => {
    const owner = await createUser({ role: 'Author' });
    const outsider = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);
    const tag = await SoundTag.create({
      floor: floor._id,
      room: room._id,
      user: owner._id,
      tags: [],
    });

    const res = await request(app)
      .post('/soundtag/update')
      .set('Authorization', `Bearer ${buildToken(outsider)}`)
      .send({ _id: tag._id.toString(), tags: [] });
    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('INVALID_PERMISSION');
  });

  test('同じフロア・ルーム・ユーザの音タグ設定の重複を一意索引で拒否する', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    await SoundTag.init();
    await SoundTag.create({ floor: floor._id, room: room._id, user: user._id, tags: [] });

    await expect(
      SoundTag.create({ floor: floor._id, room: room._id, user: user._id, tags: [] })
    ).rejects.toMatchObject({ code: 11000 });
  });
});
