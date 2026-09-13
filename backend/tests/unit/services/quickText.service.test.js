jest.mock('../../../models/User', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/QuickTextGroup', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
  countDocuments: jest.fn(),
  exists: jest.fn(),
}));
jest.mock('../../../models/QuickTextItem', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
  deleteMany: jest.fn(),
  exists: jest.fn(),
}));

const ROLES = require('../../../constants/roles');
const AppError = require('../../../utils/appError');

const User = require('../../../models/User');
const QuickTextGroup = require('../../../models/QuickTextGroup');
const QuickTextItem = require('../../../models/QuickTextItem');
const service = require('../../../services/quickText.service');

const mockFindOneOrder = (model, orderValue) => {
  const lean = jest.fn().mockResolvedValue(orderValue == null ? null : { order: orderValue });
  const select = jest.fn().mockReturnValue({ lean });
  const sort = jest.fn().mockReturnValue({ select });
  model.findOne.mockReturnValue({ sort });
  return { sort, select, lean };
};

describe('quickTextのサービス', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    QuickTextGroup.paginate = undefined;
    QuickTextGroup.exists.mockResolvedValue(true);
  });

  describe('全単語グループの取得', () => {
    test('管理者は一覧を取得できる', async () => {
      User.findOne.mockResolvedValue({ _id: 'u1', role: ROLES.ADMINISTRATOR, delete_flg: false });
      const lean = jest.fn().mockResolvedValue([{ _id: 'g1' }]);
      const sort = jest.fn().mockReturnValue({ lean });
      QuickTextGroup.find.mockReturnValue({ sort });

      const res = await service.listAllGroups({ jwtPayload: { user_id: 'u1' } });

      expect(QuickTextGroup.find).toHaveBeenCalledWith({});
      expect(sort).toHaveBeenCalledWith({ order: 1, created_at: 1, _id: 1 });
      expect(lean).toHaveBeenCalled();
      expect(res).toEqual([{ _id: 'g1' }]);
    });

    test('非管理者は拒否される', async () => {
      User.findOne.mockResolvedValue({ _id: 'u1', role: ROLES.AUTHOR, delete_flg: false });

      const p = service.listAllGroups({ jwtPayload: { user_id: 'u1' } });

      await expect(p).rejects.toBeInstanceOf(AppError);
      await expect(p).rejects.toHaveProperty('status', 403);
    });
  });

  describe('単語グループのページ単位の一覧取得', () => {
    test('paginate が存在する場合は paginate を使う', async () => {
      User.findOne.mockResolvedValue({ _id: 'u1', role: ROLES.ADMINISTRATOR, delete_flg: false });
      QuickTextGroup.paginate = jest.fn().mockResolvedValue({ docs: [], page: 2 });

      const res = await service.paginateGroups({ page: 2, jwtPayload: { user_id: 'u1' } });

      expect(QuickTextGroup.paginate).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ page: 2, limit: 10, sort: { order: 1, created_at: 1, _id: 1 } })
      );
      expect(res).toEqual({ docs: [], page: 2 });
    });

    test('paginate 未実装時は find/count で返す', async () => {
      User.findOne.mockResolvedValue({ _id: 'u1', role: ROLES.ADMINISTRATOR, delete_flg: false });
      QuickTextGroup.paginate = undefined;
    QuickTextGroup.exists.mockResolvedValue(true);
      const lean = jest.fn().mockResolvedValue([{ _id: 'g1' }]);
      const limit = jest.fn().mockReturnValue({ lean });
      const skip = jest.fn().mockReturnValue({ limit });
      const sort = jest.fn().mockReturnValue({ skip });
      QuickTextGroup.find.mockReturnValue({ sort });
      QuickTextGroup.countDocuments.mockResolvedValue(11);

      const res = await service.paginateGroups({ page: 2, jwtPayload: { user_id: 'u1' } });

      expect(QuickTextGroup.find).toHaveBeenCalledWith({});
      expect(res.total).toBe(11);
      expect(res.page).toBe(2);
      expect(res.docs).toEqual([{ _id: 'g1' }]);
    });
  });

  describe('単語グループの作成', () => {
    test('order は末尾+1 で作成される', async () => {
      User.findOne.mockResolvedValue({ _id: 'u1', role: ROLES.ADMINISTRATOR, delete_flg: false });
      mockFindOneOrder(QuickTextGroup, 2);
      QuickTextGroup.create.mockResolvedValue({ _id: 'g1', order: 3 });

      const res = await service.createGroup({
        title: 't',
        lang: 'ja',
        jwtPayload: { user_id: 'u1' },
      });

      expect(QuickTextGroup.create).toHaveBeenCalledWith({
        user: 'u1',
        order: 3,
        title: 't',
        lang: 'ja',
      });
      expect(res).toEqual({ _id: 'g1', order: 3 });
    });
  });

  describe('単語グループの更新', () => {
    test('指定フィールドを更新する', async () => {
      User.findOne.mockResolvedValue({ _id: 'u1', role: ROLES.ADMINISTRATOR, delete_flg: false });
      QuickTextGroup.findByIdAndUpdate.mockResolvedValue({ _id: 'g1', title: 'x' });

      const res = await service.updateGroup({ id: 'g1', title: 'x', jwtPayload: { user_id: 'u1' } });

      expect(QuickTextGroup.findByIdAndUpdate).toHaveBeenCalledWith(
        'g1',
        { title: 'x' },
        { new: true, runValidators: true }
      );
      expect(res).toEqual({ _id: 'g1', title: 'x' });
    });

    test('存在しないグループは 404', async () => {
      User.findOne.mockResolvedValue({ _id: 'u1', role: ROLES.ADMINISTRATOR, delete_flg: false });
      QuickTextGroup.findByIdAndUpdate.mockResolvedValue(null);

      const p = service.updateGroup({ id: 'missing', title: 'x', jwtPayload: { user_id: 'u1' } });

      await expect(p).rejects.toBeInstanceOf(AppError);
      await expect(p).rejects.toHaveProperty('status', 404);
    });
  });

  describe('単語の一覧取得', () => {
    test('グループ配下の一覧を取得する', async () => {
      User.findOne.mockResolvedValue({ _id: 'u1', role: ROLES.ADMINISTRATOR, delete_flg: false });
      const lean = jest.fn().mockResolvedValue([{ _id: 'i1' }]);
      const sort = jest.fn().mockReturnValue({ lean });
      QuickTextItem.find.mockReturnValue({ sort });

      const res = await service.listItems({ groupId: 'g1', jwtPayload: { user_id: 'u1' } });

      expect(QuickTextItem.find).toHaveBeenCalledWith({ group: 'g1' });
      expect(res).toEqual([{ _id: 'i1' }]);
    });
  });

  describe('単語の作成', () => {
    test('グループが存在しない場合は 400', async () => {
      User.findOne.mockResolvedValue({ _id: 'u1', role: ROLES.ADMINISTRATOR, delete_flg: false });
      QuickTextGroup.exists.mockResolvedValue(false);

      const p = service.createItem({
        groupId: 'g1',
        label: 'l1',
        lang: 'ja',
        jwtPayload: { user_id: 'u1' },
      });

      await expect(p).rejects.toBeInstanceOf(AppError);
      await expect(p).rejects.toHaveProperty('status', 400);
    });
  });

  describe('単語の更新', () => {
    test('指定フィールドを更新する', async () => {
      User.findOne.mockResolvedValue({ _id: 'u1', role: ROLES.ADMINISTRATOR, delete_flg: false });
      QuickTextItem.findByIdAndUpdate.mockResolvedValue({ _id: 'i1', label: 'x' });

      const res = await service.updateItem({ id: 'i1', label: 'x', jwtPayload: { user_id: 'u1' } });

      expect(QuickTextItem.findByIdAndUpdate).toHaveBeenCalledWith(
        'i1',
        { label: 'x' },
        { new: true, runValidators: true }
      );
      expect(res).toEqual({ _id: 'i1', label: 'x' });
    });

    test('存在しない項目は 404', async () => {
      User.findOne.mockResolvedValue({ _id: 'u1', role: ROLES.ADMINISTRATOR, delete_flg: false });
      QuickTextItem.findByIdAndUpdate.mockResolvedValue(null);

      const p = service.updateItem({ id: 'missing', label: 'x', jwtPayload: { user_id: 'u1' } });

      await expect(p).rejects.toBeInstanceOf(AppError);
      await expect(p).rejects.toHaveProperty('status', 404);
    });
  });

  describe('単語グループの削除', () => {
    test('存在しないグループは 404', async () => {
      User.findOne.mockResolvedValue({ _id: 'u1', role: ROLES.ADMINISTRATOR, delete_flg: false });
      QuickTextGroup.findOne.mockResolvedValue(null);

      const p = service.deleteGroup({ id: 'g1', jwtPayload: { user_id: 'u1' } });

      await expect(p).rejects.toBeInstanceOf(AppError);
      await expect(p).rejects.toHaveProperty('status', 404);
    });
  });

  describe('単語の削除', () => {
    test('削除成功でIDを返す', async () => {
      User.findOne.mockResolvedValue({ _id: 'u1', role: ROLES.ADMINISTRATOR, delete_flg: false });
      QuickTextItem.findByIdAndDelete.mockResolvedValue({ _id: 'i1' });

      const res = await service.deleteItem({ id: 'i1', jwtPayload: { user_id: 'u1' } });

      expect(QuickTextItem.findByIdAndDelete).toHaveBeenCalledWith('i1');
      expect(res).toEqual({ ok: true, deletedItemId: 'i1' });
    });
  });
});
