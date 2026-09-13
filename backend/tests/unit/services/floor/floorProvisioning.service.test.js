jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    rm: jest.fn(),
  },
}));
jest.mock('../../../../models/CategoryTag', () => ({ find: jest.fn() }));
jest.mock('../../../../models/Floor', () => ({ findByIdAndDelete: jest.fn() }));
jest.mock('../../../../models/FloorTag', () => ({ create: jest.fn(), find: jest.fn(), deleteMany: jest.fn() }));
jest.mock('../../../../models/QuickTextGroup', () => ({ find: jest.fn() }));
jest.mock('../../../../models/QuickTextItem', () => ({ find: jest.fn() }));
jest.mock('../../../../models/FloorQuickTextGroup', () => ({ create: jest.fn(), find: jest.fn(), deleteMany: jest.fn() }));
jest.mock('../../../../models/FloorQuickTextItem', () => ({ create: jest.fn(), find: jest.fn(), deleteMany: jest.fn() }));
jest.mock('../../../../models/Room', () => ({ find: jest.fn() }));
jest.mock('../../../../models/RoomTag', () => ({ find: jest.fn() }));
jest.mock('../../../../models/RoomQuickTextGroup', () => ({ find: jest.fn() }));
jest.mock('../../../../models/RoomQuickTextItem', () => ({ find: jest.fn() }));
jest.mock('../../../../services/translation.service', () => ({
  translateTitleAndDescription: jest.fn(),
  translateTag: jest.fn(),
  translateQuickTextGroup: jest.fn(),
  translateQuickTextItem: jest.fn(),
}));
const mockCommitSettingInheritance = jest.fn();
const mockPrepareFloorSettingInheritance = jest.fn();
const mockRollbackFloorSettingInheritance = jest.fn();
const mockRollbackSettingInheritance = jest.fn();
jest.mock('../../../../services/analysis/settings/inheritance.service', () => ({
  commitSettingInheritance: mockCommitSettingInheritance,
  prepareFloorSettingInheritance: mockPrepareFloorSettingInheritance,
  rollbackFloorSettingInheritance: mockRollbackFloorSettingInheritance,
  rollbackSettingInheritance: mockRollbackSettingInheritance,
}));
const mockWithAIAnalysisIntegrityLock = jest.fn((task) => task());
jest.mock('../../../../services/analysis/settings/referenceIntegrity', () => ({
  withAIAnalysisIntegrityLock: mockWithAIAnalysisIntegrityLock,
}));

const fsPromises = require('fs').promises;
const CategoryTag = require('../../../../models/CategoryTag');
const Floor = require('../../../../models/Floor');
const FloorTag = require('../../../../models/FloorTag');
const QuickTextGroup = require('../../../../models/QuickTextGroup');
const QuickTextItem = require('../../../../models/QuickTextItem');
const FloorQuickTextGroup = require('../../../../models/FloorQuickTextGroup');
const FloorQuickTextItem = require('../../../../models/FloorQuickTextItem');
const Room = require('../../../../models/Room');
const RoomTag = require('../../../../models/RoomTag');
const RoomQuickTextGroup = require('../../../../models/RoomQuickTextGroup');
const RoomQuickTextItem = require('../../../../models/RoomQuickTextItem');
const translationService = require('../../../../services/translation.service');
const {
  provisionFloorResources,
  refreshFloorResourceTranslations,
  rollbackFloorProvisioning,
  targetLanguagesChanged,
} = require('../../../../services/floor/floorProvisioning.service');

