const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const kickedUserRouter = require('../../../routes/kickedUser.route');
const { attachErrorHandler } = require('../_helpers/app');
const User = require('../../../models/User');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const KickedUser = require('../../../models/KickedUser');
const FloorMember = require('../../../models/FloorMember');

describe('キック管理API', () => {
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

  const buildApp = ({ io }) => {
    const a = express();
    a.use(express.json());
    a.use('/kickedUser', kickedUserRouter(io));
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

  test.each(['正常', '通知失敗'])('フロア作成者は%sでもキックを保存・切断し、一覧・確認・解除ができる', async (stage) => {
    const owner = await createUser({ role: 'Editor' });
    const target = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);

    const emit = jest.fn();
    if (stage === '通知失敗') emit.mockRejectedValue(new Error('emit failed'));
    const disconnectSockets = jest.fn();
    const io = {
      to: jest.fn(() => ({ emit })),
      in: jest.fn(() => ({ disconnectSockets })),
    };

    const app = buildApp({ io });

    const createRes = await request(app)
      .post('/kickedUser/create')
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .send({ user_id: target._id.toString(), room_id: room._id.toString() });
    expect(createRes.status).toBe(200);

    expect(io.to).toHaveBeenCalledWith(`__access__:floor-user:${floor._id}:${target._id}`);
    expect(emit).toHaveBeenCalledWith('KICKED_USER');
    expect(io.in).toHaveBeenCalledWith(`__access__:floor-user:${floor._id}:${target._id}`);
    expect(disconnectSockets).toHaveBeenCalledWith(true);

    const listRes = await request(app)
      .post('/kickedUser')
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .send({ floor_id: floor._id.toString() });
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(1);

    const checkRes = await request(app)
      .post('/kickedUser/check')
      .set('Authorization', `Bearer ${buildToken(target)}`)
      .send({ room_id: room._id.toString() });
    expect(checkRes.status).toBe(200);
    expect(checkRes.body).toBe(true);

    const deleteRes = await request(app)
      .post('/kickedUser/delete')
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .send({ user_id: target._id.toString(), floor_id: floor._id.toString() });
    expect(deleteRes.status).toBe(200);
    const remaining = await KickedUser.findOne({ user: target._id });
    expect(remaining).toBeNull();
  });

  test('未所属の一般ユーザはキックを登録できない', async () => {
    const owner = await createUser({ role: 'Editor' });
    const outsider = await createUser({ role: 'Author' });
    const target = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);

    const app = buildApp({ io: { to: jest.fn(() => ({ emit: jest.fn() })) } });

    const res = await request(app)
      .post('/kickedUser/create')
      .set('Authorization', `Bearer ${buildToken(outsider)}`)
      .send({ user_id: target._id.toString(), room_id: room._id.toString() });
    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('INVALID_PERMISSION');
  });

  test('トークン発行後に権限を下げられた作成者はキックの一覧・登録・解除ができない', async () => {
    const owner = await createUser({ role: 'Editor' });
    const kickedTarget = await createUser({ role: 'Author' });
    const newTarget = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);
    const ownerToken = buildToken(owner);

    const io = {
      to: jest.fn(() => ({ emit: jest.fn() })),
      in: jest.fn(() => ({ disconnectSockets: jest.fn() })),
    };
    const app = buildApp({ io });

    const setupRes = await request(app)
      .post('/kickedUser/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ user_id: kickedTarget._id.toString(), room_id: room._id.toString() });
    expect(setupRes.status).toBe(200);

    await User.updateOne({ _id: owner._id }, { $set: { role: 'Author' } });

    const listRes = await request(app)
      .post('/kickedUser')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ floor_id: floor._id.toString() });
    expect(listRes.status).toBe(401);
    expect(listRes.body?.error?.code).toBe('INVALID_PERMISSION');

    const createRes = await request(app)
      .post('/kickedUser/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ user_id: newTarget._id.toString(), room_id: room._id.toString() });
    expect(createRes.status).toBe(401);
    expect(createRes.body?.error?.code).toBe('INVALID_PERMISSION');

    const deleteRes = await request(app)
      .post('/kickedUser/delete')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ user_id: kickedTarget._id.toString(), floor_id: floor._id.toString() });
    expect(deleteRes.status).toBe(401);
    expect(deleteRes.body?.error?.code).toBe('INVALID_PERMISSION');

    await expect(KickedUser.findOne({ user: kickedTarget._id })).resolves.not.toBeNull();
    await expect(KickedUser.findOne({ user: newTarget._id })).resolves.toBeNull();
  });
  test.each(['Administrator', 'Editor', 'FloorMember'])('%sでもフロア編集者とフロアメンバーをキックできず、理由を区別する', async (actorRole) => {
    const owner = await createUser({ role: 'Editor' });
    const member = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);
    await FloorMember.create({ floor: floor._id, user: member._id });
    const actor = actorRole === 'Editor' ? owner : await createUser({ role: actorRole === 'Administrator' ? 'Administrator' : 'Author' });
    if (actorRole === 'FloorMember') await FloorMember.create({ floor: floor._id, user: actor._id });
    const emit = jest.fn();
    const disconnectSockets = jest.fn();
    const app = buildApp({ io: { to: jest.fn(() => ({ emit })), in: jest.fn(() => ({ disconnectSockets })) } });
    for (const [target, code, message] of [
      [owner, 'CANT_KICK_FLOOR_EDITOR', 'フロア編集者はキックできません。'],
      [member, 'CANT_KICK_FLOOR_MEMBER', 'フロアメンバーはキックできません。'],
    ]) {
      const response = await request(app).post('/kickedUser/create')
        .set('Authorization', `Bearer ${buildToken(actor)}`)
        .send({ user_id: String(target._id), room_id: String(room._id) });
      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({ code, message });
    }
    expect(await KickedUser.countDocuments({})).toBe(0);
    expect(emit).not.toHaveBeenCalled();
    expect(disconnectSockets).not.toHaveBeenCalled();
  });

  test('フロアメンバーは通常ユーザをキック・一覧取得・解除できるが、他フロアでは操作できない', async () => {
    const owner = await createUser({ role: 'Editor' });
    const member = await createUser({ role: 'Author' });
    const target = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const otherFloor = await createFloor(owner);
    const room = await createRoom(owner, floor);
    const otherRoom = await createRoom(owner, otherFloor);
    await FloorMember.create({ floor: floor._id, user: member._id });
    await FloorMember.create({ floor: otherFloor._id, user: target._id });
    const app = buildApp({ io: undefined });
    const auth = { Authorization: `Bearer ${buildToken(member)}` };
    expect((await request(app).post('/kickedUser/create').set(auth)
      .send({ user_id: String(target._id), room_id: String(otherRoom._id) })).status).toBe(401);
    expect((await request(app).post('/kickedUser/create').set(auth)
      .send({ user_id: String(target._id), room_id: String(room._id) })).status).toBe(200);
    const list = await request(app).post('/kickedUser').set(auth).send({ floor_id: String(floor._id) });
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect((await request(app).post('/kickedUser/delete').set(auth)
      .send({ user_id: String(target._id), floor_id: String(floor._id) })).status).toBe(200);
    expect(await KickedUser.countDocuments({})).toBe(0);
  });

  test('既存のキック記録があるメンバーは自分で解除できず、管理者の解除後に管理権限が戻る', async () => {
    const owner = await createUser({ role: 'Editor' });
    const member = await createUser({ role: 'Author' });
    const admin = await createUser({ role: 'Administrator' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);
    await FloorMember.create({ floor: floor._id, user: member._id });
    await KickedUser.create({ floor: floor._id, room: room._id, user: member._id, kicked_by: owner._id });
    const app = buildApp({ io: undefined });
    const body = { floor_id: String(floor._id), user_id: String(member._id) };
    const auth = { Authorization: `Bearer ${buildToken(member)}` };
    const denied = await request(app).post('/kickedUser/delete').set(auth).send(body);
    expect(denied.status).toBe(401);
    expect(denied.body.error.code).toBe('INVALID_PERMISSION');
    expect(await KickedUser.countDocuments({ user: member._id })).toBe(1);
    expect((await request(app).post('/kickedUser/delete')
      .set('Authorization', `Bearer ${buildToken(admin)}`).send(body)).status).toBe(200);
    const list = await request(app).post('/kickedUser').set(auth).send({ floor_id: String(floor._id) });
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
    expect(await FloorMember.countDocuments({ floor: floor._id, user: member._id })).toBe(1);
  });

});
