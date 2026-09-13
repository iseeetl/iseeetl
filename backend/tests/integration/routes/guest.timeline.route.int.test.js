const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const {
  assertTimelineOk,
  extractFirstReplyId,
  extractFirstSupplementId,
} = require('../_helpers/timelineResponse');

const ORIGINAL_ENV = {
  GUEST_JWT_SECRET: process.env.GUEST_JWT_SECRET,
  GUEST_REFRESH_SECRET: process.env.GUEST_REFRESH_SECRET,
};

if (!process.env.GUEST_JWT_SECRET) process.env.GUEST_JWT_SECRET = 'test-guest-secret';
if (!process.env.GUEST_REFRESH_SECRET) process.env.GUEST_REFRESH_SECRET = 'test-guest-refresh-secret';

jest.mock('../../../services/timeline/timelineTranslation.service', () => ({
  translateMainContentIfNeeded: jest.fn().mockResolvedValue(undefined),
  translateGuestMainContentIfNeeded: jest.fn().mockResolvedValue(undefined),
  translateReplyIfNeeded: jest.fn().mockResolvedValue(undefined),
  translateGuestReplyIfNeeded: jest.fn().mockResolvedValue(undefined),
  translateSupplementIfNeeded: jest.fn().mockResolvedValue(undefined),
  translateReplySupplementIfNeeded: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../services/analysis.service', () => ({
  runPostAnalyses: jest.fn(),
  runReplyAnalyses: jest.fn(),
}));

jest.mock('../../../integrations/onesignal/notification.client', () => ({
  dispatchNotification: jest.fn(),
}));

const guestTimelineRouter = require('../../../routes/timeline/guest');
const guestRouter = require('../../../routes/guest.route');
const { attachErrorHandler } = require('../_helpers/app');
const User = require('../../../models/User');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const RoomTag = require('../../../models/RoomTag');
const Chat = require('../../../models/Chat');
const analysisService = require('../../../services/analysis.service');
const timelineTranslationService = require('../../../services/timeline/timelineTranslation.service');
const { ALLOWED_LANGUAGES } = require('../../../constants/languages');

const restoreEnv = () => {
  if (ORIGINAL_ENV.GUEST_JWT_SECRET === undefined) delete process.env.GUEST_JWT_SECRET;
  else process.env.GUEST_JWT_SECRET = ORIGINAL_ENV.GUEST_JWT_SECRET;
  if (ORIGINAL_ENV.GUEST_REFRESH_SECRET === undefined) delete process.env.GUEST_REFRESH_SECRET;
  else process.env.GUEST_REFRESH_SECRET = ORIGINAL_ENV.GUEST_REFRESH_SECRET;
};

const buildIo = () => ({
  to: () => ({ emit: () => {} }),
});

const buildApp = (io) => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/guest', guestRouter);
  app.use(
    '/chat/guest',
    (req, _res, next) => {
      req.io = io;
      next();
    },
    guestTimelineRouter(),
  );
  return attachErrorHandler(app);
};

const buildGuestToken = (guestId, options = {}) => {
  const secret = process.env.GUEST_JWT_SECRET;
  if (options.expired) {
    return jwt.sign({ guest_id: guestId, exp: Math.floor(Date.now() / 1000) - 10 }, secret);
  }
  return jwt.sign({ guest_id: guestId }, secret, { expiresIn: '1h' });
};

const bootstrapGuestToken = async (app, guestName, lang = 'ja') => {
  const res = await request(app).post('/guest/bootstrap').send({ guest_name: guestName, lang });
  expect(res.status).toBe(200);
  return { token: res.body.guest_token, guestId: res.body.guest_id };
};

const createContext = async ({ memberOnly = false, guestReactionOnly = false } = {}) => {
  const suffix = Math.random().toString(36).slice(2);
  const user = await User.create({
    username: 'Owner',
    mail: `owner-${Date.now()}-${suffix}@example.com`,
    lang: 'ja',
  });
  const floor = await Floor.create({
    user: user._id,
    title: 'Guest Floor',
  });
  const room = await Room.create({
    floor: floor._id,
    user: user._id,
    title: 'Guest Room',
    lang: 'ja',
    member_only: memberOnly,
    guest_reaction_only: guestReactionOnly,
  });
  return { user, floor, room };
};

const buildListPayload = (ctx, overrides = {}) => ({
  floor_id: ctx.floor._id.toString(),
  room_id: ctx.room._id.toString(),
  from: null,
  to: null,
  ...overrides,
});

