const request = require('supertest');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const { buildErrorHandledApp } = require('../_helpers/app');
const { snapshotEnv, restoreEnv, ensureEnvValue, createJwtToken } = require('../_helpers/auth');
const { createUser, createFloor, createRoom } = require('../_helpers/models');
const { testRuntimePath, trailingSlash, removeDirSafe } = require('../../_helpers/testRuntime');

const Messages = require('../../../constants/messages');
const Chat = require('../../../models/Chat');
const FloorMember = require('../../../models/FloorMember');
const KickedUser = require('../../../models/KickedUser');
const RoomMember = require('../../../models/RoomMember');
const RoomTag = require('../../../models/RoomTag');

const mediaRoot = testRuntimePath('v1-extended', 'media');
const ORIGINAL_ENV = snapshotEnv(['JWT_DEV_SECRET', 'MEDIA_PATH']);
ensureEnvValue('JWT_DEV_SECRET', 'test-dev-secret');
process.env.MEDIA_PATH = trailingSlash(mediaRoot);

const v1Router = require('../../../routes/v1');
const uploadService = require('../../../services/upload.service');

const socketEmit = jest.fn();
const socketTo = jest.fn(() => ({ emit: socketEmit }));
const ioStub = {
  to: socketTo,
  in: () => ({ emit: () => {} }),
};

