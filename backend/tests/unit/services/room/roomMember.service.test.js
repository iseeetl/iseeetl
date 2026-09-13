jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue({ toString: () => 'fixedtoken' }),
}));

jest.mock('../../../../models/User', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/Floor', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/FloorMember', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/Room', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/RoomInvite', () => ({ findOne: jest.fn(), create: jest.fn() }));
jest.mock('../../../../models/RoomMember', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndRemove: jest.fn(),
  findOneAndDelete: jest.fn(),
  create: jest.fn(),
  paginate: jest.fn(),
}));

jest.mock(
  '../../../../utils/appError',
  () =>
    function AppError(message, statusCode) {
      this.message = message;
      this.statusCode = statusCode;
    }
);
jest.mock('../../../../socket/accessControl', () => ({
  revalidateFloorUserSockets: jest.fn(),
}));

const roomMemberService = require('../../../../services/room/roomMember.service');
const User = require('../../../../models/User');
const Floor = require('../../../../models/Floor');
const FloorMember = require('../../../../models/FloorMember');
const Room = require('../../../../models/Room');
const RoomInvite = require('../../../../models/RoomInvite');
const RoomMember = require('../../../../models/RoomMember');
const AppError = require('../../../../utils/appError');
const { revalidateFloorUserSockets } = require('../../../../socket/accessControl');

