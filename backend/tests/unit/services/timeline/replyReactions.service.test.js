jest.mock('../../../../models/Chat', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../../../../services/room/roomAccess.service', () => ({ authorizeRoomAccess: jest.fn() }));
jest.mock('../../../../services/timeline/shared/timelineSerializer', () => jest.fn((v) => v));

jest.mock(
  '../../../../utils/appError',
  () =>
    function AppError(message, statusCode) {
      this.message = message;
      this.statusCode = statusCode;
    }
);

const replyReactionService = require('../../../../services/timeline/replyReactions.service');
const Chat = require('../../../../models/Chat');
const { authorizeRoomAccess } = require('../../../../services/room/roomAccess.service');
const serializeTimeline = require('../../../../services/timeline/shared/timelineSerializer');
const AppError = require('../../../../utils/appError');

const makePopulateChain = (doc) => ({
  populate: jest.fn().mockResolvedValue(doc),
});

describe('replyReactionsのサービス', () => {
  const io = (() => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    return { to, _emit: emit };
  })();

  const jwtAdmin = { user_id: 'admin', user_role: 'Administrator' };
  const jwtEditor = { user_id: 'editor', user_role: 'Editor' };
  const jwtUser = { user_id: 'user', user_role: 'User' };

  const foundUser = { _id: 'user', username: 'Taro' };
  const foundRoom = { _id: 'room1', title: 'Room' };
  const foundFloor = { _id: 'floor1', title: 'Floor', user: 'editor' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('作成', () => {
    const body = { post_id: 'post1', reply_id: 'reply1', type: 'LIKE' };

    test('リアクション追加、Socket通知', async () => {
      Chat.findOne.mockResolvedValue({ _id: 'post1', room: 'room1', delete_flg: false });
      authorizeRoomAccess.mockResolvedValue({ foundUser, foundRoom, foundFloor });
      const resultObj = { _id: 'post1', room: { _id: 'room1' } };
      Chat.findOneAndUpdate.mockResolvedValue(makePopulateChain(resultObj));
      serializeTimeline.mockReturnValue(resultObj);

      const res = await replyReactionService.create(body, jwtUser, io);

      expect(res).toBe(resultObj);
      expect(Chat.findOne).toHaveBeenCalledWith({ _id: 'post1', delete_flg: false });
      expect(Chat.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'post1', 'replies._id': 'reply1', delete_flg: false },
        { $push: { 'replies.$.reactions': { user: 'user', type: 'LIKE' } } },
        { new: true, runValidators: true }
      );
      expect(io.to).toHaveBeenCalledWith('room1');
      expect(io._emit).toHaveBeenCalledWith('REPLY_REACTION_CREATE', resultObj);
    });

    test('投稿が存在しない', async () => {
      Chat.findOne.mockResolvedValue(null);
      await expect(replyReactionService.create(body, jwtUser, io)).rejects.toBeInstanceOf(AppError);
    });

    test('authorizeRoomAccess がエラー', async () => {
      Chat.findOne.mockResolvedValue({ _id: 'post1', room: 'room1', delete_flg: false });
      authorizeRoomAccess.mockRejectedValue(new AppError({ code: 'FORBIDDEN' }));
      await expect(replyReactionService.create(body, jwtUser, io)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('削除', () => {
    const baseBody = { post_id: 'post1', reply_id: 'reply1', reaction_id: 'r1' };

    const makeFoundChat = (reactionOwner = 'x') => {
      const reaction = { _id: 'r1', user: reactionOwner };
      reaction.id = (id) => (id === reaction._id ? reaction : null);

      const reply = { _id: 'reply1', reactions: [reaction] };
      reply.id = (id) => (id === reply._id ? reply : null);
      reply.reactions.id = (id) => reply.reactions.find((r) => r._id === id) || null;

      const replies = [reply];
      replies.id = (id) => replies.find((r) => r._id === id) || null;

      return { _id: 'post1', room: 'room1', replies };
    };

    beforeEach(() => {
      Chat.findOneAndUpdate.mockResolvedValue(makePopulateChain({ _id: 'post1', room: { _id: 'room1' } }));
    });

    test('管理者削除', async () => {
      Chat.findOne.mockResolvedValue(makeFoundChat());
      authorizeRoomAccess.mockResolvedValue({ foundUser, foundRoom, foundFloor });
      await expect(replyReactionService.delete(baseBody, jwtAdmin, io)).resolves.toBeDefined();
      expect(io._emit).toHaveBeenCalledWith('REACTION_DELETE', expect.any(Object));
    });

    test('フロアを作成した編集ユーザはリアクションを削除できる', async () => {
      Chat.findOne.mockResolvedValue(makeFoundChat());
      authorizeRoomAccess.mockResolvedValue({
        foundUser: { _id: 'editor', username: 'E' },
        foundRoom,
        foundFloor: { ...foundFloor, user: 'editor' },
      });
      await expect(replyReactionService.delete(baseBody, jwtEditor, io)).resolves.toBeDefined();
    });

    test('フロアメンバー削除', async () => {
      Chat.findOne.mockResolvedValue(makeFoundChat());
      authorizeRoomAccess.mockResolvedValue({ foundUser, foundRoom, foundFloor, foundFloorMember: {} });
      await expect(replyReactionService.delete(baseBody, jwtUser, io)).resolves.toBeDefined();
    });

    test('自分のリアクション削除', async () => {
      Chat.findOne.mockResolvedValue(makeFoundChat('user'));
      authorizeRoomAccess.mockResolvedValue({ foundUser, foundRoom, foundFloor, foundFloorMember: null });
      await expect(replyReactionService.delete(baseBody, jwtUser, io)).resolves.toBeDefined();
    });

    test('権限なし -> 401', async () => {
      Chat.findOne.mockResolvedValue(makeFoundChat('other'));
      authorizeRoomAccess.mockResolvedValue({ foundUser, foundRoom, foundFloor, foundFloorMember: null });
      await expect(replyReactionService.delete(baseBody, jwtUser, io)).rejects.toBeInstanceOf(AppError);
    });

    test('投稿が存在しない', async () => {
      Chat.findOne.mockResolvedValue(null);
      await expect(replyReactionService.delete(baseBody, jwtUser, io)).rejects.toBeInstanceOf(AppError);
    });
  });
});
