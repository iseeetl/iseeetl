jest.mock('../../../../services/translation.service', () => ({
  translateQuickTextGroup: jest.fn(),
  translateQuickTextItem: jest.fn(),
}));
const mockIsGoogleTranslateEnabled = jest.fn(() => true);
jest.mock('../../../../config/featureFlags', () => ({
  isGoogleTranslateEnabled: mockIsGoogleTranslateEnabled,
}));

const translationService = require('../../../../services/translation.service');
const { buildQuickTextService } = require('../../../../services/_shared/quickTextService');

const buildOrderChain = (order) => {
  const chain = {
    sort: jest.fn(() => chain),
    select: jest.fn(() => chain),
    lean: jest.fn().mockResolvedValue(order == null ? null : { order }),
  };
  return chain;
};

const buildFindChain = (docs) => {
  const chain = {
    sort: jest.fn(() => chain),
    lean: jest.fn().mockResolvedValue(docs),
  };
  return chain;
};

describe('単語管理の共通処理', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleTranslateEnabled.mockReturnValue(true);
  });

  test('単語グループを翻訳して末尾の表示順で作成する', async () => {
    const groupModel = {
      findOne: jest.fn(() => buildOrderChain(2)),
      create: jest.fn().mockResolvedValue({ _id: 'g1' }),
    };
    const itemModel = {};
    translationService.translateQuickTextGroup.mockResolvedValue([{ lang: 'en', title: 't' }]);

    const service = buildQuickTextService({
      groupModel,
      itemModel,
      listContext: jest.fn(),
      mutationContext: jest.fn().mockResolvedValue({
        floor: { _id: 'f1', target_langs: ['en'] },
        user: { _id: 'u1' },
        room: { _id: 'r1' },
      }),
      buildGroupFilter: jest.fn(() => ({ floor: 'f1' })),
      buildItemFilter: jest.fn(() => ({ floor: 'f1' })),
    });

    await service.createGroup({ title: 'title', lang: 'ja' });

    expect(groupModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        floor: 'f1',
        user: 'u1',
        room: 'r1',
        order: 3,
        title: 'title',
        lang: 'ja',
        translations: [{ lang: 'en', title: 't' }],
      })
    );
  });

  test('翻訳が無効なら外部サービスを呼ばず、翻訳を空にして単語グループを作成する', async () => {
    mockIsGoogleTranslateEnabled.mockReturnValue(false);
    const groupModel = {
      findOne: jest.fn(() => buildOrderChain(null)),
      create: jest.fn().mockResolvedValue({ _id: 'g1' }),
    };
    const service = buildQuickTextService({
      groupModel,
      itemModel: {},
      listContext: jest.fn(),
      mutationContext: jest.fn().mockResolvedValue({
        floor: { _id: 'f1', target_langs: ['en'] },
        user: { _id: 'u1' },
      }),
      buildGroupFilter: jest.fn(() => ({ floor: 'f1' })),
      buildItemFilter: jest.fn(() => ({ floor: 'f1' })),
    });

    await service.createGroup({ title: 'title', lang: 'ja' });

    expect(translationService.translateQuickTextGroup).not.toHaveBeenCalled();
    expect(groupModel.create).toHaveBeenCalledWith(expect.objectContaining({ translations: [] }));
  });

  test('翻訳が無効なら保存済みの翻訳を維持して単語グループを更新する', async () => {
    mockIsGoogleTranslateEnabled.mockReturnValue(false);
    const groupModel = {
      findOne: jest.fn().mockResolvedValue({
        _id: 'g1',
        title: 'old',
        lang: 'ja',
        translations: [{ lang: 'en', title: 'Old' }],
      }),
      findByIdAndUpdate: jest.fn().mockResolvedValue({ _id: 'g1', title: 'new' }),
    };
    const service = buildQuickTextService({
      groupModel,
      itemModel: {},
      listContext: jest.fn(),
      mutationContext: jest.fn().mockResolvedValue({
        floor: { _id: 'f1', target_langs: ['en'] },
        user: { _id: 'u1' },
      }),
      buildGroupFilter: jest.fn(() => ({ floor: 'f1' })),
      buildItemFilter: jest.fn(() => ({ floor: 'f1' })),
    });

    await service.updateGroup({ id: 'g1', title: 'new' });

    expect(translationService.translateQuickTextGroup).not.toHaveBeenCalled();
    expect(groupModel.findByIdAndUpdate.mock.calls[0][1]).toEqual({ title: 'new' });
  });

  test('所属を確認して対象の単語グループ配下の単語だけを削除する', async () => {
    const groupModel = {
      findOne: jest.fn().mockResolvedValue({ _id: 'g1' }),
      findOneAndDelete: jest.fn().mockResolvedValue({ _id: 'g1' }),
    };
    const itemModel = { deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }) };

    const service = buildQuickTextService({
      groupModel,
      itemModel,
      listContext: jest.fn(),
      mutationContext: jest.fn(),
      buildGroupFilter: jest.fn(() => ({ floor: 'f1' })),
      buildItemFilter: jest.fn(() => ({ floor: 'f1' })),
    });

    await expect(service.deleteGroup({ id: 'g1' })).resolves.toEqual({ ok: true, deletedGroupId: 'g1' });

    expect(groupModel.findOne).toHaveBeenCalledWith({ _id: 'g1', floor: 'f1' });
    expect(itemModel.deleteMany).toHaveBeenCalledWith({ floor: 'f1', group: 'g1' });
    expect(groupModel.findOneAndDelete).toHaveBeenCalledWith({ _id: 'g1', floor: 'f1' });
    expect(groupModel.findOne.mock.invocationCallOrder[0]).toBeLessThan(
      itemModel.deleteMany.mock.invocationCallOrder[0]
    );
  });

  test('対象の所属先に単語グループがなければ単語を削除しない', async () => {
    const groupModel = {
      findOne: jest.fn().mockResolvedValue(null),
      findOneAndDelete: jest.fn().mockResolvedValue(null),
    };
    const itemModel = { deleteMany: jest.fn().mockResolvedValue({}) };

    const service = buildQuickTextService({
      groupModel,
      itemModel,
      listContext: jest.fn(),
      mutationContext: jest.fn(),
      buildGroupFilter: jest.fn(() => ({ floor: 'f1' })),
      buildItemFilter: jest.fn(() => ({ floor: 'f1' })),
    });

    await expect(service.deleteGroup({ id: 'g1' })).rejects.toMatchObject({ status: 404 });

    expect(groupModel.findOne).toHaveBeenCalledWith({ _id: 'g1', floor: 'f1' });
    expect(itemModel.deleteMany).not.toHaveBeenCalled();
    expect(groupModel.findOneAndDelete).not.toHaveBeenCalled();
  });

  test('言語による絞り込みが有効なら単語一覧へ適用する', async () => {
    const groupModel = {
      exists: jest.fn().mockResolvedValue(true),
    };
    const itemModel = {
      find: jest.fn(() => buildFindChain([{ _id: 'i1' }])),
    };

    const service = buildQuickTextService({
      groupModel,
      itemModel,
      listContext: jest.fn(),
      mutationContext: jest.fn(),
      buildGroupFilter: jest.fn(() => ({ floor: 'f1' })),
      buildItemFilter: jest.fn(() => ({ floor: 'f1', group: 'g1' })),
      allowLangFilter: true,
    });

    const res = await service.listItems({ groupId: 'g1', lang: 'en' });

    expect(itemModel.find).toHaveBeenCalledWith({ floor: 'f1', group: 'g1', lang: 'en' });
    expect(res).toEqual([{ _id: 'i1' }]);
  });

  test('単語のラベルが変わった場合は翻訳する', async () => {
    const groupModel = {};
    const itemModel = {
      findOne: jest.fn().mockResolvedValue({ _id: 'i1', label: 'old', lang: 'ja' }),
      findByIdAndUpdate: jest.fn().mockResolvedValue({ _id: 'i1', label: 'new' }),
    };
    translationService.translateQuickTextItem.mockResolvedValue([{ lang: 'en', label: 'new' }]);

    const service = buildQuickTextService({
      groupModel,
      itemModel,
      listContext: jest.fn(),
      mutationContext: jest.fn().mockResolvedValue({
        floor: { _id: 'f1', target_langs: ['en'] },
        user: { _id: 'u1' },
      }),
      buildGroupFilter: jest.fn(() => ({ floor: 'f1' })),
      buildItemFilter: jest.fn(() => ({ floor: 'f1' })),
    });

    const res = await service.updateItem({ id: 'i1', label: 'new' });

    expect(translationService.translateQuickTextItem).toHaveBeenCalledWith('u1', { label: 'new', lang: 'ja' }, ['en']);
    expect(itemModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'i1',
      expect.objectContaining({ label: 'new', translations: [{ lang: 'en', label: 'new' }] }),
      { new: true, runValidators: true }
    );
    expect(res).toEqual({ _id: 'i1', label: 'new' });
  });

  test('翻訳が無効なら保存済みの翻訳を維持して単語を更新する', async () => {
    mockIsGoogleTranslateEnabled.mockReturnValue(false);
    const itemModel = {
      findOne: jest.fn().mockResolvedValue({
        _id: 'i1',
        label: 'old',
        lang: 'ja',
        translations: [{ lang: 'en', label: 'Old' }],
      }),
      findByIdAndUpdate: jest.fn().mockResolvedValue({ _id: 'i1', label: 'new' }),
    };
    const service = buildQuickTextService({
      groupModel: {},
      itemModel,
      listContext: jest.fn(),
      mutationContext: jest.fn().mockResolvedValue({
        floor: { _id: 'f1', target_langs: ['en'] },
        user: { _id: 'u1' },
      }),
      buildGroupFilter: jest.fn(() => ({ floor: 'f1' })),
      buildItemFilter: jest.fn(() => ({ floor: 'f1' })),
    });

    await service.updateItem({ id: 'i1', label: 'new' });

    expect(translationService.translateQuickTextItem).not.toHaveBeenCalled();
    expect(itemModel.findByIdAndUpdate.mock.calls[0][1]).toEqual({ label: 'new' });
  });
});
