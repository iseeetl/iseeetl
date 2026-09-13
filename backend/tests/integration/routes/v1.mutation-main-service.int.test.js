const request = require('supertest');

jest.mock('../../../services/backgroundTaskRunner', () => ({
  runBackgroundTask: jest.fn(),
}));

const { snapshotEnv, restoreEnv, createJwtToken } = require('../_helpers/auth');
const { buildErrorHandledApp } = require('../_helpers/app');
const { createUser, createFloor, createRoom } = require('../_helpers/models');
const {
  ensureDir,
  removeDirSafe,
  testRuntimePath,
  trailingSlash,
} = require('../../_helpers/testRuntime');

const ORIGINAL_ENV = snapshotEnv(['JWT_DEV_SECRET', 'MEDIA_PATH']);
const suiteRoot = testRuntimePath('v1-mutation-main-service');
const mediaRoot = testRuntimePath('v1-mutation-main-service', 'media');
process.env.JWT_DEV_SECRET = 'v1-mutation-main-service-test-secret';
process.env.MEDIA_PATH = trailingSlash(mediaRoot);

const v1Router = require('../../../routes/v1');
const Chat = require('../../../models/Chat');
const FloorMember = require('../../../models/FloorMember');
const RoomMember = require('../../../models/RoomMember');

const socketEmit = jest.fn();
const socketTo = jest.fn(() => ({ emit: socketEmit }));
const ioStub = {
  to: socketTo,
  in: () => ({ emit: socketEmit }),
  roomLanguageProvider: { getLanguages: () => [] },
};

const buildToken = (user) =>
  createJwtToken(
    { user_id: user._id.toString(), user_role: 'developer' },
    process.env.JWT_DEV_SECRET
  );

const imageFields = (user, timestamp) => ({
  image_name: `${timestamp}_${user._id.toString()}.png`,
  image_thumbnail_name: `${timestamp}_${user._id.toString()}_thumbnail.png`,
  image_caption: `caption-${timestamp}`,
});

const expectError = (response, status, code) => {
  expect(response.status).toBe(status);
  expect(response.body?.error?.code).toBe(code);
};

