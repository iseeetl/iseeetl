const express = require('express');
const fs = require('fs');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const path = require('path');

jest.mock('../../../services/analysis.service', () => ({
  runPostAnalyses: jest.fn(),
  runReplyAnalyses: jest.fn(),
}));
jest.mock('../../../services/backgroundTaskRunner', () => ({
  runBackgroundTask: jest.fn(),
}));

const { attachErrorHandler } = require('../_helpers/app');
const { testRuntimePath, ensureDir, removeDirSafe, trailingSlash } = require('../../_helpers/testRuntime');

const mediaRoot = testRuntimePath('v1-route', 'media');
const ORIGINAL_ENV = {
  JWT_DEV_SECRET: process.env.JWT_DEV_SECRET,
  MEDIA_PATH: process.env.MEDIA_PATH,
};
if (!process.env.JWT_DEV_SECRET) process.env.JWT_DEV_SECRET = 'test-dev-secret';
process.env.MEDIA_PATH = trailingSlash(mediaRoot);

const v1Router = require('../../../routes/v1');
const User = require('../../../models/User');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const Chat = require('../../../models/Chat');
const RoomTag = require('../../../models/RoomTag');
const analysisService = require('../../../services/analysis.service');
const { runBackgroundTask } = require('../../../services/backgroundTaskRunner');

