jest.mock('../../../../../services/timeline/shared/timelineSerializer', () => jest.fn((d) => d));

jest.mock(
  '../../../../../utils/appError',
  () =>
    function AppError(message, statusCode) {
      this.message = message;
      this.statusCode = statusCode;
    }
);

jest.mock('../../../../../models/Chat', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../../../../../models/Floor', () => ({ findOne: jest.fn() }));
jest.mock('../../../../../models/Room', () => ({ findOne: jest.fn() }));

const guestReplyReactionsService = require('../../../../../services/timeline/guest/guestReplyReactions.service');
const Chat = require('../../../../../models/Chat');
const Floor = require('../../../../../models/Floor');
const Room = require('../../../../../models/Room');
const serializeTimeline = require('../../../../../services/timeline/shared/timelineSerializer');
const AppError = require('../../../../../utils/appError');

describe('guestReplyReactionsのサービス', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const getIoMock = () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    return { to, _emit: emit };
  };

  describe('返信へのリアクション追加', () => {
    const BASE_BODY = {
      guest_id: 'guest123',
      guest_name: 'ゲスト',
      post_id: 'post1',
      reply_id: 'reply1',
      type: '👍',
    };

    const setupHappyMocks = () => {
      Chat.findOne.mockResolvedValue({
        _id: 'post1',
        room: 'room1',
        replies: [],
        delete_flg: false,
      });

      Room.findOne.mockResolvedValue({
        _id: 'room1',
        floor: 'floor1',
        delete_flg: false,
        member_only: false,
        title: 'ルーム',
      });

      Floor.findOne.mockResolvedValue({
        _id: 'floor1',
        delete_flg: false,
        title: 'フロア',
      });

      const populatedChat = {
        _id: 'post1',
        room: { _id: 'room1' },
        replies: [
          {
            _id: 'reply1',
            reactions: [{ guest_id: 'guest123', guest_name: 'ゲスト', type: '👍' }],
          },
        ],
      };
      const updatedChat = {
        populate: jest.fn().mockResolvedValue(populatedChat),
      };
      Chat.findOneAndUpdate.mockResolvedValue(updatedChat);
    };

    test('ゲストが返信にリアクション', async () => {
      setupHappyMocks();
      const io = getIoMock();

      const result = await guestReplyReactionsService.createReplyReaction({ ...BASE_BODY }, io);

      expect(Chat.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'post1', 'replies._id': 'reply1', delete_flg: false },
        {
          $push: {
            'replies.$.reactions': expect.objectContaining({
              guest_id: 'guest123',
              guest_name: 'ゲスト',
              type: '👍',
            }),
          },
        },
        { new: true, runValidators: true }
      );

      expect(io.to).toHaveBeenCalledWith('room1');
      expect(io._emit).toHaveBeenCalledWith('REPLY_REACTION_CREATE', result);

      expect(serializeTimeline).toHaveBeenCalled();

    });

    test('投稿が存在しないと 400', async () => {
      Chat.findOne.mockResolvedValue(null);
      await expect(
        guestReplyReactionsService.createReplyReaction({ ...BASE_BODY }, getIoMock())
      ).rejects.toBeInstanceOf(AppError);
    });

    test('ルームが存在しないと 400', async () => {
      Chat.findOne.mockResolvedValue({
        _id: 'post1',
        room: 'room1',
        replies: [],
        delete_flg: false,
      });
      Room.findOne.mockResolvedValue(null);
      await expect(
        guestReplyReactionsService.createReplyReaction({ ...BASE_BODY }, getIoMock())
      ).rejects.toBeInstanceOf(AppError);
    });

    test('フロアが存在しないと 400', async () => {
      Chat.findOne.mockResolvedValue({
        _id: 'post1',
        room: 'room1',
        replies: [],
        delete_flg: false,
      });
      Room.findOne.mockResolvedValue({
        _id: 'room1',
        floor: 'floor1',
        delete_flg: false,
        member_only: false,
      });
      Floor.findOne.mockResolvedValue(null);
      await expect(
        guestReplyReactionsService.createReplyReaction({ ...BASE_BODY }, getIoMock())
      ).rejects.toBeInstanceOf(AppError);
    });

    test('member_only ルームは 401', async () => {
      Chat.findOne.mockResolvedValue({
        _id: 'post1',
        room: 'room1',
        replies: [],
        delete_flg: false,
      });
      Room.findOne.mockResolvedValue({
        _id: 'room1',
        floor: 'floor1',
        delete_flg: false,
        member_only: true,
      });
      Floor.findOne.mockResolvedValue({
        _id: 'floor1',
        delete_flg: false,
      });
      await expect(
        guestReplyReactionsService.createReplyReaction({ ...BASE_BODY }, getIoMock())
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('返信のリアクション削除', () => {
    const BASE_BODY = {
      guest_id: 'guest123',
      guest_name: 'ゲスト',
      post_id: 'post1',
      reply_id: 'reply1',
      reaction_id: 'reaction1',
    };

    const buildFoundChat = (guestIdOfReaction) => {
      const reaction = {
        _id: 'reaction1',
        guest_id: guestIdOfReaction,
      };
      const reply = {
        _id: 'reply1',
        reactions: [reaction],
      };
      const replies = [reply];
      replies.id = (id) => (id === 'reply1' ? reply : null); // Mongoose配列のid()による検索を再現する。
      return {
        _id: 'post1',
        room: 'room1',
        replies,
        delete_flg: false,
      };
    };

    const setupHappyMocks = () => {
      Chat.findOne.mockResolvedValue(buildFoundChat('guest123'));

      Room.findOne.mockResolvedValue({
        _id: 'room1',
        floor: 'floor1',
        delete_flg: false,
        member_only: false,
        title: 'ルーム',
      });

      Floor.findOne.mockResolvedValue({
        _id: 'floor1',
        delete_flg: false,
        title: 'フロア',
      });

      const populatedChat = {
        _id: 'post1',
        room: { _id: 'room1' },
        replies: [],
      };
      const updatedChat = {
        populate: jest.fn().mockResolvedValue(populatedChat),
      };
      Chat.findOneAndUpdate.mockResolvedValue(updatedChat);
    };

    test('自分のリアクションを削除', async () => {
      setupHappyMocks();
      const io = getIoMock();

      const result = await guestReplyReactionsService.deleteReplyReaction({ ...BASE_BODY }, io);

      expect(Chat.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'post1', 'replies._id': 'reply1', delete_flg: false },
        { $pull: { 'replies.$.reactions': { _id: 'reaction1' } } },
        { new: true, runValidators: true }
      );
      expect(io.to).toHaveBeenCalledWith('room1');
      expect(io._emit).toHaveBeenCalledWith('REACTION_DELETE', result);
    });

    test('他人のリアクションは削除不可 (401)', async () => {
      Chat.findOne.mockResolvedValue(buildFoundChat('otherGuest'));
      Room.findOne.mockResolvedValue({
        _id: 'room1',
        floor: 'floor1',
        delete_flg: false,
        member_only: false,
      });
      Floor.findOne.mockResolvedValue({
        _id: 'floor1',
        delete_flg: false,
      });

      await expect(
        guestReplyReactionsService.deleteReplyReaction({ ...BASE_BODY }, getIoMock())
      ).rejects.toBeInstanceOf(AppError);
    });

    test('投稿が存在しないと 400', async () => {
      Chat.findOne.mockResolvedValue(null);
      await expect(
        guestReplyReactionsService.deleteReplyReaction({ ...BASE_BODY }, getIoMock())
      ).rejects.toBeInstanceOf(AppError);
    });

    test('member_only ルームで 401', async () => {
      Chat.findOne.mockResolvedValue(buildFoundChat('guest123'));
      Room.findOne.mockResolvedValue({
        _id: 'room1',
        floor: 'floor1',
        delete_flg: false,
        member_only: true,
      });
      Floor.findOne.mockResolvedValue({
        _id: 'floor1',
        delete_flg: false,
      });
      await expect(
        guestReplyReactionsService.deleteReplyReaction({ ...BASE_BODY }, getIoMock())
      ).rejects.toBeInstanceOf(AppError);
    });
  });
});
