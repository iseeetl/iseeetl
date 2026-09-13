jest.mock('../../../../models/Chat', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn() }));

jest.mock('../../../../services/room/roomAccess.service', () => ({ authorizeRoomAccess: jest.fn() }));
jest.mock('../../../../services/timeline/shared/timelineSerializer', () => jest.fn());

jest.mock(
  '../../../../utils/appError',
  () =>
    function AppError(message, statusCode) {
      this.message = message;
      this.statusCode = statusCode;
    }
);

const service = require('../../../../services/timeline/postSupplementReactions.service');
const Chat = require('../../../../models/Chat');
const { authorizeRoomAccess } = require('../../../../services/room/roomAccess.service');
const serializeTimeline = require('../../../../services/timeline/shared/timelineSerializer');
const AppError = require('../../../../utils/appError');

describe('postSupplementReactionsのサービス', () => {
  const io = {
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
  };

  const baseAuthResult = {
    foundUser: { _id: 'uid1', username: 'Alice' },
    foundRoom: { _id: 'room1', title: 'R' },
    foundFloor: { _id: 'floor1', title: 'F', user: 'editorId' },
    foundFloorMember: null,
  };

  const buildChatDoc = (reactions = []) => {
    const suppl = { _id: 'sup1', reactions };
    // Mongoose配列のid()による検索を再現する。
    const supplementaries = {
      id: (id) => (id === 'sup1' ? suppl : null),
    };
    return { _id: 'post1', room: 'room1', supplementaries };
  };

  const populatedResult = { room: { _id: 'room1' }, data: 'clean' };

  beforeEach(() => {
    jest.clearAllMocks();
    serializeTimeline.mockReturnValue(populatedResult);
  });

  describe('付加情報へのリアクション追加', () => {
    const body = { post_id: 'post1', supplement_id: 'sup1', type: 'like' };
    const jwt = { user_id: 'uid1', user_role: 'User' };

    test('リアクション作成', async () => {
      Chat.findOne.mockResolvedValue(buildChatDoc([]));

      const updatedChatMock = {
        populate: jest.fn().mockResolvedValue({ any: 'populated' }),
      };
      Chat.findOneAndUpdate.mockResolvedValue(updatedChatMock);

      authorizeRoomAccess.mockResolvedValue(baseAuthResult);

      await expect(service.createSupplementReaction(body, jwt, io)).resolves.toEqual(populatedResult);

      expect(Chat.findOne).toHaveBeenCalledWith({ _id: 'post1', delete_flg: false });
      expect(Chat.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'post1', 'supplementaries._id': 'sup1', delete_flg: false },
        { $push: { 'supplementaries.$.reactions': { user: 'uid1', type: 'like' } } },
        { new: true, runValidators: true }
      );
      expect(io.to).toHaveBeenCalledWith('room1');
      expect(io.to().emit).toHaveBeenCalledWith('SUPPLEMENT_REACTION_CREATE', populatedResult);
    });

    test('投稿が存在しない', async () => {
      Chat.findOne.mockResolvedValue(null);
      await expect(service.createSupplementReaction(body, jwt, io)).rejects.toBeInstanceOf(AppError);
    });

    test('付加情報が存在しない', async () => {
      const chatNoSuppl = buildChatDoc([]);
      chatNoSuppl.supplementaries.id = () => null;
      Chat.findOne.mockResolvedValue(chatNoSuppl);
      authorizeRoomAccess.mockResolvedValue(baseAuthResult);

      await expect(service.createSupplementReaction(body, jwt, io)).rejects.toBeInstanceOf(AppError);
    });

    test('リアクション重複', async () => {
      const chatDup = buildChatDoc([{ user: 'uid1', type: 'like' }]);
      Chat.findOne.mockResolvedValue(chatDup);
      authorizeRoomAccess.mockResolvedValue(baseAuthResult);

      await expect(service.createSupplementReaction(body, jwt, io)).rejects.toBeInstanceOf(AppError);
    });

    test('ルームアクセス拒否', async () => {
      Chat.findOne.mockResolvedValue(buildChatDoc([]));
      authorizeRoomAccess.mockRejectedValue(new AppError({ code: 'FORBIDDEN' }));

      await expect(service.createSupplementReaction(body, jwt, io)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('付加情報のリアクション削除', () => {
    const body = { post_id: 'post1', supplement_id: 'sup1', reaction_id: 'react1' };

    const makeChatWithReaction = (uid = 'uid1') => {
      const reaction = { _id: 'react1', user: uid };
      const suppl = { _id: 'sup1', reactions: { id: (id) => (id === 'react1' ? reaction : null) } };
      suppl.reactions.id = suppl.reactions.id;
      const supplementaries = {
        id: (id) => (id === 'sup1' ? suppl : null),
      };
      return { _id: 'post1', room: 'room1', supplementaries };
    };

    beforeEach(() => {
      Chat.findOneAndUpdate.mockResolvedValue({
        populate: jest.fn().mockResolvedValue({ any: 'populated' }),
      });
    });

    test('管理者が削除', async () => {
      Chat.findOne.mockResolvedValue(makeChatWithReaction());
      authorizeRoomAccess.mockResolvedValue(baseAuthResult);

      const jwt = { user_id: 'admin', user_role: 'Administrator' };

      await expect(service.deleteSupplementReaction(body, jwt, io)).resolves.toEqual(populatedResult);

      expect(Chat.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'post1', 'supplementaries._id': 'sup1', delete_flg: false },
        { $pull: { 'supplementaries.$.reactions': { _id: 'react1' } } },
        { new: true, runValidators: true }
      );
      expect(io.to().emit).toHaveBeenCalledWith('REACTION_DELETE', populatedResult);
    });

    test('リアクション本人が削除', async () => {
      Chat.findOne.mockResolvedValue(makeChatWithReaction('uidSelf'));
      authorizeRoomAccess.mockResolvedValue({ ...baseAuthResult, foundFloorMember: null });

      const jwt = { user_id: 'uidSelf', user_role: 'User' };

      await expect(service.deleteSupplementReaction(body, jwt, io)).resolves.toEqual(populatedResult);
    });

    test('権限不足で 401', async () => {
      Chat.findOne.mockResolvedValue(makeChatWithReaction('someoneElse'));
      authorizeRoomAccess.mockResolvedValue({ ...baseAuthResult, foundFloorMember: null });

      const jwt = { user_id: 'uidX', user_role: 'User' };

      await expect(service.deleteSupplementReaction(body, jwt, io)).rejects.toBeInstanceOf(AppError);
    });

    test('付加情報が存在しない', async () => {
      const chatNoSuppl = makeChatWithReaction();
      chatNoSuppl.supplementaries.id = () => null;
      Chat.findOne.mockResolvedValue(chatNoSuppl);
      authorizeRoomAccess.mockResolvedValue(baseAuthResult);

      const jwt = { user_id: 'uid1', user_role: 'User' };

      await expect(service.deleteSupplementReaction(body, jwt, io)).rejects.toBeInstanceOf(AppError);
    });

    test('リアクションが存在しない', async () => {
      const chatNoReaction = makeChatWithReaction();
      const suppl = chatNoReaction.supplementaries.id('sup1');
      suppl.reactions.id = () => null;
      Chat.findOne.mockResolvedValue(chatNoReaction);
      authorizeRoomAccess.mockResolvedValue(baseAuthResult);

      const jwt = { user_id: 'uid1', user_role: 'User' };

      await expect(service.deleteSupplementReaction(body, jwt, io)).rejects.toBeInstanceOf(AppError);
    });
  });
});
