jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    rm: jest.fn(),
  },
}));
jest.mock('../../../../models/FloorTag', () => ({ find: jest.fn() }));
jest.mock('../../../../models/FloorQuickTextGroup', () => ({ find: jest.fn() }));
jest.mock('../../../../models/FloorQuickTextItem', () => ({ find: jest.fn() }));
jest.mock('../../../../models/Room', () => ({ findByIdAndDelete: jest.fn() }));
jest.mock('../../../../models/RoomTag', () => ({ create: jest.fn(), deleteMany: jest.fn() }));
jest.mock('../../../../models/RoomQuickTextGroup', () => ({ create: jest.fn(), deleteMany: jest.fn() }));
jest.mock('../../../../models/RoomQuickTextItem', () => ({ create: jest.fn(), deleteMany: jest.fn() }));
jest.mock('../../../../services/translation.service', () => ({ translateTag: jest.fn() }));
const mockCommitSettingInheritance = jest.fn();
const mockPrepareRoomSettingInheritance = jest.fn();
const mockRollbackRoomSettingInheritance = jest.fn();
const mockRollbackSettingInheritance = jest.fn();
jest.mock('../../../../services/analysis/settings/inheritance.service', () => ({
  commitSettingInheritance: mockCommitSettingInheritance,
  prepareRoomSettingInheritance: mockPrepareRoomSettingInheritance,
  rollbackRoomSettingInheritance: mockRollbackRoomSettingInheritance,
  rollbackSettingInheritance: mockRollbackSettingInheritance,
}));
const mockWithAIAnalysisIntegrityLock = jest.fn((task) => task());
jest.mock('../../../../services/analysis/settings/referenceIntegrity', () => ({
  withAIAnalysisIntegrityLock: mockWithAIAnalysisIntegrityLock,
}));

const fsPromises = require('fs').promises;
const FloorTag = require('../../../../models/FloorTag');
const FloorQuickTextGroup = require('../../../../models/FloorQuickTextGroup');
const FloorQuickTextItem = require('../../../../models/FloorQuickTextItem');
const Room = require('../../../../models/Room');
const RoomTag = require('../../../../models/RoomTag');
const RoomQuickTextGroup = require('../../../../models/RoomQuickTextGroup');
const RoomQuickTextItem = require('../../../../models/RoomQuickTextItem');
const translationService = require('../../../../services/translation.service');
const {
  provisionRoomResources,
  rollbackRoomProvisioning,
} = require('../../../../services/room/roomProvisioning.service');

describe('ルームに付随するデータの作成', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FloorTag.find.mockResolvedValue([]);
    FloorQuickTextGroup.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    fsPromises.mkdir.mockResolvedValue();
    fsPromises.rm.mockResolvedValue();
    RoomTag.create.mockResolvedValue([]);
    RoomTag.deleteMany.mockResolvedValue({ deletedCount: 0 });
    mockPrepareRoomSettingInheritance.mockResolvedValue({
      type: 'room',
      childTagIds: [],
      documents: [],
    });
    mockCommitSettingInheritance.mockResolvedValue([]);
    mockRollbackRoomSettingInheritance.mockResolvedValue(undefined);
    mockRollbackSettingInheritance.mockResolvedValue(undefined);
  });

  test('フロア資源をルームへ複製してディレクトリを作る', async () => {
    FloorTag.find.mockResolvedValue([{ _id: 'tag-1', order: 1, name: 'Tag', lang: 'ja' }]);
    FloorQuickTextGroup.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([
      { _id: 'floor-group-1', order: 1, title: 'Group', lang: 'ja', translations: [] },
    ]) });
    FloorQuickTextItem.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([
      { group: 'floor-group-1', order: 1, label: 'Item', lang: 'ja', translations: [] },
    ]) });
    RoomQuickTextGroup.create.mockResolvedValue([{ _id: 'room-group-1' }]);
    translationService.translateTag.mockResolvedValue([]);

    await provisionRoomResources({
      floorId: 'floor-1',
      roomId: 'room-1',
      userId: 'user-1',
      targetLangs: ['en'],
      mediaRoot: '/test-fixtures/room-provisioning',
    });

    expect(RoomTag.create).toHaveBeenCalledWith([
      expect.objectContaining({
        _id: expect.anything(),
        floor: 'floor-1',
        room: 'room-1',
        source_floor_tag: 'tag-1',
        name: 'Tag',
      }),
    ]);
    expect(mockPrepareRoomSettingInheritance).toHaveBeenCalledWith({
      floorId: 'floor-1',
      roomId: 'room-1',
      childTags: [expect.objectContaining({ source_floor_tag: 'tag-1' })],
      userId: 'user-1',
    });
    expect(mockCommitSettingInheritance).toHaveBeenCalledTimes(1);
    expect(RoomQuickTextItem.create).toHaveBeenCalledWith([
      expect.objectContaining({ room: 'room-1', group: 'room-group-1', label: 'Item' }),
    ]);
    expect(fsPromises.mkdir).toHaveBeenCalledWith(
      '/test-fixtures/room-provisioning/floor-1/room-1',
      { recursive: true }
    );
  });

  test('タグの一括作成が途中で失敗しても、作成を試みた全IDを削除する', async () => {
    FloorTag.find.mockResolvedValue([
      { _id: 'tag-1', order: 1, name: 'Tag 1', lang: 'ja' },
      { _id: 'tag-2', order: 2, name: 'Tag 2', lang: 'ja' },
    ]);
    translationService.translateTag.mockResolvedValue([]);
    const failure = new Error('partial create');
    RoomTag.create.mockRejectedValue(failure);

    await expect(
      provisionRoomResources({
        floorId: 'floor-1',
        roomId: 'room-1',
        userId: 'user-1',
        targetLangs: [],
        mediaRoot: '/test-fixtures/room-provisioning',
      })
    ).rejects.toBe(failure);

    const attempted = RoomTag.create.mock.calls[0][0];
    expect(attempted).toHaveLength(2);
    expect(RoomTag.deleteMany).toHaveBeenCalledWith({
      _id: { $in: attempted.map((tag) => tag._id) },
    });
    expect(mockPrepareRoomSettingInheritance).not.toHaveBeenCalled();
  });

  test('失敗時は作成途中のルーム配下のデータだけを削除する', async () => {
    RoomTag.deleteMany.mockResolvedValue();
    RoomQuickTextGroup.deleteMany.mockResolvedValue();
    RoomQuickTextItem.deleteMany.mockResolvedValue();
    Room.findByIdAndDelete.mockResolvedValue();

    await rollbackRoomProvisioning({
      floorId: 'floor-1',
      roomId: 'room-1',
      mediaRoot: '/test-fixtures/room-provisioning',
    });

    expect(RoomTag.deleteMany).toHaveBeenCalledWith({ room: 'room-1' });
    expect(mockRollbackRoomSettingInheritance).toHaveBeenCalledWith({ roomId: 'room-1' });
    expect(Room.findByIdAndDelete).toHaveBeenCalledWith('room-1');
    expect(fsPromises.rm).toHaveBeenCalledWith(
      '/test-fixtures/room-provisioning/floor-1/room-1',
      { recursive: true, force: true }
    );
  });
});
