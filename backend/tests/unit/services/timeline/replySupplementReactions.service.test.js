const { ObjectId } = require('mongodb');

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

const replySupReactionsService = require('../../../../services/timeline/replySupplementReactions.service');
const Chat = require('../../../../models/Chat');
const { authorizeRoomAccess } = require('../../../../services/room/roomAccess.service');
const AppError = require('../../../../utils/appError');

const makeIds = () => ({
  postId: String(new ObjectId()),
  replyId: String(new ObjectId()),
  suppId: String(new ObjectId()),
  reactId: String(new ObjectId()),
  roomId: String(new ObjectId()),
  floorId: String(new ObjectId()),
});

const baseAuthResult = (userId, roomId, floorId, isFloorCreator = false, hasMember = false) => ({
  foundUser: { _id: userId, username: 'Taro' },
  foundRoom: { _id: roomId, title: 'Room' },
  foundFloor: { _id: floorId, title: 'Floor', user: isFloorCreator ? userId : 'creatorX' },
  foundFloorMember: hasMember ? { _id: 'member1' } : null,
});

const makeIoMock = () => {
  const emitMock = jest.fn();
  return {
    to: jest.fn().mockReturnValue({ emit: emitMock }),
    __emitMock: emitMock,
  };
};

describe('replySupplementReactionsのサービス', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('作成', () => {
    test('リアクション作成成功', async () => {
      const ids = makeIds();
      const jwt = { user_id: 'user123', user_role: 'User' };
      const ioMock = makeIoMock();

      Chat.findOne.mockResolvedValue({ _id: ids.postId, room: ids.roomId, delete_flg: false });

      authorizeRoomAccess.mockResolvedValue(baseAuthResult(jwt.user_id, ids.roomId, ids.floorId));

      const updatedChat = { _id: ids.postId, room: { _id: ids.roomId } };
      Chat.findOneAndUpdate.mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(updatedChat),
      }));

      const result = await replySupReactionsService.create(
        {
          post_id: ids.postId,
          reply_id: ids.replyId,
          supplement_id: ids.suppId,
          type: 'like',
        },
        jwt,
        ioMock
      );

      expect(result).toBe(updatedChat);

      expect(Chat.findOne).toHaveBeenCalledWith({ _id: ids.postId, delete_flg: false });
      expect(Chat.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: ids.postId, delete_flg: false },
        {
          $push: {
            'replies.$[reply].supplementaries.$[supplement].reactions': {
              user: jwt.user_id,
              type: 'like',
            },
          },
        },
        {
          arrayFilters: [{ 'reply._id': ids.replyId }, { 'supplement._id': ids.suppId }],
          new: true,
          runValidators: true,
        }
      );
      expect(ioMock.to).toHaveBeenCalledWith(ids.roomId);
      expect(ioMock.__emitMock).toHaveBeenCalledWith('REPLY_SUPPLEMENT_REACTION_CREATE', updatedChat);
    });

    test('投稿が存在せず 400', async () => {
      const ids = makeIds();
      Chat.findOne.mockResolvedValue(null);

      await expect(
        replySupReactionsService.create(
          { post_id: ids.postId, reply_id: ids.replyId, supplement_id: ids.suppId, type: 'like' },
          { user_id: 'u1', user_role: 'User' },
          makeIoMock()
        )
      ).rejects.toBeInstanceOf(AppError);
    });

    test('authorizeRoomAccess エラー', async () => {
      const ids = makeIds();
      Chat.findOne.mockResolvedValue({ _id: ids.postId, room: ids.roomId, delete_flg: false });
      authorizeRoomAccess.mockRejectedValue(new AppError({ code: 'FORBIDDEN' }));

      await expect(
        replySupReactionsService.create(
          { post_id: ids.postId, reply_id: ids.replyId, supplement_id: ids.suppId, type: 'like' },
          { user_id: 'u1', user_role: 'User' },
          makeIoMock()
        )
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('削除', () => {
    const prepareChatDoc = (ids, reactOwner) => {
      const reaction = { _id: ids.reactId, user: reactOwner };
      const reactions = [reaction];
      reactions.id = (rid) => reactions.find((r) => r._id === rid) || null;

      const supp = { _id: ids.suppId, reactions };
      const supplementaries = [supp];
      supplementaries.id = (sid) => supplementaries.find((s) => s._id === sid) || null;

      const reply = { _id: ids.replyId, supplementaries };
      const replies = [reply];
      replies.id = (rid) => replies.find((r) => r._id === rid) || null;

      return { _id: ids.postId, room: ids.roomId, delete_flg: false, replies };
    };

    test.each([
      ['管理者', { role: 'Administrator', isCreator: false, member: false, owner: false }],
      ['フロアを作成した編集ユーザ', { role: 'Editor', isCreator: true, member: false, owner: false }],
      ['フロアメンバー', { role: 'User', isCreator: false, member: true, owner: false }],
      ['リアクション所有者', { role: 'User', isCreator: false, member: false, owner: true }],
    ])('%s は削除可', async (_, cond) => {
      const ids = makeIds();
      const userId = cond.owner || cond.isCreator ? 'myId' : 'otherId';
      const jwt = { user_id: userId, user_role: cond.role === 'Administrator' ? 'Administrator' : cond.role };

      Chat.findOne.mockResolvedValue(prepareChatDoc(ids, cond.owner ? userId : 'someoneElse'));

      authorizeRoomAccess.mockResolvedValue(
        baseAuthResult(userId, ids.roomId, ids.floorId, cond.isCreator, cond.member)
      );

      const updatedChat = { _id: ids.postId, room: { _id: ids.roomId } };
      Chat.findOneAndUpdate.mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(updatedChat),
      }));

      const ioMock = makeIoMock();

      const result = await replySupReactionsService.delete(
        {
          post_id: ids.postId,
          reply_id: ids.replyId,
          supplement_id: ids.suppId,
          reaction_id: ids.reactId,
        },
        jwt,
        ioMock
      );

      expect(result).toBe(updatedChat);
      expect(Chat.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: ids.postId, delete_flg: false },
        {
          $pull: {
            'replies.$[reply].supplementaries.$[supplement].reactions': { _id: ids.reactId },
          },
        },
        {
          arrayFilters: [{ 'reply._id': ids.replyId }, { 'supplement._id': ids.suppId }],
          new: true,
          runValidators: true,
        }
      );
      expect(ioMock.__emitMock).toHaveBeenCalledWith('REACTION_DELETE', updatedChat);
    });

    test('権限無しで 401', async () => {
      const ids = makeIds();
      const jwt = { user_id: 'badUser', user_role: 'User' };

      Chat.findOne.mockResolvedValue(prepareChatDoc(ids, 'someoneElse'));
      authorizeRoomAccess.mockResolvedValue(baseAuthResult(jwt.user_id, ids.roomId, ids.floorId));

      await expect(
        replySupReactionsService.delete(
          {
            post_id: ids.postId,
            reply_id: ids.replyId,
            supplement_id: ids.suppId,
            reaction_id: ids.reactId,
          },
          jwt,
          makeIoMock()
        )
      ).rejects.toBeInstanceOf(AppError);
    });

    test('投稿が存在しない', async () => {
      const ids = makeIds();
      Chat.findOne.mockResolvedValue(null);

      await expect(
        replySupReactionsService.delete(
          {
            post_id: ids.postId,
            reply_id: ids.replyId,
            supplement_id: ids.suppId,
            reaction_id: ids.reactId,
          },
          { user_id: 'u', user_role: 'User' },
          makeIoMock()
        )
      ).rejects.toBeInstanceOf(AppError);
    });
  });
});
