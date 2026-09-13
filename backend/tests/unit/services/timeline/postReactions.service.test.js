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

const postReactionsService = require('../../../../services/timeline/postReactions.service');
const Chat = require('../../../../models/Chat');
const { authorizeRoomAccess } = require('../../../../services/room/roomAccess.service');
const serializeTimeline = require('../../../../services/timeline/shared/timelineSerializer');
const AppError = require('../../../../utils/appError');

const buildPopulateChain = (resolvedValue) => ({ populate: jest.fn().mockResolvedValue(resolvedValue) });

const buildAuthResult = (userId = 'u1') => ({
  foundUser: { _id: userId, username: 'User' },
  foundRoom: { _id: 'room1', title: 'Room' },
  foundFloor: { _id: 'floor1', title: 'Floor', user: 'owner' },
  foundFloorMember: null,
});

const getIoMock = () => {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { to, _emit: emit };
};

describe('postReactionsのサービス', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('リアクション追加', () => {
    const jwt = { user_id: 'u1', user_role: 'User' };
    const postId = 'post1';

    test('リアクション作成フロー', async () => {
      const io = getIoMock();

      const chatDoc = {
        _id: postId,
        room: 'room1',
        reactions: [],
        user: 'uX',
      };
      Chat.findOne.mockResolvedValue(chatDoc);
      authorizeRoomAccess.mockResolvedValue(buildAuthResult('u1'));

      // populate後の構造に合わせ、roomには関連ドキュメントを設定する。
      const updated = {
        ...chatDoc,
        room: { _id: 'room1' },
        reactions: [{ _id: 'r1', user: 'u1', type: 'like' }],
      };
      Chat.findOneAndUpdate.mockResolvedValue(buildPopulateChain(updated));

      const res = await postReactionsService.createReaction({ post_id: postId, type: 'like' }, jwt, io);

      expect(Chat.findOne).toHaveBeenCalledWith({ _id: postId, delete_flg: false });
      expect(Chat.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: postId, delete_flg: false },
        { $push: { reactions: { user: 'u1', type: 'like' } } },
        { new: true, runValidators: true }
      );

      expect(io.to).toHaveBeenCalledWith('room1');
      expect(io._emit).toHaveBeenCalledWith('REACTION_CREATE', updated);

      expect(serializeTimeline).toHaveBeenCalledWith(updated);
      expect(res).toEqual(updated);
    });

    test('投稿が存在しない', async () => {
      const io = getIoMock();
      Chat.findOne.mockResolvedValue(null);

      await expect(
        postReactionsService.createReaction({ post_id: postId, type: 'like' }, jwt, io)
      ).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('リアクション重複', async () => {
      const io = getIoMock();

      const chatDoc = {
        _id: postId,
        room: 'room1',
        reactions: [{ user: 'u1', type: 'like' }],
      };
      Chat.findOne.mockResolvedValue(chatDoc);
      authorizeRoomAccess.mockResolvedValue(buildAuthResult('u1'));

      await expect(
        postReactionsService.createReaction({ post_id: postId, type: 'like' }, jwt, io)
      ).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('authorizeRoomAccess でエラー', async () => {
      const io = getIoMock();

      Chat.findOne.mockResolvedValue({ _id: postId, room: 'room1', reactions: [] });

      authorizeRoomAccess.mockRejectedValue(new AppError({ code: 'FORBIDDEN' }));

      await expect(
        postReactionsService.createReaction({ post_id: postId, type: 'like' }, jwt, io)
      ).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('リアクション削除', () => {
    const adminJwt = { user_id: 'admin', user_role: 'Administrator' };
    const postId = 'post2';
    const reactionId = 'react1';

    const chatWithReaction = {
      _id: postId,
      room: 'room1',
      reactions: [{ _id: reactionId, user: 'admin', type: 'love' }],
      user: 'someone',
    };

    beforeEach(() => {
      Chat.findOne.mockResolvedValue(chatWithReaction);
    });

    test('管理者が削除', async () => {
      const io = getIoMock();

      authorizeRoomAccess.mockResolvedValue(buildAuthResult('admin'));

      const updated = { ...chatWithReaction, room: { _id: 'room1' }, reactions: [] };
      Chat.findOneAndUpdate.mockResolvedValue(buildPopulateChain(updated));

      const res = await postReactionsService.deleteReaction({ post_id: postId, reaction_id: reactionId }, adminJwt, io);

      expect(Chat.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: postId, delete_flg: false },
        { $pull: { reactions: { _id: reactionId } } },
        { new: true, runValidators: true }
      );

      expect(io.to).toHaveBeenCalledWith('room1');
      expect(io._emit).toHaveBeenCalledWith('REACTION_DELETE', updated);

      expect(res.reactions).toEqual([]);
    });

    test('フロア編集ユーザ (フロア作成者) が削除', async () => {
      const io = getIoMock();

      const jwt = { user_id: 'owner', user_role: 'Editor' };
      authorizeRoomAccess.mockResolvedValue(buildAuthResult('owner'));

      const updated = { ...chatWithReaction, room: { _id: 'room1' }, reactions: [] };
      Chat.findOneAndUpdate.mockResolvedValue(buildPopulateChain(updated));

      const res = await postReactionsService.deleteReaction({ post_id: postId, reaction_id: reactionId }, jwt, io);

      expect(io._emit).toHaveBeenCalledWith('REACTION_DELETE', updated);
      expect(res.reactions).toEqual([]);
    });

    test('フロアメンバーが削除', async () => {
      const io = getIoMock();

      const jwt = { user_id: 'member', user_role: 'User' };
      authorizeRoomAccess.mockResolvedValue({
        foundUser: { _id: 'member', username: 'Member' },
        foundRoom: { _id: 'room1', title: 'Room' },
        foundFloor: { _id: 'floor1', title: 'Floor', user: 'owner' },
        foundFloorMember: { _id: 'member1' },
      });

      const updated = { ...chatWithReaction, room: { _id: 'room1' }, reactions: [] };
      Chat.findOneAndUpdate.mockResolvedValue(buildPopulateChain(updated));

      const res = await postReactionsService.deleteReaction({ post_id: postId, reaction_id: reactionId }, jwt, io);

      expect(io._emit).toHaveBeenCalledWith('REACTION_DELETE', updated);
      expect(res.reactions).toEqual([]);
    });

    test('リアクション本人が削除', async () => {
      const io = getIoMock();

      const jwt = { user_id: 'u1', user_role: 'User' };
      authorizeRoomAccess.mockResolvedValue(buildAuthResult('u1'));
      Chat.findOne.mockResolvedValue({ ...chatWithReaction, reactions: [{ _id: reactionId, user: 'u1', type: 'love' }] });

      const updated = { ...chatWithReaction, room: { _id: 'room1' }, reactions: [] };
      Chat.findOneAndUpdate.mockResolvedValue(buildPopulateChain(updated));

      const res = await postReactionsService.deleteReaction({ post_id: postId, reaction_id: reactionId }, jwt, io);

      expect(io._emit).toHaveBeenCalledWith('REACTION_DELETE', updated);
      expect(res.reactions).toEqual([]);
    });

    test('権限なしユーザ', async () => {
      const io = getIoMock();

      const jwt = { user_id: 'uX', user_role: 'User' };
      authorizeRoomAccess.mockResolvedValue(buildAuthResult('uX'));

      await expect(
        postReactionsService.deleteReaction({ post_id: postId, reaction_id: reactionId }, jwt, io)
      ).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('リアクションが存在しない', async () => {
      const io = getIoMock();

      authorizeRoomAccess.mockResolvedValue(buildAuthResult('admin'));
      Chat.findOne.mockResolvedValue({ ...chatWithReaction, reactions: [] });

      await expect(
        postReactionsService.deleteReaction({ post_id: postId, reaction_id: reactionId }, adminJwt, io)
      ).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});
