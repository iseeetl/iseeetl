jest.mock(
  '../../../../../utils/appError',
  () =>
    function AppError(message, statusCode) {
      this.message = message;
      this.statusCode = statusCode;
    }
);

jest.mock('../../../../../models/Chat', () => ({
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../../../../../services/timeline/shared/reactionHelpers', () => ({
  authorizeGuestFromChat: jest.fn(),
  ensureGuestReactionOwner: jest.fn(),
  findChatOrThrow: jest.fn(),
  updateChatAndPopulate: jest.fn(),
}));

const service = require('../../../../../services/timeline/guest/guestReplySupplementReactions.service');
const {
  authorizeGuestFromChat,
  ensureGuestReactionOwner,
  findChatOrThrow,
  updateChatAndPopulate,
} = require('../../../../../services/timeline/shared/reactionHelpers');
const AppError = require('../../../../../utils/appError');

const getIoMock = () => {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { to, _emit: emit };
};

const withIdMethod = (arr, map) => {
  const clone = [...arr];
  clone.id = (x) => map[x] || null;
  return clone;
};

describe('guestReplySupplementReactionsのサービス', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('返信の付加情報へのリアクション追加', () => {
    const BASE_BODY = {
      guest_id: 'guest123',
      guest_name: 'ゲスト',
      post_id: 'post1',
      reply_id: 'reply1',
      supplement_id: 'supp1',
      type: '😊',
    };

    const setupHappyMocks = () => {
      findChatOrThrow.mockResolvedValue({
        _id: 'post1',
        room: 'room1',
        replies: [],
        delete_flg: false,
      });

      authorizeGuestFromChat.mockResolvedValue({
        foundRoom: {
        _id: 'room1',
        floor: 'floor1',
        delete_flg: false,
        member_only: false,
        title: 'ルーム',
      },
        foundFloor: {
        _id: 'floor1',
        delete_flg: false,
        title: 'フロア',
      },
      });

      const populatedChat = {
        _id: 'post1',
        room: { _id: 'room1' },
        replies: [
          {
            _id: 'reply1',
            supplementaries: [
              {
                _id: 'supp1',
                reactions: [{ guest_id: 'guest123', guest_name: 'ゲスト', type: '😊' }],
              },
            ],
          },
        ],
      };
      updateChatAndPopulate.mockResolvedValue(populatedChat);
    };

    test('付加情報へリアクション追加', async () => {
      setupHappyMocks();
      const io = getIoMock();

      const result = await service.createReplySupplementReaction({ ...BASE_BODY }, io);

      expect(io.to).toHaveBeenCalledWith('room1');
      expect(io._emit).toHaveBeenCalledWith('REPLY_SUPPLEMENT_REACTION_CREATE', result);

      expect(updateChatAndPopulate).toHaveBeenCalledWith({
        query: { _id: 'post1', delete_flg: false },
        update: {
          $push: {
            'replies.$[reply].supplementaries.$[supplement].reactions': expect.objectContaining({
              guest_id: 'guest123',
              guest_name: 'ゲスト',
              type: '😊',
            }),
          },
        },
        options: { arrayFilters: [{ 'reply._id': 'reply1' }, { 'supplement._id': 'supp1' }] },
      });
    });

    test('投稿不存在 400', async () => {
      findChatOrThrow.mockRejectedValue(new AppError({ code: 'INVALID_PARAMS' }));
      await expect(service.createReplySupplementReaction({ ...BASE_BODY }, getIoMock())).rejects.toBeInstanceOf(
        AppError
      );
    });

    test('member_only ルームで 401', async () => {
      findChatOrThrow.mockResolvedValue({
        _id: 'post1',
        room: 'room1',
        replies: [],
        delete_flg: false,
      });
      authorizeGuestFromChat.mockRejectedValue(new AppError({ code: 'INVALID_PERMISSION' }));

      await expect(service.createReplySupplementReaction({ ...BASE_BODY }, getIoMock())).rejects.toBeInstanceOf(
        AppError
      );
    });
  });

  describe('返信の付加情報のリアクション削除', () => {
    const BASE_BODY = {
      guest_id: 'guest123',
      guest_name: 'ゲスト',
      post_id: 'post1',
      reply_id: 'reply1',
      supplement_id: 'supp1',
      reaction_id: 'react1',
    };

    const buildChat = (reactionGuestId) => {
      const reaction = { _id: 'react1', guest_id: reactionGuestId };
      const supplement = {
        _id: 'supp1',
        reactions: withIdMethod([reaction], { react1: reaction }),
      };
      const reply = {
        _id: 'reply1',
        supplementaries: withIdMethod([supplement], { supp1: supplement }),
      };
      const replies = withIdMethod([reply], { reply1: reply });
      return {
        _id: 'post1',
        room: 'room1',
        replies,
        delete_flg: false,
      };
    };

    const setupHappyMocks = () => {
      findChatOrThrow.mockResolvedValue(buildChat('guest123'));
      authorizeGuestFromChat.mockResolvedValue({
        foundRoom: {
          _id: 'room1',
          floor: 'floor1',
          delete_flg: false,
          member_only: false,
          title: 'ルーム',
        },
        foundFloor: {
          _id: 'floor1',
          delete_flg: false,
          title: 'フロア',
        },
      });
      ensureGuestReactionOwner.mockImplementation(() => {});
      const populatedChat = {
        _id: 'post1',
        room: { _id: 'room1' },
        replies: [],
      };
      updateChatAndPopulate.mockResolvedValue(populatedChat);
    };

    test('自分のリアクション削除', async () => {
      setupHappyMocks();
      const io = getIoMock();

      const result = await service.deleteReplySupplementReaction({ ...BASE_BODY }, io);

      expect(updateChatAndPopulate).toHaveBeenCalledWith({
        query: { _id: 'post1', delete_flg: false },
        update: { $pull: { 'replies.$[reply].supplementaries.$[supplement].reactions': { _id: 'react1' } } },
        options: { arrayFilters: [{ 'reply._id': 'reply1' }, { 'supplement._id': 'supp1' }] },
      });
      expect(io.to).toHaveBeenCalledWith('room1');
      expect(io._emit).toHaveBeenCalledWith('REACTION_DELETE', result);
    });

    test('他人のリアクション削除は 401', async () => {
      findChatOrThrow.mockResolvedValue(buildChat('otherGuest'));
      authorizeGuestFromChat.mockResolvedValue({
        foundRoom: {
          _id: 'room1',
          floor: 'floor1',
          delete_flg: false,
          member_only: false,
        },
        foundFloor: {
          _id: 'floor1',
          delete_flg: false,
        },
      });
      ensureGuestReactionOwner.mockImplementation(() => {
        throw new AppError({ code: 'INVALID_PERMISSION' });
      });

      await expect(service.deleteReplySupplementReaction({ ...BASE_BODY }, getIoMock())).rejects.toBeInstanceOf(
        AppError
      );
    });

    test('投稿不存在 400', async () => {
      findChatOrThrow.mockRejectedValue(new AppError({ code: 'INVALID_PARAMS' }));
      await expect(service.deleteReplySupplementReaction({ ...BASE_BODY }, getIoMock())).rejects.toBeInstanceOf(
        AppError
      );
    });

    test('member_only ルームで 401', async () => {
      findChatOrThrow.mockResolvedValue(buildChat('guest123'));
      authorizeGuestFromChat.mockRejectedValue(new AppError({ code: 'INVALID_PERMISSION' }));

      await expect(service.deleteReplySupplementReaction({ ...BASE_BODY }, getIoMock())).rejects.toBeInstanceOf(
        AppError
      );
    });
  });
});
