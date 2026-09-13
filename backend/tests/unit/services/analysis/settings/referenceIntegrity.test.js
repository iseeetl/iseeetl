const mockCreateModel = (modelName) => ({
  modelName,
  countDocuments: jest.fn(),
  findOne: jest.fn(),
});

jest.mock('../../../../../models/AIAnalysisSetting', () => mockCreateModel('AIAnalysisSetting'));
jest.mock('../../../../../models/FloorAIAnalysisSetting', () =>
  mockCreateModel('FloorAIAnalysisSetting')
);
jest.mock('../../../../../models/RoomAIAnalysisSetting', () =>
  mockCreateModel('RoomAIAnalysisSetting')
);
jest.mock('../../../../../models/CategoryTag', () => mockCreateModel('CategoryTag'));
jest.mock('../../../../../models/Floor', () => mockCreateModel('Floor'));
jest.mock('../../../../../models/FloorTag', () => mockCreateModel('FloorTag'));
jest.mock('../../../../../models/Room', () => mockCreateModel('Room'));
jest.mock('../../../../../models/RoomTag', () => mockCreateModel('RoomTag'));

const AIAnalysisSetting = require('../../../../../models/AIAnalysisSetting');
const FloorAIAnalysisSetting = require('../../../../../models/FloorAIAnalysisSetting');
const RoomAIAnalysisSetting = require('../../../../../models/RoomAIAnalysisSetting');
const CategoryTag = require('../../../../../models/CategoryTag');
const FloorTag = require('../../../../../models/FloorTag');
const RoomTag = require('../../../../../models/RoomTag');
const {
  assertNoActiveAIAnalysisReferences,
  parentKey,
  referenceKey,
  scopeKey,
} = require('../../../../../services/analysis/settings/referenceIntegrity');

const TARGET_ID = '507f1f77bcf86cd799439011';

const MODELS = [
  AIAnalysisSetting,
  FloorAIAnalysisSetting,
  RoomAIAnalysisSetting,
  CategoryTag,
  FloorTag,
  RoomTag,
];

describe('AI解析設定の参照整合性', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MODELS.forEach((Model) => Model.countDocuments.mockResolvedValue(0));
  });

  test.each([
    ['user', AIAnalysisSetting, { delete_flg: false, result_user: TARGET_ID }],
    ['user', FloorAIAnalysisSetting, { delete_flg: false, result_user: TARGET_ID }],
    ['user', RoomAIAnalysisSetting, { delete_flg: false, result_user: TARGET_ID }],
    ['category-tag', AIAnalysisSetting, { delete_flg: false, category_tag: TARGET_ID }],
    ['floor-tag', FloorAIAnalysisSetting, { delete_flg: false, floor_tag: TARGET_ID }],
    ['room-tag', RoomAIAnalysisSetting, { delete_flg: false, room_tag: TARGET_ID }],
  ])('%sに有効な参照がある場合はCONFLICTを返す', async (type, referencedModel, filter) => {
    referencedModel.countDocuments.mockResolvedValueOnce(1);

    let error;
    try {
      await assertNoActiveAIAnalysisReferences(type, TARGET_ID);
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ code: 'CONFLICT', status: 409 });
    if (['category-tag', 'floor-tag', 'room-tag'].includes(type)) {
      expect(error.details).toEqual({
        reason: 'ACTIVE_AI_ANALYSIS_REFERENCE',
        resource_type: type,
      });
    } else {
      expect(error).not.toHaveProperty('details');
    }

    expect(referencedModel.countDocuments).toHaveBeenCalledWith(filter);
  });

  test.each(['floor', 'room'])(
    '%s は論理削除中もAI解析設定を保持するため直接参照チェックの対象外にする',
    async (type) => {
      FloorAIAnalysisSetting.countDocuments.mockResolvedValue(1);
      RoomAIAnalysisSetting.countDocuments.mockResolvedValue(1);

      await expect(
        assertNoActiveAIAnalysisReferences(type, TARGET_ID)
      ).resolves.toBeUndefined();

      expect(FloorAIAnalysisSetting.countDocuments).not.toHaveBeenCalled();
      expect(RoomAIAnalysisSetting.countDocuments).not.toHaveBeenCalled();
    }
  );

  test.each([
    ['category-tag', FloorTag],
    ['floor-tag', RoomTag],
  ])('%sを複製元とする有効な子タグだけなら削除を許可する', async (type, childModel) => {
    childModel.countDocuments.mockResolvedValue(1);

    await expect(
      assertNoActiveAIAnalysisReferences(type, TARGET_ID)
    ).resolves.toBeUndefined();

    expect(childModel.countDocuments).not.toHaveBeenCalled();
  });

  test('削除済み設定だけなら参照なしとして扱う検索条件を使う', async () => {
    await expect(
      assertNoActiveAIAnalysisReferences('user', TARGET_ID)
    ).resolves.toBeUndefined();

    expect(AIAnalysisSetting.countDocuments).toHaveBeenCalledWith({
      delete_flg: false,
      result_user: TARGET_ID,
    });
    expect(FloorAIAnalysisSetting.countDocuments).toHaveBeenCalledWith({
      delete_flg: false,
      result_user: TARGET_ID,
    });
    expect(RoomAIAnalysisSetting.countDocuments).toHaveBeenCalledWith({
      delete_flg: false,
      result_user: TARGET_ID,
    });
  });

  test('ロックのキーは種類とIDが衝突しない形式で生成する', () => {
    expect(referenceKey('user', 'u1')).toBe('ai-reference:user:u1');
    expect(parentKey('floor', 'tag1', 'vision')).toBe('ai-parent:floor:tag1:vision');
    expect(scopeKey('room', 'r1')).toBe('ai-scope:room:r1');
    expect(scopeKey('common')).toBe('ai-scope:common:global');
  });
});
