const createModel = (modelName) => ({
  modelName,
  collection: { collectionName: modelName.toLowerCase() },
  db: {
    db: {
      listCollections: jest.fn(() => ({ hasNext: jest.fn().mockResolvedValue(true) })),
    },
  },
  countDocuments: jest.fn(),
  create: jest.fn(),
  deleteMany: jest.fn(),
  find: jest.fn(),
});

const mockAIAnalysisSetting = createModel('AIAnalysisSetting');
const mockFloorAIAnalysisSetting = createModel('FloorAIAnalysisSetting');
const mockRoomAIAnalysisSetting = createModel('RoomAIAnalysisSetting');
const mockCategoryTag = createModel('CategoryTag');
const mockFloorTag = createModel('FloorTag');

jest.mock('../../../../../models/AIAnalysisSetting', () => mockAIAnalysisSetting);
jest.mock('../../../../../models/FloorAIAnalysisSetting', () => mockFloorAIAnalysisSetting);
jest.mock('../../../../../models/RoomAIAnalysisSetting', () => mockRoomAIAnalysisSetting);
jest.mock('../../../../../models/CategoryTag', () => mockCategoryTag);
jest.mock('../../../../../models/FloorTag', () => mockFloorTag);

const {
  commitSettingInheritance,
  prepareFloorSettingInheritance,
  prepareRoomSettingInheritance,
  rollbackFloorSettingInheritance,
  rollbackRoomSettingInheritance,
  rollbackSettingInheritance,
} = require('../../../../../services/analysis/settings/inheritance.service');

const leanResult = (value) => ({ lean: jest.fn().mockResolvedValue(value) });