describe('v1 APIの取得・更新・削除・アップロード', () => {
  let app;
  const tinyAudio = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]);

  const createDevToken = (user, role = 'developer') =>
    createJwtToken({ user_id: user._id.toString(), user_role: role }, process.env.JWT_DEV_SECRET);

  const expectTokenInvalid = (res) => {
    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOKEN_INVALID');
  };

  const expectInvalidParams = (res) => {
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  };

  const expectForbidden = (res) => {
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  };

  const expectNotFound = (res) => {
    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe('NOT_FOUND');
  };

  const sendD03GuardProbe = ({ routePath, token, isUpload }) => {
    const probe = request(app).post(routePath).set('Authorization', `Bearer ${token}`);

    return isUpload
      ? probe.attach('audio_file', tinyAudio, {
          filename: 'guard-probe.mp3',
          contentType: 'audio/mpeg',
        })
      : probe.send({});
  };

  beforeEach(async () => {
    socketEmit.mockClear();
    socketTo.mockClear();
    await fs.promises.rm(mediaRoot, { recursive: true, force: true });
    await fs.promises.mkdir(mediaRoot, { recursive: true });

    app = buildErrorHandledApp({
      mounts: [{ path: '/api/v1', handler: v1Router(ioStub) }],
    });
  });

  afterAll(async () => {
    restoreEnv(ORIGINAL_ENV);
    await removeDirSafe(testRuntimePath('v1-extended'));
  });

  test('v1のタイムライン取得は最新10件を主系APIと同じ形式で返す', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const roomA = await createRoom(dev, floor);
    const roomB = await createRoom(dev, floor);
    const roomTag = await RoomTag.create({
      floor: floor._id,
      room: roomA._id,
      user: dev._id,
      order: 1,
      name: 'timeline-tag',
      lang: 'ja',
    });
    const posts = Array.from({ length: 11 }, (_, index) => ({
      floor: floor._id,
      room: roomA._id,
      user: dev._id,
      content: `room-a-post-${index}`,
      lang: 'ja',
      created_at: new Date(Date.UTC(2026, 0, 1, 0, index)),
    }));
    posts[10] = {
      ...posts[10],
      room_tags: [roomTag._id],
      analysis_source_revision: 3,
      reactions: [{ user: dev._id, type: 'いいね' }],
      supplementaries: [
        {
          user: dev._id,
          content: 'visible supplement',
          lang: 'ja',
          meta: {
            analysis_kind: 'conversation',
            analysis_setting: new mongoose.Types.ObjectId(),
            analysis_setting_revision: 1,
            analysis_trigger_tag: new mongoose.Types.ObjectId(),
            analysis_source_revision: 3,
          },
        },
        { user: dev._id, content: 'deleted supplement', lang: 'ja', delete_flg: true },
      ],
      replies: [
        {
          user: dev._id,
          content: 'visible reply',
          lang: 'ja',
          room_tags: [roomTag._id],
          analysis_source_revision: 2,
          supplementaries: [
            { user: dev._id, content: 'visible reply supplement', lang: 'ja' },
            { user: dev._id, content: 'deleted reply supplement', lang: 'ja', delete_flg: true },
          ],
        },
        { user: dev._id, content: 'deleted reply', lang: 'ja', delete_flg: true },
      ],
    };
    await Chat.create(posts);
    await Chat.create({
      floor: floor._id,
      room: roomA._id,
      user: dev._id,
      content: 'deleted room-a-post',
      delete_flg: true,
      created_at: new Date(Date.UTC(2026, 0, 1, 0, 11)),
    });
    await Chat.create({
      floor: floor._id,
      room: roomB._id,
      user: dev._id,
      content: 'room-b-post',
      created_at: new Date(Date.UTC(2026, 0, 1, 0, 12)),
    });

    const res = await request(app)
      .get(`/api/v1/timeline/floor/${floor._id.toString()}/room/${roomA._id.toString()}`)
      .set('Authorization', `Bearer ${createDevToken(dev)}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(10);
    expect(res.body.map((post) => post.content)).toEqual(
      Array.from({ length: 10 }, (_, offset) => `room-a-post-${10 - offset}`)
    );

    const newest = res.body[0];
    expect(newest.floor).toBe(floor._id.toString());
    expect(newest.room).toBe(roomA._id.toString());
    expect(newest.room_tags).toEqual([roomTag._id.toString()]);
    expect(newest.user).toEqual(
      expect.objectContaining({
        _id: dev._id.toString(),
        username: dev.username,
        image_name: null,
        delete_flg: false,
      })
    );
    expect(newest.reactions[0].user).toEqual(
      expect.objectContaining({ _id: dev._id.toString(), username: dev.username })
    );
    expect(newest.analysis_source_revision).toBeUndefined();
    expect(newest.supplementaries.map(({ content }) => content)).toEqual(['visible supplement']);
    expect(newest.supplementaries[0].meta).toBeUndefined();
    expect(newest.replies.map(({ content }) => content)).toEqual(['visible reply']);
    expect(newest.replies[0].room_tags).toEqual([roomTag._id.toString()]);
    expect(newest.replies[0].user).toEqual(
      expect.objectContaining({ _id: dev._id.toString(), username: dev.username })
    );
    expect(newest.replies[0].analysis_source_revision).toBeUndefined();
    expect(newest.replies[0].supplementaries.map(({ content }) => content)).toEqual([
      'visible reply supplement',
    ]);
  });

  test('v1のタイムライン取得はObjectIdの正規化後に一致する旧形式の本文を許可する', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const post = await Chat.create({
      floor: floor._id,
      room: room._id,
      user: dev._id,
      content: 'legacy-body-post',
    });

    const res = await request(app)
      .get(`/api/v1/timeline/floor/${floor._id.toString()}/room/${room._id.toString()}`)
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({
        floor_id: floor._id.toString().toUpperCase(),
        room_id: room._id.toString().toUpperCase(),
      });

    expect(res.status).toBe(200);
    expect(res.body.map(({ _id }) => _id)).toEqual([post._id.toString()]);
  });

  test('v1のタイムライン取得は不正なパスIDと一致しない旧形式IDを拒否する', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const otherFloor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const otherRoom = await createRoom(dev, floor);
    const authorization = `Bearer ${createDevToken(dev)}`;
    const cases = [
      {
        pathFloorId: 'invalid',
        pathRoomId: room._id.toString(),
        body: {},
      },
      {
        pathFloorId: floor._id.toString(),
        pathRoomId: 'invalid',
        body: {},
      },
      {
        pathFloorId: floor._id.toString(),
        pathRoomId: room._id.toString(),
        body: { floor_id: otherFloor._id.toString() },
      },
      {
        pathFloorId: floor._id.toString(),
        pathRoomId: room._id.toString(),
        body: { room_id: otherRoom._id.toString() },
      },
    ];

    for (const { pathFloorId, pathRoomId, body } of cases) {
      const res = await request(app)
        .get(`/api/v1/timeline/floor/${pathFloorId}/room/${pathRoomId}`)
        .set('Authorization', authorization)
        .send(body);
      expectInvalidParams(res);
    }
  });

  test('v1のタイムライン取得はパスと旧形式の本文で16進数でない12文字のIDを拒否する', async () => {
    const dev = await createUser({ role: 'developer' });
    const legacyByteString = 'abcdefghijkl';
    const legacyConvertedId = Buffer.from(legacyByteString, 'utf8').toString('hex');
    const floorWithLegacyId = await createFloor(dev, { _id: legacyConvertedId });
    const roomUnderLegacyFloor = await createRoom(dev, floorWithLegacyId);
    const floor = await createFloor(dev);
    const roomWithLegacyId = await createRoom(dev, floor, { _id: legacyConvertedId });
    const authorization = `Bearer ${createDevToken(dev)}`;
    const cases = [
      {
        pathFloorId: legacyByteString,
        pathRoomId: roomUnderLegacyFloor._id.toString(),
        body: {},
      },
      {
        pathFloorId: floor._id.toString(),
        pathRoomId: legacyByteString,
        body: {},
      },
      {
        pathFloorId: legacyConvertedId,
        pathRoomId: roomUnderLegacyFloor._id.toString(),
        body: { floor_id: legacyByteString },
      },
      {
        pathFloorId: floor._id.toString(),
        pathRoomId: roomWithLegacyId._id.toString(),
        body: { room_id: legacyByteString },
      },
    ];

    for (const { pathFloorId, pathRoomId, body } of cases) {
      const res = await request(app)
        .get(`/api/v1/timeline/floor/${pathFloorId}/room/${pathRoomId}`)
        .set('Authorization', authorization)
        .send(body);
      expectInvalidParams(res);
    }
  });

  test('v1のタイムライン取得は別フロアのルームを投稿検索前に拒否する', async () => {
    const dev = await createUser({ role: 'developer' });
    const actualFloor = await createFloor(dev);
    const pathFloor = await createFloor(dev);
    const room = await createRoom(dev, actualFloor);
    const findSpy = jest.spyOn(Chat, 'find');

    try {
      const res = await request(app)
        .get(`/api/v1/timeline/floor/${pathFloor._id.toString()}/room/${room._id.toString()}`)
        .set('Authorization', `Bearer ${createDevToken(dev)}`);

      expectInvalidParams(res);
      expect(findSpy).not.toHaveBeenCalled();
    } finally {
      findSpy.mockRestore();
    }
  });

  test.each([
    ['削除済みのルーム', { deleteRoom: true, deleteFloor: false }],
    ['削除済みフロアの配下のルーム', { deleteRoom: false, deleteFloor: true }],
  ])('v1のタイムライン取得は%sにNOT_FOUNDを返す', async (_label, state) => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev, { delete_flg: state.deleteFloor });
    const room = await createRoom(dev, floor, { delete_flg: state.deleteRoom });

    const res = await request(app)
      .get(`/api/v1/timeline/floor/${floor._id.toString()}/room/${room._id.toString()}`)
      .set('Authorization', `Bearer ${createDevToken(dev)}`);

    expectNotFound(res);
  });

  test.each([
    ['所属していないメンバー限定ルーム', { memberOnly: true, kicked: false }],
    ['フロアからキックされた後のルーム', { memberOnly: false, kicked: true }],
  ])('v1のタイムライン取得は%sを投稿検索前に拒否する', async (_label, state) => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor, { member_only: state.memberOnly });
    if (state.kicked) {
      await KickedUser.create({
        user: dev._id,
        kicked_by: dev._id,
        floor: floor._id,
        room: room._id,
      });
    }
    const findSpy = jest.spyOn(Chat, 'find');

    try {
      const res = await request(app)
        .get(`/api/v1/timeline/floor/${floor._id.toString()}/room/${room._id.toString()}`)
        .set('Authorization', `Bearer ${createDevToken(dev)}`);

      expectForbidden(res);
      expect(findSpy).not.toHaveBeenCalled();
    } finally {
      findSpy.mockRestore();
    }
  });

  test('v1のタイムライン取得はトークンがなければ拒否する', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const res = await request(app).get(`/api/v1/timeline/floor/${floor._id.toString()}/room/${room._id.toString()}`);
    expectTokenInvalid(res);
  });

  test('v1のタイムライン取得はトークンのロールがdeveloper以外なら拒否する', async () => {
    const user = await createUser({ role: 'developer' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    const res = await request(app)
      .get(`/api/v1/timeline/floor/${floor._id.toString()}/room/${room._id.toString()}`)
      .set('Authorization', `Bearer ${createDevToken(user, 'User')}`);
    expectForbidden(res);
  });

  test('v1のタイムライン取得はDBの現在のロールがdeveloper以外なら拒否する', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);

    const res = await request(app)
      .get(`/api/v1/timeline/floor/${floor._id.toString()}/room/${room._id.toString()}`)
      .set('Authorization', `Bearer ${createDevToken(user)}`);

    expectForbidden(res);
  });

  test('v1のタイムライン取得は削除済みのdeveloperを拒否する', async () => {
    const dev = await createUser({ role: 'developer', delete_flg: true });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);

    const res = await request(app)
      .get(`/api/v1/timeline/floor/${floor._id.toString()}/room/${room._id.toString()}`)
      .set('Authorization', `Bearer ${createDevToken(dev)}`);

    expectTokenInvalid(res);
  });

  test('v1のルームタグ取得でタグ一覧を返す', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const [olderTag, newerTag] = await RoomTag.create([
      {
        floor: floor._id,
        room: room._id,
        user: dev._id,
        order: 1,
        name: 'older',
        lang: 'ja',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        floor: floor._id,
        room: room._id,
        user: dev._id,
        order: 1,
        name: 'newer',
        lang: 'ja',
        created_at: new Date('2026-01-02T00:00:00.000Z'),
      },
      {
        floor: floor._id,
        room: room._id,
        user: dev._id,
        order: 2,
        name: 'deleted',
        lang: 'ja',
        delete_flg: true,
      },
    ]);

    const res = await request(app)
      .post('/api/v1/roomtag')
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString() });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((tag) => tag.name)).toEqual(['newer', 'older']);
    expect(res.body[0]).toEqual({
      _id: newerTag._id.toString(),
      source_floor_tag: null,
      floor: floor._id.toString(),
      room: room._id.toString(),
      user: dev._id.toString(),
      order: 1,
      name: 'newer',
      lang: 'ja',
      translations: [],
      delete_flg: false,
      created_at: '2026-01-02T00:00:00.000Z',
      updated_at: null,
      deleted_at: null,
      __v: 0,
    });
    expect(res.body[1]._id).toBe(olderTag._id.toString());
  });

  test('v1のルームタグ取得は認可済みルームからフロアを特定する', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const unrelatedFloor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const tag = await RoomTag.create({
      floor: floor._id,
      room: room._id,
      user: dev._id,
      order: 1,
      name: 'room-derived',
      lang: 'ja',
    });

    const res = await request(app)
      .post('/api/v1/roomtag')
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({ floor_id: unrelatedFloor._id.toString(), room_id: room._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.map(({ _id }) => _id)).toEqual([tag._id.toString()]);
  });

  test('v1のルームタグ取得に主系APIと同じ入室条件を適用する', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor, { member_only: true });
    await RoomTag.create({
      floor: floor._id,
      room: room._id,
      user: dev._id,
      order: 1,
      name: 'restricted',
      lang: 'ja',
    });

    const res = await request(app)
      .post('/api/v1/roomtag')
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString() });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });

  test.each(['floor', 'room'])(
    'v1の限定ルームのタグ取得は%sの所属を持つdeveloperを許可する',
    async (membership) => {
      const dev = await createUser({ role: 'developer' });
      const floor = await createFloor(dev);
      const room = await createRoom(dev, floor, { member_only: true });
      if (membership === 'floor') {
        await FloorMember.create({ floor: floor._id, user: dev._id });
      } else {
        await RoomMember.create({ floor: floor._id, room: room._id, user: dev._id });
      }
      const tag = await RoomTag.create({
        floor: floor._id,
        room: room._id,
        user: dev._id,
        order: 1,
        name: 'member-only',
        lang: 'ja',
      });

      const res = await request(app)
        .post('/api/v1/roomtag')
        .set('Authorization', `Bearer ${createDevToken(dev)}`)
        .send({ floor_id: floor._id.toString(), room_id: room._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.map(({ _id }) => _id)).toEqual([tag._id.toString()]);
    }
  );

  test('v1のルームタグ取得はキックされたdeveloperを拒否する', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    await KickedUser.create({
      user: dev._id,
      kicked_by: dev._id,
      floor: floor._id,
      room: room._id,
    });

    const res = await request(app)
      .post('/api/v1/roomtag')
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString() });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });

  test('v1のルームタグ取得は不正な旧形式IDと存在しないルームを拒否する', async () => {
    const dev = await createUser({ role: 'developer' });
    const floorId = new mongoose.Types.ObjectId().toString();
    const roomId = new mongoose.Types.ObjectId().toString();
    const authorization = `Bearer ${createDevToken(dev)}`;

    for (const body of [
      { room_id: roomId },
      { floor_id: floorId },
      { floor_id: 'invalid', room_id: roomId },
      { floor_id: floorId, room_id: 'invalid' },
    ]) {
      const invalidResponse = await request(app)
        .post('/api/v1/roomtag')
        .set('Authorization', authorization)
        .send(body);
      expectInvalidParams(invalidResponse);
    }

    const missingRoomResponse = await request(app)
      .post('/api/v1/roomtag')
      .set('Authorization', authorization)
      .send({ floor_id: floorId, room_id: roomId });

    expect(missingRoomResponse.status).toBe(404);
    expect(missingRoomResponse.body?.error?.code).toBe('NOT_FOUND');

    const missingFloorId = new mongoose.Types.ObjectId();
    const roomWithoutFloor = await createRoom(dev, missingFloorId);
    const missingFloorResponse = await request(app)
      .post('/api/v1/roomtag')
      .set('Authorization', authorization)
      .send({ floor_id: missingFloorId.toString(), room_id: roomWithoutFloor._id.toString() });

    expect(missingFloorResponse.status).toBe(404);
    expect(missingFloorResponse.body?.error?.code).toBe('NOT_FOUND');
  });

  test.each([
    ['削除済みのルーム', { deleteRoom: true, deleteFloor: false }],
    ['削除済みフロアの配下のルーム', { deleteRoom: false, deleteFloor: true }],
  ])('v1のルームタグ取得は%sにNOT_FOUNDを返す', async (_label, state) => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev, { delete_flg: state.deleteFloor });
    const room = await createRoom(dev, floor, { delete_flg: state.deleteRoom });

    const res = await request(app)
      .post('/api/v1/roomtag')
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString() });

    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe('NOT_FOUND');
  });

  test('v1のルームタグ取得はトークンがなければ拒否する', async () => {
    const dev = await createUser();
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const res = await request(app)
      .post('/api/v1/roomtag')
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString() });
    expectTokenInvalid(res);
  });

  test('v1のルームタグ取得はdeveloper以外のトークンを拒否する', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const res = await request(app)
      .post('/api/v1/roomtag')
      .set('Authorization', `Bearer ${createDevToken(dev, 'User')}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString() });
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });

  test('v1のルームタグ取得はDBの現在のロールがdeveloper以外なら拒否する', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);

    const res = await request(app)
      .post('/api/v1/roomtag')
      .set('Authorization', `Bearer ${createDevToken(user)}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString() });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });

  test('v1のルームタグ取得は削除済みのdeveloperを拒否する', async () => {
    const dev = await createUser({ role: 'developer', delete_flg: true });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);

    const res = await request(app)
      .post('/api/v1/roomtag')
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString() });

    expectTokenInvalid(res);
  });

  test.each([
    ['/api/v1/post/create', false],
    ['/api/v1/upload/audio', true],
  ])(
    'POST %sはDBの現在のロールがdeveloper以外なら入力解析前に拒否する',
    async (routePath, isUpload) => {
      const user = await createUser({ role: 'Author' });

      const res = await sendD03GuardProbe({
        routePath,
        token: createDevToken(user),
        isUpload,
      });

      expectForbidden(res);
      if (isUpload) await expect(fs.promises.readdir(mediaRoot)).resolves.toEqual([]);
    }
  );

  test.each([
    ['/api/v1/post/create', false],
    ['/api/v1/upload/audio', true],
  ])('POST %sは削除済みのdeveloperを入力解析前に拒否する', async (routePath, isUpload) => {
    const user = await createUser({ role: 'developer', delete_flg: true });

    const res = await sendD03GuardProbe({
      routePath,
      token: createDevToken(user),
      isUpload,
    });

    expectTokenInvalid(res);
    if (isUpload) await expect(fs.promises.readdir(mediaRoot)).resolves.toEqual([]);
  });

  test('v1で投稿を更新・論理削除できる', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const post = await Chat.create({
      floor: floor._id,
      room: room._id,
      user: dev._id,
      content: 'before',
      reactions: [{ user: dev._id, type: 'いいね' }],
      supplementaries: [
        {
          user: dev._id,
          content: 'internal',
          meta: {
            analysis_kind: 'conversation',
            analysis_setting: new mongoose.Types.ObjectId(),
            analysis_setting_revision: 1,
            analysis_trigger_tag: new mongoose.Types.ObjectId(),
            analysis_source_revision: 0,
          },
        },
      ],
    });

    const updateRes = await request(app)
      .post('/api/v1/post/update')
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({ room_id: room._id.toString(), post_id: post._id.toString(), content: 'after' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.content).toBe('after');
    expect(updateRes.body.analysis_source_revision).toBeUndefined();
    expect(updateRes.body.supplementaries[0].meta).toBeUndefined();

    let saved = await Chat.findById(post._id).lean();
    expect(saved.analysis_source_revision).toBe(1);
    expect(saved.reactions).toHaveLength(1);
    expect(saved.supplementaries[0].meta.analysis_kind).toBe('conversation');

    const sameUpdateRes = await request(app)
      .post('/api/v1/post/update')
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({ room_id: room._id.toString(), post_id: post._id.toString(), content: 'after' });
    expect(sameUpdateRes.status).toBe(200);
    saved = await Chat.findById(post._id).lean();
    expect(saved.analysis_source_revision).toBe(1);

    const deleteRes = await request(app)
      .post('/api/v1/post/delete')
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({ room_id: room._id.toString(), post_id: post._id.toString() });
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.delete_flg).toBe(true);

    saved = await Chat.findById(post._id).lean();
    expect(saved.delete_flg).toBe(true);
    expect(saved.analysis_source_revision).toBe(1);
  });

  test('v1の投稿更新で不正な入力を拒否する', async () => {
    const dev = await createUser({ role: 'developer' });
    const res = await request(app)
      .post('/api/v1/post/update')
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({ post_id: 'invalid-post-id', content: 'after' });
    expectInvalidParams(res);
  });

  test.each([
    ['MAX_SAFE_INTEGER', Number.MAX_SAFE_INTEGER],
    ['小数', 1.5],
  ])('v1の投稿更新は増加できない解析元のリビジョン%sを拒否する', async (_label, revision) => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const post = await Chat.create({ floor: floor._id, room: room._id, user: dev._id, content: 'before' });
    await Chat.collection.updateOne(
      { _id: post._id },
      { $set: { analysis_source_revision: revision } }
    );

    const res = await request(app)
      .post('/api/v1/post/update')
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({ room_id: room._id.toString(), post_id: post._id.toString(), content: 'after' });

    expectInvalidParams(res);
    const saved = await Chat.collection.findOne({ _id: post._id });
    expect(saved.content).toBe('before');
    expect(saved.analysis_source_revision).toBe(revision);
  });

  test('v1の投稿削除はdeveloper以外を拒否する', async () => {
    const user = await createUser();
    const res = await request(app)
      .post('/api/v1/post/delete')
      .set('Authorization', `Bearer ${createDevToken(user, 'User')}`)
      .send({ post_id: '000000000000000000000000' });
    expectForbidden(res);
  });

  test('v1で返信を更新・論理削除できる', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const post = await Chat.create({
      floor: floor._id,
      room: room._id,
      user: dev._id,
      content: 'post',
      replies: [
        {
          user: dev._id,
          content: 'reply-before',
          lang: 'ja',
          reactions: [{ user: dev._id, type: '拍手' }],
          supplementaries: [
            {
              user: dev._id,
              content: 'internal',
              meta: {
                analysis_kind: 'conversation',
                analysis_setting: new mongoose.Types.ObjectId(),
                analysis_setting_revision: 1,
                analysis_trigger_tag: new mongoose.Types.ObjectId(),
                analysis_source_revision: 0,
              },
            },
          ],
        },
      ],
    });
    const replyId = post.replies[0]._id.toString();

    const updateRes = await request(app)
      .post('/api/v1/reply/update')
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({ room_id: room._id.toString(), post_id: post._id.toString(), reply_id: replyId, content: 'reply-after' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.replies.find((reply) => reply._id.toString() === replyId).content).toBe('reply-after');
    expect(updateRes.body.replies[0].analysis_source_revision).toBeUndefined();
    expect(updateRes.body.replies[0].supplementaries[0].meta).toBeUndefined();

    let saved = await Chat.findById(post._id).lean();
    let savedReply = saved.replies.find((reply) => reply._id.toString() === replyId);
    expect(savedReply.analysis_source_revision).toBe(1);
    expect(savedReply.reactions).toHaveLength(1);
    expect(savedReply.supplementaries[0].meta.analysis_kind).toBe('conversation');

    const deleteRes = await request(app)
      .post('/api/v1/reply/delete')
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({ room_id: room._id.toString(), post_id: post._id.toString(), reply_id: replyId });
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.replies).toHaveLength(0);
    saved = await Chat.findById(post._id).lean();
    savedReply = saved.replies.find((reply) => reply._id.toString() === replyId);
    expect(savedReply.analysis_source_revision).toBe(1);
  });

  test('v1の返信更新で不正な入力を拒否する', async () => {
    const dev = await createUser({ role: 'developer' });
    const res = await request(app)
      .post('/api/v1/reply/update')
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({ reply_id: 'invalid-reply-id', content: 'reply-after' });
    expectInvalidParams(res);
  });

  test('v1の返信削除はトークンがなければ拒否する', async () => {
    const res = await request(app).post('/api/v1/reply/delete').send({ reply_id: '000000000000000000000000' });
    expectTokenInvalid(res);
  });

  test('v1で投稿の付加情報を更新・論理削除できる', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const post = await Chat.create({
      floor: floor._id,
      room: room._id,
      user: dev._id,
      content: 'post',
      supplementaries: [{ user: dev._id, content: 'supp-before', lang: 'ja' }],
    });
    const supplementId = post.supplementaries[0]._id.toString();

    const updateRes = await request(app)
      .post('/api/v1/post/supplement/update')
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({ room_id: room._id.toString(), post_id: post._id.toString(), supplement_id: supplementId, content: 'supp-after' });
    expect(updateRes.status).toBe(200);
    expect(
      updateRes.body.supplementaries.find((supplement) => supplement._id.toString() === supplementId).content
    ).toBe('supp-after');

    const deleteRes = await request(app)
      .post('/api/v1/post/supplement/delete')
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({ room_id: room._id.toString(), post_id: post._id.toString(), supplement_id: supplementId });
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.supplementaries).toHaveLength(0);
  });

  test('v1の投稿付加情報の更新で不正な入力を拒否する', async () => {
    const dev = await createUser({ role: 'developer' });
    const res = await request(app)
      .post('/api/v1/post/supplement/update')
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({ supplement_id: 'invalid-supplement-id', content: 'supp-after' });
    expectInvalidParams(res);
  });

  test('v1の投稿付加情報の削除はトークンがなければ拒否する', async () => {
    const res = await request(app)
      .post('/api/v1/post/supplement/delete')
      .send({ supplement_id: '000000000000000000000000' });
    expectTokenInvalid(res);
  });

  test('v1で返信の付加情報を作成・更新・削除できる', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const post = await Chat.create({
      floor: floor._id,
      room: room._id,
      user: dev._id,
      content: 'post',
      replies: [{ user: dev._id, content: 'reply', lang: 'ja' }],
    });
    const replyId = post.replies[0]._id.toString();

    const createRes = await request(app)
      .post('/api/v1/reply/supplement/create')
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({ room_id: room._id.toString(), post_id: post._id.toString(), reply_id: replyId, content: 'reply-supp-before' });
    expect(createRes.status).toBe(200);
    const createdReply = createRes.body.replies.find((reply) => reply._id.toString() === replyId);
    expect(createdReply.supplementaries).toHaveLength(1);
    const supplementId = createdReply.supplementaries[0]._id.toString();

    const updateRes = await request(app)
      .post('/api/v1/reply/supplement/update')
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({ room_id: room._id.toString(), post_id: post._id.toString(), reply_id: replyId, supplement_id: supplementId, content: 'reply-supp-after' });
    expect(updateRes.status).toBe(200);
    const updatedReply = updateRes.body.replies.find((reply) => reply._id.toString() === replyId);
    expect(updatedReply.supplementaries.find((supplement) => supplement._id.toString() === supplementId).content).toBe(
      'reply-supp-after'
    );

    const deleteRes = await request(app)
      .post('/api/v1/reply/supplement/delete')
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({ room_id: room._id.toString(), post_id: post._id.toString(), reply_id: replyId, supplement_id: supplementId });
    expect(deleteRes.status).toBe(200);
    const deletedReply = deleteRes.body.replies.find((reply) => reply._id.toString() === replyId);
    expect(deletedReply.supplementaries).toHaveLength(0);
  });

  test('v1の返信付加情報の作成で不正な入力を拒否する', async () => {
    const dev = await createUser({ role: 'developer' });
    const res = await request(app)
      .post('/api/v1/reply/supplement/create')
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .send({ reply_id: 'invalid-reply-id', content: 'reply-supp-before' });
    expectInvalidParams(res);
  });

  test.each([
    ['削除済みのルーム', { deleteRoom: true, deleteFloor: false }],
    ['削除済みのフロア', { deleteRoom: false, deleteFloor: true }],
  ])('v1の返信付加情報の作成は%sを保存とSocket通知の前に拒否する', async (_label, state) => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev, { delete_flg: state.deleteFloor });
    const room = await createRoom(dev, floor, { delete_flg: state.deleteRoom });
    const post = await Chat.create({
      floor: floor._id,
      room: room._id,
      user: dev._id,
      content: 'post',
      replies: [{ user: dev._id, content: 'reply', lang: 'ja' }],
    });
    const replyId = post.replies[0]._id.toString();
    const mutationSpy = jest.spyOn(Chat, 'findOneAndUpdate');

    try {
      const res = await request(app)
        .post('/api/v1/reply/supplement/create')
        .set('Authorization', `Bearer ${createDevToken(dev)}`)
        .send({ room_id: room._id.toString(), post_id: post._id.toString(), reply_id: replyId, content: 'must-not-be-created' });

      expectInvalidParams(res);
      expect(mutationSpy).not.toHaveBeenCalled();
      const persisted = await Chat.findById(post._id).lean();
      expect(persisted.replies[0].supplementaries).toHaveLength(0);
      expect(socketTo).not.toHaveBeenCalled();
      expect(socketEmit).not.toHaveBeenCalled();
    } finally {
      mutationSpy.mockRestore();
    }
  });

  test('v1の返信付加情報の更新はトークンがなければ拒否する', async () => {
    const res = await request(app)
      .post('/api/v1/reply/supplement/update')
      .send({ reply_id: '000000000000000000000000', supplement_id: '000000000000000000000000', content: 'c' });
    expectTokenInvalid(res);
  });

  test('developerはv1で音声をアップロードできる', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const targetDir = path.join(mediaRoot, floor._id.toString(), room._id.toString());
    await fs.promises.mkdir(targetDir, { recursive: true });

    const res = await request(app)
      .post('/api/v1/upload/audio')
      .query({ room_id: room._id.toString() })
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .field('floor_id', floor._id.toString())
      .field('room_id', room._id.toString())
      .attach('audio_file', tinyAudio, { filename: 'sample.mp3', contentType: 'audio/mpeg' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('audio_name');
    const savedPath = path.join(targetDir, res.body.audio_name);
    await expect(fs.promises.access(savedPath)).resolves.toBeUndefined();
  });

  test('v1の音声アップロードはトークンがなければ拒否する', async () => {
    const res = await request(app).post('/api/v1/upload/audio').send({});
    expectTokenInvalid(res);
  });

  test('v1の音声アップロードはdeveloper以外を拒否する', async () => {
    const user = await createUser();
    const res = await request(app)
      .post('/api/v1/upload/audio')
      .set('Authorization', `Bearer ${createDevToken(user, 'User')}`)
      .send({});
    expectForbidden(res);
  });

  test('v1の音声アップロードで不正な入力を拒否する', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const res = await request(app)
      .post('/api/v1/upload/audio')
      .query({ room_id: room._id.toString() })
      .set('Authorization', `Bearer ${createDevToken(dev)}`)
      .field('floor_id', 'invalid-floor-id')
      .field('room_id', room._id.toString())
      .attach('audio_file', tinyAudio, { filename: 'sample.mp3', contentType: 'audio/mpeg' });
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('v1の動画アップロードはサムネイル生成失敗を共通のエラーへ変換する', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const ffmpegError = new Error('ffmpeg failure detail');
    const storeVideoSpy = jest.spyOn(uploadService, 'uploadTimelineVideo').mockRejectedValue(ffmpegError);

    try {
      app = buildErrorHandledApp({
        mounts: [{ path: '/api/v1', handler: v1Router(ioStub) }],
      });

      const res = await request(app)
        .post('/api/v1/upload/video')
        .query({ room_id: room._id.toString() })
        .set('Authorization', `Bearer ${createDevToken(dev)}`)
        .field('floor_id', floor._id.toString())
        .field('room_id', room._id.toString())
        .attach('video_file', Buffer.from('mock video'), {
          filename: 'sample.mp4',
          contentType: 'video/mp4',
        });

      expect(storeVideoSpy).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          status: 500,
          message: Messages.INTERNAL_SERVER_ERROR,
        },
      });
      expect(JSON.stringify(res.body)).not.toContain(ffmpegError.message);
    } finally {
      storeVideoSpy.mockRestore();
    }
  });

  test('v1の動画アップロードはdeveloper以外を拒否する', async () => {
    const user = await createUser();
    const res = await request(app)
      .post('/api/v1/upload/video')
      .set('Authorization', `Bearer ${createDevToken(user, 'User')}`)
      .send({});

    expectForbidden(res);
  });
});
