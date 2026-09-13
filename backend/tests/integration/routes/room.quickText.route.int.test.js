const request = require('supertest');
const mongoose = require('mongoose');

const roomQuickTextRouter = require('../../../routes/room/roomQuickText.route');
const FloorMember = require('../../../models/FloorMember');
const RoomMember = require('../../../models/RoomMember');
const KickedUser = require('../../../models/KickedUser');
const RoomQuickTextGroup = require('../../../models/RoomQuickTextGroup');
const RoomQuickTextItem = require('../../../models/RoomQuickTextItem');
const { buildErrorHandledApp } = require('../_helpers/app');
const {
  snapshotEnv,
  restoreEnv,
  ensureEnvValue,
  createJwtToken,
  createUserToken: buildToken,
} = require('../_helpers/auth');
const {
  createUser,
  createFloor: createFloorFixture,
  createRoom: createRoomFixture,
} = require('../_helpers/models');

describe('ルームの単語API', () => {
  let app;

  const originalEnv = snapshotEnv(['JWT_SECRET', 'GUEST_JWT_SECRET', 'GUEST_REFRESH_SECRET']);
  const createFloor = (owner, overrides = {}) =>
    createFloorFixture(owner, { description: undefined, ...overrides });
  const createRoom = (owner, floor, overrides = {}) =>
    createRoomFixture(owner, floor, { description: undefined, ...overrides });

  beforeAll(() => {
    ensureEnvValue('JWT_SECRET', 'test-jwt-secret');
    ensureEnvValue('GUEST_JWT_SECRET', 'test-guest-jwt-secret');
    ensureEnvValue('GUEST_REFRESH_SECRET', 'test-guest-refresh-secret');
  });

  afterAll(() => {
    restoreEnv(originalEnv);
  });

  beforeEach(() => {
    app = buildErrorHandledApp({
      mounts: [{ path: '/', handler: roomQuickTextRouter }],
    });
  });

  test('公開ルームの単語一覧は認証なしで取得できる', async () => {
    const owner = await createUser({ role: 'Editor' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);

    const res = await request(app).get(`/rooms/${room._id}/quick-text/groups`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('公開・限定ルームと利用者の組合せに応じてグループと単語へ同じ認可を適用する', async () => {
    const owner = await createUser({ role: 'Editor' });
    const admin = await createUser({ role: 'Administrator' });
    const floorMember = await createUser({ role: 'Author' });
    const roomMember = await createUser({ role: 'Author' });
    const outsider = await createUser({ role: 'Author' });
    const kicked = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const publicRoom = await createRoom(owner, floor, { title: 'Public Room' });
    const restrictedRoom = await createRoom(owner, floor, {
      title: 'Restricted Room',
      member_only: true,
    });

    await FloorMember.create({ floor: floor._id, user: floorMember._id });
    await RoomMember.create({ floor: floor._id, room: restrictedRoom._id, user: roomMember._id });
    await KickedUser.create({
      user: kicked._id,
      kicked_by: owner._id,
      floor: floor._id,
      room: restrictedRoom._id,
    });

    const [publicGroup, restrictedGroup] = await RoomQuickTextGroup.create([
      {
        floor: floor._id,
        room: publicRoom._id,
        user: owner._id,
        order: 1,
        title: 'Public Group',
        lang: 'ja',
      },
      {
        floor: floor._id,
        room: restrictedRoom._id,
        user: owner._id,
        order: 1,
        title: 'Restricted Group',
        lang: 'ja',
      },
    ]);
    const [publicItem, restrictedItem] = await RoomQuickTextItem.create([
      {
        floor: floor._id,
        room: publicRoom._id,
        group: publicGroup._id,
        order: 1,
        label: 'Public Item',
        lang: 'ja',
      },
      {
        floor: floor._id,
        room: restrictedRoom._id,
        group: restrictedGroup._id,
        order: 1,
        label: 'Restricted Item',
        lang: 'ja',
      },
    ]);

    const validGuestToken = createJwtToken(
      { guest_id: 'guest-1' },
      process.env.GUEST_JWT_SECRET,
      { expiresIn: '1h' }
    );
    const expiredGuestToken = createJwtToken(
      { guest_id: 'guest-1' },
      process.env.GUEST_JWT_SECRET,
      { expiresIn: -1 }
    );
    const expiredUserToken = buildToken(
      outsider,
      process.env.JWT_SECRET,
      {},
      { expiresIn: -1 }
    );

    const sendWithHeaders = (testRequest, headers) => {
      Object.entries(headers).forEach(([name, value]) => testRequest.set(name, value));
      return testRequest;
    };
    const expectAccess = async ({ room, group, item, headers = {}, status, code }) => {
      const groupsRes = await sendWithHeaders(
        request(app).get(`/rooms/${room._id}/quick-text/groups`),
        headers
      );
      const itemsRes = await sendWithHeaders(
        request(app).get(`/rooms/${room._id}/quick-text/groups/${group._id}/items`),
        headers
      );

      expect(groupsRes.status).toBe(status);
      expect(itemsRes.status).toBe(status);
      if (code) {
        expect(groupsRes.body?.error?.code).toBe(code);
        expect(itemsRes.body?.error?.code).toBe(code);
      } else {
        expect(groupsRes.body.map(({ _id }) => _id)).toContain(group._id.toString());
        expect(itemsRes.body.map(({ _id }) => _id)).toContain(item._id.toString());
      }
    };

    const publicCases = [
      { label: '匿名', headers: {}, status: 200 },
      { label: '有効Guest', headers: { 'X-Guest-Token': validGuestToken }, status: 200 },
      {
        label: '不正Guest',
        headers: { 'X-Guest-Token': 'invalid-guest-token' },
        status: 401,
        code: 'TOKEN_INVALID',
      },
      {
        label: '期限切れGuest',
        headers: { 'X-Guest-Token': expiredGuestToken },
        status: 401,
        code: 'TOKEN_EXPIRED',
      },
      {
        label: '有効User',
        headers: { Authorization: `Bearer ${buildToken(outsider)}` },
        status: 200,
      },
      {
        label: 'kick済みUser',
        headers: { Authorization: `Bearer ${buildToken(kicked)}` },
        status: 401,
        code: 'INVALID_PERMISSION',
      },
    ];
    for (const scenario of publicCases) {
      await expectAccess({
        ...scenario,
        room: publicRoom,
        group: publicGroup,
        item: publicItem,
      });
    }

    const restrictedCases = [
      { label: '匿名', headers: {}, status: 401, code: 'TOKEN_INVALID' },
      {
        label: '有効Guest',
        headers: { 'X-Guest-Token': validGuestToken },
        status: 401,
        code: 'INVALID_PERMISSION',
      },
      {
        label: '不正Guest',
        headers: { 'X-Guest-Token': 'invalid-guest-token' },
        status: 401,
        code: 'TOKEN_INVALID',
      },
      {
        label: '期限切れGuest',
        headers: { 'X-Guest-Token': expiredGuestToken },
        status: 401,
        code: 'TOKEN_EXPIRED',
      },
      {
        label: '不正User',
        headers: { Authorization: 'Bearer invalid-user-token' },
        status: 401,
        code: 'TOKEN_INVALID',
      },
      {
        label: '期限切れUser',
        headers: { Authorization: `Bearer ${expiredUserToken}` },
        status: 401,
        code: 'TOKEN_EXPIRED',
      },
      {
        label: '無所属User',
        headers: { Authorization: `Bearer ${buildToken(outsider)}` },
        status: 401,
        code: 'INVALID_PERMISSION',
      },
      {
        label: 'kick済みUser',
        headers: { Authorization: `Bearer ${buildToken(kicked)}` },
        status: 401,
        code: 'INVALID_PERMISSION',
      },
      { label: 'Administrator', headers: { Authorization: `Bearer ${buildToken(admin)}` }, status: 200 },
      { label: 'Floor所有Editor', headers: { Authorization: `Bearer ${buildToken(owner)}` }, status: 200 },
      {
        label: 'FloorMember',
        headers: { Authorization: `Bearer ${buildToken(floorMember)}` },
        status: 200,
      },
      {
        label: 'RoomMember',
        headers: { Authorization: `Bearer ${buildToken(roomMember)}` },
        status: 200,
      },
      {
        label: '有効Userと不正Guest',
        headers: {
          Authorization: `Bearer ${buildToken(floorMember)}`,
          'X-Guest-Token': 'invalid-guest-token',
        },
        status: 200,
      },
      {
        label: '不正Userと有効Guest',
        headers: {
          Authorization: 'Bearer invalid-user-token',
          'X-Guest-Token': validGuestToken,
        },
        status: 401,
        code: 'TOKEN_INVALID',
      },
      {
        label: '期限切れUserと有効Guest',
        headers: {
          Authorization: `Bearer ${expiredUserToken}`,
          'X-Guest-Token': validGuestToken,
        },
        status: 401,
        code: 'TOKEN_EXPIRED',
      },
    ];
    for (const scenario of restrictedCases) {
      await expectAccess({
        ...scenario,
        room: restrictedRoom,
        group: restrictedGroup,
        item: restrictedItem,
      });
    }
  });

  test('フロアメンバーはルームの単語グループと単語を管理できる', async () => {
    const owner = await createUser({ role: 'Editor' });
    const member = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);
    await FloorMember.create({ floor: floor._id, user: member._id });

    const groupRes = await request(app)
      .post(`/rooms/${room._id}/quick-text/groups`)
      .set('Authorization', `Bearer ${buildToken(member)}`)
      .send({ title: 'Group A', lang: 'ja' });
    expect(groupRes.status).toBe(200);

    const itemRes = await request(app)
      .post(`/rooms/${room._id}/quick-text/groups/${groupRes.body._id}/items`)
      .set('Authorization', `Bearer ${buildToken(member)}`)
      .send({ label: 'Item A', lang: 'ja' });
    expect(itemRes.status).toBe(200);

    const groupUpdateRes = await request(app)
      .patch(`/rooms/${room._id}/quick-text/groups/${groupRes.body._id}`)
      .set('Authorization', `Bearer ${buildToken(member)}`)
      .send({ title: 'Group B' });
    expect(groupUpdateRes.status).toBe(200);
    expect(groupUpdateRes.body.title).toBe('Group B');

    const itemUpdateRes = await request(app)
      .patch(`/rooms/${room._id}/quick-text/items/${itemRes.body._id}`)
      .set('Authorization', `Bearer ${buildToken(member)}`)
      .send({ label: 'Item B' });
    expect(itemUpdateRes.status).toBe(200);
    expect(itemUpdateRes.body.label).toBe('Item B');

    const itemDeleteRes = await request(app)
      .delete(`/rooms/${room._id}/quick-text/items/${itemRes.body._id}`)
      .set('Authorization', `Bearer ${buildToken(member)}`);
    expect(itemDeleteRes.status).toBe(200);
    expect(itemDeleteRes.body.ok).toBe(true);

    const groupDeleteRes = await request(app)
      .delete(`/rooms/${room._id}/quick-text/groups/${groupRes.body._id}`)
      .set('Authorization', `Bearer ${buildToken(member)}`);
    expect(groupDeleteRes.status).toBe(200);
    expect(groupDeleteRes.body.ok).toBe(true);
  });

  test('グループを削除しても別のルームの単語を削除しない', async () => {
    const owner = await createUser({ role: 'Editor' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);
    const otherRoom = await createRoom(owner, floor, { title: 'Other Room' });
    const token = buildToken(owner);

    const [groupA, groupB, otherRoomGroup] = await RoomQuickTextGroup.create([
      { floor: floor._id, room: room._id, user: owner._id, order: 1, title: 'Group A', lang: 'ja' },
      { floor: floor._id, room: room._id, user: owner._id, order: 2, title: 'Group B', lang: 'ja' },
      {
        floor: floor._id,
        room: otherRoom._id,
        user: owner._id,
        order: 1,
        title: 'Other Room Group',
        lang: 'ja',
      },
    ]);
    const [itemA, itemB, otherRoomItem] = await RoomQuickTextItem.create([
      { floor: floor._id, room: room._id, group: groupA._id, order: 1, label: 'Item A', lang: 'ja' },
      { floor: floor._id, room: room._id, group: groupB._id, order: 1, label: 'Item B', lang: 'ja' },
      {
        floor: floor._id,
        room: otherRoom._id,
        group: otherRoomGroup._id,
        order: 1,
        label: 'Other Room Item',
        lang: 'ja',
      },
    ]);

    const deleteRes = await request(app)
      .delete(`/rooms/${room._id}/quick-text/groups/${groupA._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.status).toBe(200);
    expect(await RoomQuickTextGroup.exists({ _id: groupA._id })).toBeNull();
    expect(await RoomQuickTextItem.exists({ _id: itemA._id })).toBeNull();
    expect(await RoomQuickTextGroup.exists({ _id: groupB._id })).not.toBeNull();
    expect(await RoomQuickTextItem.exists({ _id: itemB._id })).not.toBeNull();
    expect(await RoomQuickTextGroup.exists({ _id: otherRoomGroup._id })).not.toBeNull();
    expect(await RoomQuickTextItem.exists({ _id: otherRoomItem._id })).not.toBeNull();

    const wrongRoomRes = await request(app)
      .delete(`/rooms/${room._id}/quick-text/groups/${otherRoomGroup._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(wrongRoomRes.status).toBe(404);
    expect(await RoomQuickTextItem.exists({ _id: itemB._id })).not.toBeNull();
    expect(await RoomQuickTextItem.exists({ _id: otherRoomItem._id })).not.toBeNull();

    const missingGroupRes = await request(app)
      .delete(`/rooms/${room._id}/quick-text/groups/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', `Bearer ${token}`);

    expect(missingGroupRes.status).toBe(404);
    expect(await RoomQuickTextItem.exists({ _id: itemB._id })).not.toBeNull();
  });

  test('無関係のユーザはグループを作成できない', async () => {
    const owner = await createUser({ role: 'Editor' });
    const outsider = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);

    const res = await request(app)
      .post(`/rooms/${room._id}/quick-text/groups`)
      .set('Authorization', `Bearer ${buildToken(outsider)}`)
      .send({ title: 'Group A', lang: 'ja' });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });
});
