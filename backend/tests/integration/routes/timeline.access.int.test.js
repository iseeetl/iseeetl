const request = require('supertest');
const { buildErrorHandledApp } = require('../_helpers/app');
const { createUser, createFloor, createRoom } = require('../_helpers/models');
const { createUserToken } = require('../_helpers/auth');
const resourceRouter = require('../../../routes/timeline/postResource.route');
const timelineRouter = require('../../../routes/timeline');
const Chat = require('../../../models/Chat');
const FloorMember = require('../../../models/FloorMember');
const KickedUser = require('../../../models/KickedUser');

const operations = [
  ['get', '', undefined], ['get', '/:post', undefined],
  ['post', '', { content: 'new', lang: 'ja' }],
  ['patch', '/:post', { content: 'changed' }], ['delete', '/:post', undefined],
  ['put', '/:post/tags', { room_tags: [] }],
  ['post', '/:post/replies', { content: 'new', lang: 'ja' }],
  ['patch', '/:post/replies/:reply', { content: 'changed' }], ['delete', '/:post/replies/:reply', undefined],
  ['put', '/:post/replies/:reply/tags', { room_tags: [] }],
  ['post', '/:post/supplements', { content: 'new', lang: 'ja' }],
  ['patch', '/:post/supplements/:supplement', { content: 'changed' }], ['delete', '/:post/supplements/:supplement', undefined],
  ['post', '/:post/replies/:reply/supplements', { content: 'new', lang: 'ja' }],
  ['patch', '/:post/replies/:reply/supplements/:child', { content: 'changed' }],
  ['delete', '/:post/replies/:reply/supplements/:child', undefined],
];

describe('タイムラインAPIのアクセス制御', () => {
  let app, owner, actor, floor, room, post, base, emit;
  const send = (method, suffix, body, user = actor, roomId = room._id) => {
    const path = `/api/rooms/${roomId}/timeline/posts${suffix}`
      .replace(':post', String(post._id)).replace(':reply', String(post.replies[0]._id))
      .replace(':supplement', String(post.supplementaries[0]._id)).replace(':child', String(post.replies[0].supplementaries[0]._id));
    const req = request(app)[method](path).set('Authorization', `Bearer ${createUserToken(user)}`);
    return body === undefined ? req : req.send(body);
  };
  beforeEach(async () => {
    owner = await createUser({ role: 'Editor' });
    actor = await createUser();
    floor = await createFloor(owner);
    room = await createRoom(owner, floor);
    post = await Chat.create({ floor: floor._id, room: room._id, user: owner._id, lang: 'ja', content: 'post',
      supplementaries: [{ user: owner._id, lang: 'ja', content: 'supplement' }],
      replies: [{ user: owner._id, lang: 'ja', content: 'reply', supplementaries: [{ user: owner._id, lang: 'ja', content: 'child' }] }],
    });
    base = `/api/rooms/${room._id}/timeline/posts`;
    emit = jest.fn();
    const io = { to: () => ({ emit }) };
    app = buildErrorHandledApp({ mounts: [
      { path: '/', handler: (req, _res, next) => { req.io = io; next(); } },
      { path: '/api', handler: resourceRouter() },
      { path: '/chat', handler: timelineRouter() },
    ] });
  });

  describe.each(['kicked', 'member_only'])('%sの利用条件', (restriction) => {
    beforeEach(async () => {
      if (restriction === 'kicked') await KickedUser.create({ user: actor._id, kicked_by: owner._id, floor: floor._id, room: room._id });
      else { room.member_only = true; await room.save(); }
    });
    test.each(operations)('%s %s を拒否し、投稿ツリーと通知を変更しない', async (method, suffix, body) => {
      const before = await Chat.findById(post._id).lean();
      const res = await send(method, suffix, body);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(await Chat.findById(post._id).lean()).toEqual(before);
      expect(emit).not.toHaveBeenCalled();
    });
    test.each(['', '/reply'])('既存%sリアクションも入室条件を適用する', async (suffix) => {
      const res = await request(app).post(`/chat${suffix}/reaction`)
        .set('Authorization', `Bearer ${createUserToken(actor)}`)
        .send({ post_id: String(post._id), ...(suffix ? { reply_id: String(post.replies[0]._id) } : {}), type: 'いいね' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_PERMISSION');
      expect(emit).not.toHaveBeenCalled();
    });
  });

  test.each(operations.filter(([method]) => ['patch', 'delete'].includes(method)))('他者の本文編集・削除 %s %s は拒否する', async (method, suffix, body) => {
    const before = await Chat.findById(post._id).lean();
    expect((await send(method, suffix, body)).status).toBe(403);
    expect(await Chat.findById(post._id).lean()).toEqual(before);
    expect(emit).not.toHaveBeenCalled();
  });

  test.each(['patch', 'delete', 'put'])('返信の%sはルーム・親投稿の不一致を拒否する', async (method) => {
    const otherRoom = await createRoom(owner, floor);
    const otherPost = await Chat.create({ floor: floor._id, room: room._id, user: owner._id, content: 'other', lang: 'ja' });
    const suffix = `/:post/replies/:reply${method === 'put' ? '/tags' : ''}`;
    const body = method === 'put' ? { room_tags: [] } : method === 'patch' ? { content: 'changed' } : undefined;
    const before = await Chat.findById(post._id).lean();
    const crossRoom = await send(method, suffix, body, owner, otherRoom._id);
    expect(crossRoom.status).toBe(404);
    expect(crossRoom.body.error.code).toBe('NOT_FOUND');
    const url = `${base}/${otherPost._id}/replies/${post.replies[0]._id}${method === 'put' ? '/tags' : ''}`;
    const req = request(app)[method](url).set('Authorization', `Bearer ${createUserToken(owner)}`);
    const crossPost = await (body === undefined ? req : req.send(body));
    expect(crossPost.status).toBe(404);
    expect(await Chat.findById(post._id).lean()).toEqual(before);
    expect(emit).not.toHaveBeenCalled();
  });

  test('限定ルームのフロアメンバーは一覧を取得でき、存在しないルーム・不要フロア引数は拒否する', async () => {
    room.member_only = true; await room.save();
    await FloorMember.create({ floor: floor._id, user: actor._id });
    const list = await send('get', '');
    expect(list.status).toBe(200);
    expect(list.body[0]._id).toBe(String(post._id));
    expect((await send('get', '', undefined, actor, '1'.repeat(24))).status).toBe(404);
    const invalid = await request(app).get(base).query({ floor_id: String(floor._id) }).set('Authorization', `Bearer ${createUserToken(actor)}`);
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('INVALID_PARAMS');
  });
});
