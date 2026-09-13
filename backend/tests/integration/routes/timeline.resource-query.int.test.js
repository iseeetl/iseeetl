const request = require('supertest');
const { createUserToken, createJwtToken } = require('../_helpers/auth');
const { createUser, createFloor, createRoom } = require('../_helpers/models');
const { buildErrorHandledApp } = require('../_helpers/app');
const Chat = require('../../../models/Chat');
const RoomTag = require('../../../models/RoomTag');
const FloorMember = require('../../../models/FloorMember');
const routes = require('../../../routes/timeline/postResource.route');
const v1Routes = require('../../../routes/v1');

describe('タイムラインのタグ更新と検索API', () => {
  let owner, actor, floor, room, app, base;
  const emit = jest.fn();
  const io = { to: () => ({ emit }), in: () => ({ emit }), roomLanguageProvider: { getLanguages: () => [] } };
  const send = (method, url, body, user = actor) => {
    const pending = request(app)[method](url).set('Authorization', `Bearer ${createUserToken(user)}`);
    return body === undefined ? pending : pending.send(body);
  };
  beforeEach(async () => {
    owner = await createUser({ role: 'developer' });
    actor = await createUser({ role: 'developer' });
    floor = await createFloor(owner);
    room = await createRoom(owner, floor);
    base = `/api/rooms/${room._id}/timeline/posts`;
    emit.mockClear();
    app = buildErrorHandledApp({ mounts: [
      { path: '/api', handler: (req, _res, next) => { req.io = io; next(); } },
      { path: '/api', handler: routes() },
      { path: '/api/v1', handler: v1Routes(io) },
    ] });
  });

  test.each(['post', 'reply'])('%sのタグ専用更新は他者にも許可し、本文編集権限と分ける', async (kind) => {
    const tag = await RoomTag.create({ floor: floor._id, room: room._id, user: owner._id, name: 'tag', lang: 'en', order: 1 });
    const post = await Chat.create({ floor: floor._id, room: room._id, user: owner._id, content: 'parent', lang: 'en', replies: [{ user: owner._id, content: 'reply', lang: 'en' }] });
    const resource = `${base}/${post._id}${kind === 'reply' ? `/replies/${post.replies[0]._id}` : ''}`;
    expect((await send('patch', resource, { content: 'denied' })).status).toBe(403);
    const response = await send('put', `${resource}/tags`, { room_tags: [String(tag._id)] });
    expect(response.status).toBe(200);
    expect(response.body.room_tags).toEqual([String(tag._id)]);
    expect(response.body).not.toHaveProperty('content');
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toBe('TAG_UPDATE');
    const before = await Chat.findById(post._id).lean();
    emit.mockClear();
    expect((await send('put', `${resource}/tags`, { room_tags: [String(tag._id)] })).status).toBe(200);
    expect(await Chat.findById(post._id).lean()).toEqual(before);
    expect(emit).not.toHaveBeenCalled();
    expect((await send('put', `${resource}/tags`, {})).status).toBe(400);
    expect((await send('put', `${resource}/tags`, { room_tags: [], content: 'extra' })).status).toBe(400);
    expect((await send('put', `${resource}/tags`, { room_tags: [] })).status).toBe(200);
    const otherRoom = await createRoom(owner, floor);
    expect((await send('put', `${resource.replace(String(room._id), String(otherRoom._id))}/tags`, { room_tags: [] })).status).toBe(404);
  });

  test('ルーム一覧の件数・日時条件・二つの検索条件・詳細とv1の取得を維持する', async () => {
    const posts = await Chat.insertMany(Array.from({ length: 12 }, (_, index) => ({
      floor: floor._id, room: room._id, user: owner._id, lang: 'en',
      content: `${index % 2 ? 'apple' : 'orange'} ${index % 3 ? 'red' : 'blue'}`,
      created_at: new Date(Date.UTC(2026, 8, 5, 0, 0, index)),
      replies: [{ user: owner._id, content: 'reply', lang: 'en' }],
    })));
    const list = await send('get', base);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(10);
    expect(list.body[0]._id).toBe(String(posts[11]._id));
    expect(list.body[0].replies).toHaveLength(1);
    const range = await send('get', `${base}?to=2026-09-05T00:00:00.000Z&from=2026-09-05T00:00:05.000Z`);
    expect(range.body).toHaveLength(5);
    const search = await send('post', `${base}/search`, { globalServerQuery: { keyword: 'apple' }, serverQuery: { keyword: 'blue' } });
    expect(search.status).toBe(200);
    expect(search.body.map((post) => post.content)).toEqual(['apple blue', 'apple blue']);
    const detail = await send('get', `${base}/${posts[0]._id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.replies[0].content).toBe('reply');
    const otherRoom = await createRoom(owner, floor);
    expect((await send('get', `/api/rooms/${otherRoom._id}/timeline/posts/${posts[0]._id}`)).status).toBe(404);
    expect((await send('post', `${base}/search`, { floor_id: String(floor._id) })).status).toBe(400);
    const token = createJwtToken({ user_id: String(actor._id), user_role: 'developer' }, process.env.JWT_DEV_SECRET);
    const v1 = await request(app).get(`/api/v1/timeline/floor/${floor._id}/room/${room._id}`).set('Authorization', `Bearer ${token}`);
    expect(v1.status).toBe(200);
    expect(v1.body.map((post) => post._id)).toEqual(list.body.map((post) => post._id));
  });

  test('一覧・詳細・ルームタグにメンバー限定条件を適用し、公開ルームタグの未認証取得を維持する', async () => {
    const tag = await RoomTag.create({ floor: floor._id, room: room._id, user: owner._id, name: 'tag', lang: 'en', order: 1 });
    const tagUrl = `/api/rooms/${room._id}/tags`;
    expect((await request(app).get(tagUrl)).body[0]._id).toBe(String(tag._id));
    room.member_only = true; await room.save();
    expect((await send('get', base)).status).toBe(403);
    expect((await send('get', `${base}/${'1'.repeat(24)}`)).status).toBe(403);
    expect((await send('get', tagUrl)).status).toBe(403);
    expect((await request(app).get(tagUrl)).status).toBe(401);
    await FloorMember.create({ floor: floor._id, user: actor._id });
    expect((await send('get', base)).status).toBe(200);
    expect((await send('get', tagUrl)).body[0]._id).toBe(String(tag._id));
    expect(emit).not.toHaveBeenCalled();
  });
});
