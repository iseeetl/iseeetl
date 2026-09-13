const mockAIAnalysisSetting = {
  aggregate: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  deleteOne: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
};
const mockFloorAIAnalysisSetting = {
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  deleteOne: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
};
const mockRoomAIAnalysisSetting = {
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  deleteOne: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
};
const mockCategoryTag = { collection: { name: 'categorytags' }, findOne: jest.fn() };
const mockFloorTag = { findOne: jest.fn() };
const mockRoomTag = { findOne: jest.fn() };
const mockUser = { collection: { name: 'users' }, find: jest.fn(), findOne: jest.fn() };

const mockFindActiveFloor = jest.fn();
const mockFindActiveRoom = jest.fn();
const mockFindActiveUser = jest.fn();
const mockIsAdminOrCreator = jest.fn();
const mockRequireAdminUser = jest.fn();
const mockAssertNoActiveAIAnalysisReferences = jest.fn();
const mockWithAIAnalysisIntegrityLock = jest.fn((task) => task());
const mockWithKeyedLocks = jest.fn((_keys, task) => task());

jest.mock('../../../../../models/AIAnalysisSetting', () => mockAIAnalysisSetting);
jest.mock('../../../../../models/FloorAIAnalysisSetting', () => mockFloorAIAnalysisSetting);
jest.mock('../../../../../models/RoomAIAnalysisSetting', () => mockRoomAIAnalysisSetting);
jest.mock('../../../../../models/CategoryTag', () => mockCategoryTag);
jest.mock('../../../../../models/FloorTag', () => mockFloorTag);
jest.mock('../../../../../models/RoomTag', () => mockRoomTag);
jest.mock('../../../../../models/User', () => mockUser);
jest.mock('../../../../../services/_shared/activeResource', () => ({
  findActiveFloor: mockFindActiveFloor,
  findActiveRoom: mockFindActiveRoom,
  findActiveUser: mockFindActiveUser,
}));
jest.mock('../../../../../services/_shared/floorAccess', () => ({
  isAdminOrCreator: mockIsAdminOrCreator,
}));
jest.mock('../../../../../services/_shared/memberHelpers', () => ({
  requireAdminUser: mockRequireAdminUser,
}));
jest.mock('../../../../../services/analysis/settings/referenceIntegrity', () => ({
  assertNoActiveAIAnalysisReferences: mockAssertNoActiveAIAnalysisReferences,
  parentKey: (type, tagId, kind) => `parent:${type}:${tagId}:${kind}`,
  referenceKey: (type, id) => `reference:${type}:${id}`,
  scopeKey: (type, id = 'global') => `scope:${type}:${id}`,
  withAIAnalysisIntegrityLock: mockWithAIAnalysisIntegrityLock,
}));
jest.mock('../../../../../utils/keyedLock', () => ({
  withKeyedLocks: mockWithKeyedLocks,
}));

const ROLES = require('../../../../../constants/roles');
const settingService = require('../../../../../services/analysis/settings/setting.service');