describe('AI解析設定の継承', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAIAnalysisSetting.find.mockReturnValue(leanResult([]));
    mockFloorAIAnalysisSetting.find.mockReturnValue(leanResult([]));
    mockFloorAIAnalysisSetting.countDocuments.mockResolvedValue(0);
    mockRoomAIAnalysisSetting.countDocuments.mockResolvedValue(0);
    mockCategoryTag.find.mockReturnValue(leanResult([]));
    mockFloorTag.find.mockReturnValue(leanResult([]));
    mockFloorAIAnalysisSetting.create.mockResolvedValue([]);
    mockRoomAIAnalysisSetting.create.mockResolvedValue([]);
    mockFloorAIAnalysisSetting.deleteMany.mockResolvedValue({ deletedCount: 0 });
    mockRoomAIAnalysisSetting.deleteMany.mockResolvedValue({ deletedCount: 0 });
    mockFloorAIAnalysisSetting.db.db.listCollections.mockReturnValue({
      hasNext: jest.fn().mockResolvedValue(true),
    });
    mockRoomAIAnalysisSetting.db.db.listCollections.mockReturnValue({
      hasNext: jest.fn().mockResolvedValue(true),
    });
  });

  test('フロア作成時は有効な共通設定を全種別で複製し、来歴と実行者を固定する', async () => {
    mockCategoryTag.find.mockReturnValue(
      leanResult([{ _id: 'category-1', name: 'Category' }])
    );
    mockAIAnalysisSetting.find.mockReturnValue(
      leanResult([
        {
          _id: 'master-vision',
          category_tag: 'category-1',
          analysis_kind: 'vision',
          additional_prompt: 'prompt 1',
          result_user: 'result-user-1',
          revision: 3,
        },
        {
          _id: 'master-speech',
          category_tag: 'category-1',
          analysis_kind: 'speech',
          additional_prompt: '',
          result_user: 'result-user-2',
          revision: 7,
        },
      ])
    );

    const plan = await prepareFloorSettingInheritance({
      floorId: 'floor-1',
      childTags: [
        { _id: 'floor-tag-1', name: 'Category', source_category_tag: 'category-1' },
      ],
      userId: 'actor-1',
    });
    await commitSettingInheritance(plan);

    expect(mockFloorAIAnalysisSetting.countDocuments).toHaveBeenCalledWith({
      floor: 'floor-1',
      delete_flg: false,
    });
    expect(mockFloorAIAnalysisSetting.create).toHaveBeenCalledWith([
      {
        floor: 'floor-1',
        floor_tag: 'floor-tag-1',
        analysis_kind: 'vision',
        additional_prompt: 'prompt 1',
        result_user: 'result-user-1',
        source_master_setting: 'master-vision',
        source_master_revision: 3,
        revision: 1,
        user: 'actor-1',
        updated_by: 'actor-1',
      },
      {
        floor: 'floor-1',
        floor_tag: 'floor-tag-1',
        analysis_kind: 'speech',
        additional_prompt: '',
        result_user: 'result-user-2',
        source_master_setting: 'master-speech',
        source_master_revision: 7,
        revision: 1,
        user: 'actor-1',
        updated_by: 'actor-1',
      },
    ]);
  });

  test('ルーム作成時は同じフロアの有効な設定だけを複製する', async () => {
    mockFloorTag.find.mockReturnValue(
      leanResult([{ _id: 'floor-tag-1', name: 'Floor tag' }])
    );
    mockFloorAIAnalysisSetting.find.mockReturnValue(
      leanResult([
        {
          _id: 'floor-setting-1',
          floor_tag: 'floor-tag-1',
          analysis_kind: 'conversation',
          additional_prompt: 'room prompt',
          result_user: 'result-user-1',
          revision: 4,
        },
      ])
    );

    const plan = await prepareRoomSettingInheritance({
      floorId: 'floor-1',
      roomId: 'room-1',
      childTags: [
        { _id: 'room-tag-1', name: 'Floor tag', source_floor_tag: 'floor-tag-1' },
      ],
      userId: 'actor-1',
    });
    await commitSettingInheritance(plan);

    expect(mockFloorTag.find).toHaveBeenCalledWith({
      floor: 'floor-1',
      _id: { $in: ['floor-tag-1'] },
      delete_flg: false,
    });
    expect(mockFloorAIAnalysisSetting.find).toHaveBeenCalledWith({
      floor: 'floor-1',
      floor_tag: { $in: ['floor-tag-1'] },
      delete_flg: false,
    });
    expect(mockRoomAIAnalysisSetting.create).toHaveBeenCalledWith([
      expect.objectContaining({
        floor: 'floor-1',
        room: 'room-1',
        room_tag: 'room-tag-1',
        source_floor_setting: 'floor-setting-1',
        source_floor_revision: 4,
        revision: 1,
      }),
    ]);
  });

  test('ロック内の再確認で親タグが無効なら複製前に停止する', async () => {
    mockCategoryTag.find.mockReturnValue(leanResult([]));

    await expect(
      prepareFloorSettingInheritance({
        floorId: 'floor-1',
        childTags: [
          {
            _id: 'floor-tag-1',
            name: 'Missing category',
            source_category_tag: 'missing-category',
          },
        ],
        userId: 'actor-1',
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(mockAIAnalysisSetting.find).not.toHaveBeenCalled();
  });

  test('ロック待機中に親タグ名が変わったら子タグ名との不一致で停止する', async () => {
    mockCategoryTag.find.mockReturnValue(
      leanResult([{ _id: 'category-1', name: 'Renamed category' }])
    );

    await expect(
      prepareFloorSettingInheritance({
        floorId: 'floor-1',
        childTags: [
          { _id: 'floor-tag-1', name: 'Original category', source_category_tag: 'category-1' },
        ],
        userId: 'actor-1',
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(mockAIAnalysisSetting.find).not.toHaveBeenCalled();
    expect(mockFloorAIAnalysisSetting.create).not.toHaveBeenCalled();
  });

  test('ロック待機中にフロアタグ名が変わった場合もルームへの複製前に停止する', async () => {
    mockFloorTag.find.mockReturnValue(
      leanResult([{ _id: 'floor-tag-1', name: 'Renamed floor tag' }])
    );

    await expect(
      prepareRoomSettingInheritance({
        floorId: 'floor-1',
        roomId: 'room-1',
        childTags: [
          { _id: 'room-tag-1', name: 'Original floor tag', source_floor_tag: 'floor-tag-1' },
        ],
        userId: 'actor-1',
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(mockFloorAIAnalysisSetting.find).not.toHaveBeenCalled();
    expect(mockRoomAIAnalysisSetting.create).not.toHaveBeenCalled();
  });

  test('既存の有効な設定との合計が所属先の上限を超える場合は複製しない', async () => {
    mockCategoryTag.find.mockReturnValue(
      leanResult([{ _id: 'category-1', name: 'Category' }])
    );
    mockAIAnalysisSetting.find.mockReturnValue(
      leanResult([
        { _id: 'master-1', category_tag: 'category-1' },
        { _id: 'master-2', category_tag: 'category-1' },
      ])
    );
    mockFloorAIAnalysisSetting.countDocuments.mockResolvedValue(99);

    await expect(
      prepareFloorSettingInheritance({
        floorId: 'floor-1',
        childTags: [
          { _id: 'floor-tag-1', name: 'Category', source_category_tag: 'category-1' },
        ],
        userId: 'actor-1',
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(mockFloorAIAnalysisSetting.create).not.toHaveBeenCalled();
  });

  test('複製や付随データの作成に失敗したら、対象の所属先だけを削除して戻す', async () => {
    const floorPlan = {
      type: 'floor',
      childTagIds: ['floor-tag-1'],
      documents: [{ floor_tag: 'floor-tag-1' }],
    };
    await rollbackSettingInheritance(floorPlan);
    await rollbackFloorSettingInheritance({ floorId: 'floor-1' });
    await rollbackRoomSettingInheritance({ roomId: 'room-1' });

    expect(mockFloorAIAnalysisSetting.deleteMany).toHaveBeenNthCalledWith(1, {
      floor_tag: { $in: ['floor-tag-1'] },
    });
    expect(mockFloorAIAnalysisSetting.deleteMany).toHaveBeenNthCalledWith(2, {
      floor: 'floor-1',
    });
    expect(mockRoomAIAnalysisSetting.deleteMany).toHaveBeenCalledWith({ room: 'room-1' });
  });

  test('既存コレクションの設定は対象の所属先だけを削除して戻す', async () => {
    await rollbackFloorSettingInheritance({ floorId: 'floor-1' });

    expect(mockFloorAIAnalysisSetting.db.db.listCollections).toHaveBeenCalledWith(
      { name: 'flooraianalysissetting' },
      { nameOnly: true }
    );
    expect(mockFloorAIAnalysisSetting.deleteMany).toHaveBeenCalledWith({ floor: 'floor-1' });
  });

  test('設定のコレクションが未作成なら削除コマンドを送らない', async () => {
    mockFloorAIAnalysisSetting.db.db.listCollections.mockReturnValue({
      hasNext: jest.fn().mockResolvedValue(false),
    });

    await rollbackFloorSettingInheritance({ floorId: 'floor-1' });

    expect(mockFloorAIAnalysisSetting.deleteMany).not.toHaveBeenCalled();
  });
});
