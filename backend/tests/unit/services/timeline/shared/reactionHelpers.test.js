jest.mock('../../../../../models/Chat', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock('../../../../../models/Room', () => ({ findOne: jest.fn() }));
jest.mock('../../../../../models/Floor', () => ({ findOne: jest.fn() }));
jest.mock('../../../../../services/room/roomAccess.service', () => ({ authorizeRoomAccess: jest.fn() }));
jest.mock('../../../../../services/_shared/activeResource', () => ({
  findActiveRoom: jest.fn(),
  findActiveFloor: jest.fn(),
}));
jest.mock('../../../../../services/timeline/shared/timelineSerializer', () => jest.fn((v) => v));

jest.mock(
  '../../../../../utils/appError',
  () =>
    function AppError(message, statusCode) {
      this.message = message;
      this.statusCode = statusCode;
    }
);

const Chat = require('../../../../../models/Chat');
const { authorizeRoomAccess } = require('../../../../../services/room/roomAccess.service');
const { findActiveRoom, findActiveFloor } = require('../../../../../services/_shared/activeResource');
const serializeTimeline = require('../../../../../services/timeline/shared/timelineSerializer');
const AppError = require('../../../../../utils/appError');
const {
  authorizeGuestFromChat,
  authorizeUserFromChat,
  canDeleteByRole,
  ensureGuestReactionOwner,
  findChatOrThrow,
  populateAndClean,
  updateChatAndPopulate,
} = require('../../../../../services/timeline/shared/reactionHelpers');

const objId = (val) => ({ toString: () => val });

describe('reactionHelpersの検証', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('findChatOrThrow: 存在しない場合はエラー', async () => {
    Chat.findOne.mockResolvedValue(null);
    await expect(findChatOrThrow('p1')).rejects.toBeInstanceOf(AppError);
  });

  test('findChatOrThrow: select 指定で select を呼び出す', async () => {
    const doc = { _id: 'p1' };
    const select = jest.fn().mockResolvedValue(doc);
    Chat.findOne.mockReturnValue({ select });

    const res = await findChatOrThrow('p1', { select: 'user' });

    expect(select).toHaveBeenCalledWith('user');
    expect(res).toEqual(doc);
  });

  test('authorizeUserFromChat: roomAccess を呼ぶ', async () => {
    const chat = { room: objId('r1') };
    authorizeRoomAccess.mockResolvedValue({ foundRoom: { _id: 'r1' } });
    const res = await authorizeUserFromChat(chat, { user_id: 'u1', user_role: 'User' });

    expect(authorizeRoomAccess).toHaveBeenCalledWith('u1', 'User', 'r1');
    expect(res.decodedUserId).toBe('u1');
  });

  test('authorizeGuestFromChat: member_only は 401', async () => {
    findActiveRoom.mockResolvedValue({ _id: 'r1', floor: objId('f1'), member_only: true });
    findActiveFloor.mockResolvedValue({ _id: 'f1' });

    await expect(authorizeGuestFromChat({ room: objId('r1') })).rejects.toBeInstanceOf(AppError);
  });

  test('authorizeGuestFromChat: 公開ルームならルームと所属フロアを返す', async () => {
    const room = { _id: 'r1', floor: objId('f1'), member_only: false };
    const floor = { _id: 'f1' };
    findActiveRoom.mockResolvedValue(room);
    findActiveFloor.mockResolvedValue(floor);

    const res = await authorizeGuestFromChat({ room: objId('r1') });

    expect(findActiveRoom).toHaveBeenCalledWith('r1', expect.any(Object));
    expect(findActiveFloor).toHaveBeenCalledWith('f1', expect.any(Object));
    expect(res).toEqual({ foundRoom: room, foundFloor: floor });
  });

  test('canDeleteByRole: 管理者/編集者/メンバーの判定', () => {
    const floor = { user: objId('owner') };
    expect(canDeleteByRole({ role: 'Administrator', floor, floorMember: null, userId: 'x' })).toBe(true);
    expect(canDeleteByRole({ role: 'Editor', floor, floorMember: null, userId: 'owner' })).toBe(true);
    expect(canDeleteByRole({ role: 'User', floor, floorMember: { _id: 'm' }, userId: 'x' })).toBe(true);
    expect(canDeleteByRole({ role: 'User', floor, floorMember: null, userId: 'x' })).toBe(false);
  });

  test('ensureGuestReactionOwner: guest_id が不一致なら 401', () => {
    expect(() => ensureGuestReactionOwner(null, 'g1')).toThrow(AppError);
    expect(() => ensureGuestReactionOwner({ guest_id: null }, 'g1')).toThrow(AppError);
    expect(() => ensureGuestReactionOwner({ guest_id: 'g2' }, 'g1')).toThrow(AppError);
  });

  test('ensureGuestReactionOwner: guest_id が一致すれば通過', () => {
    expect(() => ensureGuestReactionOwner({ guest_id: 'g1' }, 'g1')).not.toThrow();
  });

  test('populateAndClean: populate して serializeTimeline を返す', async () => {
    const doc = { _id: 'p1' };
    const updatedChat = { populate: jest.fn().mockResolvedValue(doc) };

    const res = await populateAndClean(updatedChat);

    expect(updatedChat.populate).toHaveBeenCalled();
    expect(serializeTimeline).toHaveBeenCalledWith(doc);
    expect(res).toEqual(doc);
  });

  test('updateChatAndPopulate: 更新して populateAndClean を返す', async () => {
    const doc = { _id: 'p2' };
    const updatedChat = { populate: jest.fn().mockResolvedValue(doc) };
    Chat.findOneAndUpdate.mockResolvedValue(updatedChat);

    const res = await updateChatAndPopulate({
      query: { _id: 'p2', delete_flg: false },
      update: { $set: { title: 'x' } },
      options: { new: true },
    });

    expect(Chat.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'p2', delete_flg: false },
      { $set: { title: 'x' } },
      { new: true, runValidators: true }
    );
    expect(serializeTimeline).toHaveBeenCalledWith(doc);
    expect(res).toEqual(doc);
  });

  test('updateChatAndPopulate: 更新結果が null の場合は AppError', async () => {
    Chat.findOneAndUpdate.mockResolvedValue(null);

    await expect(
      updateChatAndPopulate({
        query: { _id: 'missing', delete_flg: false },
        update: { $set: { title: 'x' } },
      })
    ).rejects.toBeInstanceOf(AppError);
  });
});
