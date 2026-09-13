const request = require('supertest');
const fs = require('fs').promises;
const path = require('path');
jest.mock('../../../services/backgroundTaskRunner', () => ({ runBackgroundTask: jest.fn() }));
const { createUserToken, createJwtToken, snapshotEnv, restoreEnv } = require('../_helpers/auth');
const { buildErrorHandledApp } = require('../_helpers/app');
const { createUser, createFloor, createRoom } = require('../_helpers/models');
const { ensureDir, removeDirSafe, testRuntimePath, trailingSlash } = require('../../_helpers/testRuntime');
const Chat = require('../../../models/Chat');
const FloorMember = require('../../../models/FloorMember');
const previousEnv = snapshotEnv(['JWT_DEV_SECRET', 'MEDIA_PATH']);
process.env.JWT_DEV_SECRET = 'resource-post-v1-test-secret';
const runtime = testRuntimePath('resource-post');
process.env.MEDIA_PATH = trailingSlash(runtime);
const postRoutes = require('../../../routes/timeline/postResource.route');
const v1Routes = require('../../../routes/v1');
const emit = jest.fn();
const io = { to: () => ({ emit }), in: () => ({ emit }), roomLanguageProvider: { getLanguages: () => [] } };

describe('v1と共通処理を使う投稿API', () => {
  let app, owner, floor, room, base;
  const send = (method, path, body, actor = owner) => {
    const req = request(app)[method](path).set('Authorization', `Bearer ${createUserToken(actor)}`);
    return body === undefined ? req : req.send(body);
  };
  beforeEach(async () => {
    emit.mockClear();
    await ensureDir(runtime);
    owner = await createUser({ role: 'developer' });
    floor = await createFloor(owner);
    room = await createRoom(owner, floor);
    base = `/api/rooms/${room._id}/timeline/posts`;
    app = buildErrorHandledApp({
      mounts: [
        { path: '/api', handler: (req, _res, next) => { req.io = io; next(); } },
        { path: '/api', handler: postRoutes() },
        { path: '/api/v1', handler: v1Routes(io) },
      ],
    });
  });
  afterAll(async () => { restoreEnv(previousEnv); await removeDirSafe(runtime); });

  test.each([
    { label: '返信', kind: 'reply', collection: 'replies', event: 'REPLY', v1Path: '/api/v1/reply/update', v1Id: 'reply_id' },
    { label: '投稿付加情報', kind: 'postSupplement', collection: 'supplements', event: 'SUPPLEMENT', v1Path: '/api/v1/post/supplement/update', v1Id: 'supplement_id' },
    { label: '返信付加情報', kind: 'replySupplement', collection: 'supplements', event: 'REPLY_SUPPLEMENT', v1Path: '/api/v1/reply/supplement/update', v1Id: 'supplement_id' },
  ])('$labelの作成・部分更新・削除、親子関係とv1 APIからの更新を確認する', async ({ kind, collection, event, v1Path, v1Id }) => {
    const post = await Chat.create({ floor: floor._id, room: room._id, user: owner._id, content: 'parent', lang: 'en',
      replies: [{ user: owner._id, content: 'parent reply', lang: 'en' }] });
    const prefix = `${base}/${post._id}${kind === 'replySupplement' ? `/replies/${post.replies[0]._id}` : ''}`;
    const url = `${prefix}/${collection}`;
    const directory = path.join(runtime, String(floor._id), String(room._id));
    await ensureDir(directory);
    const fileName = `2001_${owner._id}.png`;
    const thumbnailName = `2001_${owner._id}_thumbnail.png`;
    await fs.writeFile(path.join(directory, fileName), 'image-fixture');
    await fs.writeFile(path.join(directory, thumbnailName), 'thumbnail-fixture');
    const created = await send('post', url, { lang: 'en', media: { image: { file_name: fileName, thumbnail_name: thumbnailName } } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ post_id: String(post._id), room_id: String(room._id), content: null, lang: 'en' });
    expect(created.body).not.toHaveProperty('replies');
    expect(created.body).not.toHaveProperty('analysis_source_revision');
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toBe(`${event}_CREATE`);
    const resource = `${url}/${created.body._id}`;
    emit.mockClear();
    const patched = await send('patch', resource, { content: 'changed' });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ content: 'changed', lang: 'en' });
    expect(patched.body.media.image.file_name).toBe(fileName);
    const before = await Chat.findById(post._id).lean();
    expect(before.content).toBe('parent');
    emit.mockClear();
    expect((await send('patch', resource, {})).status).toBe(200);
    expect(await Chat.findById(post._id).lean()).toEqual(before);
    expect(emit).not.toHaveBeenCalled();
    const outsider = await createUser();
    expect((await send('patch', resource, { content: 'denied' }, outsider)).status).toBe(403);
    const otherPost = await Chat.create({ floor: floor._id, room: room._id, user: owner._id, content: 'other', lang: 'en' });
    expect((await send('patch', resource.replace(String(post._id), String(otherPost._id)), { content: 'wrong parent' })).status).toBe(404);
    expect((await send('patch', resource, { content: null, media: null })).status).toBe(400);
    const token = createJwtToken({ user_id: String(owner._id), user_role: 'developer' }, process.env.JWT_DEV_SECRET);
    const v1 = await request(app).post(v1Path).set('Authorization', `Bearer ${token}`).send({
      room_id: String(room._id), post_id: String(post._id), [v1Id]: created.body._id, content: 'v1 child',
      ...(kind === 'replySupplement' ? { reply_id: String(post.replies[0]._id) } : {}),
    });
    expect(v1.status).toBe(200);
    expect(v1.body._id).toBe(String(post._id));
    emit.mockClear();
    expect((await send('delete', resource)).status).toBe(204);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toBe(`${event}_DELETE`);
    const saved = await Chat.findById(post._id).lean();
    const children = kind === 'reply' ? saved.replies : kind === 'postSupplement' ? saved.supplementaries : saved.replies[0].supplementaries;
    expect(children.find((item) => String(item._id) === created.body._id).delete_flg).toBe(true);
    await expect(fs.access(path.join(directory, fileName))).rejects.toHaveProperty('code', 'ENOENT');
  });

  test('返信の通知指定だけのPATCHは保存を変更せず通知する', async () => {
    const post = await Chat.create({ floor: floor._id, room: room._id, user: owner._id, content: 'parent', lang: 'en',
      replies: [{ user: owner._id, content: 'reply', lang: 'en' }] });
    const before = await Chat.findById(post._id).lean();
    const response = await send('patch', `${base}/${post._id}/replies/${post.replies[0]._id}`, { notify_all: true });
    expect(response.status).toBe(200);
    expect(await Chat.findById(post._id).lean()).toEqual(before);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toBe('REPLY_UPDATE');
    expect(emit.mock.calls[0][1].replies[0].notify_all).toBe(true);
  });

  test('最小create、本文だけのPATCH、bodyなしDELETEとSocketを確認する', async () => {
    const created = await send('post', base, { content: 'before', lang: 'en' });
    expect(created.status).toBe(201);
    const id = created.body._id;
    expect(created.body).toMatchObject({ room_id: String(room._id), content: 'before', lang: 'en', room_tags: [], media: { image: null, video: null, audio: null } });
    expect(created.body).not.toHaveProperty('analysis_source_revision');
    expect(created.body).not.toHaveProperty('translations');
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toBe('POST_CREATE');
    emit.mockClear();
    const patched = await send('patch', `${base}/${id}`, { content: 'after' });
    expect(patched.status).toBe(200);
    const saved = await Chat.findById(id).lean();
    expect(saved).toMatchObject({ content: 'after', lang: 'en' });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toBe('POST_UPDATE');
    emit.mockClear();
    const deleted = await send('delete', `${base}/${id}`);
    expect(deleted.status).toBe(204);
    expect(deleted.text).toBe('');
    expect((await Chat.findById(id)).delete_flg).toBe(true);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toBe('POST_DELETE');
  });

  test('未知項目、認証、別ルーム、編集権限を検証する', async () => {
    expect((await request(app).post(base).send({ content: 'test', lang: 'ja' })).status).toBe(401);
    expect((await send('post', base, { content: 'test', lang: 'ja', user_id: String(owner._id) })).status).toBe(400);
    const created = await send('post', base, { content: 'test', lang: 'ja' });
    const other = await createUser({ role: 'developer' });
    expect((await send('patch', `${base}/${created.body._id}`, { content: 'no' }, other)).status).toBe(403);
    const otherRoom = await createRoom(owner, floor);
    expect((await send('patch', `/api/rooms/${otherRoom._id}/timeline/posts/${created.body._id}`, { content: 'no' })).status).toBe(404);
    await FloorMember.create({ floor: floor._id, user: other._id });
    expect((await send('patch', `${base}/${created.body._id}`, { content: 'allowed' }, other)).status).toBe(200);
  });

  test('無変更PATCHは保存日時・リビジョン・Socketを変更しない', async () => {
    const created = await send('post', base, { content: 'test', lang: 'en' });
    const before = await Chat.findById(created.body._id).lean();
    emit.mockClear();
    const response = await send('patch', `${base}/${created.body._id}`, { content: 'test' });
    expect(response.status).toBe(200);
    expect(await Chat.findById(created.body._id).lean()).toEqual(before);
    expect(emit).not.toHaveBeenCalled();
  });

  test('未変更の既存メディア・子配列を保持し、空対象を拒否する', async () => {
    const post = await Chat.create({ floor: floor._id, room: room._id, user: owner._id, content: 'before', lang: 'en', image_name: 'legacy.png', image_thumbnail_name: null, replies: [{ content: 'reply', lang: 'en' }] });
    const response = await send('patch', `${base}/${post._id}`, { content: 'after' });
    expect(response.status).toBe(200);
    const saved = await Chat.findById(post._id).lean();
    expect(saved.image_name).toBe('legacy.png');
    expect(saved.replies[0].content).toBe('reply');
    const plain = await send('post', base, { content: 'only text', lang: 'en' });
    expect((await send('patch', `${base}/${plain.body._id}`, { content: null })).status).toBe(400);
  });

  test('v1の既存リクエスト・応答と通常API通知を維持する', async () => {
    const token = createJwtToken({ user_id: String(owner._id), user_role: 'developer' }, process.env.JWT_DEV_SECRET);
    const created = await request(app).post('/api/v1/post/create').set('Authorization', `Bearer ${token}`)
      .send({ floor_id: String(floor._id), room_id: String(room._id), content: 'v1' });
    expect(created.status).toBe(200);
    const id = created.body._id;
    expect(created.body).toHaveProperty('image_name', null);
    emit.mockClear();
    const updated = await send('patch', `${base}/${id}`, { content: 'new main' });
    expect(updated.status).toBe(200);
    expect(updated.body.lang).toBe('ja');
    expect(emit).toHaveBeenCalledTimes(1);
    const legacyUpdate = await request(app).post('/api/v1/post/update').set('Authorization', `Bearer ${token}`)
      .send({ room_id: String(room._id), post_id: id, content: 'v1 again' });
    expect(legacyUpdate.status).toBe(200);
    expect(legacyUpdate.body.content).toBe('v1 again');
  });

  test('メディアだけの作成とキャプションの部分更新、メディア全解除を扱う', async () => {
    const directory = path.join(runtime, String(floor._id), String(room._id));
    await ensureDir(directory);
    const fileName = `1001_${owner._id}.png`;
    const thumbnailName = `1001_${owner._id}_thumbnail.png`;
    await fs.writeFile(path.join(directory, fileName), 'image-fixture');
    await fs.writeFile(path.join(directory, thumbnailName), 'thumbnail-fixture');
    const created = await send('post', base, { lang: 'en', media: { image: { file_name: fileName, thumbnail_name: thumbnailName } } });
    expect(created.status).toBe(201);
    expect(created.body.content).toBeNull();
    const resource = `${base}/${created.body._id}`;
    const patched = await send('patch', resource, { media: { image: { caption: 'caption' } } });
    expect(patched.status).toBe(200);
    expect(patched.body.media.image).toEqual({ file_name: fileName, thumbnail_name: thumbnailName, caption: 'caption' });
    expect((await send('patch', resource, { media: null })).status).toBe(400);
    expect((await send('patch', resource, { content: 'text', media: null })).status).toBe(200);
    expect((await Chat.findById(created.body._id)).image_name).toBeNull();
    await expect(fs.access(path.join(directory, fileName))).rejects.toHaveProperty('code', 'ENOENT');
  });

  test('PATCHの検証後に本文が消えた場合、添付解除で空の投稿を保存しない', async () => {
    const post = await Chat.create({ floor: floor._id, room: room._id, user: owner._id,
      content: 'text', lang: 'en', image_name: 'legacy.png' });
    const original = Chat.findOneAndUpdate;
    const spy = jest.spyOn(Chat, 'findOneAndUpdate').mockImplementationOnce(async function (...args) {
      await Chat.updateOne({ _id: post._id }, { $set: { content: null }, $inc: { analysis_source_revision: 1 } });
      return original.apply(this, args);
    });
    try {
      const response = await send('patch', `${base}/${post._id}`, { media: null });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
      expect((await Chat.findById(post._id)).image_name).toBe('legacy.png');
      expect(emit).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });
});
