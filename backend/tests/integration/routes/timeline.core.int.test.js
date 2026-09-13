const { OPENAI_MODEL_ENV } = require('../../_helpers/openai');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { ensureDir, testRuntimePath, trailingSlash, removeDirSafe } = require('../../_helpers/testRuntime');

const ORIGINAL_ENV = {
  ...Object.fromEntries(Object.keys(OPENAI_MODEL_ENV).map((name) => [name, process.env[name]])),
  JWT_SECRET: process.env.JWT_SECRET,
  MEDIA_PATH: process.env.MEDIA_PATH,
  EXTERNAL_OPENAI_ENABLED: process.env.EXTERNAL_OPENAI_ENABLED,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};

const mediaRoot = testRuntimePath('timeline-core', 'media');
process.env.MEDIA_PATH = trailingSlash(mediaRoot);
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.OPENAI_API_KEY = 'test-openai-key';

jest.mock('../../../services/analysis.service', () => ({
  runPostAnalyses: jest.fn().mockResolvedValue(undefined),
  runReplyAnalyses: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../services/timeline/timelineTranslation.service', () => ({
  translateMainContentIfNeeded: jest.fn().mockResolvedValue(undefined),
  translateGuestMainContentIfNeeded: jest.fn().mockResolvedValue(undefined),
  translateReplyIfNeeded: jest.fn().mockResolvedValue(undefined),
  translateGuestReplyIfNeeded: jest.fn().mockResolvedValue(undefined),
  translateSupplementIfNeeded: jest.fn().mockResolvedValue(undefined),
  translateReplySupplementIfNeeded: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../integrations/onesignal/notification.client', () => ({
  dispatchNotification: jest.fn(),
}));

const timelineRouter = require('../../../routes/timeline');
const resourceRouter = require('../../../routes/timeline/postResource.route');
const { attachErrorHandler } = require('../_helpers/app');
const User = require('../../../models/User');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const RoomTag = require('../../../models/RoomTag');
const Chat = require('../../../models/Chat');
const { runPostAnalyses } = require('../../../services/analysis.service');
const { drainBackgroundTasks } = require('../../../services/backgroundTaskRunner');

