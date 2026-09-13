const crypto = require('crypto');

jest.mock('../../../../models/User', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/Floor', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/FloorInvite', () => ({ create: jest.fn(), findOne: jest.fn() }));
jest.mock('../../../../models/FloorMember', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  findOneAndDelete: jest.fn(),
  paginate: jest.fn(),
}));
jest.mock('../../../../utils/appError', () => {
  return function AppError(message, statusCode) {
    this.message = message;
    this.statusCode = statusCode;
  };
});
jest.mock('../../../../socket/accessControl', () => ({
  revalidateFloorUserSockets: jest.fn(),
}));

const floorMemberService = require('../../../../services/floor/floorMember.service');
const User = require('../../../../models/User');
const Floor = require('../../../../models/Floor');
const FloorInvite = require('../../../../models/FloorInvite');
const FloorMember = require('../../../../models/FloorMember');
const AppError = require('../../../../utils/appError');
const { revalidateFloorUserSockets } = require('../../../../socket/accessControl');

describe('floorMemberのサービス', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('一覧取得', () => {
    const body = { floor_id: 'floor1' };
    const adminJwt = { user_role: 'Administrator', user_id: 'admin' };
    const editorJwt = { user_role: 'Editor', user_id: 'editor' };
    const memberJwt = { user_role: 'User', user_id: 'mem' };
    const userJwt = { user_role: 'User', user_id: 'other' };

    beforeEach(() => {
      User.findOne.mockResolvedValue({ _id: 'dummy' });
      Floor.findOne.mockResolvedValue({ _id: 'floor1', user: 'editor' });
      FloorMember.findOne.mockResolvedValue(null);

      FloorMember.find.mockImplementation(() => ({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([{ _id: 'fm1' }]),
          }),
        }),
      }));
    });

    test('管理者はメンバー一覧を取得できる', async () => {
      await expect(floorMemberService.list(body, adminJwt)).resolves.toEqual(expect.arrayContaining([{ _id: 'fm1' }]));
    });

    test('フロアを作成した編集ユーザはメンバー一覧を取得できる', async () => {
      FloorMember.findOne.mockResolvedValue(null);
      await expect(floorMemberService.list(body, editorJwt)).resolves.toHaveLength(1);
    });

    test('フロアメンバーはメンバー一覧を取得できる', async () => {
      FloorMember.findOne.mockResolvedValue({ _id: 'fmX' });
      await expect(floorMemberService.list(body, memberJwt)).resolves.toHaveLength(1);
    });

    test('権限なしユーザ → 401', async () => {
      FloorMember.findOne.mockResolvedValue(null);
      await expect(floorMemberService.list(body, userJwt)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('招待', () => {
    const body = { floor_id: 'floor1', period: '8h' };
    const adminJwt = { user_role: 'Administrator', user_id: 'admin' };
    const editorJwt = { user_role: 'Editor', user_id: 'editor' };
    const userJwt = { user_role: 'User', user_id: 'user' };

    beforeEach(() => {
      Floor.findOne.mockResolvedValue({ _id: 'floor1', user: 'editor' });
      FloorInvite.create.mockResolvedValue({ _id: 'inv1' });
      jest.spyOn(crypto, 'randomBytes').mockReturnValue(Buffer.from('123456789012345678901234', 'utf8'));
    });

    afterEach(() => crypto.randomBytes.mockRestore());

    test('管理者は招待を作成できる', async () => {
      await expect(floorMemberService.invite(body, adminJwt)).resolves.toEqual({ _id: 'inv1' });
    });

    test('フロアを作成した編集ユーザは招待を作成できる', async () => {
      await expect(floorMemberService.invite(body, editorJwt)).resolves.toEqual({ _id: 'inv1' });
    });

    test('権限なしユーザ → 401', async () => {
      await expect(floorMemberService.invite(body, userJwt)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('作成', () => {
    const jwtUser = { user_id: 'u1' };
    const bodyBase = { floor_id: 'floor1', invite_token: 'tok' };

    beforeEach(() => {
      User.findOne.mockResolvedValue({ _id: 'u1' });
      Floor.findOne.mockResolvedValue({ _id: 'floor1', user: 'creator' });
      FloorInvite.findOne.mockResolvedValue({
        token_expiry: new Date(Date.now() + 60 * 60 * 1000),
      });
      FloorMember.findOne.mockResolvedValue(null);
      FloorMember.create.mockResolvedValue({ _id: 'newFM' });
      FloorMember.findById.mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue({ _id: 'newFM', floor: { title: 'T' } }),
      }));
    });

    test('一意キーの競合だけを参加済みへ変換し、別DBエラーは伝播する', async () => {
      const duplicate = { code: 11000, keyPattern: { floor: 1, user: 1 } };
      FloorMember.create.mockRejectedValueOnce(duplicate);
      await expect(floorMemberService.create(bodyBase, jwtUser)).rejects.toBeInstanceOf(AppError);
      for (const error of [{ code: 11000, keyPattern: { _id: 1 } }, new Error('database failed')]) {
        FloorMember.create.mockRejectedValueOnce(error);
        await expect(floorMemberService.create(bodyBase, jwtUser)).rejects.toBe(error);
      }
    });

    test('フロアメンバー作成', async () => {
      await expect(floorMemberService.create(bodyBase, jwtUser)).resolves.toHaveProperty('floor');
    });

    test('フロア作成者自身のフロアメンバー登録を拒否する', async () => {
      Floor.findOne.mockResolvedValue({ _id: 'floor1', user: 'u1' });
      await expect(floorMemberService.create(bodyBase, jwtUser)).rejects.toBeInstanceOf(AppError);
    });

    test('招待トークン期限切れ', async () => {
      FloorInvite.findOne.mockResolvedValue({
        token_expiry: new Date(Date.now() - 1000),
      });
      await expect(floorMemberService.create(bodyBase, jwtUser)).rejects.toBeInstanceOf(AppError);
    });

    test('既にメンバー', async () => {
      FloorMember.findOne.mockResolvedValue({ _id: 'exists' });
      await expect(floorMemberService.create(bodyBase, jwtUser)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('削除', () => {
    const body = { _id: 'fm1', floor_id: 'floor1' };
    const adminJwt = { user_role: 'Administrator', user_id: 'admin' };
    const editorJwt = { user_role: 'Editor', user_id: 'editor' };
    const userJwt = { user_role: 'User', user_id: 'user' };

    beforeEach(() => {
      Floor.findOne.mockResolvedValue({ _id: 'floor1', user: 'editor' });
      FloorMember.findOneAndDelete.mockResolvedValue({ _id: 'fm1', floor: 'floor1', user: 'target' });
    });

    test('管理者はメンバーを削除できる', async () => {
      const io = {};

      await expect(floorMemberService.delete(body, adminJwt, io)).resolves.toEqual(
        expect.objectContaining({ _id: 'fm1' })
      );
      expect(revalidateFloorUserSockets).toHaveBeenCalledWith(io, {
        floorId: 'floor1',
        userId: 'target',
      });
    });

    test('フロアを作成した編集ユーザはメンバーを削除できる', async () => {
      await expect(floorMemberService.delete(body, editorJwt)).resolves.toEqual(
        expect.objectContaining({ _id: 'fm1' })
      );
    });

    test('権限なし → 401', async () => {
      await expect(floorMemberService.delete(body, userJwt)).rejects.toBeInstanceOf(AppError);
    });

    test('該当メンバーなし → 404', async () => {
      FloorMember.findOneAndDelete.mockResolvedValue(null);
      await expect(floorMemberService.delete(body, adminJwt)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('退会', () => {
    const body = { floor_id: 'floor1' };
    const jwtUser = { user_id: 'leaveUser' };

    test('脱退成功', async () => {
      const io = {};
      FloorMember.findOneAndDelete.mockResolvedValue({ _id: 'fm', floor: 'floor1', user: 'leaveUser' });

      await expect(floorMemberService.leave(body, jwtUser, io)).resolves.toEqual(
        expect.objectContaining({ _id: 'fm' })
      );
      expect(revalidateFloorUserSockets).toHaveBeenCalledWith(io, {
        floorId: 'floor1',
        userId: 'leaveUser',
      });
    });

    test('見つからず → 404', async () => {
      FloorMember.findOneAndDelete.mockResolvedValue(null);
      await expect(floorMemberService.leave(body, jwtUser)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('管理画面向けのページ単位の一覧取得', () => {
    const body = { page: 1 };
    const adminJwt = { user_id: 'admin' };

    beforeEach(() => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator', delete_flg: false });
      FloorMember.paginate.mockResolvedValue({ docs: [] });
    });

    test('管理画面用のメンバー一覧を取得する', async () => {
      await expect(floorMemberService.managementPaginate(body, adminJwt)).resolves.toEqual({ docs: [] });
      expect(FloorMember.paginate).toHaveBeenCalledWith({}, expect.objectContaining({ page: 1 }));
    });
  });

  describe('管理画面からの削除', () => {
    const adminJwt = { user_id: 'admin' };

    beforeEach(() => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator', delete_flg: false });
      FloorMember.findOneAndDelete.mockResolvedValue({
        _id: 'fm1',
        floor: 'floor1',
        user: 'target',
      });
    });

    test('親フロアを参照せずIDだけで物理削除しSocket権限を再評価する', async () => {
      const io = {};

      await expect(floorMemberService.managementDelete({ _id: 'fm1' }, adminJwt, io)).resolves.toEqual(
        expect.objectContaining({ _id: 'fm1' })
      );

      expect(Floor.findOne).not.toHaveBeenCalled();
      expect(FloorMember.findOneAndDelete).toHaveBeenCalledWith({ _id: 'fm1' });
      expect(revalidateFloorUserSockets).toHaveBeenCalledWith(io, {
        floorId: 'floor1',
        userId: 'target',
      });
    });

    test('現在のDBロールが管理者でなければ拒否する', async () => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Author', delete_flg: false });

      await expect(floorMemberService.managementDelete({ _id: 'fm1' }, adminJwt)).rejects.toBeInstanceOf(
        AppError
      );
      expect(FloorMember.findOneAndDelete).not.toHaveBeenCalled();
    });

    test('対象が存在しなければNOT_FOUNDにする', async () => {
      FloorMember.findOneAndDelete.mockResolvedValue(null);

      await expect(floorMemberService.managementDelete({ _id: 'missing' }, adminJwt)).rejects.toBeInstanceOf(
        AppError
      );
    });
  });
});
