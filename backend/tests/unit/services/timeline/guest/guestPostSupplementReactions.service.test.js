jest.mock('../../../../../models/Chat', () => ({
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../../../../../services/timeline/shared/reactionHelpers', () => ({
  authorizeGuestFromChat: jest.fn(),
  ensureGuestReactionOwner: jest.fn(),
  findChatOrThrow: jest.fn(),
  updateChatAndPopulate: jest.fn(),
}));

jest.mock(
  '../../../../../utils/appError',
  () =>
    function AppError(message, statusCode) {
      this.message = message;
      this.statusCode = statusCode;
    }
);

const supplementReactionService = require('../../../../../services/timeline/guest/guestPostSupplementReactions.service');
const Chat = require('../../../../../models/Chat');
const {
  authorizeGuestFromChat,
  ensureGuestReactionOwner,
  findChatOrThrow,
  updateChatAndPopulate,
} = require('../../../../../services/timeline/shared/reactionHelpers');
const AppError = require('../../../../../utils/appError');

const objId = (val) => ({ toString: () => val });

describe('guestPostSupplementReactionsのサービス', () => {
  const io = (() => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    return { to, _emit: emit };
  })();

  const foundRoom = { _id: 'room1', title: 'Room', floor: objId('floor1'), member_only: false };
  const foundFloor = { _id: 'floor1', title: 'Floor' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('付加情報へのリアクション追加', () => {
    const body = {
      guest_id: 'g1',
      guest_name: 'Guest',
      post_id: 'post1',
      supplement_id: 'sup1',
      type: 'LIKE',
    };

    test('リアクション追加、Socket通知', async () => {
      findChatOrThrow.mockResolvedValue({ _id: 'post1', room: objId('room1'), delete_flg: false });
      authorizeGuestFromChat.mockResolvedValue({ foundRoom, foundFloor });

      const resultObj = { _id: 'post1', room: { _id: 'room1' } };
      updateChatAndPopulate.mockResolvedValue(resultObj);

      const res = await supplementReactionService.createSupplementReaction(body, io);

      expect(res).toBe(resultObj);
      expect(updateChatAndPopulate).toHaveBeenCalledWith({
        query: { _id: 'post1', 'supplementaries._id': 'sup1', delete_flg: false },
        update: { $push: { 'supplementaries.$.reactions': { guest_id: 'g1', guest_name: 'Guest', type: 'LIKE' } } },
      });
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
      expect(updateChatAndPopulate).toHaveBeenCalledTimes(1);
      expect(io.to).toHaveBeenCalledWith('room1');
      expect(io._emit).toHaveBeenCalledWith('SUPPLEMENT_REACTION_CREATE', resultObj);
    });

    test('member_only ルームは 401', async () => {
      findChatOrThrow.mockResolvedValue({ _id: 'post1', room: objId('room1'), delete_flg: false });
      authorizeGuestFromChat.mockRejectedValue(new AppError({ code: 'INVALID_PERMISSION' }));
      await expect(supplementReactionService.createSupplementReaction(body, io)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('付加情報のリアクション削除', () => {
    const baseBody = {
      guest_id: 'g1',
      guest_name: 'Guest',
      post_id: 'post1',
      supplement_id: 'sup1',
      reaction_id: 'r1',
    };

    const makeFoundChat = (ownerId = 'x') => {
      const reaction = { _id: { toString: () => 'r1' }, guest_id: ownerId };
      const supplement = { _id: 'sup1', reactions: [reaction] };

      const supplementaries = [supplement];
      supplementaries.id = (id) => supplementaries.find((s) => s._id === id) || null;

      return { _id: 'post1', room: objId('room1'), supplementaries, delete_flg: false };
    };

    beforeEach(() => {
      updateChatAndPopulate.mockResolvedValue({ _id: 'post1', room: { _id: 'room1' } });
    });

    test('自分のリアクション削除', async () => {
      findChatOrThrow.mockResolvedValue(makeFoundChat('g1'));
      authorizeGuestFromChat.mockResolvedValue({ foundRoom, foundFloor });
      ensureGuestReactionOwner.mockImplementation(() => {});

      const res = await supplementReactionService.deleteSupplementReaction(baseBody, io);

      expect(res).toBeDefined();
      expect(updateChatAndPopulate).toHaveBeenCalledWith({
        query: { _id: 'post1', 'supplementaries._id': 'sup1', delete_flg: false },
        update: { $pull: { 'supplementaries.$.reactions': { _id: 'r1' } } },
      });
      expect(io._emit).toHaveBeenCalledWith('REACTION_DELETE', expect.any(Object));
    });

    test('権限なし -> 401', async () => {
      findChatOrThrow.mockResolvedValue(makeFoundChat('other'));
      authorizeGuestFromChat.mockResolvedValue({ foundRoom, foundFloor });
      ensureGuestReactionOwner.mockImplementation(() => {
        throw new AppError({ code: 'INVALID_PERMISSION' });
      });

      await expect(supplementReactionService.deleteSupplementReaction(baseBody, io)).rejects.toBeInstanceOf(AppError);
    });
  });
});
