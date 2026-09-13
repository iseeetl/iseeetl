jest.mock('../../../../../models/Chat', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../../../../../models/Floor', () => ({ findOne: jest.fn() }));
jest.mock('../../../../../models/Room', () => ({ findOne: jest.fn() }));

jest.mock('../../../../../services/timeline/shared/timelineSerializer', () => jest.fn((v) => v));

jest.mock(
  '../../../../../utils/appError',
  () =>
    function AppError(message, statusCode) {
      this.message = message;
      this.statusCode = statusCode;
    }
);

const guestPostReactionService = require('../../../../../services/timeline/guest/guestPostReactions.service');
const Chat = require('../../../../../models/Chat');
const Room = require('../../../../../models/Room');
const Floor = require('../../../../../models/Floor');
const serializeTimeline = require('../../../../../services/timeline/shared/timelineSerializer');
const AppError = require('../../../../../utils/appError');

const makePopulateChain = (_returnVal) => {
  const obj = {};
  obj.populate = jest.fn().mockReturnValue(obj);
  return obj;
};

const objId = (val) => ({ toString: () => val });

describe('guestPostReactionsのサービス', () => {
  const io = (() => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    return { to, _emit: emit };
  })();

  const guestId = 'g1';
  const guestName = 'GUEST';

  const foundRoom = { _id: 'room1', title: 'Room', floor: objId('floor1'), member_only: false };
  const foundFloor = { _id: 'floor1', title: 'Floor' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('リアクション追加', () => {
    const body = { guest_id: guestId, guest_name: guestName, post_id: 'post1', type: 'LIKE' };

    test('リアクション追加、Socket通知', async () => {
      Chat.findOne.mockResolvedValue({ _id: 'post1', room: objId('room1'), delete_flg: false });
      Room.findOne.mockResolvedValue(foundRoom);
      Floor.findOne.mockResolvedValue(foundFloor);
      const resultObj = { _id: 'post1', room: { _id: 'room1' } };
      Chat.findOneAndUpdate.mockResolvedValue(makePopulateChain(resultObj));
      serializeTimeline.mockReturnValue(resultObj);

      const res = await guestPostReactionService.createReaction(body, io);

      expect(res).toBe(resultObj);
      expect(Chat.findOne).toHaveBeenCalledWith({ _id: 'post1', delete_flg: false });
      expect(Room.findOne).toHaveBeenCalledWith({ _id: 'room1', delete_flg: false });
      expect(Floor.findOne).toHaveBeenCalledWith({ _id: 'floor1', delete_flg: false });
      expect(Chat.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'post1', delete_flg: false },
        {
          $push: {
            reactions: { guest_id: 'g1', guest_name: 'GUEST', type: 'LIKE' },
          },
        },
        { new: true, runValidators: true }
      );
      expect(io.to).toHaveBeenCalledWith('room1');
      expect(io._emit).toHaveBeenCalledWith('REACTION_CREATE', resultObj);
    });

    test('投稿が存在しない', async () => {
      Chat.findOne.mockResolvedValue(null);
      await expect(guestPostReactionService.createReaction(body, io)).rejects.toBeInstanceOf(AppError);
    });

    test('member_only ルームは 401', async () => {
      Chat.findOne.mockResolvedValue({ _id: 'post1', room: objId('room1'), delete_flg: false });
      Room.findOne.mockResolvedValue({ ...foundRoom, member_only: true });
      await expect(guestPostReactionService.createReaction(body, io)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('リアクション削除', () => {
    const baseBody = {
      guest_id: guestId,
      guest_name: guestName,
      post_id: 'post1',
      reaction_id: 'r1',
    };

    const makeFoundChat = (ownerId = 'x') => ({
      _id: 'post1',
      room: objId('room1'),
      reactions: [
        {
          _id: { toString: () => 'r1' },
          guest_id: ownerId,
          guest_name: 'Some',
        },
      ],
      delete_flg: false,
    });

    beforeEach(() => {
      Chat.findOneAndUpdate.mockResolvedValue(makePopulateChain({ _id: 'post1', room: { _id: 'room1' } }));
    });

    test('自分のリアクション削除、Socket通知', async () => {
      Chat.findOne.mockResolvedValue(makeFoundChat('g1'));
      Room.findOne.mockResolvedValue(foundRoom);
      Floor.findOne.mockResolvedValue(foundFloor);

      const res = await guestPostReactionService.deleteReaction(baseBody, io);

      expect(res).toBeDefined();
      expect(Chat.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'post1', delete_flg: false },
        { $pull: { reactions: { _id: 'r1' } } },
        { new: true, runValidators: true }
      );
      expect(io._emit).toHaveBeenCalledWith('REACTION_DELETE', expect.any(Object));
    });

    test('権限なし -> 401', async () => {
      Chat.findOne.mockResolvedValue(makeFoundChat('otherGuest'));
      Room.findOne.mockResolvedValue(foundRoom);
      Floor.findOne.mockResolvedValue(foundFloor);

      await expect(guestPostReactionService.deleteReaction(baseBody, io)).rejects.toBeInstanceOf(AppError);
    });

    test('投稿が存在しない', async () => {
      Chat.findOne.mockResolvedValue(null);
      await expect(guestPostReactionService.deleteReaction(baseBody, io)).rejects.toBeInstanceOf(AppError);
    });

    test('member_only ルームは 401', async () => {
      Chat.findOne.mockResolvedValue(makeFoundChat('g1'));
      Room.findOne.mockResolvedValue({ ...foundRoom, member_only: true });
      Floor.findOne.mockResolvedValue(foundFloor);
      await expect(guestPostReactionService.deleteReaction(baseBody, io)).rejects.toBeInstanceOf(AppError);
    });
  });
});
