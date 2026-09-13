const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const ORIGINAL_ENV = {
  JWT_SECRET: process.env.JWT_SECRET,
};

if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';

const floorRouterFactory = require('../../../routes/floor');
const roomRouterFactory = require('../../../routes/room');
const { attachErrorHandler } = require('../_helpers/app');
const User = require('../../../models/User');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const FloorMember = require('../../../models/FloorMember');
const RoomMember = require('../../../models/RoomMember');
const { buildFloorUserAccessRoom } = require('../../../socket/accessRooms');
const { ROOM_ACCESS_REVOKED_EVENT } = require('../../../socket/accessControl');

const buildApp = (io) => {
  const app = express();
  app.use(express.json());
  app.use('/floor', floorRouterFactory(io));
  app.use('/room', roomRouterFactory(io));
  return attachErrorHandler(app);
};

const buildToken = (user) => jwt.sign({ user_id: user._id.toString(), user_role: user.role }, process.env.JWT_SECRET);

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
    title: 'Test Floor',
    description: 'desc',
    lang: 'ja',
    target_langs: [],
    ...overrides,
  });

const createRoom = (owner, floor, overrides = {}) =>
  Room.create({
    user: owner._id,
    floor: floor._id,
    title: 'Test Room',
    description: 'desc',
    lang: 'ja',
    ...overrides,
  });

const validToken = 'a'.repeat(48);
const { createTestIndexes } = require('../../_helpers/createTestIndexes');
beforeAll(async () => {
  await createTestIndexes();
});

