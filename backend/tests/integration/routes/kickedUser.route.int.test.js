const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const kickedUserRouter = require('../../../routes/kickedUser.route');
const { attachErrorHandler } = require('../_helpers/app');
const User = require('../../../models/User');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const KickedUser = require('../../../models/KickedUser');

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

  test('フロア作成者以外はキックを登録できない', async () => {
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
});
