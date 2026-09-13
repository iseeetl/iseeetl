jest.mock('../../../../services/translation.service', () => ({
  translateTag: jest.fn(),
}));
const mockIsGoogleTranslateEnabled = jest.fn(() => true);
jest.mock('../../../../config/featureFlags', () => ({
  isGoogleTranslateEnabled: mockIsGoogleTranslateEnabled,
}));
const mockAssertNoActiveAIAnalysisReferences = jest.fn();
const mockWithAIAnalysisIntegrityLock = jest.fn((task) => task());
jest.mock('../../../../services/analysis/settings/referenceIntegrity', () => ({
  assertNoActiveAIAnalysisReferences: mockAssertNoActiveAIAnalysisReferences,
  withAIAnalysisIntegrityLock: mockWithAIAnalysisIntegrityLock,
}));
const mockCommitSettingInheritance = jest.fn();
const mockPrepareFloorSettingInheritance = jest.fn();
const mockRollbackSettingInheritance = jest.fn();
jest.mock('../../../../services/analysis/settings/inheritance.service', () => ({
  commitSettingInheritance: mockCommitSettingInheritance,
  prepareFloorSettingInheritance: mockPrepareFloorSettingInheritance,
  rollbackSettingInheritance: mockRollbackSettingInheritance,
}));

jest.mock('../../../../models/User', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/Floor', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/FloorTag', () => ({
  modelName: 'FloorTag',
  find: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOne: jest.fn(),
  paginate: jest.fn(),
  bulkWrite: jest.fn(),
  deleteMany: jest.fn(),
  deleteOne: jest.fn(),
}));
jest.mock('../../../../models/CategoryTag', () => ({ find: jest.fn() }));


const floorTagService = require('../../../../services/floor/floorTag.service');
const translationService = require('../../../../services/translation.service');
const User = require('../../../../models/User');
const Floor = require('../../../../models/Floor');
const FloorTag = require('../../../../models/FloorTag');
const CategoryTag = require('../../../../models/CategoryTag');
const AppError = require('../../../../utils/appError');