const queryResult = (value) => {
  const promise = Promise.resolve(value);
  const query = {
    lean: jest.fn(() => Promise.resolve(value)),
    limit: jest.fn(() => query),
    populate: jest.fn(() => query),
    select: jest.fn(() => query),
    sort: jest.fn(() => query),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
  return query;
};

const aggregateResult = (value) => {
  const aggregate = {
    collation: jest.fn().mockResolvedValue(value),
  };
  mockAIAnalysisSetting.aggregate.mockReturnValue(aggregate);
  return aggregate;
};

const admin = { _id: 'admin-1', role: ROLES.ADMINISTRATOR };
const editor = { _id: 'editor-1', role: ROLES.EDITOR };
const jwt = { user_id: 'actor-1' };

const commonPopulated = (overrides = {}) => ({
  _id: 'setting-1',
  category_tag: {
    _id: 'category-1',
    name: '画像',
    translations: [{ lang: 'en', name: 'Image' }],
    delete_flg: false,
  },
  analysis_kind: 'vision',
  additional_prompt: '',
  result_user: {
    _id: 'result-user-1',
    username: 'result-user',
    image_name: 'avatar.png',
    mail: 'hidden@example.test',
    delete_flg: false,
  },
  revision: 1,
  delete_flg: false,
  user: 'admin-1',
  updated_by: 'admin-1',
  internal_ai_meta: { provider: 'hidden' },
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-02T00:00:00.000Z'),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockWithAIAnalysisIntegrityLock.mockImplementation((task) => task());
  mockWithKeyedLocks.mockImplementation((_keys, task) => task());
  mockRequireAdminUser.mockResolvedValue(admin);
  mockFindActiveUser.mockResolvedValue(admin);
  mockFindActiveFloor.mockResolvedValue({ _id: 'floor-1', user: 'editor-1' });
  mockFindActiveRoom.mockResolvedValue({ _id: 'room-1', floor: 'floor-1' });
  mockIsAdminOrCreator.mockImplementation(
    (role, ownerId, actorId) =>
      role === ROLES.ADMINISTRATOR ||
      (role === ROLES.EDITOR && String(ownerId) === String(actorId))
  );
  mockAssertNoActiveAIAnalysisReferences.mockResolvedValue();
  mockAIAnalysisSetting.countDocuments.mockResolvedValue(0);
  mockFloorAIAnalysisSetting.countDocuments.mockResolvedValue(0);
  mockRoomAIAnalysisSetting.countDocuments.mockResolvedValue(0);
});

describe('AI解析設定の応答データ生成', () => {
  test('共通設定の公開項目だけを返す', () => {
    expect(settingService.serializeSetting(commonPopulated(), 'common')).toEqual({
      _id: 'setting-1',
      scope: 'category_tag',
      tag: {
        _id: 'category-1',
        name: '画像',
        lang: null,
        translations: [{ lang: 'en', name: 'Image' }],
      },
      analysis_kind: 'vision',
      additional_prompt: '',
      result_user: {
        _id: 'result-user-1',
        username: 'result-user',
        image_name: 'avatar.png',
      },
      revision: 1,
    });
  });

  test('フロアとルームの設定には必要最小限の所属先と複製元の情報だけを含める', () => {
    const floor = settingService.serializeSetting(
      {
        ...commonPopulated(),
        floor: 'floor-1',
        floor_tag: { _id: 'floor-tag-1', name: 'Floor image', lang: 'en' },
        source_master_setting: 'master-setting-1',
        source_master_revision: 4,
      },
      'floor'
    );
    const room = settingService.serializeSetting(
      {
        ...commonPopulated(),
        floor: 'floor-1',
        room: 'room-1',
        room_tag: { _id: 'room-tag-1', name: 'Room image', lang: 'en' },
        source_floor_setting: 'floor-setting-1',
        source_floor_revision: 7,
      },
      'room'
    );

    expect(floor).toEqual(
      expect.objectContaining({
        scope: 'floor',
        floor: 'floor-1',
        source: { setting_id: 'master-setting-1', revision: 4 },
      })
    );
    expect(room).toEqual(
      expect.objectContaining({
        scope: 'room',
        floor: 'floor-1',
        room: 'room-1',
        source: { setting_id: 'floor-setting-1', revision: 7 },
      })
    );
    expect(floor).not.toHaveProperty('source_master_setting');
    expect(room).not.toHaveProperty('source_floor_setting');
    expect(floor.result_user).not.toHaveProperty('mail');
  });

  test('参照先が存在しなければ空のIDで返す', () => {
    expect(
      settingService.serializeSetting(
        commonPopulated({ category_tag: {}, result_user: {} }),
        'common'
      )
    ).toEqual(
      expect.objectContaining({
        tag: { _id: '' },
        result_user: { _id: '' },
      })
    );
  });

  test('_idの取得が自身を返すMongooseのObjectIdを変換できる', () => {
    const objectId = {
      toHexString: () => '507f1f77bcf86cd799439011',
    };
    Object.defineProperty(objectId, '_id', {
      get: () => objectId,
    });

    expect(
      settingService.serializeSetting(
        commonPopulated({ _id: objectId }),
        'common'
      )._id
    ).toBe('507f1f77bcf86cd799439011');
  });
});

describe('共通のAI解析設定', () => {
  test('1回のDB集計で絞り込み・検索・並べ替え・件数取得・ページ切替を行う', async () => {
    const aggregate = aggregateResult([
      {
        docs: [commonPopulated({ _id: 'setting-11' })],
        metadata: [{ total: 12 }],
      },
    ]);

    await expect(
      settingService.paginateCommon(
        { page: 2, search: 'Image.+' },
        jwt
      )
    ).resolves.toEqual({
      docs: [
        expect.objectContaining({
          _id: 'setting-11',
          tag: expect.objectContaining({ name: '画像', delete_flg: false }),
          result_user: expect.objectContaining({ username: 'result-user', delete_flg: false }),
        }),
      ],
      total: 12,
      limit: 10,
      pages: 2,
      page: 2,
      pagingCounter: 11,
      hasPrevPage: true,
      hasNextPage: false,
      prevPage: 1,
      nextPage: null,
    });

    expect(mockRequireAdminUser).toHaveBeenCalledWith('actor-1');
    expect(mockAIAnalysisSetting.find).not.toHaveBeenCalled();
    expect(aggregate.collation).toHaveBeenCalledWith({ locale: 'ja' });

    const pipeline = mockAIAnalysisSetting.aggregate.mock.calls[0][0];
    expect(pipeline[0]).toEqual({ $match: { delete_flg: false } });
    expect(pipeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          $lookup: expect.objectContaining({ from: 'categorytags', as: 'category_tag' }),
        }),
        expect.objectContaining({
          $lookup: expect.objectContaining({ from: 'users', as: 'result_user' }),
        }),
        { $sort: { 'category_tag.name': 1, analysis_kind: 1, _id: 1 } },
        {
          $facet: {
            docs: [{ $skip: 10 }, { $limit: 10 }],
            metadata: [{ $count: 'total' }],
          },
        },
      ])
    );
    const project = pipeline.find((stage) => stage.$project).$project;
    expect(project.category_tag.delete_flg).toBe('$category_tag.delete_flg');
    expect(project.result_user.delete_flg).toBe('$result_user.delete_flg');
    const searchStage = pipeline.find((stage) => stage.$match?.$or);
    expect(searchStage.$match.$or.map((condition) => Object.keys(condition)[0])).toEqual([
      'category_tag.name',
      'category_tag.translations.name',
      'analysis_kind',
      'result_user.username',
    ]);
    for (const condition of searchStage.$match.$or) {
      const matcher = Object.values(condition)[0].$regex;
      expect(matcher).toBeInstanceOf(RegExp);
      expect(matcher.source).toBe(/Image\.\+/i.source);
      expect(matcher.flags).toContain('i');
    }
  });

  test('検索語が未指定でも旧版の削除済み設定を除外し、空の一覧のページ情報を返す', async () => {
    aggregateResult([{ docs: [], metadata: [] }]);

    await expect(
      settingService.paginateCommon({ page: 1, search: '' }, jwt)
    ).resolves.toEqual({
      docs: [],
      total: 0,
      limit: 10,
      pages: 1,
      page: 1,
      pagingCounter: 1,
      hasPrevPage: false,
      hasNextPage: false,
      prevPage: null,
      nextPage: null,
    });

    const pipeline = mockAIAnalysisSetting.aggregate.mock.calls[0][0];
    expect(pipeline.filter((stage) => stage.$match)).toEqual([
      { $match: { delete_flg: false } },
    ]);
    expect(pipeline.at(-1)).toEqual({
      $facet: {
        docs: [{ $skip: 0 }, { $limit: 10 }],
        metadata: [{ $count: 'total' }],
      },
    });
  });

  test('解析結果ユーザの検索では有効な候補を件数で制限せず、所定の順序で返す', async () => {
    const users = [
      { _id: 'user-1', username: 'Result A', image_name: null },
      { _id: 'user-2', username: 'Result B', image_name: 'avatar.png' },
    ];
    const query = queryResult(users);
    mockUser.find.mockReturnValue(query);

    await expect(settingService.searchResultUsers({ search: 'Result' }, jwt)).resolves.toEqual(users);

    expect(mockUser.find).toHaveBeenCalledWith({
      delete_flg: false,
      username: { $regex: 'Result', $options: 'i' },
    });
    expect(query.select).toHaveBeenCalledWith('_id username image_name');
    expect(query.sort).toHaveBeenCalledWith({ username: 1, _id: 1 });
    expect(query.limit).not.toHaveBeenCalled();
  });

  test('所属先を指定した結果ユーザ検索は対象フロアを作成した編集ユーザだけに許可する', async () => {
    const users = [{ _id: 'user-1', username: 'Result A', image_name: null }];
    const query = queryResult(users);
    mockFindActiveUser.mockResolvedValue(editor);
    mockFindActiveFloor.mockResolvedValue({ _id: 'floor-1', user: 'editor-1' });
    mockUser.find.mockReturnValue(query);

    await expect(
      settingService.searchScopedResultUsers(
        'floor',
        { floor_id: 'floor-1', search: 'Result' },
        jwt
      )
    ).resolves.toEqual(users);

    expect(mockIsAdminOrCreator).toHaveBeenCalledWith(
      ROLES.EDITOR,
      'editor-1',
      'editor-1'
    );
    expect(mockUser.find).toHaveBeenCalledWith({
      delete_flg: false,
      username: { $regex: 'Result', $options: 'i' },
    });

    jest.clearAllMocks();
    mockFindActiveUser.mockResolvedValue(editor);
    mockFindActiveFloor.mockResolvedValue({ _id: 'floor-1', user: 'other-editor' });
    mockIsAdminOrCreator.mockReturnValue(false);

    await expect(
      settingService.searchScopedResultUsers(
        'floor',
        { floor_id: 'floor-1', search: '' },
        jwt
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    expect(mockUser.find).not.toHaveBeenCalled();
  });

  test('管理者は有効なタグと結果ユーザを指定してリビジョン1の設定を作成できる', async () => {
    mockCategoryTag.findOne.mockReturnValue(
      queryResult({ _id: 'category-1', name: '画像', translations: [], delete_flg: false })
    );
    mockUser.findOne.mockReturnValue(
      queryResult({ _id: 'result-user-1', username: 'result-user', image_name: null })
    );
    mockAIAnalysisSetting.create.mockResolvedValue({ _id: 'setting-1' });
    mockAIAnalysisSetting.findById.mockReturnValue(queryResult(commonPopulated()));

    const result = await settingService.createCommon(
      {
        category_tag: 'category-1',
        analysis_kind: 'vision',
        additional_prompt: 'describe briefly',
        result_user: 'result-user-1',
      },
      jwt
    );

    expect(mockRequireAdminUser).toHaveBeenCalledWith('actor-1');
    expect(mockAIAnalysisSetting.countDocuments).toHaveBeenCalledWith({ delete_flg: false });
    expect(mockAIAnalysisSetting.create).toHaveBeenCalledWith({
      category_tag: 'category-1',
      analysis_kind: 'vision',
      additional_prompt: 'describe briefly',
      result_user: 'result-user-1',
      revision: 1,
      user: 'admin-1',
      updated_by: 'admin-1',
    });
    expect(result._id).toBe('setting-1');
  });

  test('有効な共通設定が100件なら追加を拒否する', async () => {
    mockCategoryTag.findOne.mockReturnValue(
      queryResult({ _id: 'category-1', name: '画像', translations: [], delete_flg: false })
    );
    mockUser.findOne.mockReturnValue(queryResult({ _id: 'result-user-1' }));
    mockAIAnalysisSetting.countDocuments.mockResolvedValue(100);

    await expect(
      settingService.createCommon(
        {
          category_tag: 'category-1',
          analysis_kind: 'vision',
          additional_prompt: '',
          result_user: 'result-user-1',
        },
        jwt
      )
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
    expect(mockAIAnalysisSetting.create).not.toHaveBeenCalled();
  });

  test('更新条件にリビジョンの一致を要求し、旧版の削除済み設定を除外する', async () => {
    const current = commonPopulated({
      category_tag: 'category-1',
      result_user: 'result-user-1',
    });
    mockAIAnalysisSetting.findOne.mockReturnValue(queryResult(current));
    mockCategoryTag.findOne.mockReturnValue(
      queryResult({ _id: 'category-2', name: '音声', translations: [], delete_flg: false })
    );
    mockUser.findOne.mockReturnValue(queryResult({ _id: 'result-user-2' }));
    mockAIAnalysisSetting.findOneAndUpdate.mockResolvedValue(null);

    await expect(
      settingService.updateCommon(
        {
          _id: 'setting-1',
          category_tag: 'category-2',
          analysis_kind: 'speech',
          additional_prompt: '',
          result_user: 'result-user-2',
          revision: 9,
        },
        jwt
      )
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });

    expect(mockAIAnalysisSetting.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'setting-1', revision: 9, delete_flg: false },
      expect.objectContaining({ $inc: { revision: 1 } }),
      { new: true, runValidators: true }
    );
  });

  test('リビジョンを安全に増加できなければ更新を拒否する', async () => {
    mockAIAnalysisSetting.findOne.mockReturnValue(
      queryResult(
        commonPopulated({
          category_tag: 'category-1',
          result_user: 'result-user-1',
          revision: Number.MAX_SAFE_INTEGER,
        })
      )
    );

    await expect(
      settingService.updateCommon(
        {
          _id: 'setting-1',
          category_tag: 'category-1',
          analysis_kind: 'vision',
          additional_prompt: '',
          result_user: 'result-user-1',
          revision: Number.MAX_SAFE_INTEGER,
        },
        jwt
      )
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });

    expect(mockAIAnalysisSetting.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('フロアとルームのAI解析設定', () => {
  const floorTag = {
    _id: 'floor-tag-1',
    floor: 'floor-1',
    name: '画像',
    translations: [],
    source_category_tag: 'category-1',
    delete_flg: false,
  };
  const roomTag = {
    _id: 'room-tag-1',
    floor: 'floor-1',
    room: 'room-1',
    name: '画像',
    translations: [],
    source_floor_tag: 'floor-tag-1',
    delete_flg: false,
  };

  test.each([
    {
      type: 'floor',
      body: { floor_id: 'floor-1', include_deleted: true },
      Model: mockFloorAIAnalysisSetting,
      filter: { floor: 'floor-1', delete_flg: false },
      setting: {
        ...commonPopulated({ _id: 'floor-setting-1' }),
        floor: 'floor-1',
        floor_tag: floorTag,
        source_master_setting: null,
        source_master_revision: null,
      },
    },
    {
      type: 'room',
      body: { floor_id: 'floor-1', room_id: 'room-1', include_deleted: true },
      Model: mockRoomAIAnalysisSetting,
      filter: { room: 'room-1', delete_flg: false },
      setting: {
        ...commonPopulated({ _id: 'room-setting-1' }),
        floor: 'floor-1',
        room: 'room-1',
        room_tag: roomTag,
        source_floor_setting: null,
        source_floor_revision: null,
      },
    },
  ])('$typeの一覧は削除済みを指定しても有効な設定だけを取得する', async ({
    type,
    body,
    Model,
    filter,
    setting,
  }) => {
    Model.find.mockReturnValue(queryResult([setting]));

    const result = await settingService.listScoped(type, body, jwt);

    expect(Model.find).toHaveBeenCalledWith(filter);
    expect(result).toEqual([
      expect.objectContaining({
        _id: setting._id,
        scope: type,
      }),
    ]);
  });

  test('フロアを作成した編集ユーザは結果ユーザを明示して独立した設定を作成できる', async () => {
    mockFindActiveUser.mockResolvedValue(editor);
    mockFindActiveFloor.mockResolvedValue({ _id: 'floor-1', user: 'editor-1' });
    mockFloorTag.findOne.mockReturnValue(
      queryResult({ ...floorTag, source_category_tag: null })
    );
    mockUser.findOne.mockReturnValue(
      queryResult({ _id: 'selected-user-1', username: 'selected', image_name: null })
    );
    mockFloorAIAnalysisSetting.create.mockResolvedValue({ _id: 'floor-setting-1' });
    mockFloorAIAnalysisSetting.findById.mockReturnValue(
      queryResult({
        ...commonPopulated({
          _id: 'floor-setting-1',
          result_user: {
            _id: 'selected-user-1',
            username: 'selected',
            image_name: null,
          },
        }),
        floor: 'floor-1',
        floor_tag: floorTag,
        source_master_setting: null,
        source_master_revision: null,
      })
    );

    await settingService.createFloor(
      {
        floor_id: 'floor-1',
        floor_tag: 'floor-tag-1',
        analysis_kind: 'vision',
        additional_prompt: '',
        result_user: 'selected-user-1',
      },
      jwt
    );

    expect(mockFloorAIAnalysisSetting.create).toHaveBeenCalledWith(
      expect.objectContaining({
        floor: 'floor-1',
        floor_tag: 'floor-tag-1',
        result_user: 'selected-user-1',
        source_master_setting: null,
        source_master_revision: null,
        revision: 1,
      })
    );
    expect(mockFloorAIAnalysisSetting.countDocuments).toHaveBeenCalledWith({
      floor: 'floor-1',
      delete_flg: false,
    });
  });

  test('編集ユーザは有効な結果ユーザを指定しなければ設定を作成できない', async () => {
    mockFindActiveUser.mockResolvedValue(editor);
    mockFindActiveFloor.mockResolvedValue({ _id: 'floor-1', user: 'editor-1' });
    mockFloorTag.findOne.mockReturnValue(
      queryResult({
        ...floorTag,
        source_category_tag: null,
      })
    );
    mockUser.findOne.mockReturnValue(queryResult(null));

    await expect(
      settingService.createFloor(
        {
          floor_id: 'floor-1',
          floor_tag: 'floor-tag-1',
          analysis_kind: 'vision',
          additional_prompt: '',
        },
        jwt
      )
    ).rejects.toMatchObject({ code: 'INVALID_PARAMS', status: 400 });
    expect(mockFloorAIAnalysisSetting.create).not.toHaveBeenCalled();
  });

  test('編集ユーザによる設定作成は複製元の共通タグに依存しない', async () => {
    mockFindActiveUser.mockResolvedValue(editor);
    mockFindActiveFloor.mockResolvedValue({ _id: 'floor-1', user: 'editor-1' });
    mockFloorTag.findOne.mockReturnValue(queryResult(floorTag));
    mockUser.findOne.mockReturnValue(queryResult({ _id: 'selected-user-1' }));
    mockFloorAIAnalysisSetting.create.mockResolvedValue({ _id: 'floor-setting-1' });
    mockFloorAIAnalysisSetting.findById.mockReturnValue(
      queryResult({
        ...commonPopulated({ _id: 'floor-setting-1' }),
        floor: 'floor-1',
        floor_tag: floorTag,
        source_master_setting: null,
        source_master_revision: null,
      })
    );

    await expect(
      settingService.createFloor(
        {
          floor_id: 'floor-1',
          floor_tag: 'floor-tag-1',
          analysis_kind: 'vision',
          additional_prompt: '',
          result_user: 'selected-user-1',
        },
        jwt
      )
    ).resolves.toMatchObject({ source: null });

    expect(mockCategoryTag.findOne).not.toHaveBeenCalled();
    expect(mockAIAnalysisSetting.findOne).not.toHaveBeenCalled();
  });

  test('編集ユーザは削除済みまたは存在しない結果ユーザで設定を作成できない', async () => {
    mockFindActiveUser.mockResolvedValue(editor);
    mockFindActiveFloor.mockResolvedValue({ _id: 'floor-1', user: 'editor-1' });
    mockFloorTag.findOne.mockReturnValue(queryResult(floorTag));
    mockUser.findOne.mockReturnValue(queryResult(null));

    await expect(
      settingService.createFloor(
        {
          floor_id: 'floor-1',
          floor_tag: 'floor-tag-1',
          analysis_kind: 'vision',
          additional_prompt: '',
          result_user: 'deleted-user',
        },
        jwt
      )
    ).rejects.toMatchObject({ code: 'INVALID_PARAMS', status: 400 });
    expect(mockFloorAIAnalysisSetting.create).not.toHaveBeenCalled();
  });

  test('フロアを作成していない編集ユーザの操作を拒否する', async () => {
    mockFindActiveUser.mockResolvedValue(editor);
    mockFindActiveFloor.mockResolvedValue({ _id: 'floor-1', user: 'other-editor' });

    await expect(
      settingService.createFloor(
        {
          floor_id: 'floor-1',
          floor_tag: 'floor-tag-1',
          analysis_kind: 'vision',
          additional_prompt: '',
        },
        jwt
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    expect(mockFloorTag.findOne).not.toHaveBeenCalled();
  });

  test('管理者は複製元のタグが削除済みまたは存在しなくても独立した設定を作成できる', async () => {
    mockFindActiveUser.mockResolvedValue(admin);
    mockFloorTag.findOne.mockReturnValue(queryResult(floorTag));
    mockUser.findOne.mockReturnValue(queryResult({ _id: 'admin-selected-user' }));
    mockFloorAIAnalysisSetting.create.mockResolvedValue({ _id: 'floor-setting-1' });
    mockFloorAIAnalysisSetting.findById.mockReturnValue(
      queryResult({
        ...commonPopulated({ _id: 'floor-setting-1' }),
        floor: 'floor-1',
        floor_tag: floorTag,
        source_master_setting: null,
        source_master_revision: null,
      })
    );

    await settingService.createFloor(
      {
        floor_id: 'floor-1',
        floor_tag: 'floor-tag-1',
        analysis_kind: 'vision',
        additional_prompt: 'admin prompt',
        result_user: 'admin-selected-user',
      },
      jwt
    );

    expect(mockFloorAIAnalysisSetting.create).toHaveBeenCalledWith(
      expect.objectContaining({
        result_user: 'admin-selected-user',
        source_master_setting: null,
        source_master_revision: null,
      })
    );
    expect(mockAIAnalysisSetting.findOne).not.toHaveBeenCalled();
  });

  test('ルーム設定もフロア編集ユーザが親設定なしで独立作成できる', async () => {
    mockFindActiveUser.mockResolvedValue(editor);
    mockRoomTag.findOne.mockReturnValue(queryResult(roomTag));
    mockUser.findOne.mockReturnValue(queryResult({ _id: 'selected-user-1' }));
    mockRoomAIAnalysisSetting.create.mockResolvedValue({ _id: 'room-setting-1' });
    mockRoomAIAnalysisSetting.findById.mockReturnValue(
      queryResult({
        ...commonPopulated({
          _id: 'room-setting-1',
          result_user: {
            _id: 'selected-user-1',
            username: 'selected',
            image_name: null,
          },
        }),
        floor: 'floor-1',
        room: 'room-1',
        room_tag: roomTag,
        source_floor_setting: null,
        source_floor_revision: null,
      })
    );

    await settingService.createRoom(
      {
        floor_id: 'floor-1',
        room_id: 'room-1',
        room_tag: 'room-tag-1',
        analysis_kind: 'vision',
        additional_prompt: '',
        result_user: 'selected-user-1',
      },
      jwt
    );

    expect(mockRoomAIAnalysisSetting.create).toHaveBeenCalledWith(
      expect.objectContaining({
        result_user: 'selected-user-1',
        source_floor_setting: null,
        source_floor_revision: null,
      })
    );
    expect(mockFloorTag.findOne).not.toHaveBeenCalled();
    expect(mockFloorAIAnalysisSetting.findOne).not.toHaveBeenCalled();
  });

  test('ルーム設定作成はresult_userがなければ拒否する', async () => {
    mockFindActiveUser.mockResolvedValue(editor);
    mockRoomTag.findOne.mockReturnValue(queryResult(roomTag));
    mockUser.findOne.mockReturnValue(queryResult(null));

    await expect(
      settingService.createRoom(
        {
          floor_id: 'floor-1',
          room_id: 'room-1',
          room_tag: 'room-tag-1',
          analysis_kind: 'vision',
          additional_prompt: '',
        },
        jwt
      )
    ).rejects.toMatchObject({ code: 'INVALID_PARAMS', status: 400 });

    expect(mockRoomAIAnalysisSetting.create).not.toHaveBeenCalled();
  });

  test('編集ユーザは結果ユーザを変更でき、複製元の情報は維持する', async () => {
    const current = {
      _id: 'floor-setting-1',
      floor: 'floor-1',
      floor_tag: 'floor-tag-1',
      analysis_kind: 'vision',
      additional_prompt: '',
      result_user: 'inherited-user-1',
      source_master_setting: 'master-setting-1',
      source_master_revision: 6,
      revision: 4,
      delete_flg: false,
    };
    mockFindActiveUser.mockResolvedValue(editor);
    mockFindActiveFloor.mockResolvedValue({ _id: 'floor-1', user: 'editor-1' });
    mockFloorAIAnalysisSetting.findById
      .mockReturnValueOnce(queryResult(current))
      .mockReturnValueOnce(
        queryResult({
          ...commonPopulated({ _id: 'floor-setting-1', revision: 5 }),
          floor: 'floor-1',
          floor_tag: { _id: 'floor-tag-2', name: '音声', translations: [] },
          source_master_setting: 'master-setting-1',
          source_master_revision: 6,
        })
      );
    mockFloorTag.findOne.mockReturnValue(
      queryResult({
        _id: 'floor-tag-2',
        floor: 'floor-1',
        name: '音声',
        translations: [],
        source_category_tag: null,
        delete_flg: false,
      })
    );
    mockUser.findOne.mockReturnValue(queryResult({ _id: 'selected-user-2' }));
    mockFloorAIAnalysisSetting.findOneAndUpdate.mockResolvedValue({ _id: 'floor-setting-1' });

    await settingService.updateScoped(
      'floor',
      {
        _id: 'floor-setting-1',
        floor_id: 'floor-1',
        floor_tag: 'floor-tag-2',
        analysis_kind: 'audioScene',
        additional_prompt: 'updated',
        result_user: 'selected-user-2',
        revision: 4,
      },
      jwt
    );

    expect(mockFloorAIAnalysisSetting.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'floor-setting-1', revision: 4, delete_flg: false },
      {
        $set: expect.objectContaining({
          floor_tag: 'floor-tag-2',
          analysis_kind: 'audioScene',
          result_user: 'selected-user-2',
        }),
        $inc: { revision: 1 },
      },
      { new: true, runValidators: true }
    );
    const update = mockFloorAIAnalysisSetting.findOneAndUpdate.mock.calls[0][1].$set;
    expect(update).not.toHaveProperty('source_master_setting');
    expect(update).not.toHaveProperty('source_master_revision');
  });

  test.each(['floor', 'room'])('%sの設定をリビジョンで競合確認して物理削除する', async (type) => {
    const Model = type === 'floor' ? mockFloorAIAnalysisSetting : mockRoomAIAnalysisSetting;
    const current = { _id: 'setting-1', floor: 'floor-1', room: 'room-1', revision: 4, delete_flg: false };
    Model.findById.mockReturnValue(queryResult(current));
    Model.deleteOne.mockResolvedValue({ deletedCount: 1 });
    await expect(settingService.deleteScoped(type, {
      _id: current._id, floor_id: 'floor-1', room_id: 'room-1', revision: 4,
    }, jwt)).resolves.toEqual({ _id: current._id });
    expect(Model.deleteOne).toHaveBeenCalledWith({ _id: current._id, revision: 4 });
    expect(Model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('リビジョン上限では設定更新を拒否するが物理削除はできる', async () => {
    const current = {
      _id: 'floor-setting-1',
      floor: 'floor-1',
      floor_tag: 'floor-tag-1',
      analysis_kind: 'vision',
      additional_prompt: '',
      result_user: 'result-user-1',
      source_master_setting: null,
      source_master_revision: null,
      revision: Number.MAX_SAFE_INTEGER,
      delete_flg: false,
    };
    mockFloorAIAnalysisSetting.findById.mockReturnValue(queryResult(current));

    await expect(
      settingService.updateScoped(
        'floor',
        {
          _id: current._id,
          floor_id: 'floor-1',
          floor_tag: 'floor-tag-1',
          analysis_kind: 'vision',
          additional_prompt: '',
          result_user: 'result-user-1',
          revision: Number.MAX_SAFE_INTEGER,
        },
        jwt
      )
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });

    mockFloorAIAnalysisSetting.deleteOne.mockResolvedValue({ deletedCount: 1 });
    await expect(
      settingService.deleteScoped(
        'floor',
        {
          _id: current._id,
          floor_id: 'floor-1',
          revision: Number.MAX_SAFE_INTEGER,
        },
        jwt
      )
    ).resolves.toEqual({ _id: current._id });

    expect(mockFloorAIAnalysisSetting.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('環境変数からの初期ユーザ取得', () => {
  const originalSupportUserId = process.env.SUPPORT_USER_ID;
  const supportUserId = '111111111111111111111111';

  afterEach(() => {
    if (originalSupportUserId === undefined) delete process.env.SUPPORT_USER_ID;
    else process.env.SUPPORT_USER_ID = originalSupportUserId;
  });

  test.each([undefined, '', '   ', 'invalid-id', 'abcdefghijklmnopqrstuvwx'])(
    '未設定・不正なID（%s）はユーザを問い合わせず空欄とする', async (value) => {
      if (value === undefined) delete process.env.SUPPORT_USER_ID;
      else process.env.SUPPORT_USER_ID = value;
      await expect(settingService.getDefaultResultUser(jwt)).resolves.toBeNull();
      expect(mockRequireAdminUser).toHaveBeenCalledWith(jwt.user_id);
      expect(mockUser.findOne).not.toHaveBeenCalled();
    }
  );

  test('前後の空白を除いたIDで有効なユーザを取得し、公開項目だけを返す', async () => {
    process.env.SUPPORT_USER_ID = `  ${supportUserId}  `;
    mockUser.findOne.mockReturnValue(queryResult({
      _id: supportUserId, username: 'Support', mail: 'private@example.test', role: ROLES.ADMINISTRATOR,
    }));
    await expect(settingService.getDefaultResultUser(jwt)).resolves.toEqual({
      _id: supportUserId, username: 'Support', image_name: null,
    });
    expect(mockUser.findOne).toHaveBeenCalledWith({ _id: supportUserId, delete_flg: false });
  });

  test('存在しないユーザは空欄とし、DBの取得失敗は呼び出し元へ返す', async () => {
    process.env.SUPPORT_USER_ID = supportUserId;
    mockUser.findOne.mockReturnValue(queryResult(null));
    await expect(settingService.getDefaultResultUser(jwt)).resolves.toBeNull();
    const error = new Error('database unavailable');
    mockUser.findOne.mockReturnValue({ select: jest.fn().mockRejectedValue(error) });
    await expect(settingService.getDefaultResultUser(jwt)).rejects.toBe(error);
  });
});
