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
jest.mock('../../../../models/FloorQuickTextGroup', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
  exists: jest.fn(),
}));
jest.mock('../../../../models/FloorQuickTextItem', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
  deleteMany: jest.fn(),
}));

const AppError = require('../../../../utils/appError');
const ROLES = require('../../../../constants/roles');

const translationService = require('../../../../services/translation.service');
const User = require('../../../../models/User');
const Floor = require('../../../../models/Floor');
const FloorQuickTextGroup = require('../../../../models/FloorQuickTextGroup');

const service = require('../../../../services/floor/floorQuickText.service');

const mockFindOneOrder = (model, orderValue) => {
  const lean = jest.fn().mockResolvedValue(orderValue == null ? null : { order: orderValue });
  const select = jest.fn().mockReturnValue({ lean });
  const sort = jest.fn().mockReturnValue({ select });
  model.findOne.mockReturnValue({ sort });
  return { sort, select, lean };
};

describe('floorQuickTextのサービス', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleTranslateEnabled.mockReturnValue(true);
  });

  describe('単語グループの一覧取得', () => {
    test('管理者は一覧を取得できる', async () => {
      User.findOne.mockResolvedValue({ _id: 'u1', delete_flg: false });
      Floor.findOne.mockResolvedValue({ _id: 'f1', user: 'owner', delete_flg: false });
      const lean = jest.fn().mockResolvedValue([{ _id: 'g1' }]);
      const sort = jest.fn().mockReturnValue({ lean });
      FloorQuickTextGroup.find.mockReturnValue({ sort });

      const res = await service.listGroups({ floorId: 'f1', jwtPayload: { user_id: 'u1', user_role: ROLES.ADMINISTRATOR } });

      expect(FloorQuickTextGroup.find).toHaveBeenCalledWith({ floor: 'f1' });
      expect(sort).toHaveBeenCalledWith({ order: 1, created_at: 1, _id: 1 });
      expect(lean).toHaveBeenCalled();
      expect(res).toEqual([{ _id: 'g1' }]);
    });

    test('権限がない場合は 403', async () => {
      User.findOne.mockResolvedValue({ _id: 'editor1', delete_flg: false });
      Floor.findOne.mockResolvedValue({ _id: 'f1', user: 'other', delete_flg: false });

      const p = service.listGroups({ floorId: 'f1', jwtPayload: { user_id: 'editor1', user_role: ROLES.EDITOR } });

      await expect(p).rejects.toBeInstanceOf(AppError);
      await expect(p).rejects.toHaveProperty('status', 403);
    });
  });

  describe('単語グループの作成', () => {
    test('翻訳を含めて作成する', async () => {
      User.findOne.mockResolvedValue({ _id: 'u1', delete_flg: false });
      Floor.findOne.mockResolvedValue({ _id: 'f1', user: 'u1', target_langs: ['en', 'ja'], delete_flg: false });
      translationService.translateQuickTextGroup.mockResolvedValue([{ lang: 'en', content: 'HELLO' }]);
      mockFindOneOrder(FloorQuickTextGroup, 4);
      FloorQuickTextGroup.create.mockResolvedValue({ _id: 'g1', order: 5 });

      const res = await service.createGroup({
        floorId: 'f1',
        title: 'hello',
        lang: 'ja',
        jwtPayload: { user_id: 'u1', user_role: ROLES.EDITOR },
      });

      expect(translationService.translateQuickTextGroup).toHaveBeenCalledWith('u1', { title: 'hello', lang: 'ja' }, [
        'en',
        'ja',
      ]);
      expect(FloorQuickTextGroup.create).toHaveBeenCalledWith({
        floor: 'f1',
        user: 'u1',
        order: 5,
        title: 'hello',
        lang: 'ja',
        translations: [{ lang: 'en', content: 'HELLO' }],
      });
      expect(res).toEqual({ _id: 'g1', order: 5 });
    });
  });

  describe('単語の一覧取得', () => {
    test('グループが存在しない場合は 400', async () => {
      User.findOne.mockResolvedValue({ _id: 'u1', delete_flg: false });
      Floor.findOne.mockResolvedValue({ _id: 'f1', user: 'u1', delete_flg: false });
      FloorQuickTextGroup.exists.mockResolvedValue(false);

      const p = service.listItems({ floorId: 'f1', groupId: 'g1', jwtPayload: { user_id: 'u1', user_role: ROLES.EDITOR } });

      await expect(p).rejects.toBeInstanceOf(AppError);
      await expect(p).rejects.toHaveProperty('status', 400);
    });
  });
});