describe('フロア・ルームメンバーAPI', () => {
  let app, io, socketScopes;

  afterAll(() => {
    if (ORIGINAL_ENV.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_ENV.JWT_SECRET;
  });

  beforeEach(() => {
    socketScopes = new Map();
    io = {
      in: jest.fn((accessRoom) => {
        if (!socketScopes.has(accessRoom)) {
          socketScopes.set(accessRoom, {
            fetchSockets: jest.fn().mockResolvedValue([]),
            emit: jest.fn(),
            disconnectSockets: jest.fn(),
          });
        }
        return socketScopes.get(accessRoom);
      }),
    };
    app = buildApp(io);
  });

  const registerSockets = (floorId, userId, sockets) => {
    const accessRoom = buildFloorUserAccessRoom(floorId, userId);
    const scope = {
      fetchSockets: jest.fn().mockResolvedValue(sockets),
      emit: jest.fn(),
      disconnectSockets: jest.fn(),
    };
    socketScopes.set(accessRoom, scope);
    return scope;
  };

  const buildSocket = (roomId) => ({
    data: { accessContext: { room_id: roomId.toString() } },
    emit: jest.fn(),
    disconnect: jest.fn(),
  });

  test('フロアメンバーの招待・参加・脱退・削除ができる', async () => {
    const owner = await createUser({ role: 'Editor' });
    const memberCandidate = await createUser({ role: 'Author' });
    const deleteCandidate = await createUser({ role: 'Author' });

    const floor = await createFloor(owner, { title: 'Member Floor' });
    const privateRoom = await createRoom(owner, floor, { title: 'Member Room', member_only: true });

    const invite = await request(app)
      .post('/floor/floormember/invite')
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .send({ floor_id: floor._id.toString(), period: '8h' });
    expect(invite.status).toBe(200);
    expect(invite.body).toHaveProperty('token');

    const ownerJoin = await request(app)
      .post('/floor/floormember/create')
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .send({ floor_id: floor._id.toString(), invite_token: invite.body.token });
    expect(ownerJoin.status).toBe(400);
    expect(ownerJoin.body?.error?.code).toBe('DONT_NEED_FLOOR_MEMBER');

    const memberJoin = await request(app)
      .post('/floor/floormember/create')
      .set('Authorization', `Bearer ${buildToken(memberCandidate)}`)
      .send({ floor_id: floor._id.toString(), invite_token: invite.body.token });
    expect(memberJoin.status).toBe(200);
    expect(memberJoin.body).toHaveProperty('_id');

    const list = await request(app)
      .post('/floor/floormember')
      .set('Authorization', `Bearer ${buildToken(memberCandidate)}`)
      .send({ floor_id: floor._id.toString() });
    expect(list.status).toBe(200);
    expect(list.body.some((row) => row.user?._id?.toString() === memberCandidate._id.toString())).toBe(true);

    const leavingSocket = buildSocket(privateRoom._id);
    registerSockets(floor._id, memberCandidate._id, [leavingSocket]);

    const leave = await request(app)
      .post('/floor/floormember/leave')
      .set('Authorization', `Bearer ${buildToken(memberCandidate)}`)
      .send({ floor_id: floor._id.toString() });
    expect(leave.status).toBe(200);
    expect(leavingSocket.emit).toHaveBeenCalledWith(ROOM_ACCESS_REVOKED_EVENT);
    expect(leavingSocket.disconnect).toHaveBeenCalledWith(true);

    const remaining = await FloorMember.find({ floor: floor._id, user: memberCandidate._id });
    expect(remaining.length).toBe(0);

    const secondInvite = await request(app)
      .post('/floor/floormember/invite')
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .send({ floor_id: floor._id.toString(), period: '8h' });
    expect(secondInvite.status).toBe(200);

    const deleteJoin = await request(app)
      .post('/floor/floormember/create')
      .set('Authorization', `Bearer ${buildToken(deleteCandidate)}`)
      .send({ floor_id: floor._id.toString(), invite_token: secondInvite.body.token });
    expect(deleteJoin.status).toBe(200);

    await RoomMember.create({ floor: floor._id, room: privateRoom._id, user: deleteCandidate._id });
    const retainedSocket = buildSocket(privateRoom._id);
    registerSockets(floor._id, deleteCandidate._id, [retainedSocket]);

    const deleted = await request(app)
      .post('/floor/floormember/delete')
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .send({ _id: deleteJoin.body._id, floor_id: floor._id.toString() });
    expect(deleted.status).toBe(200);
    expect(deleted.body._id.toString()).toBe(deleteJoin.body._id.toString());
    expect(retainedSocket.emit).not.toHaveBeenCalled();
    expect(retainedSocket.disconnect).not.toHaveBeenCalled();
  });

  test('無関係のユーザはフロアメンバー一覧を取得できない', async () => {
    const owner = await createUser({ role: 'Editor' });
    const outsider = await createUser({ role: 'Author' });
    const floor = await createFloor(owner, { title: 'Forbidden Floor' });

    const res = await request(app)
      .post('/floor/floormember')
      .set('Authorization', `Bearer ${buildToken(outsider)}`)
      .send({ floor_id: floor._id.toString() });
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });

  test('ルームメンバーの招待・参加・脱退・削除・所属確認ができる', async () => {
    const owner = await createUser({ role: 'Editor' });
    const floorMemberUser = await createUser({ role: 'Author' });
    const roomMemberUser = await createUser({ role: 'Author' });
    const leaveMemberUser = await createUser({ role: 'Author' });

    const floor = await createFloor(owner, { title: 'Room Floor' });
    const room = await createRoom(owner, floor, { title: 'Room A', member_only: true });

    await FloorMember.create({ floor: floor._id, user: floorMemberUser._id });
    await RoomMember.create({ floor: floor._id, room: room._id, user: leaveMemberUser._id });
    const leavingRoomSocket = buildSocket(room._id);
    registerSockets(floor._id, leaveMemberUser._id, [leavingRoomSocket]);

    const leaveSuccess = await request(app)
      .post('/room/roommember/leave')
      .set('Authorization', `Bearer ${buildToken(leaveMemberUser)}`)
      .send({ room_id: room._id.toString() });
    expect(leaveSuccess.status).toBe(200);
    expect(leavingRoomSocket.emit).toHaveBeenCalledWith(ROOM_ACCESS_REVOKED_EVENT);
    expect(leavingRoomSocket.disconnect).toHaveBeenCalledWith(true);

    const invite = await request(app)
      .post('/room/roommember/invite')
      .set('Authorization', `Bearer ${buildToken(floorMemberUser)}`)
      .send({ room_id: room._id.toString(), period: '8h' });
    expect(invite.status).toBe(200);
    expect(invite.body).toHaveProperty('token');

    const floorMemberJoin = await request(app)
      .post('/room/roommember/create')
      .set('Authorization', `Bearer ${buildToken(floorMemberUser)}`)
      .send({ room_id: room._id.toString(), invite_token: invite.body.token });
    expect(floorMemberJoin.status).toBe(400);
    expect(floorMemberJoin.body?.error?.code).toBe('FLOOR_MEMBER_NOT_REQUIRD');

    const roomMemberJoin = await request(app)
      .post('/room/roommember/create')
      .set('Authorization', `Bearer ${buildToken(roomMemberUser)}`)
      .send({ room_id: room._id.toString(), invite_token: invite.body.token });
    expect(roomMemberJoin.status).toBe(200);
    expect(roomMemberJoin.body).toHaveProperty('_id');

    const contains = await request(app)
      .post('/room/roommember/contains')
      .set('Authorization', `Bearer ${buildToken(roomMemberUser)}`)
      .send({ room_id: room._id.toString() });
    expect(contains.status).toBe(200);
    expect(contains.body).toBe(true);

    const list = await request(app)
      .post('/room/roommember')
      .set('Authorization', `Bearer ${buildToken(roomMemberUser)}`)
      .send({ room_id: room._id.toString() });
    expect(list.status).toBe(200);
    expect(list.body.some((row) => row.user?._id?.toString() === roomMemberUser._id.toString())).toBe(true);

    const deletedSocketA = buildSocket(room._id);
    const deletedSocketB = buildSocket(room._id);
    registerSockets(floor._id, roomMemberUser._id, [deletedSocketA, deletedSocketB]);

    io.in.mockClear();
    const deleteForbidden = await request(app)
      .post('/room/roommember/delete')
      .set('Authorization', `Bearer ${buildToken(roomMemberUser)}`)
      .send({ _id: roomMemberJoin.body._id });
    expect(deleteForbidden.status).toBe(403);
    expect(deleteForbidden.body?.error?.code).toBe('FORBIDDEN');
    expect(io.in).not.toHaveBeenCalled();

    const deleted = await request(app)
      .post('/room/roommember/delete')
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .send({ _id: roomMemberJoin.body._id });
    expect(deleted.status).toBe(200);
    expect(deletedSocketA.emit).toHaveBeenCalledWith(ROOM_ACCESS_REVOKED_EVENT);
    expect(deletedSocketA.disconnect).toHaveBeenCalledWith(true);
    expect(deletedSocketB.emit).toHaveBeenCalledWith(ROOM_ACCESS_REVOKED_EVENT);
    expect(deletedSocketB.disconnect).toHaveBeenCalledWith(true);

    const leave = await request(app)
      .post('/room/roommember/leave')
      .set('Authorization', `Bearer ${buildToken(roomMemberUser)}`)
      .send({ room_id: room._id.toString() });
    expect(leave.status).toBe(404);
    expect(leave.body?.error?.code).toBe('NOT_FOUND');

    const missingMember = await RoomMember.findOne({ room: room._id, user: roomMemberUser._id });
    expect(missingMember).toBeNull();
  });

  test('フロア作成者をルームメンバーとして登録できない', async () => {
    const owner = await createUser({ role: 'Editor' });
    const floor = await createFloor(owner, { title: 'Owner Floor' });
    const room = await createRoom(owner, floor, { title: 'Owner Room' });

    const res = await request(app)
      .post('/room/roommember/create')
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .send({ room_id: room._id.toString(), invite_token: validToken });
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('FLOOR_EDITOR_NOT_REQUIRD');
  });

  test('管理用フロアメンバー一覧は管理者だけが取得できる', async () => {
    const admin = await createUser({ role: 'Administrator' });
    const outsider = await createUser({ role: 'User' });
    const owner = await createUser({ role: 'Editor' });
    const member = await createUser({ role: 'Author' });
    const floor = await createFloor(owner, { title: 'Manage Floor' });
    await FloorMember.create({ floor: floor._id, user: member._id });

    const ok = await request(app)
      .get('/floor/floormember/management/paginate?page=1')
      .set('Authorization', `Bearer ${buildToken(admin)}`);
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body.docs)).toBe(true);
    expect(ok.body.docs.length).toBeGreaterThanOrEqual(1);

    const forbidden = await request(app)
      .get('/floor/floormember/management/paginate?page=1')
      .set('Authorization', `Bearer ${buildToken(outsider)}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body?.error?.code).toBe('FORBIDDEN');
  });

  test('削除済みフロアのメンバーも管理者は削除でき、管理者以外は削除できない', async () => {
    const admin = await createUser({ role: 'Administrator' });
    const outsider = await createUser({ role: 'User' });
    const owner = await createUser({ role: 'Editor' });
    const member = await createUser({ role: 'Author' });
    const floor = await createFloor(owner, {
      title: 'Deleted Floor Member Management',
      delete_flg: true,
      deleted_at: new Date(),
    });
    const room = await createRoom(owner, floor, { title: 'Deleted Floor Room', member_only: true });
    const floorMember = await FloorMember.create({ floor: floor._id, user: member._id });

    const managementSocket = buildSocket(room._id);
    registerSockets(floor._id, member._id, [managementSocket]);

    const ok = await request(app)
      .post('/floor/floormember/management/delete')
      .set('Authorization', `Bearer ${buildToken(admin)}`)
      .send({ _id: floorMember._id.toString() });
    expect(ok.status).toBe(200);
    expect(ok.body._id.toString()).toBe(floorMember._id.toString());
    await expect(FloorMember.findById(floorMember._id)).resolves.toBeNull();
    expect(managementSocket.emit).toHaveBeenCalledWith(ROOM_ACCESS_REVOKED_EVENT);
    expect(managementSocket.disconnect).toHaveBeenCalledWith(true);

    const forbidden = await request(app)
      .post('/floor/floormember/management/delete')
      .set('Authorization', `Bearer ${buildToken(outsider)}`)
      .send({ _id: new mongoose.Types.ObjectId().toString() });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body?.error?.code).toBe('FORBIDDEN');
  });

  test('管理用フロアメンバー削除は対象がなければNOT_FOUNDを返す', async () => {
    const admin = await createUser({ role: 'Administrator' });

    const res = await request(app)
      .post('/floor/floormember/management/delete')
      .set('Authorization', `Bearer ${buildToken(admin)}`)
      .send({ _id: new mongoose.Types.ObjectId().toString() });
    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe('NOT_FOUND');
  });

  test('管理用ルームメンバー一覧は管理者だけが取得できる', async () => {
    const admin = await createUser({ role: 'Administrator' });
    const outsider = await createUser({ role: 'User' });
    const owner = await createUser({ role: 'Editor' });
    const member = await createUser({ role: 'Author' });
    const floor = await createFloor(owner, { title: 'Manage Room Floor' });
    const room = await createRoom(owner, floor, { title: 'Manage Room' });
    await RoomMember.create({ floor: floor._id, room: room._id, user: member._id });

    const ok = await request(app)
      .get('/room/roommember/management/paginate?page=1')
      .set('Authorization', `Bearer ${buildToken(admin)}`);
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body.docs)).toBe(true);
    expect(ok.body.docs.length).toBeGreaterThanOrEqual(1);

    const forbidden = await request(app)
      .get('/room/roommember/management/paginate?page=1')
      .set('Authorization', `Bearer ${buildToken(outsider)}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body?.error?.code).toBe('FORBIDDEN');
  });

  test('管理用ルームメンバー削除は管理者だけが実行できる', async () => {
    const admin = await createUser({ role: 'Administrator' });
    const outsider = await createUser({ role: 'User' });
    const owner = await createUser({ role: 'Editor' });
    const member = await createUser({ role: 'Author' });
    const floor = await createFloor(owner, { title: 'Delete Room Floor' });
    const room = await createRoom(owner, floor, { title: 'Delete Room', member_only: true });
    const roomMember = await RoomMember.create({ floor: floor._id, room: room._id, user: member._id });

    const managementSocket = buildSocket(room._id);
    registerSockets(floor._id, member._id, [managementSocket]);

    const ok = await request(app)
      .post('/room/roommember/management/delete')
      .set('Authorization', `Bearer ${buildToken(admin)}`)
      .send({ _id: roomMember._id.toString() });
    expect(ok.status).toBe(200);
    expect(ok.body._id.toString()).toBe(roomMember._id.toString());

    expect(managementSocket.emit).toHaveBeenCalledWith(ROOM_ACCESS_REVOKED_EVENT);
    expect(managementSocket.disconnect).toHaveBeenCalledWith(true);

    const forbidden = await request(app)
      .post('/room/roommember/management/delete')
      .set('Authorization', `Bearer ${buildToken(outsider)}`)
      .send({ _id: new mongoose.Types.ObjectId().toString() });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body?.error?.code).toBe('FORBIDDEN');
  });

  test('管理用ルームメンバー削除は対象がなければNOT_FOUNDを返す', async () => {
    const admin = await createUser({ role: 'Administrator' });

    const res = await request(app)
      .post('/room/roommember/management/delete')
      .set('Authorization', `Bearer ${buildToken(admin)}`)
      .send({ _id: new mongoose.Types.ObjectId().toString() });
    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe('NOT_FOUND');
  });

  test('管理用フロアメンバー一覧はpage=0を拒否する', async () => {
    const admin = await createUser({ role: 'Administrator' });

    const res = await request(app)
      .get('/floor/floormember/management/paginate?page=0')
      .set('Authorization', `Bearer ${buildToken(admin)}`);
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('管理用ルームメンバー一覧はpage=0を拒否する', async () => {
    const admin = await createUser({ role: 'Administrator' });

    const res = await request(app)
      .get('/room/roommember/management/paginate?page=0')
      .set('Authorization', `Bearer ${buildToken(admin)}`);
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('管理用ルームメンバー削除は不正なIDを拒否する', async () => {
    const admin = await createUser({ role: 'Administrator' });

    const res = await request(app)
      .post('/room/roommember/management/delete')
      .set('Authorization', `Bearer ${buildToken(admin)}`)
      .send({ _id: 'invalid-id' });
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('管理用フロアメンバー削除は不正なIDを拒否する', async () => {
    const admin = await createUser({ role: 'Administrator' });

    const res = await request(app)
      .post('/floor/floormember/management/delete')
      .set('Authorization', `Bearer ${buildToken(admin)}`)
      .send({ _id: 'invalid-id' });
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });
});

test.each(['floor', 'room'])('%sの同時受諾は成功1件と参加済み1件、脱退後は再参加できる', async (kind) => {
  const owner = await createUser({ role: 'Editor' });
  const member = await createUser({ role: 'Author' });
  const floor = await createFloor(owner);
  const room = await createRoom(owner, floor, { member_only: true });
  const app = buildApp({ in: () => ({ fetchSockets: async () => [] }) });
  const base = `/${kind}/${kind}member`;
  const scope = kind === 'floor' ? { floor_id: String(floor._id) } : { room_id: String(room._id) };
  const invite = await request(app).post(`${base}/invite`).set('Authorization', `Bearer ${buildToken(owner)}`).send({ ...scope, period: '8h' });
  expect(invite.status).toBe(200);
  const join = () => request(app).post(`${base}/create`).set('Authorization', `Bearer ${buildToken(member)}`).send({ ...scope, invite_token: invite.body.token });
  const Model = kind === 'floor' ? FloorMember : RoomMember;
  // 両方の要求がメンバー未登録の確認を終えてから作成処理を進め、DBで競合させる。
  const original = Model.create.bind(Model);
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  let entered = 0;
  const spy = jest.spyOn(Model, 'create').mockImplementation(async (...args) => {
    if (++entered === 2) release();
    await barrier;
    return original(...args);
  });
  let responses;
  try { responses = await Promise.all([join(), join()]); } finally { spy.mockRestore(); }
  expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
  expect(responses.find((r) => r.status === 400).body.error.code).toBe(kind === 'floor' ? 'ALREADY_FLOOR_MEMBER' : 'ALREADY_ROOM_MEMBER');
  expect(await Model.countDocuments({ user: member._id })).toBe(1);
  const leave = await request(app).post(`${base}/leave`).set('Authorization', `Bearer ${buildToken(member)}`).send(scope);
  expect(leave.status).toBe(200);
  expect(await Model.countDocuments({ user: member._id })).toBe(0);
  expect((await join()).status).toBe(200);
});
