const request = require('supertest');

const resourceRouter = require('../../../routes/timeline/postResource.route');
const roomTagRouter = require('../../../routes/room/roomTag.route');
const floorTagRouter = require('../../../routes/floor/floorTag.route');
const FloorMember = require('../../../models/FloorMember');
const RoomMember = require('../../../models/RoomMember');
const KickedUser = require('../../../models/KickedUser');
const Room = require('../../../models/Room');
const RoomTag = require('../../../models/RoomTag');
const FloorTag = require('../../../models/FloorTag');
const RoomAIAnalysisSetting = require('../../../models/RoomAIAnalysisSetting');
const Chat = require('../../../models/Chat');
const SoundTag = require('../../../models/SoundTag');
const PushFilter = require('../../../models/PushFilter');
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

describe('ルームタグAPI', () => {
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
      mounts: [
        { path: '/roomtag', handler: roomTagRouter },
        { path: '/api', handler: resourceRouter() },
        { path: '/floortag', handler: floorTagRouter },
      ],
    });
  });

  test('公開ルームのタグ一覧を取得できる', async () => {
    const owner = await createUser({ role: 'Editor' });
    const member = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);
    await FloorMember.create({ floor: floor._id, user: member._id });

    const createRes = await request(app)
      .post('/roomtag/create')
      .set('Authorization', `Bearer ${buildToken(member)}`)
      .send({ room_id: room._id.toString(), order: 1, name: 'Tag A', lang: 'ja' });
    expect(createRes.status).toBe(200);

    const listRes = await request(app).get(`/api/rooms/${room._id}/tags`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(1);
  });

  test('公開・限定ルームと利用者の組合せに応じてタグ一覧の取得を許可する', async () => {
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

    const [publicTag, restrictedTag] = await RoomTag.create([
      {
        floor: floor._id,
        room: publicRoom._id,
        user: owner._id,
        order: 1,
        name: 'Public Tag',
        lang: 'ja',
      },
      {
        floor: floor._id,
        room: restrictedRoom._id,
        user: owner._id,
        order: 1,
        name: 'Restricted Tag',
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

    const expectAccess = async ({ room, tag, headers = {}, status, code }) => {
      const testRequest = request(app).get(`/api/rooms/${room._id}/tags`);
      Object.entries(headers).forEach(([name, value]) => testRequest.set(name, value));
      const response = await testRequest;

      expect(response.status).toBe(status);
      if (code) {
        expect(response.body?.error?.code).toBe(code);
      } else {
        expect(response.body.map(({ _id }) => _id)).toContain(tag._id.toString());
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
        status: 403,
        code: 'FORBIDDEN',
      },
    ];
    for (const scenario of publicCases) {
      await expectAccess({ ...scenario, room: publicRoom, tag: publicTag });
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
        status: 403,
        code: 'FORBIDDEN',
      },
      {
        label: 'kick済みUser',
        headers: { Authorization: `Bearer ${buildToken(kicked)}` },
        status: 403,
        code: 'FORBIDDEN',
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
      await expectAccess({ ...scenario, room: restrictedRoom, tag: restrictedTag });
    }
  });

  test('フロアメンバーはタグを更新・削除できる', async () => {
    const owner = await createUser({ role: 'Editor' });
    const member = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);
    await FloorMember.create({ floor: floor._id, user: member._id });

    const createRes = await request(app)
      .post('/roomtag/create')
      .set('Authorization', `Bearer ${buildToken(member)}`)
      .send({ room_id: room._id.toString(), order: 1, name: 'Tag A', lang: 'ja' });
    expect(createRes.status).toBe(200);

    const updateRes = await request(app)
      .post('/roomtag/update')
      .set('Authorization', `Bearer ${buildToken(member)}`)
      .send({ _id: createRes.body._id, order: 2, name: 'Tag B', lang: 'ja' });
    expect(updateRes.status).toBe(200);

    const deleteRes = await request(app)
      .post('/roomtag/delete')
      .set('Authorization', `Bearer ${buildToken(member)}`)
      .send({ _id: createRes.body._id });
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.delete_flg).toBe(true);
  });

  test('CSV取込と初期化で同名タグのIDと関連する参照を保持する', async () => {
    const owner = await createUser({ role: 'Editor' });
    const member = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);
    await FloorMember.create({ floor: floor._id, user: member._id });

    const keptTag = await RoomTag.create({
      floor: floor._id,
      room: room._id,
      user: owner._id,
      order: 1,
      name: 'Tag A',
      lang: 'ja',
    });
    const removedTag = await RoomTag.create({
      floor: floor._id,
      room: room._id,
      user: owner._id,
      order: 2,
      name: 'Tag X',
      lang: 'ja',
    });
    const chat = await Chat.create({
      floor: floor._id,
      room: room._id,
      user: member._id,
      content: 'Post',
      room_tags: [keptTag._id],
      replies: [
        {
          user: member._id,
          content: 'Reply',
          lang: 'ja',
          room_tags: [keptTag._id],
        },
      ],
    });
    const soundTag = await SoundTag.create({
      floor: floor._id,
      room: room._id,
      user: member._id,
      tags: [keptTag._id],
    });
    const pushFilter = await PushFilter.create({
      floor: floor._id,
      room: room._id,
      user: member._id,
      conditions: { tags: [keptTag._id.toString()] },
    });

    const importRes = await request(app)
      .post('/roomtag/import')
      .set('Authorization', `Bearer ${buildToken(member)}`)
      .send({
        room_id: room._id.toString(),
        csv: [
          [2, 'Tag A'],
          [1, 'Tag B'],
        ],
      });
    expect(importRes.status).toBe(200);
    const importedTagA = importRes.body.find(({ name }) => name === 'Tag A');
    expect(importedTagA._id).toBe(keptTag._id.toString());
    expect(importedTagA.order).toBe(2);

    const keptAfterImport = await RoomTag.findById(keptTag._id).lean();
    const removedAfterImport = await RoomTag.findById(removedTag._id).lean();
    expect(keptAfterImport.delete_flg).toBe(false);
    expect(removedAfterImport).not.toBeNull();
    expect(removedAfterImport.delete_flg).toBe(true);

    const chatAfterImport = await Chat.findById(chat._id).lean();
    const soundAfterImport = await SoundTag.findById(soundTag._id).lean();
    const pushAfterImport = await PushFilter.findById(pushFilter._id).lean();
    expect(chatAfterImport.room_tags.map(String)).toEqual([keptTag._id.toString()]);
    expect(chatAfterImport.replies[0].room_tags.map(String)).toEqual([keptTag._id.toString()]);
    expect(soundAfterImport.tags.map(String)).toEqual([keptTag._id.toString()]);
    expect(pushAfterImport.conditions.tags).toEqual([keptTag._id.toString()]);

    await FloorTag.create({ floor: floor._id, user: owner._id, order: 1, name: 'FloorTag', lang: 'ja' });
    await FloorTag.create({ floor: floor._id, user: owner._id, order: 2, name: 'Tag A', lang: 'ja' });
    const initRes = await request(app)
      .post('/roomtag/init')
      .set('Authorization', `Bearer ${buildToken(member)}`)
      .send({ room_id: room._id.toString() });
    expect(initRes.status).toBe(200);
    expect(initRes.body.length).toBe(2);
    expect(initRes.body.find(({ name }) => name === 'Tag A')._id).toBe(keptTag._id.toString());
  });

  test('CSV内の名前が重複していれば既存タグを変えず拒否する', async () => {
    const owner = await createUser({ role: 'Editor' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);
    const existingTag = await RoomTag.create({
      floor: floor._id,
      room: room._id,
      user: owner._id,
      order: 1,
      name: 'Existing',
      lang: 'ja',
    });

    const importRes = await request(app)
      .post('/roomtag/import')
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .send({
        room_id: room._id.toString(),
        csv: [
          [1, 'Duplicate'],
          [2, 'Duplicate'],
        ],
      });

    expect(importRes.status).toBe(400);
    const unchangedTag = await RoomTag.findById(existingTag._id).lean();
    expect(unchangedTag).not.toBeNull();
    expect(unchangedTag.delete_flg).toBe(false);
    expect(await RoomTag.countDocuments({ room: room._id })).toBe(1);
  });

  test('管理用一覧では検索語と削除状態を組み合わせ、フロア・ルーム情報を取得する', async () => {
    const admin = await createUser({ role: 'Administrator' });
    const owner = await createUser({ role: 'Editor' });
    const floor = await createFloor(owner, { title: 'Room Tag Filter Floor' });
    const room = await createRoom(owner, floor, { title: 'Room Tag Filter Room' });
    const sourceFloorTag = await FloorTag.create({
      floor: floor._id,
      user: owner._id,
      order: 1,
      name: 'Room Tag Filter Source',
      lang: 'ja',
    });
    const prefix = 'RoomTagLifecycleFilter';
    await RoomTag.create([
      ...Array.from({ length: 11 }, (_, index) => ({
        floor: floor._id,
        room: room._id,
        user: owner._id,
        order: index + 1,
        name: `${prefix} Active ${index}`,
        lang: 'ja',
        source_floor_tag: sourceFloorTag._id,
        delete_flg: false,
      })),
      ...Array.from({ length: 2 }, (_, index) => ({
        floor: floor._id,
        room: room._id,
        user: owner._id,
        order: index + 20,
        name: `${prefix} Deleted ${index}`,
        lang: 'ja',
        source_floor_tag: sourceFloorTag._id,
        delete_flg: true,
        deleted_at: new Date(),
      })),
      {
        floor: floor._id,
        room: room._id,
        user: owner._id,
        order: 30,
        name: 'Unmatched Room Tag',
        lang: 'ja',
      },
    ]);
    const paginate = (payload) =>
      request(app)
        .post('/roomtag/management/paginate')
        .set('Authorization', `Bearer ${buildToken(admin)}`)
        .send({ page: 1, search: prefix, ...payload });

    const [active, deleted, all] = await Promise.all([
      paginate({ delete_flg: false }),
      paginate({ delete_flg: true }),
      paginate({}),
    ]);

    expect(active.status).toBe(200);
    expect(active.body).toMatchObject({ total: 11, pages: 2, page: 1 });
    expect(active.body.docs).toHaveLength(10);
    expect(active.body.docs.every((tag) => tag.delete_flg === false)).toBe(true);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toMatchObject({ total: 2, pages: 1, page: 1 });
    expect(deleted.body.docs).toHaveLength(2);
    expect(deleted.body.docs.every((tag) => tag.delete_flg === true)).toBe(true);
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ total: 13, pages: 2, page: 1 });
    expect(all.body.docs).toHaveLength(10);
    expect(all.body.docs.every((tag) => tag.name.includes(prefix))).toBe(true);
    expect(all.body.docs.every((tag) => tag.floor.title === 'Room Tag Filter Floor')).toBe(true);
    expect(all.body.docs.every((tag) => tag.room.title === 'Room Tag Filter Room')).toBe(true);
    expect(all.body.docs.every((tag) => tag.floor.delete_flg === false)).toBe(true);
    expect(all.body.docs.every((tag) => tag.room.delete_flg === false)).toBe(true);
    expect(all.body.docs.every((tag) => tag.room.floor === floor._id.toString())).toBe(true);
    expect(
      all.body.docs.every(
        (tag) =>
          tag.source_floor_tag.name === 'Room Tag Filter Source' &&
          tag.source_floor_tag.delete_flg === false &&
          tag.source_floor_tag.floor === floor._id.toString()
      )
    ).toBe(true);
  });

  test('削除状態の変更ではタグ情報を保持して復元でき、有効なAI解析設定からの参照を確認する', async () => {
    const admin = await createUser({ role: 'Administrator' });
    const owner = await createUser({ role: 'Editor' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);
    const tag = await RoomTag.create({
      floor: floor._id,
      room: room._id,
      user: owner._id,
      order: 7,
      name: 'Lifecycle Room Tag',
      lang: 'ja',
      translations: [{ user: owner._id, lang: 'en', name: 'Lifecycle room tag' }],
    });
    const setState = (target, delete_flg) =>
      request(app)
        .post('/roomtag/management/delete-state')
        .set('Authorization', `Bearer ${buildToken(admin)}`)
        .send({ _id: target._id.toString(), delete_flg });

    const deleted = await setState(tag, true);
    const deletedTag = await RoomTag.findById(tag._id).lean();
    expect(deleted.status).toBe(200);
    expect(deletedTag).toMatchObject({
      order: 7,
      name: 'Lifecycle Room Tag',
      lang: 'ja',
      delete_flg: true,
    });
    expect(deletedTag.floor.toString()).toBe(floor._id.toString());
    expect(deletedTag.room.toString()).toBe(room._id.toString());
    expect(deletedTag.user.toString()).toBe(owner._id.toString());
    expect(deletedTag.translations.map(({ lang, name }) => ({ lang, name }))).toEqual([
      { lang: 'en', name: 'Lifecycle room tag' },
    ]);
    expect(deletedTag.deleted_at).toBeInstanceOf(Date);

    const restored = await setState(tag, false);
    const restoredTag = await RoomTag.findById(tag._id).lean();
    expect(restored.status).toBe(200);
    expect(restoredTag).toMatchObject({
      order: 7,
      name: 'Lifecycle Room Tag',
      lang: 'ja',
      delete_flg: false,
    });
    expect(restoredTag.deleted_at).toBeNull();

    const referencedTag = await RoomTag.create({
      floor: floor._id,
      room: room._id,
      user: owner._id,
      order: 8,
      name: 'Referenced Room Tag',
      lang: 'ja',
    });
    await RoomAIAnalysisSetting.create({
      floor: floor._id,
      room: room._id,
      room_tag: referencedTag._id,
      analysis_kind: 'vision',
      additional_prompt: '',
      result_user: owner._id,
      user: admin._id,
      updated_by: admin._id,
    });
    const beforeReferencedDelete = await RoomTag.findById(referencedTag._id).lean();

    const guarded = await setState(referencedTag, true);
    expect(guarded.status).toBe(409);
    expect(guarded.body?.error).toMatchObject({
      code: 'CONFLICT',
      details: {
        reason: 'ACTIVE_AI_ANALYSIS_REFERENCE',
        resource_type: 'room-tag',
      },
    });
    expect(await RoomTag.findById(referencedTag._id).lean()).toEqual(beforeReferencedDelete);

    expect((await setState(tag, true)).status).toBe(200);
    await Room.updateOne(
      { _id: room._id },
      { $set: { delete_flg: true, deleted_at: new Date() } }
    );
    const parentConflict = await setState(tag, false);
    expect(parentConflict.status).toBe(409);
    expect(parentConflict.body?.error?.code).toBe('CONFLICT');
    const stillDeletedTag = await RoomTag.findById(tag._id).lean();
    expect(stillDeletedTag.delete_flg).toBe(true);
    expect(stillDeletedTag.deleted_at).toBeInstanceOf(Date);
  });

  test('元のフロアタグは有効なルームタグを残して削除でき、ルームタグの復元後も継承元IDを保持する', async () => {
    const admin = await createUser({ role: 'Administrator' });
    const owner = await createUser({ role: 'Editor' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);
    const sourceFloorTag = await FloorTag.create({
      floor: floor._id,
      user: owner._id,
      order: 1,
      name: 'Source integrity floor tag',
      lang: 'ja',
    });
    const childTag = await RoomTag.create({
      floor: floor._id,
      room: room._id,
      source_floor_tag: sourceFloorTag._id,
      user: owner._id,
      order: 1,
      name: 'Source integrity room tag',
      lang: 'ja',
    });
    const authorization = `Bearer ${buildToken(admin)}`;

    const parentDelete = await request(app)
      .post('/floortag/management/delete')
      .set('Authorization', authorization)
      .send({ _id: sourceFloorTag._id.toString() });
    expect(parentDelete.status).toBe(200);
    expect(await FloorTag.findById(sourceFloorTag._id)).toBeNull();
    const activeChild = await RoomTag.findById(childTag._id).lean();
    expect(activeChild.delete_flg).toBe(false);
    expect(activeChild.source_floor_tag.toString()).toBe(
      sourceFloorTag._id.toString()
    );

    const childDelete = await request(app)
      .post('/roomtag/management/delete-state')
      .set('Authorization', authorization)
      .send({ _id: childTag._id.toString(), delete_flg: true });
    expect(childDelete.status).toBe(200);

    const restored = await request(app)
      .post('/roomtag/management/delete-state')
      .set('Authorization', authorization)
      .send({ _id: childTag._id.toString(), delete_flg: false });
    expect(restored.status).toBe(200);
    const restoredChild = await RoomTag.findById(childTag._id).lean();
    expect(restoredChild.delete_flg).toBe(false);
    expect(restoredChild.source_floor_tag.toString()).toBe(
      sourceFloorTag._id.toString()
    );
  });

  test('管理者はタグを一覧取得・更新できる', async () => {
    const admin = await createUser({ role: 'Administrator' });
    const owner = await createUser({ role: 'Editor' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);
    const tag = await RoomTag.create({
      floor: floor._id,
      room: room._id,
      user: owner._id,
      order: 1,
      name: 'Tag A',
      lang: 'ja',
    });

    const paginateRes = await request(app)
      .post('/roomtag/management/paginate')
      .set('Authorization', `Bearer ${buildToken(admin)}`)
      .send({ page: 1 });
    expect(paginateRes.status).toBe(200);

    const updateRes = await request(app)
      .post('/roomtag/management/update')
      .set('Authorization', `Bearer ${buildToken(admin)}`)
      .send({
        _id: tag._id.toString(),
        order: 2,
        name: 'Tag B',
        lang: 'ja',
        delete_flg: false,
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body).toMatchObject({ order: 2, name: 'Tag B', delete_flg: false });

    const conflictRes = await request(app)
      .post('/roomtag/management/update')
      .set('Authorization', `Bearer ${buildToken(admin)}`)
      .send({
        _id: tag._id.toString(),
        order: 3,
        name: 'Stale Tag',
        lang: 'ja',
        delete_flg: true,
      });
    expect(conflictRes.status).toBe(409);
    const unchanged = await RoomTag.findById(tag._id).lean();
    expect(unchanged).toMatchObject({ order: 2, name: 'Tag B', delete_flg: false });
    expect(unchanged.deleted_at).toBeNull();
  });
});
