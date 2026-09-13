jest.mock('../../../../services/translation.service', () => ({
  translateQuickTextGroup: jest.fn(),
  translateQuickTextItem: jest.fn(),
}));
const mockIsGoogleTranslateEnabled = jest.fn(() => true);
jest.mock('../../../../config/featureFlags', () => ({
  isGoogleTranslateEnabled: mockIsGoogleTranslateEnabled,
}));

jest.mock('../../../../models/User', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/Floor', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/Room', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/FloorMember', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/RoomQuickTextGroup', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
  exists: jest.fn(),
}));
jest.mock('../../../../models/RoomQuickTextItem', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
  deleteMany: jest.fn(),
}));
jest.mock('../../../../services/room/roomAccess.service', () => ({
  authorizeRoomMetadataAccess: jest.fn(),
}));

const AppError = require('../../../../utils/appError');
const ROLES = require('../../../../constants/roles');

const translationService = require('../../../../services/translation.service');
const User = require('../../../../models/User');
const Floor = require('../../../../models/Floor');
const Room = require('../../../../models/Room');
const FloorMember = require('../../../../models/FloorMember');
const RoomQuickTextGroup = require('../../../../models/RoomQuickTextGroup');
const RoomQuickTextItem = require('../../../../models/RoomQuickTextItem');
const { authorizeRoomMetadataAccess } = require('../../../../services/room/roomAccess.service');

const service = require('../../../../services/room/roomQuickText.service');

const mockFindOneOrder = (model, orderValue) => {
  const lean = jest.fn().mockResolvedValue(orderValue == null ? null : { order: orderValue });
  const select = jest.fn().mockReturnValue({ lean });
  const sort = jest.fn().mockReturnValue({ select });
  model.findOne.mockReturnValue({ sort });
  return { sort, select, lean };
};

describe('roomQuickTextのサービス', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleTranslateEnabled.mockReturnValue(true);
    authorizeRoomMetadataAccess.mockResolvedValue({
      room: { _id: 'r1', floor: 'f1' },
      floor: { _id: 'f1' },
    });
  });

  describe('単語グループと単語の一覧取得', () => {
    test('識別情報を共通ルームメタデータ認可へ渡し、グループ絞り込み条件と並べ替えを適用する', async () => {
      const groups = [{ _id: 'g1' }];
      const lean = jest.fn().mockResolvedValue(groups);
      const sort = jest.fn().mockReturnValue({ lean });
      RoomQuickTextGroup.find.mockReturnValue({ sort });
      const identity = {
        jwtPayload: { user_id: 'u1', user_role: 'Author' },
        guest: undefined,
      };

      await expect(service.listGroups({ roomId: 'r1', lang: 'ja', ...identity })).resolves.toBe(groups);

      expect(authorizeRoomMetadataAccess).toHaveBeenCalledWith('r1', identity);
      expect(RoomQuickTextGroup.find).toHaveBeenCalledWith({ room: 'r1' });
      expect(sort).toHaveBeenCalledWith({ order: 1, created_at: 1, _id: 1 });
    });

    test('項目一覧は認可後にグループ存在とlang 絞り込み条件を維持する', async () => {
      RoomQuickTextGroup.exists.mockResolvedValue(true);
      const items = [{ _id: 'i1' }];
      const lean = jest.fn().mockResolvedValue(items);
      const sort = jest.fn().mockReturnValue({ lean });
      RoomQuickTextItem.find.mockReturnValue({ sort });
      const guest = { id: 'guest-1' };

      await expect(
        service.listItems({ roomId: 'r1', groupId: 'g1', lang: 'en', guest })
      ).resolves.toBe(items);

      expect(authorizeRoomMetadataAccess).toHaveBeenCalledWith('r1', {
        jwtPayload: undefined,
        guest,
      });
      expect(RoomQuickTextGroup.exists).toHaveBeenCalledWith({ _id: 'g1', room: 'r1' });
      expect(RoomQuickTextItem.find).toHaveBeenCalledWith({ room: 'r1', group: 'g1', lang: 'en' });
    });

    test('認可失敗時は一覧クエリを行わずエラーを伝播する', async () => {
      const error = new AppError({ code: 'INVALID_PERMISSION' });
      authorizeRoomMetadataAccess.mockRejectedValue(error);

      await expect(service.listGroups({ roomId: 'r1' })).rejects.toBe(error);
      expect(RoomQuickTextGroup.find).not.toHaveBeenCalled();
    });
  });

  describe('単語グループの作成', () => {
    test('権限がない場合は 403', async () => {
      User.findOne.mockResolvedValue({ _id: 'u1', delete_flg: false });
      Room.findOne.mockResolvedValue({ _id: 'r1', floor: 'f1', delete_flg: false });
      Floor.findOne.mockResolvedValue({ _id: 'f1', user: 'owner', delete_flg: false });
      FloorMember.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

      const p = service.createGroup({
        roomId: 'r1',
        title: 'g1',
        lang: 'ja',
        jwtPayload: { user_id: 'u1', user_role: ROLES.AUTHOR },
      });

      await expect(p).rejects.toBeInstanceOf(AppError);
      await expect(p).rejects.toHaveProperty('status', 403);
    });

    test('翻訳を含めて作成する', async () => {
      User.findOne.mockResolvedValue({ _id: 'u1', delete_flg: false });
      Room.findOne.mockResolvedValue({ _id: 'r1', floor: 'f1', delete_flg: false });
      Floor.findOne.mockResolvedValue({ _id: 'f1', user: 'u1', target_langs: ['en'], delete_flg: false });
      FloorMember.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      translationService.translateQuickTextGroup.mockResolvedValue([{ lang: 'en', content: 'HELLO' }]);
      mockFindOneOrder(RoomQuickTextGroup, 1);
      RoomQuickTextGroup.create.mockResolvedValue({ _id: 'g1', order: 2 });

      const res = await service.createGroup({
        roomId: 'r1',
        title: 'hello',
        lang: 'ja',
        jwtPayload: { user_id: 'u1', user_role: ROLES.EDITOR },
      });

      expect(translationService.translateQuickTextGroup).toHaveBeenCalledWith('u1', { title: 'hello', lang: 'ja' }, [
        'en',
      ]);
      expect(RoomQuickTextGroup.create).toHaveBeenCalledWith({
        floor: 'f1',
        room: 'r1',
        user: 'u1',
        order: 2,
        title: 'hello',
        lang: 'ja',
        translations: [{ lang: 'en', content: 'HELLO' }],
      });
      expect(res).toEqual({ _id: 'g1', order: 2 });
    });
  });

  describe('単語の一覧取得', () => {
    test('グループが存在しない場合は 400', async () => {
      RoomQuickTextGroup.exists.mockResolvedValue(false);

      const p = service.listItems({ roomId: 'r1', groupId: 'g1', lang: null });

      await expect(p).rejects.toBeInstanceOf(AppError);
      await expect(p).rejects.toHaveProperty('status', 400);
    });
  });
});