describe('roomMemberのサービス', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockUser = { _id: 'uid', username: 'U' };
  const mockFloor = { _id: 'floor1', user: 'owner', delete_flg: false };
  const mockRoom = { _id: 'room1', floor: 'floor1', delete_flg: false };

  describe('一覧取得', () => {
    const body = { room_id: 'room1' };

    beforeEach(() => {
      User.findOne.mockResolvedValue(mockUser);
      Room.findOne.mockResolvedValue(mockRoom);
      Floor.findOne.mockResolvedValue(mockFloor);
    });

    test('管理者が一覧取得', async () => {
      FloorMember.findOne.mockResolvedValue(null);
      RoomMember.findOne.mockResolvedValue(null);

      const leanMock = jest.fn().mockResolvedValue([{ _id: 'rm1' }]);
      const sortReturn = { lean: leanMock };
      const sortMock = jest.fn().mockReturnValue(sortReturn);
      const populateMock = jest.fn().mockReturnValue({ sort: sortMock });
      RoomMember.find.mockReturnValue({ populate: populateMock });

      const res = await roomMemberService.list(body, { user_role: 'Administrator', user_id: 'uid' });

      expect(res).toEqual([{ _id: 'rm1' }]);
      expect(RoomMember.find).toHaveBeenCalledWith({ room: 'room1' });
      expect(populateMock).toHaveBeenCalled();
      expect(sortMock).toHaveBeenCalledWith({ created_at: 'desc' });
      expect(leanMock).toHaveBeenCalled();
    });

    test('権限なしユーザは 403', async () => {
      FloorMember.findOne.mockResolvedValue(null);
      RoomMember.findOne.mockResolvedValue(null);

      await expect(roomMemberService.list(body, { user_role: 'User', user_id: 'someone' })).rejects.toBeInstanceOf(
        AppError
      );
    });
  });

  describe('招待', () => {
    const body = { floor_id: 'floor1', room_id: 'room1', period: '8h' };

    beforeEach(() => {
      User.findOne.mockResolvedValue(mockUser);
      Room.findOne.mockResolvedValue(mockRoom);
      Floor.findOne.mockResolvedValue(mockFloor);
      FloorMember.findOne.mockResolvedValue(null);
      RoomInvite.create.mockResolvedValue({ _id: 'inv1', token: 'fixedtoken' });
    });

    test('フロアを作成した編集ユーザは招待を作成できる', async () => {
      const jwt = { user_role: 'Editor', user_id: 'owner' };

      const res = await roomMemberService.invite(body, jwt);

      expect(res.token).toBe('fixedtoken');
      expect(RoomInvite.create).toHaveBeenCalledWith(expect.objectContaining({ token: 'fixedtoken', room: 'room1' }));
    });

    test('権限なしユーザは 403', async () => {
      await expect(roomMemberService.invite(body, { user_role: 'User', user_id: 'guest' })).rejects.toBeInstanceOf(
        AppError
      );
    });
  });

  describe('作成', () => {
    const body = {
      floor_id: 'floor1',
      room_id: 'room1',
      invite_token: 'fixedtoken',
    };

    const roomInvite = {
      _id: 'inv1',
      token: 'fixedtoken',
      token_expiry: new Date(Date.now() + 1000 * 60),
      room: 'room1',
      floor: 'floor1',
    };

    beforeEach(() => {
      User.findOne.mockResolvedValue(mockUser);
      Room.findOne.mockResolvedValue(mockRoom);
      Floor.findOne.mockResolvedValue(mockFloor);
      FloorMember.findOne.mockResolvedValue(null);
      RoomInvite.findOne.mockResolvedValue(roomInvite);
      RoomMember.findOne.mockResolvedValue(null);
      RoomMember.create.mockResolvedValue({ _id: 'rmNew' });
      RoomMember.findById.mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue({ _id: 'rmNew', room: { title: 'T' } }),
      }));
    });

    test('一意キーの競合だけを参加済みへ変換し、別DBエラーは伝播する', async () => {
      const duplicate = { code: 11000, keyPattern: { room: 1, user: 1 } };
      RoomMember.create.mockRejectedValueOnce(duplicate);
      await expect(roomMemberService.create(body, { user_id: 'uid' })).rejects.toBeInstanceOf(AppError);
      for (const error of [{ code: 11000, keyPattern: { _id: 1 } }, new Error('database failed')]) {
        RoomMember.create.mockRejectedValueOnce(error);
        await expect(roomMemberService.create(body, { user_id: 'uid' })).rejects.toBe(error);
      }
    });

    test('招待トークンでメンバー作成', async () => {
      const res = await roomMemberService.create(body, { user_id: 'uid' });

      expect(RoomMember.create).toHaveBeenCalledWith(expect.objectContaining({ room: 'room1', user: 'uid' }));
      expect(res._id).toBe('rmNew');
    });

    test('既にフロアメンバーの場合は 400', async () => {
      FloorMember.findOne.mockResolvedValue({ _id: 'fm1' });

      await expect(roomMemberService.create(body, { user_id: 'uid' })).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('削除', () => {
    const body = { _id: 'rm1', room_id: 'room1' };

    beforeEach(() => {
      User.findOne.mockResolvedValue(mockUser);
      RoomMember.findOne.mockResolvedValue({ _id: 'rm1', room: 'room1', floor: 'floor1' });
      Floor.findOne.mockResolvedValue(mockFloor);
      RoomMember.findOneAndDelete.mockResolvedValue({
        _id: 'rm1',
        floor: 'floor1',
        room: 'room1',
        user: 'user-2',
      });
    });

    test('ルーム作成者はメンバーを削除できる', async () => {
      Room.findOne.mockResolvedValue({ _id: 'room1', floor: 'floor1', user: 'uid', delete_flg: false });

      await expect(roomMemberService.delete(body, { user_role: 'User', user_id: 'uid' })).resolves.toEqual(
        expect.objectContaining({ _id: 'rm1' })
      );

      expect(RoomMember.findOneAndDelete).toHaveBeenCalled();
    });

    test('削除成功時に対象ユーザのフロア内Socket権限を再判定する', async () => {
      Room.findOne.mockResolvedValue({ _id: 'room1', floor: 'floor1', user: 'uid', delete_flg: false });
      const io = {};

      await roomMemberService.delete(body, { user_role: 'User', user_id: 'uid' }, io);

      expect(revalidateFloorUserSockets).toHaveBeenCalledWith(io, {
        floorId: 'floor1',
        userId: 'user-2',
      });
    });

    test('権限なしユーザは 403', async () => {
      Room.findOne.mockResolvedValue({ _id: 'room1', floor: 'floor1', user: 'other', delete_flg: false });

      await expect(roomMemberService.delete(body, { user_role: 'User', user_id: 'uid' })).rejects.toBeInstanceOf(
        AppError
      );
    });
  });

  describe('退会', () => {
    const body = { room_id: 'room1' };

    beforeEach(() => {
      User.findOne.mockResolvedValue(mockUser);
      Room.findOne.mockResolvedValue(mockRoom);
      Floor.findOne.mockResolvedValue(mockFloor);
      RoomMember.findOne.mockResolvedValue({ _id: 'rm1' });
      RoomMember.findOneAndDelete.mockResolvedValue({
        _id: 'rm1',
        floor: 'floor1',
        room: 'room1',
        user: 'uid',
      });
    });

    test('メンバーが脱退', async () => {
      const io = {};
      const res = await roomMemberService.leave(body, { user_id: 'uid' }, io);

      expect(RoomMember.findOneAndDelete).toHaveBeenCalledWith({ room: 'room1', user: 'uid' });
      expect(revalidateFloorUserSockets).toHaveBeenCalledWith(io, {
        floorId: 'floor1',
        userId: 'uid',
      });
      expect(res._id).toBe('rm1');
    });

    test('メンバーで無い場合は 404', async () => {
      RoomMember.findOneAndDelete.mockResolvedValue(null);
      await expect(roomMemberService.leave(body, { user_id: 'uid' })).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('所属の確認', () => {
    const body = { room_id: 'room1' };

    beforeEach(() => {
      User.findOne.mockResolvedValue(mockUser);
      Room.findOne.mockResolvedValue(mockRoom);
      Floor.findOne.mockResolvedValue(mockFloor);
    });

    test('true を返却 (メンバー)', async () => {
      RoomMember.findOne.mockResolvedValue({ _id: 'rm1' });
      await expect(roomMemberService.isCurrentUserRoomMember(body, { user_id: 'uid' })).resolves.toBe(true);
    });

    test('false を返却 (メンバーでない)', async () => {
      RoomMember.findOne.mockResolvedValue(null);
      await expect(roomMemberService.isCurrentUserRoomMember(body, { user_id: 'uid' })).resolves.toBe(false);
    });
  });

  describe('管理画面向けのページ単位の一覧取得', () => {
    const adminJwt = { user_role: 'Administrator', user_id: 'admin' };

    beforeEach(() => {
      RoomMember.paginate.mockResolvedValue({ docs: [] });
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator', delete_flg: false });
    });

    test('一覧取得', async () => {
      await roomMemberService.managementPaginate({ page: 1 }, adminJwt);
      expect(RoomMember.paginate).toHaveBeenCalledWith({}, expect.objectContaining({ page: 1, limit: 10 }));
    });
  });

  describe('管理画面からの削除', () => {
    const adminJwt = { user_role: 'Administrator', user_id: 'admin' };

    beforeEach(() => {
      RoomMember.findOneAndDelete.mockResolvedValue({
        _id: 'rm1',
        floor: 'floor1',
        room: 'room1',
        user: 'user-2',
      });
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator', delete_flg: false });
    });

    test('削除', async () => {
      const io = {};

      await roomMemberService.managementDelete({ _id: 'rm1' }, adminJwt, io);
      expect(RoomMember.findOneAndDelete).toHaveBeenCalledWith({ _id: 'rm1' });
      expect(revalidateFloorUserSockets).toHaveBeenCalledWith(io, {
        floorId: 'floor1',
        userId: 'user-2',
      });
    });
  });
});