describe('v1 APIの基本操作', () => {
  let app;
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  );

  const restoreEnv = () => {
    if (ORIGINAL_ENV.JWT_DEV_SECRET === undefined) delete process.env.JWT_DEV_SECRET;
    else process.env.JWT_DEV_SECRET = ORIGINAL_ENV.JWT_DEV_SECRET;
    if (ORIGINAL_ENV.MEDIA_PATH === undefined) delete process.env.MEDIA_PATH;
    else process.env.MEDIA_PATH = ORIGINAL_ENV.MEDIA_PATH;
  };

  const buildToken = (payload) => jwt.sign(payload, process.env.JWT_DEV_SECRET);
  const createUser = (overrides = {}) =>
    User.create({
      username: `dev-${Date.now()}-${Math.random()}`,
      mail: `dev-${Date.now()}-${Math.random()}@example.com`,
      lang: 'ja',
      role: 'User',
      ...overrides,
    });
  const createFloor = (user, overrides = {}) =>
    Floor.create({
      user: user._id,
      title: 'Floor',
      lang: 'ja',
      target_langs: [],
      ...overrides,
    });
  const createRoom = (user, floor, overrides = {}) =>
    Room.create({
      user: user._id,
      floor: floor._id,
      title: 'Room',
      lang: 'ja',
      member_only: false,
      ...overrides,
    });

  const buildApp = () => {
    const a = express();
    a.use(express.json());
    a.use('/api/v1', v1Router({ to: () => ({ emit: () => {} }) }));
    return attachErrorHandler(a);
  };

  beforeEach(async () => {
    await removeDirSafe(mediaRoot);
    await ensureDir(mediaRoot);
    app = buildApp();
  });

  afterEach(async () => {
    await removeDirSafe(mediaRoot);
  });

  afterAll(() => {
    restoreEnv();
  });

  test('developerはv1で投稿を作成できる', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const res = await request(app)
      .post('/api/v1/post/create')
      .set('Authorization', `Bearer ${buildToken({ user_id: dev._id.toString(), user_role: 'developer' })}`)
      .send({
        floor_id: floor._id.toString(),
        room_id: room._id.toString(),
        content: 'integration post',
      });

    expect(res.status).toBe(200);
    expect(res.body.content).toBe('integration post');
    expect(res.body.floor.toString()).toBe(floor._id.toString());
    expect(res.body.room.toString()).toBe(room._id.toString());
    expect(res.body.analysis_source_revision).toBeUndefined();

    const saved = await Chat.findById(res.body._id).lean();
    expect(saved).toBeTruthy();
    expect(saved.content).toBe('integration post');
    expect(saved.analysis_source_revision).toBe(1);
  });

  test('v1の投稿作成で不正な入力を拒否する', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const res = await request(app)
      .post('/api/v1/post/create')
      .set('Authorization', `Bearer ${buildToken({ user_id: dev._id.toString(), user_role: 'developer' })}`)
      .send({
        floor_id: 'invalid-floor-id',
        room_id: room._id.toString(),
        content: 'integration post',
      });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('v1の投稿作成は認可済みルームと異なるフロアIDを拒否する', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const otherFloor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const res = await request(app)
      .post('/api/v1/post/create')
      .set('Authorization', `Bearer ${buildToken({ user_id: dev._id.toString(), user_role: 'developer' })}`)
      .send({
        floor_id: otherFloor._id.toString(),
        room_id: room._id.toString(),
        content: 'must not be created',
      });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
    expect(await Chat.countDocuments({ room: room._id })).toBe(0);
  });

  test('v1で既存の投稿に返信を追加できる', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const post = await Chat.create({
      floor: floor._id,
      room: room._id,
      user: dev._id,
      content: 'base post',
      lang: 'ja',
    });
    const res = await request(app)
      .post('/api/v1/reply/create')
      .set('Authorization', `Bearer ${buildToken({ user_id: dev._id.toString(), user_role: 'developer' })}`)
      .send({
        room_id: room._id.toString(),
        post_id: post._id.toString(),
        content: 'reply body',
      });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.replies)).toBe(true);
    expect(res.body.replies).toHaveLength(1);
    expect(res.body.replies[0].content).toBe('reply body');
    expect(res.body.replies[0].analysis_source_revision).toBeUndefined();
    const saved = await Chat.findById(post._id).lean();
    expect(saved.replies[0].analysis_source_revision).toBe(1);
  });

  test('解析用の4種類のタグを付けてもv1の投稿・返信ではAI解析を起動しない', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const tags = await RoomTag.create(
      ['画像解析', '文字起こし', '動画解析', '音解析'].map((name, index) => ({
        floor: floor._id,
        room: room._id,
        user: dev._id,
        order: index + 1,
        name,
        lang: 'ja',
      }))
    );
    const roomTags = tags.map((tag) => tag._id.toString());
    const authorization = `Bearer ${buildToken({
      user_id: dev._id.toString(),
      user_role: 'developer',
    })}`;

    const createdPost = await request(app)
      .post('/api/v1/post/create')
      .set('Authorization', authorization)
      .send({
        floor_id: floor._id.toString(),
        room_id: room._id.toString(),
        content: 'v1 analysis boundary post',
        room_tags: roomTags,
      });
    expect(createdPost.status).toBe(200);

    const createdReply = await request(app)
      .post('/api/v1/reply/create')
      .set('Authorization', authorization)
      .send({
        room_id: room._id.toString(),
        post_id: createdPost.body._id,
        content: 'v1 analysis boundary reply',
        room_tags: roomTags,
      });
    expect(createdReply.status).toBe(200);

    expect(runBackgroundTask).not.toHaveBeenCalled();
    Object.values(analysisService).forEach((handler) => expect(handler).not.toHaveBeenCalled());
    const saved = await Chat.findById(createdPost.body._id).lean();
    expect(saved.analysis_source_revision).toBe(1);
    expect(saved.replies[0].analysis_source_revision).toBe(1);
    expect(saved.supplementaries).toHaveLength(0);
    expect(saved.replies[0].supplementaries).toHaveLength(0);
  });

  test('v1で投稿に付加情報を追加できる', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const post = await Chat.create({
      floor: floor._id,
      room: room._id,
      user: dev._id,
      content: 'base post',
      lang: 'ja',
    });
    const res = await request(app)
      .post('/api/v1/post/supplement/create')
      .set('Authorization', `Bearer ${buildToken({ user_id: dev._id.toString(), user_role: 'developer' })}`)
      .send({
        room_id: room._id.toString(),
        post_id: post._id.toString(),
        content: 'supplement body',
      });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.supplementaries)).toBe(true);
    expect(res.body.supplementaries).toHaveLength(1);
    expect(res.body.supplementaries[0].content).toBe('supplement body');
  });

  test('developerはv1で画像をアップロードできる', async () => {
    const dev = await createUser({ role: 'developer' });
    const floor = await createFloor(dev);
    const room = await createRoom(dev, floor);
    const targetDir = path.join(mediaRoot, floor._id.toString(), room._id.toString());
    await ensureDir(targetDir);

    const res = await request(app)
      .post('/api/v1/upload/image')
      .query({ room_id: room._id.toString() })
      .set('Authorization', `Bearer ${buildToken({ user_id: dev._id.toString(), user_role: 'developer' })}`)
      .field('floor_id', floor._id.toString())
      .field('room_id', room._id.toString())
      .attach('image_file', tinyPng, { filename: 'tiny.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('image_name');
    const savedPath = path.join(targetDir, res.body.image_name);
    await expect(fs.promises.access(savedPath)).resolves.toBeUndefined();
  });

  test('v1の画像アップロードはdeveloper以外を拒否する', async () => {
    const user = await createUser();
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    const res = await request(app)
      .post('/api/v1/upload/image')
      .query({ room_id: room._id.toString() })
      .set('Authorization', `Bearer ${buildToken({ user_id: user._id.toString(), user_role: 'User' })}`)
      .field('floor_id', floor._id.toString())
      .field('room_id', room._id.toString())
      .attach('image_file', tinyPng, { filename: 'tiny.png', contentType: 'image/png' });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });
});
