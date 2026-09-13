jest.mock('../../../models/CategoryTag', () => ({
  modelName: 'CategoryTag',
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  paginate: jest.fn(),
  create: jest.fn(),
  bulkWrite: jest.fn(),
  deleteOne: jest.fn(),
}));

const mockIsGoogleTranslateEnabled = jest.fn(() => true);
jest.mock('../../../config/featureFlags', () => ({
  isGoogleTranslateEnabled: mockIsGoogleTranslateEnabled,
}));
const mockAssertNoActiveAIAnalysisReferences = jest.fn();
const mockWithAIAnalysisIntegrityLock = jest.fn((task) => task());
jest.mock('../../../services/analysis/settings/referenceIntegrity', () => ({
  assertNoActiveAIAnalysisReferences: mockAssertNoActiveAIAnalysisReferences,
  withAIAnalysisIntegrityLock: mockWithAIAnalysisIntegrityLock,
}));

const categoryTagService = require('../../../services/categoryTag.service');
const CategoryTag = require('../../../models/CategoryTag');
const AppError = require('../../../utils/appError');

describe('categoryTagのサービス', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleTranslateEnabled.mockReturnValue(true);
    mockAssertNoActiveAIAnalysisReferences.mockResolvedValue(undefined);
  });

  describe('一覧取得', () => {
    test('削除されていない共通タグだけを取得する', async () => {
      CategoryTag.find.mockResolvedValue([{ name: 'A' }]);

      const res = await categoryTagService.list();
      expect(res).toEqual([{ name: 'A' }]);
      expect(CategoryTag.find).toHaveBeenCalledWith({ delete_flg: false });
    });
  });

  describe('ページ単位の一覧取得', () => {
    test('検索無し', async () => {
      CategoryTag.paginate.mockResolvedValue({ docs: [] });

      await categoryTagService.paginate({ page: 2, search: null });

      expect(CategoryTag.paginate).toHaveBeenCalledWith(
        { delete_flg: false },
        expect.objectContaining({ page: 2, limit: 10, sort: { order: 'asc' } })
      );
    });

    test('検索有り', async () => {
      CategoryTag.paginate.mockResolvedValue({ docs: [] });

      await categoryTagService.paginate({ page: 1, search: 'test' });

      const [query] = CategoryTag.paginate.mock.calls[0];
      expect(query.name).toMatchObject({
        $regex: 'test',
        $options: expect.stringContaining('i'),
      });
    });

    test('旧削除状態が渡されても有効なタグだけを取得する', async () => {
      CategoryTag.paginate.mockResolvedValue({ docs: [] });

      await categoryTagService.paginate({ page: 1, search: null, delete_flg: true });

      expect(CategoryTag.paginate).toHaveBeenCalledWith(
        { delete_flg: false },
        expect.objectContaining({ page: 1 })
      );
    });
  });

  describe('作成', () => {
    test('指定された表示順と名前で共通タグを作成する', async () => {
      const body = { order: 5, name: 'Tag' };
      CategoryTag.create.mockResolvedValue({ _id: 'id1' });

      const res = await categoryTagService.create(body, 'user1');

      expect(CategoryTag.create).toHaveBeenCalledWith({
        user: 'user1',
        order: 5,
        name: 'Tag',
      });
      expect(res).toEqual({ _id: 'id1' });
    });
  });

  describe('更新', () => {
    test('有効なタグの編集項目だけを更新する', async () => {
      CategoryTag.findOne.mockResolvedValue({ _id: 'tag1', delete_flg: false });
      CategoryTag.findOneAndUpdate.mockResolvedValue({ _id: 'tag1', name: 'New' });
      await expect(categoryTagService.update({ _id: 'tag1', order: 9, name: 'New' }))
        .resolves.toEqual({ _id: 'tag1', name: 'New' });
      expect(CategoryTag.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'tag1', delete_flg: false },
        { order: 9, name: 'New', updated_at: expect.any(Number) },
        { new: true, runValidators: true }
      );
    });

    test('削除済みまたは存在しないタグを更新できない', async () => {
      CategoryTag.findOne.mockResolvedValue(null);
      await expect(categoryTagService.update({ _id: 'tag1', order: 1, name: 'Tag' }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(CategoryTag.findOne).toHaveBeenCalledWith({ _id: 'tag1', delete_flg: false });
      expect(CategoryTag.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('条件付き更新が競合した場合は409を返す', async () => {
      CategoryTag.findOne.mockResolvedValue({ _id: 'tag1', delete_flg: false });
      CategoryTag.findOneAndUpdate.mockResolvedValue(null);
      await expect(categoryTagService.update({ _id: 'tag1', order: 2, name: 'Tag' }))
        .rejects.toMatchObject({ code: 'CONFLICT' });
      expect(CategoryTag.findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('削除', () => {
    test('未使用タグを物理削除し、応答はIDだけを返す', async () => {
      CategoryTag.findOne.mockResolvedValue({ _id: 'tag1', name: 'Current' });
      CategoryTag.deleteOne.mockResolvedValue({ deletedCount: 1 });
      await expect(categoryTagService.delete({ _id: 'tag1' })).resolves.toEqual({ _id: 'tag1' });
      expect(CategoryTag.deleteOne).toHaveBeenCalledWith({ _id: 'tag1' });
      expect(CategoryTag.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('共通AI解析設定から参照中なら削除を止める', async () => {
      CategoryTag.findOne.mockResolvedValue({ _id: 'tag1' });
      mockAssertNoActiveAIAnalysisReferences.mockRejectedValue(new AppError({ code: 'CONFLICT' }));
      await expect(categoryTagService.delete({ _id: 'tag1' })).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(CategoryTag.deleteOne).not.toHaveBeenCalled();
    });
  });

  describe('インポート', () => {
    const csv = [
      [1, ' タグ1 '],
      [2, '<Tag2>'],
    ];

    beforeEach(() => {
      CategoryTag.bulkWrite.mockResolvedValue({ ok: 1 });
      CategoryTag.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'old1', name: 'タグ1', delete_flg: false },
          { _id: 'oldX', name: 'Old', delete_flg: false },
        ]),
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([
          { _id: 'old1', order: 1, name: 'タグ1' },
          { _id: 'new2', order: 2, name: '<Tag2>' },
        ]) }),
      });
    });

    test('同名IDを維持し、対象外タグを最後に物理削除する', async () => {
      const result = await categoryTagService.import({ csv }, 'userXYZ');

      const [operations, options] = CategoryTag.bulkWrite.mock.calls[0];
      expect(options).toEqual({ ordered: true });
      expect(operations[0].updateOne.filter).toEqual({ name: 'タグ1', delete_flg: false });
      expect(operations[0].updateOne.update.$set.order).toBe(1);
      expect(operations[1].updateOne.filter).toEqual({ name: '<Tag2>', delete_flg: false });
      expect(operations[2].deleteMany.filter).toEqual({ _id: { $in: ['oldX'] } });
      expect(result).toEqual([
        { _id: 'old1', order: 1, name: 'タグ1' },
        { _id: 'new2', order: 2, name: '<Tag2>' },
      ]);
    });

    test('CSV内の同名タグはDB変更前に拒否する', async () => {
      await expect(
        categoryTagService.import(
          {
            csv: [
              [1, 'Duplicate'],
              [2, 'Duplicate'],
            ],
          },
          'userXYZ'
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(CategoryTag.find).not.toHaveBeenCalled();
      expect(CategoryTag.bulkWrite).not.toHaveBeenCalled();
    });

    test('既存タグ名の重複は曖昧な更新を拒否する', async () => {
      CategoryTag.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'old1', name: 'タグ1' },
          { _id: 'old2', name: 'タグ1' },
        ]),
      });

      await expect(categoryTagService.import({ csv }, 'userXYZ')).rejects.toBeInstanceOf(AppError);

      expect(CategoryTag.bulkWrite).not.toHaveBeenCalled();
    });
  });
});