describe('floorTagのサービス', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleTranslateEnabled.mockReturnValue(true);
    mockAssertNoActiveAIAnalysisReferences.mockResolvedValue(undefined);
    mockPrepareFloorSettingInheritance.mockResolvedValue({
      type: 'floor',
      childTagIds: [],
      documents: [],
    });
    mockCommitSettingInheritance.mockResolvedValue([]);
    mockRollbackSettingInheritance.mockResolvedValue(undefined);
    FloorTag.deleteOne.mockResolvedValue({ deletedCount: 1 });
    FloorTag.deleteMany.mockResolvedValue({ deletedCount: 0 });
  });

  const mockUser = { _id: 'u1', username: 'tester', role: 'Administrator' };
  const mockFloor = { _id: 'f1', user: 'creator', target_langs: ['en'], delete_flg: false };

  const mockReconcileFinds = ({ existing = [], active = [] } = {}) => {
    FloorTag.find.mockImplementation(() => ({
      lean: jest.fn().mockResolvedValue(existing),
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(active) }),
    }));
  };

  describe('一覧取得', () => {
    const body = { floor_id: 'f1' };
    const adminJwt = { user_role: 'Administrator', user_id: 'u1' };
    const editorCreatorJwt = { user_role: 'Editor', user_id: 'creator' };
    const userJwt = { user_role: 'User', user_id: 'u2' };

    beforeEach(() => {
      User.findOne.mockResolvedValue(mockUser);
      Floor.findOne.mockResolvedValue(mockFloor);
      FloorTag.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: 't1' }]),
      });
    });

    test('管理者が一覧取得', async () => {
      await expect(floorTagService.list(body, adminJwt)).resolves.toEqual([{ _id: 't1' }]);
      expect(FloorTag.find).toHaveBeenCalledWith({ floor: 'f1', delete_flg: false });
    });

    test('フロア編集ユーザ (作成者) が一覧取得', async () => {
      await expect(floorTagService.list(body, editorCreatorJwt)).resolves.toBeDefined();
    });

    test('権限無しユーザ', async () => {
      await expect(floorTagService.list(body, userJwt)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('作成', () => {
    const body = {
      floor_id: 'f1',
      order: 5,
      name: 'tagName',
      lang: 'ja',
      target_langs: ['en'],
    };
    const adminJwt = { user_role: 'Administrator', user_id: 'u1' };
    const editorCreatorJwt = { user_role: 'Editor', user_id: 'creator' };
    const userJwt = { user_role: 'User', user_id: 'u2' };

    beforeEach(() => {
      translationService.translateTag.mockResolvedValue([{ lang: 'en', name: 'translated' }]);
      User.findOne.mockResolvedValue(mockUser);
      Floor.findOne.mockResolvedValue(mockFloor);
      FloorTag.create.mockResolvedValue({ _id: 'tNew' });
    });

    test('翻訳呼び出し (target_langsあり)', async () => {
      await expect(floorTagService.create(body, adminJwt)).resolves.toEqual({ _id: 'tNew' });
      expect(translationService.translateTag).toHaveBeenCalledWith('u1', { lang: 'ja', name: 'tagName' }, ['en']);
      expect(FloorTag.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'tagName', translations: [{ lang: 'en', name: 'translated' }] })
      );
    });

    test('翻訳呼び出し (target_langs空でもサービスに委譲)', async () => {
      translationService.translateTag.mockResolvedValue([]);
      Floor.findOne.mockResolvedValue({ ...mockFloor, target_langs: [] });
      await floorTagService.create({ ...body, target_langs: [] }, adminJwt);
      expect(translationService.translateTag).toHaveBeenCalledWith('u1', { lang: 'ja', name: 'tagName' }, []);
      expect(FloorTag.create).toHaveBeenCalledWith(expect.objectContaining({ translations: [] }));
    });

    test('フロアを作成した編集ユーザはタグを作成できる', async () => {
      await expect(floorTagService.create(body, editorCreatorJwt)).resolves.toEqual({ _id: 'tNew' });
    });

    test('権限なしユーザ', async () => {
      await expect(floorTagService.create(body, userJwt)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('更新', () => {
    const baseBody = {
      _id: 't1',
      order: 2,
      name: 'newName',
      lang: 'ja',
      target_langs: ['en'],
    };
    const adminJwt = { user_role: 'Administrator', user_id: 'uAdmin' };
    const editorCreatorJwt = { user_role: 'Editor', user_id: 'creator' };
    const otherEditorJwt = { user_role: 'Editor', user_id: 'other' };

    const foundTag = {
      _id: 't1',
      floor: 'f1',
      user: 'creator',
      name: 'oldName',
      lang: 'ja',
      translations: [],
      delete_flg: false,
    };

    beforeEach(() => {
      translationService.translateTag.mockResolvedValue([{ lang: 'en', name: 'translated' }]);
      User.findOne.mockResolvedValue(mockUser);
      FloorTag.findOne.mockResolvedValue(foundTag);
      Floor.findOne.mockResolvedValue(mockFloor);
      FloorTag.findOneAndUpdate.mockResolvedValue({ _id: 't1', name: 'newName' });
    });

    test('管理者が更新', async () => {
      const res = await floorTagService.update(baseBody, adminJwt);
      expect(res).toEqual({ _id: 't1', name: 'newName' });
      expect(FloorTag.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 't1', delete_flg: false },
        expect.objectContaining({ name: 'newName' }),
        expect.any(Object)
      );
    });

    test('name 変わらず → 翻訳呼ばれない', async () => {
      const sameNameBody = { ...baseBody, name: 'oldName' };
      await floorTagService.update(sameNameBody, adminJwt);
      expect(translationService.translateTag).not.toHaveBeenCalled();
    });

    test('フロア編集ユーザ (作成者) が name 変更時に翻訳', async () => {
      await floorTagService.update(baseBody, editorCreatorJwt);
      expect(translationService.translateTag).toHaveBeenCalledWith('creator', { lang: 'ja', name: 'newName' }, ['en']);
    });

    test('Google翻訳無効時はname変更後も保存済み翻訳を保持する', async () => {
      mockIsGoogleTranslateEnabled.mockReturnValue(false);
      FloorTag.findOne.mockResolvedValue({
        ...foundTag,
        translations: [{ lang: 'en', name: 'Old name' }],
      });

      await floorTagService.update(baseBody, adminJwt);

      expect(translationService.translateTag).not.toHaveBeenCalled();
      expect(FloorTag.findOneAndUpdate.mock.calls[0][1].translations).toEqual([
        { lang: 'en', name: 'Old name' },
      ]);
    });

    test('作成者でないフロア編集ユーザ', async () => {
      await expect(floorTagService.update(baseBody, otherEditorJwt)).rejects.toBeInstanceOf(AppError);
    });

    test('タグ存在しない', async () => {
      FloorTag.findOne.mockResolvedValue(null);
      await expect(floorTagService.update(baseBody, adminJwt)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('削除', () => {
    const body = { _id: 't1' };
    const adminJwt = { user_role: 'Administrator', user_id: 'uAdmin' };
    const editorCreatorJwt = { user_role: 'Editor', user_id: 'creator' };
    const otherEditorJwt = { user_role: 'Editor', user_id: 'other' };

    beforeEach(() => {
      FloorTag.findOneAndUpdate.mockResolvedValue({ _id: 't1', delete_flg: true });
    });

    test('管理者が削除', async () => {
      User.findOne.mockResolvedValue({ _id: 'uAdmin', role: 'Administrator' });
      FloorTag.findOne.mockResolvedValue({
        _id: 't1',
        user: 'creator',
        floor: 'f1',
        delete_flg: false,
      });
      Floor.findOne.mockResolvedValue(mockFloor);

      const res = await floorTagService.delete(body, adminJwt);
      expect(res).toEqual({ _id: 't1' });
      expect(mockAssertNoActiveAIAnalysisReferences).toHaveBeenCalledWith(
        'floor-tag',
        't1'
      );
      expect(FloorTag.deleteOne).toHaveBeenCalledWith({ _id: 't1', delete_flg: false });
    });

    test('フロア編集ユーザ (作成者) が削除', async () => {
      User.findOne.mockResolvedValue({ _id: 'creator', role: 'Editor' });
      FloorTag.findOne.mockResolvedValue({
        _id: 't1',
        user: 'creator',
        floor: 'f1',
        delete_flg: false,
      });
      Floor.findOne.mockResolvedValue(mockFloor);

      await expect(floorTagService.delete(body, editorCreatorJwt)).resolves.toBeDefined();
    });

    test('作成者でないフロア編集ユーザ', async () => {
      User.findOne.mockResolvedValue({ _id: 'other', role: 'Editor' });
      FloorTag.findOne.mockResolvedValue({
        _id: 't1',
        user: 'creator',
        floor: 'f1',
        delete_flg: false,
      });
      Floor.findOne.mockResolvedValue(mockFloor);

      await expect(floorTagService.delete(body, otherEditorJwt)).rejects.toBeInstanceOf(AppError);
    });

    test('フロアAI解析設定から参照中なら削除更新しない', async () => {
      User.findOne.mockResolvedValue({ _id: 'uAdmin', role: 'Administrator' });
      FloorTag.findOne.mockResolvedValue({
        _id: 't1',
        user: 'creator',
        floor: 'f1',
        delete_flg: false,
      });
      Floor.findOne.mockResolvedValue(mockFloor);
      mockAssertNoActiveAIAnalysisReferences.mockRejectedValue(
        new AppError({ code: 'CONFLICT' })
      );

      await expect(floorTagService.delete(body, adminJwt)).rejects.toBeInstanceOf(
        AppError
      );

      expect(FloorTag.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('インポート', () => {
    const body = {
      floor_id: 'f1',
      csv: [
        [1, 'TagA'],
        [2, 'TagB'],
      ],
    };
    const adminJwt = { user_role: 'Administrator', user_id: 'u1' };
    const userJwt = { user_role: 'User', user_id: 'u2' };

    beforeEach(() => {
      Floor.findOne.mockResolvedValue(mockFloor);
      translationService.translateTag.mockResolvedValue([]);
      FloorTag.bulkWrite.mockResolvedValue({ ok: 1 });
      mockReconcileFinds({
        existing: [
          { _id: 'oldA', name: 'TagA', delete_flg: false },
          { _id: 'oldX', name: 'TagX', delete_flg: false },
        ],
        active: [
          { _id: 'oldA', name: 'TagA' },
          { _id: 'newB', name: 'TagB' },
        ],
      });
    });

    test('同名IDを維持し、対象外タグを最後に物理削除する', async () => {
      const res = await floorTagService.import(body, adminJwt);

      const [operations, options] = FloorTag.bulkWrite.mock.calls[0];
      expect(options).toEqual({ ordered: true });
      expect(operations[0].updateOne.filter).toEqual({ floor: 'f1', name: 'TagA', delete_flg: false });
      expect(operations[1].updateOne.filter).toEqual({ floor: 'f1', name: 'TagB', delete_flg: false });
      expect(operations[2].deleteMany.filter).toEqual({
        floor: 'f1',
        _id: { $in: ['oldX'] },
      });
      expect(res).toEqual([
        { _id: 'oldA', name: 'TagA' },
        { _id: 'newB', name: 'TagB' },
      ]);
    });

    test('CSV内の同名タグは翻訳・DB変更前に拒否する', async () => {
      await expect(
        floorTagService.import(
          {
            floor_id: 'f1',
            csv: [
              [1, 'Duplicate'],
              [2, 'Duplicate'],
            ],
          },
          adminJwt
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(translationService.translateTag).not.toHaveBeenCalled();
      expect(FloorTag.find).not.toHaveBeenCalled();
      expect(FloorTag.bulkWrite).not.toHaveBeenCalled();
    });

    test('翻訳失敗時はDBを変更しない', async () => {
      translationService.translateTag.mockRejectedValueOnce(new Error('translation failed'));

      await expect(floorTagService.import(body, adminJwt)).rejects.toThrow('translation failed');

      expect(FloorTag.find).not.toHaveBeenCalled();
      expect(FloorTag.bulkWrite).not.toHaveBeenCalled();
    });

    test('権限無しユーザ', async () => {
      await expect(floorTagService.import(body, userJwt)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('初期化', () => {
    const body = { floor_id: 'f1' };
    const adminJwt = { user_role: 'Administrator', user_id: 'u1' };
    const editorCreatorJwt = { user_role: 'Editor', user_id: 'creator' };

    beforeEach(() => {
      Floor.findOne.mockResolvedValue(mockFloor);
      translationService.translateTag.mockResolvedValue([]);
      FloorTag.bulkWrite.mockResolvedValue({ ok: 1 });
      mockReconcileFinds({
        existing: [
          { _id: 'old1', name: 'CT1', delete_flg: false },
          { _id: 'oldX', name: 'Old', delete_flg: false },
        ],
        active: [
          { _id: 'old1', name: 'CT1' },
          { _id: 'new2', name: 'CT2' },
        ],
      });
      CategoryTag.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'c1', order: 1, name: 'CT1', lang: 'ja' },
          { _id: 'c2', order: 2, name: 'CT2', lang: 'ja' },
        ]),
      });
    });

    test('共通タグと同名のフロアタグ IDを維持して同期する', async () => {
      const res = await floorTagService.init(body, adminJwt);

      const operations = FloorTag.bulkWrite.mock.calls.flatMap(([items]) => items);
      const options = FloorTag.bulkWrite.mock.calls[0][1];
      expect(options).toEqual({ ordered: true });
      expect(operations[0].updateOne.filter).toEqual({ floor: 'f1', name: 'CT1', delete_flg: false });
      expect(operations[1].updateOne.filter).toEqual({ floor: 'f1', name: 'CT2', delete_flg: false });
      expect(operations[0].updateOne.update.$set).not.toHaveProperty(
        'source_category_tag'
      );
      expect(operations[0].updateOne.update.$setOnInsert.source_category_tag).toBe('c1');
      expect(operations[1].updateOne.update.$setOnInsert.source_category_tag).toBe('c2');
      expect(operations[2].deleteMany.filter._id).toEqual({ $in: ['oldX'] });
      expect(mockPrepareFloorSettingInheritance).toHaveBeenCalledWith({
        floorId: 'f1',
        childTags: [
          expect.objectContaining({ name: 'CT2', source_category_tag: 'c2' }),
        ],
        userId: 'u1',
      });
      expect(mockCommitSettingInheritance).toHaveBeenCalledTimes(1);
      expect(res).toEqual([
        { _id: 'old1', name: 'CT1' },
        { _id: 'new2', name: 'CT2' },
      ]);
    });

    test('共通タグ無しでも既存フロアタグを物理削除する', async () => {
      CategoryTag.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });
      mockReconcileFinds({
        existing: [{ _id: 'old1', name: 'CT1', delete_flg: false }],
        active: [],
      });

      const res = await floorTagService.init(body, editorCreatorJwt);

      const [operations] = FloorTag.bulkWrite.mock.calls[0];
      expect(operations).toHaveLength(1);
      expect(operations[0].deleteMany.filter).toEqual({
        floor: 'f1',
        _id: { $in: ['old1'] },
      });
      expect(res).toEqual([]);
    });

    test('共通タグ名が重複している場合は翻訳・DB変更前に拒否する', async () => {
      CategoryTag.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'c1', order: 1, name: 'CT1', lang: 'ja' },
          { _id: 'c2', order: 2, name: 'CT1', lang: 'ja' },
        ]),
      });

      await expect(floorTagService.init(body, adminJwt)).rejects.toBeInstanceOf(AppError);

      expect(translationService.translateTag).not.toHaveBeenCalled();
      expect(FloorTag.find).not.toHaveBeenCalled();
      expect(FloorTag.bulkWrite).not.toHaveBeenCalled();
    });
  });

  describe('管理画面向けのページ単位の一覧取得', () => {
    const bodyNoSearch = { page: 1, search: null };
    const bodySearch = { page: 2, search: 'xxx' };
    const adminJwt = { user_id: 'admin' };

    beforeEach(() => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      FloorTag.paginate.mockResolvedValue({ docs: [] });
    });

    test('検索なし', async () => {
      await floorTagService.managementPaginate(bodyNoSearch, adminJwt);
      expect(FloorTag.paginate).toHaveBeenCalledWith({ delete_flg: false }, expect.objectContaining({ page: 1, limit: 10 }));
    });

    test('検索あり', async () => {
      await floorTagService.managementPaginate(bodySearch, adminJwt);
      const query = FloorTag.paginate.mock.calls[0][0];
      expect(query).toHaveProperty('$or');
      expect(Array.isArray(query.$or)).toBe(true);
      expect(query.$or[0]).toHaveProperty('name');
      expect(query.$or[0].name).toMatchObject({
        $regex: 'xxx',
        $options: expect.stringContaining('i'),
      });
    });

    test('有効なタグと所属フロアを一覧へ含める', async () => {
      await floorTagService.managementPaginate(
        { page: 1, search: null, delete_flg: true },
        adminJwt
      );

      expect(FloorTag.paginate).toHaveBeenCalledWith(
        { delete_flg: false },
        expect.objectContaining({
          populate: expect.arrayContaining([
            { path: 'floor', select: 'title delete_flg' },
            { path: 'source_category_tag', select: 'name delete_flg' },
          ]),
        })
      );
    });
  });

  describe('管理画面からの更新', () => {
    const body = {
      _id: 't1',
      order: 9,
      name: 'MngTag',
      lang: 'he',
      delete_flg: false,
    };
    const adminJwt = { user_id: 'admin' };

    beforeEach(() => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      FloorTag.findOne.mockResolvedValue({
        _id: 't1',
        floor: 'f1',
        name: 'Old tag',
        lang: 'ja',
        translations: [{ lang: 'en', name: 'Old tag' }],
        delete_flg: false,
      });
      Floor.findOne.mockResolvedValue({ _id: 'f1', target_langs: ['en'] });
      translationService.translateTag.mockResolvedValue([{ lang: 'en', name: 'Managed tag' }]);
      FloorTag.findOneAndUpdate.mockResolvedValue({ _id: 't1', delete_flg: false });
    });

    test('管理者が更新', async () => {
      await floorTagService.managementUpdate(body, adminJwt);
      expect(FloorTag.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 't1', delete_flg: false },
        expect.objectContaining({
          lang: 'he',
          translations: [{ lang: 'en', name: 'Managed tag' }],
        }),
        expect.objectContaining({ new: true })
      );
      const update = FloorTag.findOneAndUpdate.mock.calls[0][1];
      expect(update).not.toHaveProperty('delete_flg');
      expect(update).not.toHaveProperty('deleted_at');
      expect(translationService.translateTag).toHaveBeenCalledWith(
        'admin',
        { lang: 'he', name: 'MngTag' },
        ['en']
      );
    });

    test('削除されたタグは更新できない', async () => {
      FloorTag.findOne.mockResolvedValue(null);
      await expect(floorTagService.managementUpdate({ _id: 't1', order: 1, name: 'x', lang: 'ja' }, adminJwt))
        .rejects.toBeInstanceOf(AppError);
      expect(FloorTag.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('管理画面からの削除', () => {
    test('管理者が未使用タグを物理削除する', async () => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      FloorTag.findOne.mockResolvedValue({ _id: 't1', name: 'Current' });
      await expect(floorTagService.managementDelete({ _id: 't1' }, { user_id: 'admin' }))
        .resolves.toEqual({ _id: 't1' });
      expect(FloorTag.deleteOne).toHaveBeenCalledWith({ _id: 't1' });
      expect(FloorTag.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});