const ensureEnv = () => {
  Object.assign(process.env, OPENAI_MODEL_ENV);
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.MEDIA_PATH = trailingSlash(mediaRoot);
  process.env.EXTERNAL_OPENAI_ENABLED = 'false';
  if (!process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = 'test-openai-key';
};

const restoreEnv = () => {
  Object.keys(OPENAI_MODEL_ENV).forEach((name) => {
    if (ORIGINAL_ENV[name] === undefined) delete process.env[name];
    else process.env[name] = ORIGINAL_ENV[name];
  });
  if (ORIGINAL_ENV.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_ENV.JWT_SECRET;
  if (ORIGINAL_ENV.MEDIA_PATH === undefined) delete process.env.MEDIA_PATH;
  else process.env.MEDIA_PATH = ORIGINAL_ENV.MEDIA_PATH;
  if (ORIGINAL_ENV.EXTERNAL_OPENAI_ENABLED === undefined) delete process.env.EXTERNAL_OPENAI_ENABLED;
  else process.env.EXTERNAL_OPENAI_ENABLED = ORIGINAL_ENV.EXTERNAL_OPENAI_ENABLED;
  if (ORIGINAL_ENV.OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = ORIGINAL_ENV.OPENAI_API_KEY;
};

const buildIo = () => ({
  to: () => ({ emit: () => {} }),
});

const attachIoToRequest = (io) => (req, _res, next) => {
  req.io = io;
  next();
};

const buildApp = (io) => {
  const app = express();
  app.use(express.json());
  app.use('/chat', attachIoToRequest(io), timelineRouter());
  app.use('/api', attachIoToRequest(io), resourceRouter());
  return attachErrorHandler(app);
};

const buildToken = (user) => jwt.sign({ user_id: user._id.toString(), user_role: user.role }, process.env.JWT_SECRET);

const seedContext = async () => {
  const user = await User.create({
    username: 'Alice',
    mail: 'alice@example.com',
    lang: 'ja',
  });
  const floor = await Floor.create({
    user: user._id,
    title: 'Floor A',
  });
  const room = await Room.create({
    floor: floor._id,
    user: user._id,
    title: 'Room A',
    lang: 'ja',
    member_only: false,
  });
  return { user, floor, room };
};

const createImageFiles = async (ctx, userId, timestamp = Date.now()) => {
  const baseName = `${timestamp}_${userId}`;
  const imageName = `${baseName}.png`;
  const thumbnailName = `${baseName}_thumbnail.png`;
  const roomDir = path.join(mediaRoot, ctx.floor._id.toString(), ctx.room._id.toString());
  await ensureDir(roomDir);
  await Promise.all([
    fs.writeFile(path.join(roomDir, imageName), 'image'),
    fs.writeFile(path.join(roomDir, thumbnailName), 'thumbnail'),
  ]);
  return { imageName, thumbnailName, roomDir };
};

describe('タイムラインAPIの基本操作', () => {
  let app;
  let ctx;
  let token;

  beforeAll(async () => {
    await ensureDir(mediaRoot);
    ensureEnv();
  });

  afterAll(async () => {
    restoreEnv();
    await removeDirSafe(testRuntimePath('timeline-core'));
  });

  beforeEach(async () => {
    const io = buildIo();
    app = buildApp(io);
    ctx = await seedContext();
    token = buildToken(ctx.user);
  });


  const send = (method, suffix = '', body) => {
    const req = request(app)[method](`/api/rooms/${ctx.room._id}/timeline/posts${suffix}`).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body);
  };
  const create = async (suffix = '', data = {}) => {
    const response = await send('post', suffix, { content: 'post', lang: 'ja', ...data });
    expect(response.status).toBe(201);
    return response.body;
  };
  const imageBody = (files) => ({ content: 'post', lang: 'ja', media: { image: { file_name: files.imageName, thumbnail_name: files.thumbnailName } } });

  const resourceCases = [
    { kind: 'post', label: '投稿' },
    { kind: 'reply', label: '返信' },
    { kind: 'supplement', label: '投稿付加情報' },
    { kind: 'reply supplement', label: '返信付加情報' },
  ];

  test.each([
    { kind: 'foreign issuer', label: '他のユーザがアップロードした画像' },
    { kind: 'room image', label: 'ルーム画像' },
  ])('メディアの参照先として$labelを拒否する', async ({ kind }) => {
    const userId = kind === 'foreign issuer' ? new mongoose.Types.ObjectId() : ctx.user._id;
    const files = await createImageFiles(ctx, String(userId));
    if (kind === 'room image') await Room.findByIdAndUpdate(ctx.room._id, { image_name: files.imageName });
    const res = await send('post', '', imageBody(files));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PARAMS');
    expect(await Chat.countDocuments()).toBe(0);
  });

  test('重複したメディアを拒否し、別の有効な投稿が参照するファイルは削除時も残す', async () => {
    const files = await createImageFiles(ctx, String(ctx.user._id));
    const first = await send('post', '', imageBody(files));
    expect(first.status).toBe(201);
    const duplicate = await send('post', '', imageBody(files));
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.error.code).toBe('INVALID_PARAMS');
    await Chat.create({ user: ctx.user._id, floor: ctx.floor._id, room: ctx.room._id, content: 'shared', lang: 'ja', image_name: files.imageName, image_thumbnail_name: files.thumbnailName });
    expect((await send('delete', `/${first.body._id}`)).status).toBe(204);
    await expect(fs.access(path.join(files.roomDir, files.imageName))).resolves.toBeUndefined();
    await expect(fs.access(path.join(files.roomDir, files.thumbnailName))).resolves.toBeUndefined();
  });

  test.each(resourceCases.flatMap((resource) => ['正常', '配信先例外', '通知例外'].map((stage) => ({ ...resource, stage }))))(
    '$labelの作成・取得・更新・削除は、通知処理が「$stage」の場合もHTTPステータス・保存結果・親子関係を維持する', async ({ kind, stage }) => {
    if (stage !== '正常') {
      app = buildApp({ to: () => {
        if (stage === '配信先例外') throw new Error('scope failed');
        return { emit: () => { throw new Error('emit failed'); } };
      } });
    }
    let collection = '';
    let parent;
    if (kind !== 'post') {
      parent = await create();
      collection = `/${parent._id}`;
      if (kind === 'reply supplement') {
        const reply = await create(`${collection}/replies`);
        collection += `/replies/${reply._id}/supplements`;
      } else collection += kind === 'reply' ? '/replies' : '/supplements';
    }
    const item = await create(collection);
    const suffix = `${collection}/${item._id}`;
    expect((await send('patch', suffix, { content: 'updated' })).body.content).toBe('updated');
    const before = await send('get', `/${parent?._id || item._id}`);
    expect(before.status).toBe(200);
    expect((await send('delete', suffix)).status).toBe(204);
    const stored = await Chat.findById(parent?._id || item._id).lean();
    const child = kind === 'post' ? stored : kind === 'reply' ? stored.replies[0] : kind === 'supplement' ? stored.supplementaries[0] : stored.replies[0].supplementaries[0];
    expect(child.delete_flg).toBe(true);
    const after = await send('get', parent ? `/${parent._id}` : '');
    if (!parent) expect(after.body).toHaveLength(0);
    else if (kind === 'reply') expect(after.body.replies).toHaveLength(0);
    else if (kind === 'supplement') expect(after.body.supplementaries).toHaveLength(0);
    else expect(after.body.replies[0].supplementaries).toHaveLength(0);
  });

  test('一覧は全体・カラムの両方の条件を適用し、詳細は親投稿のツリーを返す', async () => {
    const wanted = await create('', { content: 'apple red' });
    await create('', { content: 'apple blue' });
    await create('', { content: 'orange red' });
    const found = await send('post', '/search', { globalServerQuery: { keyword: 'apple' }, serverQuery: { keyword: 'red' } });
    expect(found.status).toBe(200);
    expect(found.body.map((item) => item._id)).toEqual([wanted._id]);
    const detail = await send('get', `/${wanted._id}`);
    expect(detail.status).toBe(200);
    expect(detail.body._id).toBe(wanted._id);
    expect(detail.body.replies).toEqual([]);
  });

  test.each([
    { kind: 'post', label: '投稿' },
    { kind: 'reply', label: '返信' },
  ])('$labelのタグ更新を保存し、別ルームのタグは拒否する', async ({ kind }) => {
    const parent = await create();
    const collection = kind === 'post' ? '' : `/${parent._id}/replies`;
    const item = kind === 'post' ? parent : await create(collection);
    const target = `${collection}/${item._id}`;
    const tag = await RoomTag.create({ floor: ctx.floor._id, room: ctx.room._id, user: ctx.user._id, order: 1, name: 'tag', lang: 'ja' });
    const foreign = await RoomTag.create({ floor: ctx.floor._id, room: new mongoose.Types.ObjectId(), user: ctx.user._id, order: 1, name: 'foreign', lang: 'ja' });
    const changed = await send('put', `${target}/tags`, { room_tags: [String(tag._id)] });
    expect(changed.status).toBe(200);
    expect(changed.body.room_tags).toEqual([String(tag._id)]);
    for (const [method, suffix, body] of [
      ['post', collection, { content: 'new', lang: 'ja', room_tags: [String(foreign._id)] }],
      ['patch', target, { room_tags: [String(foreign._id)] }],
      ['put', `${target}/tags`, { room_tags: [String(foreign._id)] }],
    ]) {
      const res = await send(method, suffix, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PARAMS');
    }
    const stored = await Chat.findById(parent._id).lean();
    expect((kind === 'post' ? stored : stored.replies[0]).room_tags.map(String)).toEqual([String(tag._id)]);
  });

  test.each(resourceCases)('ルーム配下のAPIで作成した$labelにリアクションAPIを使える', async ({ kind }) => {
    const parent = await create();
    const body = { post_id: parent._id };
    let reactionPath = '/chat';
    if (kind === 'reply' || kind === 'reply supplement') {
      const reply = await create(`/${parent._id}/replies`);
      body.reply_id = reply._id;
      reactionPath += '/reply';
    }
    if (kind === 'supplement' || kind === 'reply supplement') {
      const supplement = await create(`/${parent._id}${body.reply_id ? `/replies/${body.reply_id}` : ''}/supplements`);
      body.supplement_id = supplement._id;
      reactionPath += '/supplement';
    }
    const target = (post) => {
      const item = body.reply_id ? post.replies.find((reply) => String(reply._id) === body.reply_id) : post;
      return body.supplement_id ? item.supplementaries.find((supplement) => String(supplement._id) === body.supplement_id) : item;
    };
    const added = await request(app).post(`${reactionPath}/reaction`).set('Authorization', `Bearer ${token}`).send({ ...body, type: 'いいね' });
    expect(added.status).toBe(200);
    expect(target(added.body).reactions).toHaveLength(1);
    const removed = await request(app).post(`${reactionPath}/reaction/delete`).set('Authorization', `Bearer ${token}`)
      .send({ ...body, reaction_id: target(added.body).reactions[0]._id });
    expect(removed.status).toBe(200);
    expect(target(removed.body).reactions).toHaveLength(0);
  });

  test.each([
    { kind: 'post', label: '投稿' },
    { kind: 'reply', label: '返信' },
  ])('$labelの更新後もリビジョンと解析情報を保持し、内部情報を応答へ出さない', async ({ kind }) => {
    const parent = await create();
    const tags = await RoomTag.create(['A', 'B'].map((name, index) => ({ floor: ctx.floor._id, room: ctx.room._id, user: ctx.user._id, name, order: index + 1, lang: 'ja' })));
    const tagIds = tags.map((tag) => String(tag._id));
    const item = kind === 'post' ? parent : await create(`/${parent._id}/replies`, { room_tags: tagIds });
    const suffix = `/${parent._id}${kind === 'reply' ? `/replies/${item._id}` : ''}`;
    const settingId = new mongoose.Types.ObjectId();
    const nested = { user: ctx.user._id, lang: 'ja', content: 'internal', meta: {
      analysis_kind: 'conversation', analysis_setting: settingId, analysis_setting_revision: 1,
      analysis_trigger_tag: tags[0]._id, analysis_source_revision: 1,
    } };
    const prefix = kind === 'reply' ? 'replies.$[reply].' : '';
    await Chat.updateOne({ _id: parent._id }, { $push: { [`${prefix}supplementaries`]: nested, [`${prefix}reactions`]: { user: ctx.user._id, type: '拍手' } } },
      kind === 'reply' ? { arrayFilters: [{ 'reply._id': item._id }] } : {});
    const read = async () => {
      const stored = await Chat.findById(parent._id).lean();
      return kind === 'reply' ? stored.replies[0] : stored;
    };
    expect((await send('patch', suffix, { animation: 'move-and-erase' })).status).toBe(200);
    expect((await read()).analysis_source_revision).toBe(1);
    const changed = await send('patch', suffix, { content: 'source changed' });
    expect(changed.status).toBe(200);
    expect(changed.body.analysis_source_revision).toBeUndefined();
    expect(changed.body.supplementaries).toBeUndefined();
    let saved = await read();
    expect(saved.analysis_source_revision).toBe(2);
    expect(saved.supplementaries[0].meta.analysis_setting.toString()).toBe(String(settingId));
    expect(saved.reactions).toHaveLength(1);
    if (kind === 'reply') expect((await send('put', `${suffix}/tags`, { room_tags: [...tagIds].reverse() })).status).toBe(200);
    else {
      expect((await send('patch', suffix, { content: 'source changed', animation: null })).status).toBe(200);
      await create(`${suffix}/supplements`);
    }
    const detail = await send('get', `/${parent._id}`);
    const publicItem = kind === 'reply' ? detail.body.replies[0] : detail.body;
    expect(publicItem.analysis_source_revision).toBeUndefined();
    expect(publicItem.supplementaries.every((supplement) => supplement.meta === undefined)).toBe(true);
    saved = await read();
    expect(saved.analysis_source_revision).toBe(2);
    expect(saved.supplementaries[0].meta.analysis_source_revision).toBe(1);
    expect((await send('delete', suffix)).status).toBe(204);
    expect((await read()).analysis_source_revision).toBe(2);
  });

  test('AI解析の完了を待たずに作成APIの応答を返す', async () => {
    let release, started;
    const pending = new Promise((resolve) => { release = resolve; });
    const began = new Promise((resolve) => { started = resolve; });
    runPostAnalyses.mockImplementationOnce(() => { started(); return pending; });
    process.env.EXTERNAL_OPENAI_ENABLED = 'true';
    try {
      const post = await create();
      await began;
      expect(runPostAnalyses).toHaveBeenCalledTimes(1);
      expect((await Chat.findById(post._id).lean()).supplementaries).toHaveLength(0);
    } finally {
      release();
      process.env.EXTERNAL_OPENAI_ENABLED = 'false';
      await drainBackgroundTasks({ timeoutMs: 1000 });
    }
  });
});
