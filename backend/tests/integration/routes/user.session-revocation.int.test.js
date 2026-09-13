const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const User = require('../../../models/User');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const authRouter = require('../../../routes/auth.route');
const router = require('../../../routes/user.route');
const {
  ROOM_ACCESS_REVOKED_EVENT,
  USER_ROLE_UPDATED_EVENT,
  USER_SESSION_REVOKED_EVENT,
} = require('../../../socket/accessControl');
const { buildUserAccessRoom } = require('../../../socket/accessRooms');
const { attachErrorHandler } = require('../_helpers/app');

describe('ユーザのセッション失効API', () => {
  const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
  const SECRET = ORIGINAL_JWT_SECRET || 'user-session-revocation-test-secret';

  const buildToken = (payload) => jwt.sign(payload, SECRET);
  const buildApp = (io) => {
    const app = express();
    app.use(express.json());
    app.use('/auth', authRouter);
    app.use('/user', (req, _res, next) => {
      req.io = io;
      next();
    });
    app.use('/user', router);
    return attachErrorHandler(app);
  };

  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
  });

  afterAll(() => {
    if (ORIGINAL_JWT_SECRET === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
    }
  });

  test('論理削除は既存Socketと旧JWTを失効させ、復元後も旧JWTを再有効化しない', async () => {
    const admin = await User.create({
      username: 'SessionDeleteAdmin',
      mail: 'session-delete-admin@example.com',
      lang: 'ja',
      role: 'Administrator',
    });
    const target = await User.create({
      username: 'SessionDeleteTarget',
      mail: 'session-delete-target@example.com',
      lang: 'ja',
      role: 'Author',
      session_version: 2,
    });
    const adminToken = buildToken({
      user_id: admin._id.toString(),
      user_role: 'Administrator',
      session_version: 0,
    });
    const oldTargetToken = buildToken({
      user_id: target._id.toString(),
      user_role: 'Author',
      session_version: 2,
    });
    const socketScope = {
      emit: jest.fn(),
      disconnectSockets: jest.fn(),
      fetchSockets: jest.fn().mockResolvedValue([]),
    };
    const io = { in: jest.fn(() => socketScope) };
    const app = buildApp(io);
    const payload = {
      _id: target._id.toString(),
      username: target.username,
      mail: target.mail,
      role: target.role,
    };

    const passwordRes = await request(app)
      .post('/user/management/update')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...payload, password: 'NewPassw0rd', delete_flg: false });

    expect(passwordRes.status).toBe(200);
    expect((await User.findById(target._id)).session_version).toBe(3);
    expect(socketScope.disconnectSockets).toHaveBeenCalledWith(true);
    socketScope.emit.mockClear();
    socketScope.disconnectSockets.mockClear();

    const deleteRes = await request(app)
      .post('/user/management/delete-state')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ _id: target._id.toString(), delete_flg: true });

    expect(deleteRes.status).toBe(200);
    const deletedTarget = await User.findById(target._id);
    expect(deletedTarget.delete_flg).toBe(true);
    expect(deletedTarget.session_version).toBe(4);
    expect(io.in).toHaveBeenCalledWith(buildUserAccessRoom(target._id));
    expect(socketScope.emit).toHaveBeenCalledWith(USER_SESSION_REVOKED_EVENT);
    expect(socketScope.disconnectSockets).toHaveBeenCalledWith(true);

    const repeatedDeleteRes = await request(app)
      .post('/user/management/delete-state')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ _id: target._id.toString(), delete_flg: true });

    expect(repeatedDeleteRes.status).toBe(200);
    const repeatedlyDeletedTarget = await User.findById(target._id);
    expect(repeatedlyDeletedTarget.session_version).toBe(4);
    expect(socketScope.disconnectSockets).toHaveBeenCalledTimes(2);

    const deletedSessionRes = await request(app)
      .get('/user/detail')
      .set('Authorization', `Bearer ${oldTargetToken}`);
    expect(deletedSessionRes.status).toBe(401);

    const restoreRes = await request(app)
      .post('/user/management/delete-state')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ _id: target._id.toString(), delete_flg: false });

    expect(restoreRes.status).toBe(200);
    const restoredTarget = await User.findById(target._id);
    expect(restoredTarget.delete_flg).toBe(false);
    expect(restoredTarget.session_version).toBe(4);
    expect(socketScope.disconnectSockets).toHaveBeenCalledTimes(2);

    const restoredOldSessionRes = await request(app)
      .get('/user/detail')
      .set('Authorization', `Bearer ${oldTargetToken}`);
    expect(restoredOldSessionRes.status).toBe(401);

    const loginRes = await request(app).post('/auth/login').send({
      mail: target.mail,
      password: 'NewPassw0rd',
    });
    expect(loginRes.status).toBe(200);
    const freshTargetToken = loginRes.body.token;
    expect(jwt.verify(freshTargetToken, SECRET).session_version).toBe(4);

    const freshSessionRes = await request(app)
      .get('/user/detail')
      .set('Authorization', `Bearer ${freshTargetToken}`);
    expect(freshSessionRes.status).toBe(200);
  });

  test.each(['通知', '切断'])('%s失敗後も同状態の削除を再試行でき、DBのセッション世代を重ねて進めない', async (stage) => {
    const admin = await User.create({
      username: 'SessionEmitFailureAdmin',
      mail: 'session-emit-failure-admin@example.com',
      lang: 'ja',
      role: 'Administrator',
    });
    const target = await User.create({
      username: 'SessionEmitFailureTarget',
      mail: 'session-emit-failure-target@example.com',
      lang: 'ja',
      role: 'Author',
      session_version: 5,
    });
    const socketScope = {
      emit: jest.fn((event) => {
        if (stage === '通知' && event === USER_SESSION_REVOKED_EVENT) throw new Error('emit failed');
      }),
      disconnectSockets: jest.fn(),
      fetchSockets: jest.fn().mockResolvedValue([]),
    };
    if (stage === '切断') socketScope.disconnectSockets.mockRejectedValueOnce(new Error('disconnect failed'));
    const app = buildApp({ in: jest.fn(() => socketScope) });
    const token = buildToken({
      user_id: admin._id.toString(),
      user_role: 'Administrator',
      session_version: 0,
    });
    const deleteTarget = () =>
      request(app)
        .post('/user/management/delete-state')
        .set('Authorization', `Bearer ${token}`)
        .send({ _id: target._id.toString(), delete_flg: true });

    const first = await deleteTarget();
    const retry = await deleteTarget();

    expect(first.status).toBe(stage === '切断' ? 500 : 200);
    expect(retry.status).toBe(200);
    expect(socketScope.disconnectSockets).toHaveBeenCalledTimes(2);
    expect(socketScope.disconnectSockets).toHaveBeenNthCalledWith(1, true);
    expect(socketScope.disconnectSockets).toHaveBeenNthCalledWith(2, true);
    expect((await User.findById(target._id)).session_version).toBe(6);
  });

  test('ロール降格は限定ルームの既存Socketだけを切断し、公開ルームと旧JWTを維持する', async () => {
    const admin = await User.create({
      username: 'RoleDowngradeAdmin',
      mail: 'role-downgrade-admin@example.com',
      lang: 'ja',
      role: 'Administrator',
    });
    const target = await User.create({
      username: 'RoleDowngradeTarget',
      mail: 'role-downgrade-target@example.com',
      lang: 'ja',
      role: 'Editor',
    });
    const floor = await Floor.create({
      user: target._id,
      title: 'Role downgrade floor',
      description: 'desc',
      lang: 'ja',
      target_langs: [],
    });
    const privateRoom = await Room.create({
      user: target._id,
      floor: floor._id,
      title: 'Role downgrade private room',
      description: 'desc',
      lang: 'ja',
      member_only: true,
    });
    const publicRoom = await Room.create({
      user: target._id,
      floor: floor._id,
      title: 'Role downgrade public room',
      description: 'desc',
      lang: 'ja',
      member_only: false,
    });
    const adminToken = buildToken({
      user_id: admin._id.toString(),
      user_role: 'Administrator',
      session_version: 0,
    });
    const oldTargetToken = buildToken({
      user_id: target._id.toString(),
      user_role: 'Editor',
      session_version: 0,
    });
    const buildSocket = (roomId) => ({
      data: { accessContext: { room_id: roomId.toString() } },
      emit: jest.fn(),
      disconnect: jest.fn(),
    });
    const privateSocket = buildSocket(privateRoom._id);
    const publicSocket = buildSocket(publicRoom._id);
    const socketScope = {
      fetchSockets: jest.fn().mockResolvedValue([privateSocket, publicSocket]),
      emit: jest.fn(),
      disconnectSockets: jest.fn(),
    };
    const io = { in: jest.fn(() => socketScope) };
    const app = buildApp(io);

    const updateRes = await request(app)
      .post('/user/management/update')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({
        _id: target._id.toString(),
        username: target.username,
        mail: target.mail,
        role: 'Author',
        delete_flg: false,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.role).toBe('Author');
    const updatedTarget = await User.findById(target._id);
    expect(updatedTarget.role).toBe('Author');
    expect(updatedTarget.session_version).toBe(0);
    expect(io.in).toHaveBeenCalledWith(buildUserAccessRoom(target._id));
    expect(socketScope.emit).toHaveBeenCalledWith(USER_ROLE_UPDATED_EVENT, { role: 'Author' });
    expect(privateSocket.emit).toHaveBeenCalledWith(ROOM_ACCESS_REVOKED_EVENT);
    expect(privateSocket.disconnect).toHaveBeenCalledWith(true);
    expect(publicSocket.emit).not.toHaveBeenCalled();
    expect(publicSocket.disconnect).not.toHaveBeenCalled();

    const oldSessionRes = await request(app)
      .get('/user/detail')
      .set('Authorization', 'Bearer ' + oldTargetToken);
    expect(oldSessionRes.status).toBe(200);
  });
});