describe('v1と主系タイムラインの共通更新処理', () => {
  let app;

  const sendMutation = (user, routePath, body) =>
    request(app)
      .post(routePath)
      .set('Authorization', `Bearer ${buildToken(user)}`)
      .send(body);

  beforeEach(async () => {
    socketEmit.mockClear();
    socketTo.mockClear();
    await removeDirSafe(suiteRoot);
    await ensureDir(mediaRoot);
    app = buildErrorHandledApp({
      mounts: [{ path: '/api/v1', handler: v1Router(ioStub) }],
    });
  });

  afterAll(async () => {
    restoreEnv(ORIGINAL_ENV);
    await removeDirSafe(suiteRoot);
  });

  test('フロアメンバーは他者の内容を更新・削除でき、ルームメンバーだけでは操作できない', async () => {
    const owner = await createUser({ role: 'developer' });
    const actor = await createUser({ role: 'developer' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor, { member_only: true });
    await FloorMember.create({ floor: floor._id, user: actor._id });
    const post = await Chat.create({
      floor: floor._id,
      room: room._id,
      user: owner._id,
      content: 'post-before',
      lang: 'ja',
      supplementaries: [{ user: owner._id, content: 'post-supplement', lang: 'ja' }],
      replies: [
        {
          user: owner._id,
          content: 'reply-before',
          lang: 'ja',
          supplementaries: [{ user: owner._id, content: 'reply-supplement', lang: 'ja' }],
        },
      ],
    });
    const replyId = post.replies[0]._id.toString();
    const postSupplementId = post.supplementaries[0]._id.toString();
    const replySupplementId = post.replies[0].supplementaries[0]._id.toString();
    const roomId = room._id.toString();
    const postId = post._id.toString();

    const postUpdate = await sendMutation(actor, '/api/v1/post/update', {
      room_id: roomId,
      post_id: postId,
      content: 'post-by-floor-member',
    });
    expect(postUpdate.status).toBe(200);

    const replySupplementDelete = await sendMutation(
      actor,
      '/api/v1/reply/supplement/delete',
      {
        room_id: roomId,
        post_id: postId,
        reply_id: replyId,
        supplement_id: replySupplementId,
      }
    );
    expect(replySupplementDelete.status).toBe(200);

    await FloorMember.deleteOne({ floor: floor._id, user: actor._id });
    await RoomMember.create({ floor: floor._id, room: room._id, user: actor._id });
    socketEmit.mockClear();
    socketTo.mockClear();

    const replyUpdate = await sendMutation(actor, '/api/v1/reply/update', {
      room_id: roomId,
      post_id: postId,
      reply_id: replyId,
      content: 'must-not-update',
    });
    expectError(replyUpdate, 401, 'INVALID_PERMISSION');

    const postSupplementDelete = await sendMutation(
      actor,
      '/api/v1/post/supplement/delete',
      {
        room_id: roomId,
        post_id: postId,
        supplement_id: postSupplementId,
      }
    );
    expectError(postSupplementDelete, 401, 'INVALID_PERMISSION');

    const saved = await Chat.findById(post._id).lean();
    expect(saved.content).toBe('post-by-floor-member');
    expect(saved.replies[0].content).toBe('reply-before');
    expect(saved.replies[0].supplementaries[0].delete_flg).toBe(true);
    expect(saved.supplementaries[0].delete_flg).toBe(false);
    expect(socketEmit).not.toHaveBeenCalled();
  });

  test('ルーム・投稿・返信・付加情報の親子ID不一致を拒否し、対象を変更しない', async () => {
    const developer = await createUser({ role: 'developer' });
    const floor = await createFloor(developer);
    const room = await createRoom(developer, floor);
    const otherRoom = await createRoom(developer, floor);
    const postA = await Chat.create({
      floor: floor._id,
      room: room._id,
      user: developer._id,
      content: 'post-a',
      lang: 'ja',
      supplementaries: [{ user: developer._id, content: 'post-a-supplement', lang: 'ja' }],
      replies: [
        {
          user: developer._id,
          content: 'reply-a1',
          lang: 'ja',
          supplementaries: [{ user: developer._id, content: 'reply-a1-supplement', lang: 'ja' }],
        },
        {
          user: developer._id,
          content: 'reply-a2',
          lang: 'ja',
          supplementaries: [{ user: developer._id, content: 'reply-a2-supplement', lang: 'ja' }],
        },
      ],
    });
    const postB = await Chat.create({
      floor: floor._id,
      room: room._id,
      user: developer._id,
      content: 'post-b',
      lang: 'ja',
      supplementaries: [{ user: developer._id, content: 'post-b-supplement', lang: 'ja' }],
      replies: [{ user: developer._id, content: 'reply-b', lang: 'ja' }],
    });
    const roomId = room._id.toString();
    const postAId = postA._id.toString();
    const cases = [
      {
        path: '/api/v1/post/update',
        body: {
          room_id: otherRoom._id.toString(),
          post_id: postAId,
          content: 'wrong-room',
        },
        status: 400,
        code: 'INVALID_PARAMS',
      },
      {
        path: '/api/v1/reply/update',
        body: {
          room_id: roomId,
          post_id: postAId,
          reply_id: postB.replies[0]._id.toString(),
          content: 'wrong-post',
        },
        status: 400,
        code: 'INVALID_PARAMS',
      },
      {
        path: '/api/v1/post/supplement/update',
        body: {
          room_id: roomId,
          post_id: postAId,
          supplement_id: postB.supplementaries[0]._id.toString(),
          content: 'wrong-post-supplement',
        },
        status: 404,
        code: 'NOT_FOUND',
      },
      {
        path: '/api/v1/reply/supplement/update',
        body: {
          room_id: roomId,
          post_id: postAId,
          reply_id: postA.replies[0]._id.toString(),
          supplement_id: postA.replies[1].supplementaries[0]._id.toString(),
          content: 'wrong-reply-supplement',
        },
        status: 400,
        code: 'INVALID_PARAMS',
      },
    ];

    for (const scenario of cases) {
      const response = await sendMutation(developer, scenario.path, scenario.body);
      expectError(response, scenario.status, scenario.code);
    }

    const [savedA, savedB] = await Promise.all([
      Chat.findById(postA._id).lean(),
      Chat.findById(postB._id).lean(),
    ]);
    expect(savedA.content).toBe('post-a');
    expect(savedA.replies.map(({ content }) => content)).toEqual(['reply-a1', 'reply-a2']);
    expect(savedA.replies[0].supplementaries[0].content).toBe('reply-a1-supplement');
    expect(savedB.replies[0].content).toBe('reply-b');
    expect(savedB.supplementaries[0].content).toBe('post-b-supplement');
    expect(socketEmit).not.toHaveBeenCalled();
  });

  test('論理削除済みの投稿・返信・付加情報配下を変更しない', async () => {
    const developer = await createUser({ role: 'developer' });
    const floor = await createFloor(developer);
    const room = await createRoom(developer, floor);
    const deletedPost = await Chat.create({
      floor: floor._id,
      room: room._id,
      user: developer._id,
      content: 'deleted-post',
      lang: 'ja',
      delete_flg: true,
    });
    const activePost = await Chat.create({
      floor: floor._id,
      room: room._id,
      user: developer._id,
      content: 'active-post',
      lang: 'ja',
      supplementaries: [
        { user: developer._id, content: 'deleted-post-supplement', lang: 'ja', delete_flg: true },
      ],
      replies: [
        {
          user: developer._id,
          content: 'deleted-reply',
          lang: 'ja',
          delete_flg: true,
          supplementaries: [{ user: developer._id, content: 'child-of-deleted-reply', lang: 'ja' }],
        },
        {
          user: developer._id,
          content: 'active-reply',
          lang: 'ja',
          supplementaries: [
            { user: developer._id, content: 'deleted-reply-supplement', lang: 'ja', delete_flg: true },
          ],
        },
      ],
    });
    const roomId = room._id.toString();
    const activePostId = activePost._id.toString();
    const cases = [
      {
        path: '/api/v1/reply/create',
        body: {
          room_id: roomId,
          post_id: deletedPost._id.toString(),
          content: 'child-of-deleted-post',
        },
        status: 400,
        code: 'INVALID_PARAMS',
      },
      {
        path: '/api/v1/reply/supplement/create',
        body: {
          room_id: roomId,
          post_id: activePostId,
          reply_id: activePost.replies[0]._id.toString(),
          content: 'child-of-deleted-reply',
        },
        status: 400,
        code: 'INVALID_PARAMS',
      },
      {
        path: '/api/v1/post/supplement/update',
        body: {
          room_id: roomId,
          post_id: activePostId,
          supplement_id: activePost.supplementaries[0]._id.toString(),
          content: 'must-not-update',
        },
        status: 404,
        code: 'NOT_FOUND',
      },
      {
        path: '/api/v1/reply/supplement/update',
        body: {
          room_id: roomId,
          post_id: activePostId,
          reply_id: activePost.replies[1]._id.toString(),
          supplement_id: activePost.replies[1].supplementaries[0]._id.toString(),
          content: 'must-not-update',
        },
        status: 400,
        code: 'INVALID_PARAMS',
      },
    ];

    for (const scenario of cases) {
      const response = await sendMutation(developer, scenario.path, scenario.body);
      expectError(response, scenario.status, scenario.code);
    }

    const [savedDeletedPost, savedActivePost] = await Promise.all([
      Chat.findById(deletedPost._id).lean(),
      Chat.findById(activePost._id).lean(),
    ]);
    expect(savedDeletedPost.replies).toHaveLength(0);
    expect(savedActivePost.supplementaries[0].content).toBe('deleted-post-supplement');
    expect(savedActivePost.replies[0].supplementaries).toHaveLength(1);
    expect(savedActivePost.replies[1].supplementaries[0].content).toBe(
      'deleted-reply-supplement'
    );
    expect(socketEmit).not.toHaveBeenCalled();
  });

  test('内容だけのv1更新では投稿・返信・各付加情報の既存メディアを保持する', async () => {
    const developer = await createUser({ role: 'developer' });
    const floor = await createFloor(developer);
    const room = await createRoom(developer, floor);
    const postMedia = imageFields(developer, '1001');
    const postSupplementMedia = imageFields(developer, '1002');
    const replyMedia = imageFields(developer, '1003');
    const replySupplementMedia = imageFields(developer, '1004');
    const post = await Chat.create({
      floor: floor._id,
      room: room._id,
      user: developer._id,
      content: 'post-before',
      lang: 'ja',
      ...postMedia,
      supplementaries: [
        {
          user: developer._id,
          content: 'post-supplement-before',
          lang: 'ja',
          ...postSupplementMedia,
        },
      ],
      replies: [
        {
          user: developer._id,
          content: 'reply-before',
          lang: 'ja',
          ...replyMedia,
          supplementaries: [
            {
              user: developer._id,
              content: 'reply-supplement-before',
              lang: 'ja',
              ...replySupplementMedia,
            },
          ],
        },
      ],
    });
    const roomId = room._id.toString();
    const postId = post._id.toString();
    const replyId = post.replies[0]._id.toString();
    const postSupplementId = post.supplementaries[0]._id.toString();
    const replySupplementId = post.replies[0].supplementaries[0]._id.toString();
    const updates = [
      {
        path: '/api/v1/post/update',
        body: {
          room_id: roomId,
          post_id: postId,
          content: 'post-after',
          image_name: postMedia.image_name,
          image_thumbnail_name: postMedia.image_thumbnail_name,
        },
      },
      {
        path: '/api/v1/reply/update',
        body: {
          room_id: roomId,
          post_id: postId,
          reply_id: replyId,
          content: 'reply-after',
          image_caption: 'caption-updated',
        },
      },
      {
        path: '/api/v1/post/supplement/update',
        body: {
          room_id: roomId,
          post_id: postId,
          supplement_id: postSupplementId,
          content: 'post-supplement-after',
        },
      },
      {
        path: '/api/v1/reply/supplement/update',
        body: {
          room_id: roomId,
          post_id: postId,
          reply_id: replyId,
          supplement_id: replySupplementId,
          content: 'reply-supplement-after',
        },
      },
    ];

    for (const update of updates) {
      const response = await sendMutation(developer, update.path, update.body);
      expect(response.status).toBe(200);
    }

    const saved = await Chat.findById(post._id).lean();
    expect(saved).toEqual(expect.objectContaining(postMedia));
    expect(saved.supplementaries[0]).toEqual(expect.objectContaining(postSupplementMedia));
    expect(saved.replies[0]).toEqual(expect.objectContaining({
      ...replyMedia,
      image_caption: 'caption-updated',
    }));
    expect(saved.replies[0].supplementaries[0]).toEqual(
      expect.objectContaining(replySupplementMedia)
    );
  });
});