const buildPostPayload = (ctx, guestName, overrides = {}) => ({
  floor_id: ctx.floor._id.toString(),
  floor_title: ctx.floor.title,
  room_id: ctx.room._id.toString(),
  room_title: ctx.room.title,
  guest_name: guestName,
  content: 'guest post',
  lang: 'ja',
  room_tags: [],
  animation: null,
  keyup: '',
  target_langs: [],
  ...overrides,
});

const buildReplyPayload = (ctx, postId, guestName, overrides = {}) => ({
  floor_id: ctx.floor._id.toString(),
  floor_title: ctx.floor.title,
  room_id: ctx.room._id.toString(),
  room_title: ctx.room.title,
  post_id: postId,
  guest_name: guestName,
  content: 'guest reply',
  lang: 'ja',
  room_tags: [],
  animation: null,
  keyup: '',
  target_langs: [],
  ...overrides,
});

describe('ゲスト用タイムラインAPIのアクセス制御', () => {
  let app;

  const guestName1 = 'GuestOne';
  const guestName2 = 'GuestTwo';

  afterAll(() => {
    restoreEnv();
  });

  beforeEach(() => {
    app = buildApp(buildIo());
  });

  test('一覧取得時にゲストトークンがなければTOKEN_INVALIDを返す', async () => {
    const ctx = await createContext();
    const res = await request(app).post('/chat/guest').send(buildListPayload(ctx));
    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOKEN_INVALID');
  });

  test('一覧取得時にゲストトークンが期限切れならTOKEN_EXPIREDを返す', async () => {
    const ctx = await createContext();
    const { guestId } = await bootstrapGuestToken(app, guestName1);
    const token = buildGuestToken(guestId, { expired: true });
    const res = await request(app)
      .post('/chat/guest')
      .set('x-guest-token', token)
      .send(buildListPayload(ctx));
    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOKEN_EXPIRED');
  });

  test('詳細取得時にゲストトークンがなければTOKEN_INVALIDを返す', async () => {
    const ctx = await createContext();
    const res = await request(app)
      .post('/chat/guest/detail')
      .send({ post_id: ctx.floor._id.toString() });
    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOKEN_INVALID');
  });

  test('詳細取得時にゲストトークンが期限切れならTOKEN_EXPIREDを返す', async () => {
    const ctx = await createContext();
    const { guestId } = await bootstrapGuestToken(app, guestName1);
    const token = buildGuestToken(guestId, { expired: true });

    const res = await request(app)
      .post('/chat/guest/detail')
      .set('x-guest-token', token)
      .send({ post_id: ctx.floor._id.toString() });
    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOKEN_EXPIRED');
  });

  test('メンバー限定ルームの一覧をゲストは取得できない', async () => {
    const ctx = await createContext({ memberOnly: true });
    const { token } = await bootstrapGuestToken(app, guestName1);
    const res = await request(app)
      .post('/chat/guest')
      .set('x-guest-token', token)
      .send(buildListPayload(ctx));
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });

  test('メンバー限定ルームにゲストは投稿できない', async () => {
    const ctx = await createContext({ memberOnly: true });
    const { token } = await bootstrapGuestToken(app, guestName1);
    const res = await request(app)
      .post('/chat/guest/post')
      .set('x-guest-token', token)
      .send(buildPostPayload(ctx, guestName1));
    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('INVALID_PERMISSION');
  });

  test('有効なゲストトークンで投稿一覧を取得できる', async () => {
    const ctx = await createContext();
    const { token } = await bootstrapGuestToken(app, guestName1);

    const created = await request(app)
      .post('/chat/guest/post')
      .set('x-guest-token', token)
      .send(buildPostPayload(ctx, guestName1));
    expect(created.status).toBe(200);

    const res = await request(app)
      .post('/chat/guest')
      .set('x-guest-token', token)
      .send(buildListPayload(ctx));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((row) => row._id === created.body._id)).toBe(true);
  });

  test('ゲストの投稿一覧に全体条件とカラム条件をANDで適用する', async () => {
    const ctx = await createContext();
    const { token } = await bootstrapGuestToken(app, guestName1);
    const contents = ['global column', 'global only', 'column only'];
    const created = [];
    for (const content of contents) {
      const response = await request(app)
        .post('/chat/guest/post')
        .set('x-guest-token', token)
        .send(buildPostPayload(ctx, guestName1, { content }));
      expect(response.status).toBe(200);
      created.push(response.body);
    }

    const listed = await request(app)
      .post('/chat/guest')
      .set('x-guest-token', token)
      .send(
        buildListPayload(ctx, {
          globalServerQuery: {
            filterMode: 'include',
            keywordArray: ['global'],
            logicalOperator: 'or',
          },
          serverQuery: {
            filterMode: 'include',
            keywordArray: ['column'],
            logicalOperator: 'or',
          },
        })
      );

    expect(listed.status).toBe(200);
    expect(listed.body.map((post) => post._id)).toEqual([created[0]._id]);
  });

  test('有効なゲストトークンで投稿詳細を取得できる', async () => {
    const ctx = await createContext();
    const { token } = await bootstrapGuestToken(app, guestName1);

    const created = await request(app)
      .post('/chat/guest/post')
      .set('x-guest-token', token)
      .send(buildPostPayload(ctx, guestName1));
    expect(created.status).toBe(200);

    const res = await request(app)
      .post('/chat/guest/detail')
      .set('x-guest-token', token)
      .send({ post_id: created.body._id });
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(created.body._id);
  });

  test('投稿IDが不正ならゲストの詳細取得を拒否する', async () => {
    await createContext();
    const { token } = await bootstrapGuestToken(app, guestName1);

    const res = await request(app)
      .post('/chat/guest/detail')
      .set('x-guest-token', token)
      .send({ post_id: 'invalid-id' });
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('ルームIDが不正ならゲストの一覧取得を拒否する', async () => {
    const ctx = await createContext();
    const { token } = await bootstrapGuestToken(app, guestName1);

    const res = await request(app)
      .post('/chat/guest')
      .set('x-guest-token', token)
      .send(buildListPayload(ctx, { room_id: 'invalid-id' }));

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('フロアIDが不正ならゲストの一覧取得を拒否する', async () => {
    const ctx = await createContext();
    const { token } = await bootstrapGuestToken(app, guestName1);

    const res = await request(app)
      .post('/chat/guest')
      .set('x-guest-token', token)
      .send(buildListPayload(ctx, { floor_id: 'invalid-id' }));

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('存在しない投稿の詳細にはnullを返す', async () => {
    await createContext();
    const { token } = await bootstrapGuestToken(app, guestName1);

    const res = await request(app)
      .post('/chat/guest/detail')
      .set('x-guest-token', token)
      .send({ post_id: new mongoose.Types.ObjectId().toString() });
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  test('フロアが削除済みならゲストの投稿詳細取得を拒否する', async () => {
    const ctx = await createContext();
    const { token } = await bootstrapGuestToken(app, guestName1);

    const post = await Chat.create({
      floor: ctx.floor._id,
      room: ctx.room._id,
      guest_id: 'guest-id',
      guest_name: guestName1,
      content: 'base',
      lang: 'ja',
      room_tags: [],
      animation: null,
    });

    await Floor.updateOne({ _id: ctx.floor._id }, { $set: { delete_flg: true } });

    const res = await request(app)
      .post('/chat/guest/detail')
      .set('x-guest-token', token)
      .send({ post_id: post._id.toString() });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('メンバー限定ルームの投稿詳細をゲストは取得できない', async () => {
    const ctx = await createContext({ memberOnly: true });
    const { token, guestId } = await bootstrapGuestToken(app, guestName1);

    const post = await Chat.create({
      floor: ctx.floor._id,
      room: ctx.room._id,
      guest_id: guestId,
      guest_name: guestName1,
      content: 'base',
      lang: 'ja',
      room_tags: [],
      animation: null,
    });

    const res = await request(app)
      .post('/chat/guest/detail')
      .set('x-guest-token', token)
      .send({ post_id: post._id.toString() });

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('INVALID_PERMISSION');
  });

  test('リアクション限定ルームでは通常表示の指定でも絵文字以外のゲスト投稿を拒否する', async () => {
    const ctx = await createContext({ guestReactionOnly: true });
    const { token } = await bootstrapGuestToken(app, guestName1);
    const res = await request(app)
      .post('/chat/guest/post')
      .set('x-guest-token', token)
      .send(buildPostPayload(ctx, guestName1, { content: 'hello', animation: null }));
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('リアクション限定ルームでは通常表示の指定でも絵文字以外のゲスト返信を拒否する', async () => {
    const ctx = await createContext({ guestReactionOnly: true });
    const { token, guestId } = await bootstrapGuestToken(app, guestName1);
    const post = await Chat.create({
      floor: ctx.floor._id,
      room: ctx.room._id,
      guest_id: guestId,
      guest_name: guestName1,
      content: 'base',
      lang: 'ja',
      room_tags: [],
      animation: null,
    });

    const res = await request(app)
      .post('/chat/guest/reply')
      .set('x-guest-token', token)
      .send(buildReplyPayload(ctx, post._id.toString(), guestName1, { content: 'hello', animation: null }));
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('ゲストの投稿と返信に別ルームのタグを指定できない', async () => {
    const ctx = await createContext();
    const { token, guestId } = await bootstrapGuestToken(app, guestName1);
    const otherRoom = await Room.create({
      floor: ctx.floor._id,
      user: ctx.user._id,
      title: 'Other Guest Room',
      lang: 'ja',
      member_only: false,
    });
    const foreignTag = await RoomTag.create({
      floor: ctx.floor._id,
      room: otherRoom._id,
      user: ctx.user._id,
      order: 1,
      name: 'Foreign Guest Tag',
      lang: 'ja',
    });
    const roomTags = [foreignTag._id.toString()];

    const rejectedPost = await request(app)
      .post('/chat/guest/post')
      .set('x-guest-token', token)
      .send(buildPostPayload(ctx, guestName1, { room_tags: roomTags }));
    expect(rejectedPost.status).toBe(400);
    expect(rejectedPost.body?.error?.code).toBe('INVALID_PARAMS');

    const post = await Chat.create({
      floor: ctx.floor._id,
      room: ctx.room._id,
      guest_id: guestId,
      guest_name: guestName1,
      content: 'base',
      lang: 'ja',
      room_tags: [],
      animation: null,
    });
    const rejectedReply = await request(app)
      .post('/chat/guest/reply')
      .set('x-guest-token', token)
      .send(buildReplyPayload(ctx, post._id.toString(), guestName1, { room_tags: roomTags }));
    expect(rejectedReply.status).toBe(400);
    expect(rejectedReply.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test.each(['正常', '通知失敗'])('%sでもゲストの投稿・返信を保存し、解析タグがあってもAI解析は起動しない', async (stage) => {
    if (stage === '通知失敗') app = buildApp({ to: () => ({ emit: () => { throw new Error('emit failed'); } }) });
    const ctx = await createContext();
    const { token } = await bootstrapGuestToken(app, guestName1);
    const tags = await RoomTag.create(
      ['画像解析', '文字起こし', '動画解析', '音解析'].map((name, index) => ({
        floor: ctx.floor._id,
        room: ctx.room._id,
        user: ctx.user._id,
        order: index + 1,
        name,
        lang: 'ja',
      }))
    );
    const roomTags = tags.map((tag) => tag._id.toString());

    const createdPost = await request(app)
      .post('/chat/guest/post')
      .set('x-guest-token', token)
      .send(buildPostPayload(ctx, guestName1, { room_tags: roomTags }));
    expect(createdPost.status).toBe(200);
    expect(createdPost.body.analysis_source_revision).toBeUndefined();

    const createdReply = await request(app)
      .post('/chat/guest/reply')
      .set('x-guest-token', token)
      .send(buildReplyPayload(ctx, createdPost.body._id, guestName1, { room_tags: roomTags }));
    expect(createdReply.status).toBe(200);
    expect(createdReply.body.replies[0].analysis_source_revision).toBeUndefined();

    Object.values(analysisService).forEach((handler) => expect(handler).not.toHaveBeenCalled());
    expect(timelineTranslationService.translateGuestMainContentIfNeeded).not.toHaveBeenCalled();
    expect(timelineTranslationService.translateGuestReplyIfNeeded).not.toHaveBeenCalled();
    const saved = await Chat.findById(createdPost.body._id).lean();
    expect(saved.analysis_source_revision).toBe(1);
    expect(saved.replies[0].analysis_source_revision).toBe(1);
    expect(saved.supplementaries).toHaveLength(0);
    expect(saved.replies[0].supplementaries).toHaveLength(0);
  });

  test('ゲスト投稿の本文がnullなら拒否する（HTTP 400）', async () => {
    const ctx = await createContext({ guestReactionOnly: true });
    const { token } = await bootstrapGuestToken(app, guestName1);
    const res = await request(app)
      .post('/chat/guest/post')
      .set('x-guest-token', token)
      .send(buildPostPayload(ctx, guestName1, { content: null, animation: 'move-and-erase' }));
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('対応言語数を超える翻訳先を指定したゲスト投稿は保存せず拒否する', async () => {
    const ctx = await createContext();
    const { token } = await bootstrapGuestToken(app, guestName1);
    const res = await request(app)
      .post('/chat/guest/post')
      .set('x-guest-token', token)
      .send(
        buildPostPayload(ctx, guestName1, {
          target_langs: Array(ALLOWED_LANGUAGES.length + 1).fill('en'),
        })
      );

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
    expect(await Chat.countDocuments({ room: ctx.room._id })).toBe(0);
  });

  test('ゲスト返信の本文がnullなら拒否する（HTTP 400）', async () => {
    const ctx = await createContext({ guestReactionOnly: true });
    const { token, guestId } = await bootstrapGuestToken(app, guestName1);
    const post = await Chat.create({
      floor: ctx.floor._id,
      room: ctx.room._id,
      guest_id: guestId,
      guest_name: guestName1,
      content: 'base',
      lang: 'ja',
      room_tags: [],
      animation: null,
    });

    const res = await request(app)
      .post('/chat/guest/reply')
      .set('x-guest-token', token)
      .send(buildReplyPayload(ctx, post._id.toString(), guestName1, { content: null, animation: 'move-and-erase' }));
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('ゲスト投稿へのリアクションは本人だけが解除できる', async () => {
    const ctx = await createContext();
    const { token: token1 } = await bootstrapGuestToken(app, guestName1);
    const { token: token2 } = await bootstrapGuestToken(app, guestName2);

    const created = await request(app)
      .post('/chat/guest/post')
      .set('x-guest-token', token1)
      .send(buildPostPayload(ctx, guestName1));
    const postId = created.body._id;

    const reacted = await request(app)
      .post('/chat/guest/reaction')
      .set('x-guest-token', token1)
      .send({ post_id: postId, guest_name: guestName1, type: 'いいね' });
    const reactionId = reacted.body.reactions[0]._id;

    const deleted = await request(app)
      .post('/chat/guest/reaction/delete')
      .set('x-guest-token', token2)
      .send({ post_id: postId, reaction_id: reactionId, guest_name: guestName2 });

    expect(deleted.status).toBe(401);
    expect(deleted.body?.error?.code).toBe('INVALID_PERMISSION');
  });

  test('ゲストが返信へのリアクションを追加・解除できる', async () => {
    const ctx = await createContext();
    const { token } = await bootstrapGuestToken(app, guestName1);

    const createdPost = await request(app)
      .post('/chat/guest/post')
      .set('x-guest-token', token)
      .send(buildPostPayload(ctx, guestName1));
    const postId = createdPost.body._id;

    const createdReply = await request(app)
      .post('/chat/guest/reply')
      .set('x-guest-token', token)
      .send(buildReplyPayload(ctx, postId, guestName1));
    const replyId = extractFirstReplyId(createdReply, 'リアクション検証用のゲストの返信作成');

    const reacted = await request(app)
      .post('/chat/guest/reply/reaction')
      .set('x-guest-token', token)
      .send({ post_id: postId, reply_id: replyId, guest_name: guestName1, type: '拍手' });
    expect(reacted.status).toBe(200);

    const reply = reacted.body.replies.find((r) => r._id === replyId);
    expect(reply.reactions).toHaveLength(1);

    const reactionId = reply.reactions[0]._id;
    const deleted = await request(app)
      .post('/chat/guest/reply/reaction/delete')
      .set('x-guest-token', token)
      .send({ post_id: postId, reply_id: replyId, reaction_id: reactionId, guest_name: guestName1 });
    expect(deleted.status).toBe(200);

    const replyAfter = deleted.body.replies.find((r) => r._id === replyId);
    expect(replyAfter.reactions).toHaveLength(0);
  });

  test('ゲスト返信へのリアクションは本人だけが解除できる', async () => {
    const ctx = await createContext();
    const { token: token1 } = await bootstrapGuestToken(app, guestName1);
    const { token: token2 } = await bootstrapGuestToken(app, guestName2);

    const createdPost = await request(app)
      .post('/chat/guest/post')
      .set('x-guest-token', token1)
      .send(buildPostPayload(ctx, guestName1));
    const postId = createdPost.body._id;

    const createdReply = await request(app)
      .post('/chat/guest/reply')
      .set('x-guest-token', token1)
      .send(buildReplyPayload(ctx, postId, guestName1));
    const replyId = extractFirstReplyId(createdReply, '削除権限の検証用のゲストの返信作成');

    const reacted = await request(app)
      .post('/chat/guest/reply/reaction')
      .set('x-guest-token', token1)
      .send({ post_id: postId, reply_id: replyId, guest_name: guestName1, type: '拍手' });
    const reactionId = reacted.body.replies.find((r) => r._id === replyId).reactions[0]._id;

    const deleted = await request(app)
      .post('/chat/guest/reply/reaction/delete')
      .set('x-guest-token', token2)
      .send({ post_id: postId, reply_id: replyId, reaction_id: reactionId, guest_name: guestName2 });

    expect(deleted.status).toBe(401);
    expect(deleted.body?.error?.code).toBe('INVALID_PERMISSION');
  });

  test('ゲストが投稿の付加情報へのリアクションを追加・解除できる', async () => {
    const ctx = await createContext();
    const { token, guestId } = await bootstrapGuestToken(app, guestName1);

    const post = await Chat.create({
      floor: ctx.floor._id,
      room: ctx.room._id,
      guest_id: guestId,
      guest_name: guestName1,
      content: 'base',
      lang: 'ja',
      room_tags: [],
      animation: null,
      supplementaries: [{ content: 'supplement', lang: 'ja' }],
    });

    const supplementId = post.supplementaries[0]._id.toString();
    const reacted = await request(app)
      .post('/chat/guest/supplement/reaction')
      .set('x-guest-token', token)
      .send({ post_id: post._id.toString(), supplement_id: supplementId, guest_name: guestName1, type: 'いいね' });
    assertTimelineOk(reacted, 'ゲストの付加情報へのリアクション作成');

    const reactedSupplementId = extractFirstSupplementId(reacted, 'ゲストの付加情報へのリアクションのデータ');
    const reactedSupplement = reacted.body.supplementaries.find((supp) => supp._id === reactedSupplementId);
    const reactionId = reactedSupplement.reactions[0]._id;
    const deleted = await request(app)
      .post('/chat/guest/supplement/reaction/delete')
      .set('x-guest-token', token)
      .send({ post_id: post._id.toString(), supplement_id: supplementId, reaction_id: reactionId, guest_name: guestName1 });
    expect(deleted.status).toBe(200);
    expect(deleted.body.supplementaries[0].reactions).toHaveLength(0);
  });

  test('ゲストが返信の付加情報へのリアクションを追加・解除できる', async () => {
    const ctx = await createContext();
    const { token, guestId } = await bootstrapGuestToken(app, guestName1);

    const post = await Chat.create({
      floor: ctx.floor._id,
      room: ctx.room._id,
      guest_id: guestId,
      guest_name: guestName1,
      content: 'base',
      lang: 'ja',
      room_tags: [],
      animation: null,
      replies: [
        {
          guest_id: guestId,
          guest_name: guestName1,
          content: 'reply',
          lang: 'ja',
          room_tags: [],
          animation: null,
          supplementaries: [{ content: 'reply supplement', lang: 'ja' }],
        },
      ],
    });

    const replyId = post.replies[0]._id.toString();
    const supplementId = post.replies[0].supplementaries[0]._id.toString();

    const reacted = await request(app)
      .post('/chat/guest/reply/supplement/reaction')
      .set('x-guest-token', token)
      .send({
        post_id: post._id.toString(),
        reply_id: replyId,
        supplement_id: supplementId,
        guest_name: guestName1,
        type: '拍手',
      });
    expect(reacted.status).toBe(200);

    const reply = reacted.body.replies.find((r) => r._id === replyId);
    const reactionId = reply.supplementaries[0].reactions[0]._id;

    const deleted = await request(app)
      .post('/chat/guest/reply/supplement/reaction/delete')
      .set('x-guest-token', token)
      .send({
        post_id: post._id.toString(),
        reply_id: replyId,
        supplement_id: supplementId,
        reaction_id: reactionId,
        guest_name: guestName1,
      });
    expect(deleted.status).toBe(200);

    const replyAfter = deleted.body.replies.find((r) => r._id === replyId);
    expect(replyAfter.supplementaries[0].reactions).toHaveLength(0);
  });
});
