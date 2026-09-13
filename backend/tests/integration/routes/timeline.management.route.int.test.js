const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');
const { testRuntimePath, trailingSlash, ensureDir, removeDirSafe } = require('../../_helpers/testRuntime');

const { attachErrorHandler } = require('../_helpers/app');
const User = require('../../../models/User');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const Chat = require('../../../models/Chat');
require('../../../models/RoomTag');

const ORIGINAL_ENV = {
  JWT_SECRET: process.env.JWT_SECRET,
  MEDIA_PATH: process.env.MEDIA_PATH,
};
const mediaRoot = testRuntimePath('timeline-management', 'media');

if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';
process.env.MEDIA_PATH = trailingSlash(mediaRoot);

const managementRouter = require('../../../routes/timeline/management.route');

describe('タイムラインデータの管理API', () => {
  let app;
  let adminToken;

  const ensureEnv = () => {
    if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.MEDIA_PATH = trailingSlash(mediaRoot);
  };

  const restoreEnv = () => {
    if (ORIGINAL_ENV.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_ENV.JWT_SECRET;
    if (ORIGINAL_ENV.MEDIA_PATH === undefined) delete process.env.MEDIA_PATH;
    else process.env.MEDIA_PATH = ORIGINAL_ENV.MEDIA_PATH;
  };

  const buildToken = () => adminToken;

  const buildApp = () => {
    const a = express();
    a.use(express.json());
    a.use('/timeline/management', managementRouter({}));
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

  beforeAll(async () => {
    await ensureDir(mediaRoot);
    ensureEnv();
  });

  afterAll(async () => {
    await removeDirSafe(mediaRoot);
    restoreEnv();
  });

  beforeEach(async () => {
    await removeDirSafe(mediaRoot);
    await ensureDir(mediaRoot);
    const admin = await createUser({ role: 'Administrator' });
    adminToken = jwt.sign(
      { user_id: admin._id.toString(), user_role: admin.role },
      process.env.JWT_SECRET
    );
    app = buildApp();
  });

  test('サイズ確認はJSONの整形サイズとZIP概算を返し、認可と所属を検証する', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    await Chat.create([
      { floor: floor._id, room: room._id, user: user._id, content: '日本語の投稿', replies: [{ content: '削除済み', delete_flg: true }] },
      { floor: floor._id, room: room._id, user: user._id, content: 'second' },
      { floor: floor._id, room: room._id, user: user._id, content: 'excluded', delete_flg: true },
    ]);
    const payload = { floor_id: String(floor._id), room_id: String(room._id) };
    const post = (url, data) => request(app).post('/timeline/management/' + url).set('Authorization', `Bearer ${buildToken()}`).send(data);
    const output = await post('timeline', payload);
    const estimate = await post('timeline/estimate', { ...payload, type: 'json' });
    expect(estimate.status).toBe(200);
    expect(estimate.body).toMatchObject({ itemCount: 2, type: 'json', approximate: true,
      estimatedBytes: Buffer.byteLength(JSON.stringify(output.body, null, '  ')) });
    const roomDir = path.join(mediaRoot, payload.floor_id, payload.room_id);
    await ensureDir(roomDir);
    await fs.writeFile(path.join(roomDir, 'fixture.txt'), 'example content');
    const zipEstimate = await post('timeline/estimate', { ...payload, type: 'media' });
    expect(zipEstimate.status).toBe(200);
    expect(zipEstimate.body.itemCount).toBe(1);
    expect(zipEstimate.body.estimatedBytes).toBeGreaterThan(15);
    expect((await request(app).post('/timeline/management/timeline/estimate').send({ ...payload, type: 'json' })).status).toBe(401);
    const nonAdmin = jwt.sign({ user_id: String(user._id), user_role: user.role }, process.env.JWT_SECRET);
    expect((await request(app).post('/timeline/management/timeline/estimate').set('Authorization', `Bearer ${nonAdmin}`).send({ ...payload, type: 'json' })).status).toBe(403);
    expect((await post('timeline/estimate', { ...payload, floor_id: String(user._id), type: 'json' })).status).toBe(400);
    expect((await post('timeline/estimate', { ...payload, type: 'invalid' })).status).toBe(400);
  });

  test('管理者は投稿一覧を取得できる', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    await Chat.create({ floor: floor._id, room: room._id, user: user._id, content: 'post' });

    const res = await request(app)
      .post('/timeline/management/paginate')
      .set('Authorization', `Bearer ${buildToken()}`)
      .send({ page: 1, search: null });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('docs');
    expect(res.body.docs.length).toBeGreaterThan(0);
  });

  test('管理APIの応答で内部情報とリビジョンを隠し、削除状態の条件と取得対象の仕様を維持する', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    const meta = {
      analysis_kind: 'conversation',
      analysis_setting: user._id,
      analysis_setting_revision: 1,
      analysis_trigger_tag: user._id,
      analysis_source_revision: 2,
    };
    const post = await Chat.create({
      floor: floor._id,
      room: room._id,
      user: user._id,
      content: 'post',
      analysis_source_revision: 3,
      supplementaries: [{ content: 'deleted post supplement', delete_flg: true, meta }],
      replies: [
        {
          content: 'deleted reply',
          delete_flg: true,
          analysis_source_revision: 2,
          supplementaries: [{ content: 'deleted reply supplement', delete_flg: true, meta }],
        },
      ],
    });

    const page = await request(app)
      .post('/timeline/management/paginate')
      .set('Authorization', `Bearer ${buildToken()}`)
      .send({ page: 1, search: null });
    const pagePost = page.body.docs.find((entry) => entry._id === post._id.toString());
    expect(page.status).toBe(200);
    expect(pagePost.analysis_source_revision).toBeUndefined();
    expect(pagePost.replies).toHaveLength(1);
    expect(pagePost.replies[0].delete_flg).toBe(true);
    expect(pagePost.replies[0].analysis_source_revision).toBeUndefined();
    expect(pagePost.replies[0].supplementaries[0].meta).toBeUndefined();
    expect(pagePost.supplementaries[0].delete_flg).toBe(true);
    expect(pagePost.supplementaries[0].meta).toBeUndefined();

    const timeline = await request(app)
      .post('/timeline/management/timeline')
      .set('Authorization', `Bearer ${buildToken()}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString() });
    expect(timeline.status).toBe(200);
    expect(timeline.body[0].replies).toHaveLength(0);
    expect(timeline.body[0].supplementaries).toHaveLength(0);

    const saved = await Chat.findById(post._id).lean();
    expect(saved.analysis_source_revision).toBe(3);
    expect(saved.replies[0].supplementaries[0].meta.analysis_source_revision).toBe(2);
  });

  test('GETのクエリでページを指定して一覧を取得できる', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    await Chat.create({ floor: floor._id, room: room._id, user: user._id, content: 'post' });

    const res = await request(app)
      .get('/timeline/management/paginate?page=1&search=')
      .set('Authorization', `Bearer ${buildToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('docs');
  });

  test('管理者以外は投稿一覧を取得できない', async () => {
    const user = await createUser({ role: 'User' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    await Chat.create({ floor: floor._id, room: room._id, user: user._id, content: 'post' });

    const res = await request(app)
      .post('/timeline/management/paginate')
      .set('Authorization', `Bearer ${jwt.sign({ user_id: user._id.toString(), user_role: 'User' }, process.env.JWT_SECRET)}`)
      .send({ page: 1, search: '' });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });

  test('指定したフロア・ルームのタイムラインを取得できる', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    await Chat.create({ floor: floor._id, room: room._id, user: user._id, content: 'post' });

    const res = await request(app)
      .post('/timeline/management/timeline')
      .set('Authorization', `Bearer ${buildToken()}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString() });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
  });

  test.each([
    ['削除済みフロア', { floorDeleted: true, roomDeleted: false }],
    ['削除済みルーム', { floorDeleted: false, roomDeleted: true }],
    ['削除済みフロア内の削除済みルーム', { floorDeleted: true, roomDeleted: true }],
  ])('%sのタイムラインを取得できる', async (_label, state) => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user, {
      delete_flg: state.floorDeleted,
      deleted_at: state.floorDeleted ? new Date() : null,
    });
    const room = await createRoom(user, floor, {
      delete_flg: state.roomDeleted,
      deleted_at: state.roomDeleted ? new Date() : null,
    });
    await Chat.create({
      floor: floor._id,
      room: room._id,
      user: user._id,
      content: 'recoverable post',
    });

    const response = await request(app)
      .post('/timeline/management/timeline')
      .set('Authorization', `Bearer ${buildToken()}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString() });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].content).toBe('recoverable post');
  });

  test('timeline JSONとメディアZIPは別フロア所属ルームを拒否する', async () => {
    const user = await createUser({ role: 'Author' });
    const floorA = await createFloor(user, { title: 'Floor A' });
    const floorB = await createFloor(user, { title: 'Floor B' });
    const roomA = await createRoom(user, floorA, { title: 'Room A' });

    const timelineRes = await request(app)
      .post('/timeline/management/timeline')
      .set('Authorization', `Bearer ${buildToken()}`)
      .send({ floor_id: floorB._id.toString(), room_id: roomA._id.toString() });

    const mediaRes = await request(app)
      .post('/timeline/management/timeline/media')
      .set('Authorization', `Bearer ${buildToken()}`)
      .send({ floor_id: floorB._id.toString(), room_id: roomA._id.toString() });

    expect(timelineRes.status).toBe(400);
    expect(timelineRes.body?.error?.code).toBe('INVALID_PARAMS');
    expect(mediaRes.status).toBe(400);
    expect(mediaRes.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('管理者以外はタイムラインデータを取得できない', async () => {
    const user = await createUser({ role: 'User' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    await Chat.create({ floor: floor._id, room: room._id, user: user._id, content: 'post' });

    const res = await request(app)
      .post('/timeline/management/timeline')
      .set('Authorization', `Bearer ${jwt.sign({ user_id: user._id.toString(), user_role: 'User' }, process.env.JWT_SECRET)}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString() });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });

  test('投稿を論理削除できる', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    const post = await Chat.create({ floor: floor._id, room: room._id, user: user._id, content: 'post' });

    const res = await request(app)
      .post('/timeline/management/delete')
      .set('Authorization', `Bearer ${buildToken()}`)
      .send({ post_id: post._id.toString(), delete_flg: true });

    expect(res.status).toBe(200);
    expect(res.body.delete_flg).toBe(true);
    const updated = await Chat.findById(post._id);
    expect(updated.delete_flg).toBe(true);
  });

  test('論理削除済みの投稿を復元できる', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    const post = await Chat.create({ floor: floor._id, room: room._id, user: user._id, content: 'post', delete_flg: true });

    const res = await request(app)
      .post('/timeline/management/delete')
      .set('Authorization', `Bearer ${buildToken()}`)
      .send({ post_id: post._id.toString(), delete_flg: false });

    expect(res.status).toBe(200);
    expect(res.body.delete_flg).toBe(false);
  });

  test('返信を論理削除・復元できる', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    const post = await Chat.create({
      floor: floor._id,
      room: room._id,
      user: user._id,
      content: 'post',
      replies: [{ content: 'reply', lang: 'ja' }],
    });
    const replyId = post.replies[0]._id.toString();

    const deleted = await request(app)
      .post('/timeline/management/delete')
      .set('Authorization', `Bearer ${buildToken()}`)
      .send({ post_id: post._id.toString(), reply_id: replyId, delete_flg: true });

    expect(deleted.status).toBe(200);
    const deletedReply = deleted.body.replies.find((row) => row._id === replyId);
    expect(deletedReply.delete_flg).toBe(true);

    const restored = await request(app)
      .post('/timeline/management/delete')
      .set('Authorization', `Bearer ${buildToken()}`)
      .send({ post_id: post._id.toString(), reply_id: replyId, delete_flg: false });

    expect(restored.status).toBe(200);
    const restoredReply = restored.body.replies.find((row) => row._id === replyId);
    expect(restoredReply.delete_flg).toBe(false);
  });

  test('投稿の付加情報を論理削除できる', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    const post = await Chat.create({
      floor: floor._id,
      room: room._id,
      user: user._id,
      content: 'post',
      supplementaries: [{ content: 'supplement', lang: 'ja' }],
    });
    const supplementId = post.supplementaries[0]._id.toString();

    const deleted = await request(app)
      .post('/timeline/management/delete')
      .set('Authorization', `Bearer ${buildToken()}`)
      .send({ post_id: post._id.toString(), supplement_id: supplementId, delete_flg: true });

    expect(deleted.status).toBe(200);
    const supplement = deleted.body.supplementaries.find((row) => row._id === supplementId);
    expect(supplement.delete_flg).toBe(true);
  });

  test('論理削除済みの投稿の付加情報を復元できる', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    const post = await Chat.create({
      floor: floor._id,
      room: room._id,
      user: user._id,
      content: 'post',
      supplementaries: [{ content: 'supplement', lang: 'ja', delete_flg: true }],
    });
    const supplementId = post.supplementaries[0]._id.toString();

    const restored = await request(app)
      .post('/timeline/management/delete')
      .set('Authorization', `Bearer ${buildToken()}`)
      .send({ post_id: post._id.toString(), supplement_id: supplementId, delete_flg: false });

    expect(restored.status).toBe(200);
    const supplement = restored.body.supplementaries.find((row) => row._id === supplementId);
    expect(supplement.delete_flg).toBe(false);
  });

  test('返信の付加情報を論理削除できる', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    const post = await Chat.create({
      floor: floor._id,
      room: room._id,
      user: user._id,
      content: 'post',
      replies: [{ content: 'reply', lang: 'ja', supplementaries: [{ content: 'reply supplement', lang: 'ja' }] }],
    });
    const replyId = post.replies[0]._id.toString();
    const supplementId = post.replies[0].supplementaries[0]._id.toString();

    const deleted = await request(app)
      .post('/timeline/management/delete')
      .set('Authorization', `Bearer ${buildToken()}`)
      .send({
        post_id: post._id.toString(),
        reply_id: replyId,
        supplement_id: supplementId,
        delete_flg: true,
      });

    expect(deleted.status).toBe(200);
    const reply = deleted.body.replies.find((row) => row._id === replyId);
    const replySupp = reply.supplementaries.find((row) => row._id === supplementId);
    expect(replySupp.delete_flg).toBe(true);
  });

  test('削除対象の返信がなければNOT_FOUNDを返す', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    const post = await Chat.create({ floor: floor._id, room: room._id, user: user._id, content: 'post' });

    const res = await request(app)
      .post('/timeline/management/delete')
      .set('Authorization', `Bearer ${buildToken()}`)
      .send({ post_id: post._id.toString(), reply_id: '507f191e810c19729de860ea', delete_flg: true });

    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe('NOT_FOUND');
  });

  test('削除対象の付加情報がなければNOT_FOUNDを返す', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    const post = await Chat.create({
      floor: floor._id,
      room: room._id,
      user: user._id,
      content: 'post',
      supplementaries: [{ content: 'supplement', lang: 'ja' }],
    });

    const res = await request(app)
      .post('/timeline/management/delete')
      .set('Authorization', `Bearer ${buildToken()}`)
      .send({ post_id: post._id.toString(), supplement_id: '507f191e810c19729de860ea', delete_flg: true });

    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe('NOT_FOUND');
  });

  test('保存先があれば削除済みフロア・ルームのメディアもZIPで取得できる', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user, { delete_flg: true, deleted_at: new Date() });
    const room = await createRoom(user, floor, { delete_flg: true, deleted_at: new Date() });
    const dirPath = path.join(process.env.MEDIA_PATH, floor._id.toString(), room._id.toString());
    await fs.mkdir(dirPath, { recursive: true });

    const res = await request(app)
      .post('/timeline/management/timeline/media')
      .set('Authorization', `Bearer ${buildToken()}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString() });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/zip');
  });

  test('管理者以外はメディアZIPを取得できない', async () => {
    const user = await createUser({ role: 'User' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    const dirPath = path.join(process.env.MEDIA_PATH, floor._id.toString(), room._id.toString());
    await fs.mkdir(dirPath, { recursive: true });

    const res = await request(app)
      .post('/timeline/management/timeline/media')
      .set('Authorization', `Bearer ${jwt.sign({ user_id: user._id.toString(), user_role: 'User' }, process.env.JWT_SECRET)}`)
      .send({ floor_id: floor._id.toString(), room_id: room._id.toString() });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });
});