describe('フロアに付随するデータの作成', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    CategoryTag.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    QuickTextGroup.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    FloorTag.find.mockResolvedValue([]);
    FloorQuickTextGroup.find.mockResolvedValue([]);
    FloorQuickTextItem.find.mockResolvedValue([]);
    Room.find.mockResolvedValue([]);
    RoomTag.find.mockResolvedValue([]);
    RoomQuickTextGroup.find.mockResolvedValue([]);
    RoomQuickTextItem.find.mockResolvedValue([]);
    fsPromises.mkdir.mockResolvedValue();
    fsPromises.rm.mockResolvedValue();
    FloorTag.create.mockResolvedValue([]);
    FloorTag.deleteMany.mockResolvedValue({ deletedCount: 0 });
    mockPrepareFloorSettingInheritance.mockResolvedValue({
      type: 'floor',
      childTagIds: [],
      documents: [],
    });
    mockCommitSettingInheritance.mockResolvedValue([]);
    mockRollbackFloorSettingInheritance.mockResolvedValue(undefined);
    mockRollbackSettingInheritance.mockResolvedValue(undefined);
  });

  test('タグと単語を複製し、フロアメディアディレクトリを作る', async () => {
    CategoryTag.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([
      { _id: 'tag-1', order: 1, name: 'Tag', lang: 'ja' },
    ]) });
    QuickTextGroup.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([
      { _id: 'group-1', order: 1, title: 'Group', lang: 'ja' },
    ]) });
    QuickTextItem.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([
      { _id: 'item-1', group: 'group-1', order: 1, label: 'Item', lang: 'ja' },
    ]) });
    FloorQuickTextGroup.create.mockResolvedValue([{ _id: 'floor-group-1' }]);
    translationService.translateTag.mockResolvedValue([{ lang: 'en', name: 'tag' }]);
    translationService.translateQuickTextGroup.mockResolvedValue([{ lang: 'en', content: 'Group' }]);
    translationService.translateQuickTextItem.mockResolvedValue([{ lang: 'en', content: 'Item' }]);

    await provisionFloorResources({
      floorId: 'floor-1',
      userId: 'user-1',
      targetLangs: ['en'],
      mediaRoot: '/test-fixtures/floor-provisioning',
    });

    expect(FloorTag.create).toHaveBeenCalledWith([
      expect.objectContaining({
        _id: expect.anything(),
        floor: 'floor-1',
        source_category_tag: 'tag-1',
        name: 'Tag',
      }),
    ]);
    expect(mockPrepareFloorSettingInheritance).toHaveBeenCalledWith({
      floorId: 'floor-1',
      childTags: [expect.objectContaining({ source_category_tag: 'tag-1' })],
      userId: 'user-1',
    });
    expect(mockCommitSettingInheritance).toHaveBeenCalledTimes(1);
    expect(FloorQuickTextItem.create).toHaveBeenCalledWith([
      expect.objectContaining({ floor: 'floor-1', group: 'floor-group-1', label: 'Item' }),
    ]);
    expect(fsPromises.mkdir).toHaveBeenCalledWith(
      '/test-fixtures/floor-provisioning/floor-1',
      { recursive: true }
    );
  });

  test('タグの一括作成が途中で失敗しても、作成を試みた全IDを削除する', async () => {
    CategoryTag.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { _id: 'tag-1', order: 1, name: 'Tag 1', lang: 'ja' },
        { _id: 'tag-2', order: 2, name: 'Tag 2', lang: 'ja' },
      ]),
    });
    translationService.translateTag.mockResolvedValue([]);
    const failure = new Error('partial create');
    FloorTag.create.mockRejectedValue(failure);

    await expect(
      provisionFloorResources({
        floorId: 'floor-1',
        userId: 'user-1',
        targetLangs: [],
        mediaRoot: '/test-fixtures/floor-provisioning',
      })
    ).rejects.toBe(failure);

    const attempted = FloorTag.create.mock.calls[0][0];
    expect(attempted).toHaveLength(2);
    expect(FloorTag.deleteMany).toHaveBeenCalledWith({
      _id: { $in: attempted.map((tag) => tag._id) },
    });
    expect(mockPrepareFloorSettingInheritance).not.toHaveBeenCalled();
  });

  test('ロック待機中に親タグ名が変わったら作成済みの子タグを削除する', async () => {
    CategoryTag.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { _id: 'tag-1', order: 1, name: 'Original tag', lang: 'ja' },
      ]),
    });
    translationService.translateTag.mockResolvedValue([]);
    const conflict = Object.assign(new Error('renamed parent'), { code: 'CONFLICT' });
    mockPrepareFloorSettingInheritance.mockRejectedValue(conflict);

    await expect(
      provisionFloorResources({
        floorId: 'floor-1',
        userId: 'user-1',
        targetLangs: [],
        mediaRoot: '/test-fixtures/floor-provisioning',
      })
    ).rejects.toBe(conflict);

    const attempted = FloorTag.create.mock.calls[0][0];
    expect(FloorTag.deleteMany).toHaveBeenCalledWith({
      _id: { $in: attempted.map((tag) => tag._id) },
    });
    expect(mockCommitSettingInheritance).not.toHaveBeenCalled();
  });

  test('失敗時は作成途中の子データ・フロア本体・ディレクトリを削除する', async () => {
    FloorTag.deleteMany.mockResolvedValue();
    FloorQuickTextGroup.deleteMany.mockResolvedValue();
    FloorQuickTextItem.deleteMany.mockResolvedValue();
    Floor.findByIdAndDelete.mockResolvedValue();

    await rollbackFloorProvisioning({
      floorId: 'floor-1',
      mediaRoot: '/test-fixtures/floor-provisioning',
    });

    expect(FloorTag.deleteMany).toHaveBeenCalledWith({ floor: 'floor-1' });
    expect(mockRollbackFloorSettingInheritance).toHaveBeenCalledWith({ floorId: 'floor-1' });
    expect(Floor.findByIdAndDelete).toHaveBeenCalledWith('floor-1');
    expect(fsPromises.rm).toHaveBeenCalledWith(
      '/test-fixtures/floor-provisioning/floor-1',
      { recursive: true, force: true }
    );
  });

  test('翻訳先言語の順序差を変更として扱わない', () => {
    expect(targetLanguagesChanged(['en', 'ja'], ['ja', 'en'])).toBe(false);
    expect(targetLanguagesChanged(['en'], ['ja'])).toBe(true);
  });

  test('翻訳先言語が変わったら配下のルーム・タグ・単語も再翻訳する', async () => {
    const room = { _id: 'room-1', title: 'Room', description: 'Desc', lang: 'ja', save: jest.fn() };
    const roomTag = { _id: 'tag-1', name: 'Tag', lang: 'ja', save: jest.fn() };
    const roomGroup = { _id: 'group-1', title: 'Group', lang: 'ja', save: jest.fn() };
    const roomItem = { _id: 'item-1', label: 'Item', lang: 'ja', save: jest.fn() };
    Room.find.mockResolvedValue([room]);
    RoomTag.find.mockResolvedValue([roomTag]);
    RoomQuickTextGroup.find.mockResolvedValue([roomGroup]);
    RoomQuickTextItem.find.mockResolvedValue([roomItem]);
    translationService.translateTitleAndDescription.mockResolvedValue([{ lang: 'en', title: 'Room' }]);
    translationService.translateTag.mockResolvedValue([{ lang: 'en', name: 'tag' }]);
    translationService.translateQuickTextGroup.mockResolvedValue([{ lang: 'en', content: 'Group' }]);
    translationService.translateQuickTextItem.mockResolvedValue([{ lang: 'en', content: 'Item' }]);

    await refreshFloorResourceTranslations({ floorId: 'floor-1', userId: 'user-1', targetLangs: ['en'] });

    expect(Room.find).toHaveBeenCalledWith({ floor: 'floor-1' });
    expect(RoomTag.find).toHaveBeenCalledWith({ floor: 'floor-1', delete_flg: false });
    expect(RoomQuickTextGroup.find).toHaveBeenCalledWith({ floor: 'floor-1' });
    expect(RoomQuickTextItem.find).toHaveBeenCalledWith({ floor: 'floor-1' });
    expect(room.save).toHaveBeenCalled();
    expect(roomTag.save).toHaveBeenCalled();
    expect(roomGroup.save).toHaveBeenCalled();
    expect(roomItem.save).toHaveBeenCalled();
  });
});
