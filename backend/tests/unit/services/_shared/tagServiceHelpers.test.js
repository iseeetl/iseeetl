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

const translationService = require('../../../../services/translation.service');
const {
  buildManagementPaginateOptions,
  buildManagementUpdateData,
  resolveTagTranslations,
  buildTranslatedTagDocs,
  createTranslatedTag,
  reconcileTagsByName,
  deleteTag,
  updateTranslatedTag,
  updateManagedTag,
} = require('../../../../services/_shared/tagServiceHelpers');

const { buildPaginationLabels } = require('../../../../services/_shared/paginationHelpers');

describe('タグ管理の共通処理', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWithAIAnalysisIntegrityLock.mockImplementation((task) => task());
    mockIsGoogleTranslateEnabled.mockReturnValue(true);
    mockAssertNoActiveAIAnalysisReferences.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('管理画面の一覧取得に必要な設定を返す', () => {
    const options = buildManagementPaginateOptions({
      page: 2,
      sort: { created_at: -1 },
      populate: 'owner',
      lean: true,
    });

    expect(options).toEqual(
      expect.objectContaining({
        page: 2,
        sort: { created_at: -1 },
        populate: 'owner',
        lean: true,
        customLabels: buildPaginationLabels(),
      })
    );
  });

  test('管理画面の更新データには編集項目だけを含め、削除状態や日時は含めない', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1234);

    const result = buildManagementUpdateData({ order: 1, name: 'tag' });

    expect(result).toEqual({ order: 1, name: 'tag', updated_at: 1234 });
    expect(result).not.toHaveProperty('delete_flg');
    expect(result).not.toHaveProperty('deleted_at');
  });

  test('タグに変更がなければ保存済みの翻訳を返す', async () => {
    const currentTag = { name: 'Tag', lang: 'ja', translations: { en: 'Tag' } };
    const nextTag = { name: 'Tag', lang: 'ja' };

    const result = await resolveTagTranslations({
      currentTag,
      nextTag,
      userId: 'u1',
      targetLangs: ['en'],
    });

    expect(result).toEqual({ en: 'Tag' });
    expect(translationService.translateTag).not.toHaveBeenCalled();
  });

  test('タグに変更があれば翻訳する', async () => {
    translationService.translateTag.mockResolvedValue({ en: 'New' });
    const currentTag = { name: 'Old', lang: 'ja', translations: { en: 'Old' } };
    const nextTag = { name: 'New', lang: 'en' };

    const result = await resolveTagTranslations({
      currentTag,
      nextTag,
      userId: 'u1',
      targetLangs: ['ja'],
    });

    expect(translationService.translateTag).toHaveBeenCalledWith('u1', { lang: 'en', name: 'New' }, ['ja']);
    expect(result).toEqual({ en: 'New' });
  });

  test('翻訳が無効なら保存済みの翻訳を維持する', async () => {
    mockIsGoogleTranslateEnabled.mockReturnValue(false);
    const currentTag = {
      name: 'Old',
      lang: 'ja',
      translations: [{ lang: 'en', name: 'Old' }],
    };

    const result = await resolveTagTranslations({
      currentTag,
      nextTag: { name: 'New', lang: 'ja' },
      userId: 'u1',
      targetLangs: ['en'],
    });

    expect(result).toEqual(currentTag.translations);
    expect(translationService.translateTag).not.toHaveBeenCalled();
  });

  test('翻訳を含むタグデータを生成する', async () => {
    translationService.translateTag
      .mockResolvedValueOnce({ en: 'One' })
      .mockResolvedValueOnce({ en: 'Two' });

    const rows = [{ name: 'First' }, { name: 'Second' }];
    const buildBaseDoc = jest.fn((row, idx) => ({ name: row.name, order: idx }));

    const result = await buildTranslatedTagDocs({
      rows,
      baseLang: 'ja',
      targetLangs: ['en'],
      userId: 'u1',
      buildBaseDoc,
    });

    expect(buildBaseDoc).toHaveBeenCalledWith(rows[0], 0);
    expect(buildBaseDoc).toHaveBeenCalledWith(rows[1], 1);
    expect(translationService.translateTag).toHaveBeenCalledWith('u1', { name: 'First', lang: 'ja' }, ['en']);
    expect(translationService.translateTag).toHaveBeenCalledWith('u1', { name: 'Second', lang: 'ja' }, ['en']);
    expect(result).toEqual([
      { name: 'First', order: 0, lang: 'ja', translations: { en: 'One' } },
      { name: 'Second', order: 1, lang: 'ja', translations: { en: 'Two' } },
    ]);
  });

  test('翻訳が無効なら外部サービスを呼ばず、翻訳を空にしてタグを作成する', async () => {
    mockIsGoogleTranslateEnabled.mockReturnValue(false);
    const Model = { create: jest.fn().mockResolvedValue({ _id: 'tag-1' }) };

    await createTranslatedTag({
      Model,
      data: { name: 'Tag', lang: 'ja' },
      userId: 'u1',
      targetLangs: ['en'],
    });

    expect(translationService.translateTag).not.toHaveBeenCalled();
    expect(Model.create).toHaveBeenCalledWith({ name: 'Tag', lang: 'ja', translations: [] });
  });

  test('通常のタグ更新では翻訳完了後のDB書込だけを参照整合性のロック内で行う', async () => {
    const updated = { _id: 'floor-tag-1', name: 'Updated' };
    const Model = {
      findOneAndUpdate: jest.fn().mockResolvedValue(updated),
    };
    mockWithAIAnalysisIntegrityLock.mockImplementation(async (task) => {
      expect(Model.findOneAndUpdate).not.toHaveBeenCalled();
      return task();
    });

    await expect(
      updateTranslatedTag({
        Model,
        filter: { _id: 'floor-tag-1' },
        currentTag: { name: 'Tag', lang: 'ja', translations: [] },
        order: 1,
        name: 'Updated',
        lang: 'ja',
        userId: 'user-1',
        targetLangs: [],
      })
    ).resolves.toBe(updated);

    expect(mockWithAIAnalysisIntegrityLock).toHaveBeenCalledTimes(1);
    expect(Model.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  test('翻訳が無効なら既存の翻訳を維持し、新規タグの翻訳を空にする', async () => {
    mockIsGoogleTranslateEnabled.mockReturnValue(false);
    const Model = {
      find: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue([
          { name: 'Existing', translations: [{ lang: 'en', name: 'Existing' }] },
        ]),
      })),
      bulkWrite: jest.fn().mockResolvedValue({}),
    };

    await reconcileTagsByName({
      Model,
      scope: { floor: 'f1' },
      userId: 'u1',
      tags: [
        { name: 'Existing', order: 1, translations: [] },
        { name: 'New', order: 2, translations: [] },
      ],
    });

    const operations = Model.bulkWrite.mock.calls[0][0];
    expect(operations[0].updateOne.update.$set).not.toHaveProperty('translations');
    expect(operations[0].updateOne.update.$setOnInsert.translations).toEqual([]);
    expect(operations[1].updateOne.update.$set).not.toHaveProperty('translations');
    expect(operations[1].updateOne.update.$setOnInsert.translations).toEqual([]);
  });

  test('親参照は新規タグだけへ保存し、既存の同名タグの参照や設定は上書きしない', async () => {
    const inheritancePlan = { type: 'floor', documents: [] };
    const inheritance = {
      prepare: jest.fn().mockResolvedValue(inheritancePlan),
      commit: jest.fn().mockResolvedValue([]),
      rollback: jest.fn(),
    };
    const Model = {
      modelName: 'FloorTag',
      find: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue([
          {
            _id: 'existing-id',
            name: 'Existing',
            source_category_tag: 'stored-parent',
            delete_flg: false,
          },
        ]),
      })),
      bulkWrite: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn(),
    };

    await reconcileTagsByName({
      Model,
      scope: { floor: 'floor-1' },
      userId: 'user-1',
      tags: [
        { name: 'Existing', order: 1, source_category_tag: 'different-parent' },
        { name: 'Inserted', order: 2, source_category_tag: 'insert-parent' },
      ],
      insertOnlyFields: ['source_category_tag'],
      inheritance,
    });

    const operations = Model.bulkWrite.mock.calls[0][0];
    expect(operations[0].updateOne.update.$set).not.toHaveProperty('source_category_tag');
    expect(operations[0].updateOne.update.$setOnInsert.source_category_tag).toBe(
      'different-parent'
    );
    expect(operations[1].updateOne.update.$set).not.toHaveProperty('source_category_tag');
    expect(operations[1].updateOne.update.$setOnInsert).toEqual(
      expect.objectContaining({ source_category_tag: 'insert-parent' })
    );
    expect(inheritance.prepare).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'Inserted',
        source_category_tag: 'insert-parent',
        user: 'user-1',
        _id: expect.anything(),
      }),
    ]);
    expect(inheritance.commit).toHaveBeenCalledWith(inheritancePlan);
  });

  test('設定の複製に失敗したら元のエラーを維持し、新規設定とタグだけを削除して戻す', async () => {
    const failure = new Error('inheritance failed');
    const inheritancePlan = {
      type: 'room',
      childTagIds: ['planned-id'],
      documents: [{ room_tag: 'planned-id' }],
    };
    const inheritance = {
      prepare: jest.fn().mockResolvedValue(inheritancePlan),
      commit: jest.fn().mockRejectedValue(failure),
      rollback: jest.fn().mockResolvedValue(undefined),
    };
    const Model = {
      modelName: 'FloorTag',
      find: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([{ _id: 'old', name: 'Old', delete_flg: false }]) })),
      bulkWrite: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };

    await expect(
      reconcileTagsByName({
        Model,
        scope: { floor: 'floor-1', room: 'room-1' },
        userId: 'user-1',
        tags: [{ name: 'Inserted', order: 1, source_floor_tag: 'floor-tag-1' }],
        insertOnlyFields: ['source_floor_tag'],
        inheritance,
      })
    ).rejects.toBe(failure);

    expect(Model.bulkWrite.mock.calls.flatMap(([items]) => items).some((operation) => operation.deleteMany)).toBe(false);
    expect(inheritance.rollback).toHaveBeenCalledWith(inheritancePlan);
    expect(Model.deleteMany).toHaveBeenCalledWith({
      _id: { $in: [expect.anything()] },
    });
  });

  test('ロック待機中に親タグ名が変わったら、初期化のタグ書込前に停止する', async () => {
    const conflict = Object.assign(new Error('renamed parent'), { code: 'CONFLICT' });
    const inheritance = {
      prepare: jest.fn().mockRejectedValue(conflict),
      commit: jest.fn(),
      rollback: jest.fn(),
    };
    const Model = {
      modelName: 'FloorTag',
      find: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })),
      bulkWrite: jest.fn(),
      deleteMany: jest.fn(),
    };

    await expect(
      reconcileTagsByName({
        Model,
        scope: { floor: 'floor-1' },
        userId: 'user-1',
        tags: [
          { name: 'Original tag', order: 1, source_category_tag: 'category-1' },
        ],
        insertOnlyFields: ['source_category_tag'],
        inheritance,
      })
    ).rejects.toBe(conflict);

    expect(Model.bulkWrite).not.toHaveBeenCalled();
    expect(inheritance.commit).not.toHaveBeenCalled();
    expect(Model.deleteMany).not.toHaveBeenCalled();
  });

  test('有効な一覧から除外するフロアタグの参照を一括更新前に確認する', async () => {
    const Model = {
      modelName: 'FloorTag',
      find: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue([
          { _id: 'keep-id', name: 'Keep', delete_flg: false },
          { _id: 'remove-id', name: 'Remove', delete_flg: false },
        ]),
      })),
      bulkWrite: jest.fn().mockResolvedValue({}),
    };

    await reconcileTagsByName({
      Model,
      scope: { floor: 'floor-1' },
      userId: 'user-1',
      tags: [{ name: 'Keep', order: 1, translations: [] }],
    });

    expect(mockAssertNoActiveAIAnalysisReferences).toHaveBeenCalledWith(
      'floor-tag',
      'remove-id'
    );
    expect(Model.bulkWrite).toHaveBeenCalledTimes(1);
  });

  test('参照中フロアタグの物理削除はDB更新前に停止する', async () => {
    const Model = {
      modelName: 'FloorTag',
      findOne: jest.fn().mockResolvedValue({ _id: 'floor-tag-1' }),
      findOneAndUpdate: jest.fn(),
    };
    mockAssertNoActiveAIAnalysisReferences.mockRejectedValue(
      new Error('referenced')
    );

    await expect(
      deleteTag({ Model, filter: { _id: 'floor-tag-1', delete_flg: false } })
    ).rejects.toThrow('referenced');

    expect(mockAssertNoActiveAIAnalysisReferences).toHaveBeenCalledWith(
      'floor-tag',
      'floor-tag-1'
    );
    expect(Model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('管理画面の更新では有効なタグの編集項目だけを更新する', async () => {
    const currentTag = { _id: 'room-tag-1', name: 'Tag', lang: 'ja', delete_flg: false };
    const Model = {
      modelName: 'RoomTag',
      findOne: jest.fn().mockResolvedValue(currentTag),
      findOneAndUpdate: jest.fn().mockResolvedValue({ _id: 'room-tag-1' }),
    };

    await updateManagedTag({
      Model,
      id: 'room-tag-1',
      order: 1,
      name: 'Tag',
      lang: 'ja',
      userId: 'user-1',
      targetLangs: [],
    });

    expect(mockAssertNoActiveAIAnalysisReferences).not.toHaveBeenCalled();
    expect(Model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'room-tag-1', delete_flg: false },
      expect.not.objectContaining({ delete_flg: expect.anything() }),
      expect.objectContaining({ new: true, runValidators: true })
    );
    const update = Model.findOneAndUpdate.mock.calls[0][1];
    expect(update).not.toHaveProperty('deleted_at');
  });

  test('削除済みまたは存在しないタグは管理画面から更新できない', async () => {
    const Model = { findOne: jest.fn().mockResolvedValue(null), findOneAndUpdate: jest.fn() };
    await expect(updateManagedTag({ Model, id: 'missing', throwIfMissing: true }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(Model.findOne).toHaveBeenCalledWith({ _id: 'missing', delete_flg: false });
    expect(Model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('管理画面の条件付き更新が競合したら再取得して409を返す', async () => {
    const currentTag = {
      _id: 'floor-tag-1',
      name: 'Tag',
      lang: 'ja',
      delete_flg: false,
    };
    const Model = {
      modelName: 'FloorTag',
      findOne: jest
        .fn()
        .mockResolvedValueOnce(currentTag)
        .mockResolvedValueOnce({ ...currentTag, delete_flg: true }),
      findOneAndUpdate: jest.fn().mockResolvedValue(null),
    };

    await expect(
      updateManagedTag({
        Model,
        id: currentTag._id,
        order: 1,
        name: 'Tag',
        lang: 'ja',
        userId: 'user-1',
        targetLangs: [],
        })
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });

    expect(Model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: currentTag._id, delete_flg: false },
      expect.not.objectContaining({ delete_flg: expect.anything() }),
      expect.objectContaining({ new: true, runValidators: true })
    );
    expect(Model.findOne).toHaveBeenCalledTimes(2);
  });

  test('未使用タグを物理削除し、応答はIDだけを返す', async () => {
    const Model = {
      modelName: 'FloorTag',
      findOne: jest.fn().mockResolvedValue({ _id: 'floor-tag-1', name: 'Current' }),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    await expect(deleteTag({ Model, id: 'floor-tag-1' })).resolves.toEqual({ _id: 'floor-tag-1' });
    expect(mockAssertNoActiveAIAnalysisReferences).toHaveBeenCalledWith('floor-tag', 'floor-tag-1');
    expect(Model.deleteOne).toHaveBeenCalledWith({ _id: 'floor-tag-1' });
  });

  test('削除対象が存在しなければ参照確認や削除を実行しない', async () => {
    const Model = { findOne: jest.fn().mockResolvedValue(null), deleteOne: jest.fn() };
    await expect(deleteTag({ Model, id: 'missing' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(Model.deleteOne).not.toHaveBeenCalled();
    expect(mockAssertNoActiveAIAnalysisReferences).not.toHaveBeenCalled();
  });

  test('確認後に別操作で削除された場合は404を返す', async () => {
    const Model = {
      modelName: 'FloorTag',
      findOne: jest.fn().mockResolvedValue({ _id: 'floor-tag-1' }),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    await expect(deleteTag({ Model, id: 'floor-tag-1' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
