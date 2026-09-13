jest.mock('../../../../services/translation.service', () => ({
  translateTag: jest.fn().mockResolvedValue(['translated']),
}));
const mockIsGoogleTranslateEnabled = jest.fn(() => true);
jest.mock('../../../../config/featureFlags', () => ({
  isGoogleTranslateEnabled: mockIsGoogleTranslateEnabled,
}));
const mockAssertNoActiveAIAnalysisReferences = jest.fn();
const mockAssertRoomTagParentActive = jest.fn();
const mockWithAIAnalysisIntegrityLock = jest.fn((task) => task());
jest.mock('../../../../services/analysis/settings/referenceIntegrity', () => ({
  assertNoActiveAIAnalysisReferences: mockAssertNoActiveAIAnalysisReferences,
  assertRoomTagParentActive: mockAssertRoomTagParentActive,
  withAIAnalysisIntegrityLock: mockWithAIAnalysisIntegrityLock,
}));
const mockCommitSettingInheritance = jest.fn();
const mockPrepareRoomSettingInheritance = jest.fn();
const mockRollbackSettingInheritance = jest.fn();
jest.mock('../../../../services/analysis/settings/inheritance.service', () => ({
  commitSettingInheritance: mockCommitSettingInheritance,
  prepareRoomSettingInheritance: mockPrepareRoomSettingInheritance,
  rollbackSettingInheritance: mockRollbackSettingInheritance,
}));

jest.mock('../../../../models/User', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/Floor', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/FloorMember', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/FloorTag', () => ({ find: jest.fn() }));
jest.mock('../../../../models/Room', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/RoomTag', () => ({
  modelName: 'RoomTag',
  find: jest.fn(),
  create: jest.fn(),
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
  paginate: jest.fn(),
  bulkWrite: jest.fn(),
  deleteMany: jest.fn(),
}));
jest.mock('../../../../services/room/roomAccess.service', () => ({
  authorizeRoomMetadataAccess: jest.fn(),
}));

jest.mock(
  '../../../../utils/appError',
  () =>
    function AppError(message, statusCode) {
      this.message = message;
      this.statusCode = statusCode;
    }
);

const roomTagService = require('../../../../services/room/roomTag.service');
const translationService = require('../../../../services/translation.service');
const User = require('../../../../models/User');
const Floor = require('../../../../models/Floor');
const FloorMember = require('../../../../models/FloorMember');
const FloorTag = require('../../../../models/FloorTag');
const Room = require('../../../../models/Room');
const RoomTag = require('../../../../models/RoomTag');
const { authorizeRoomMetadataAccess } = require('../../../../services/room/roomAccess.service');
const AppError = require('../../../../utils/appError');

describe('roomTagのサービス', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleTranslateEnabled.mockReturnValue(true);
    mockAssertNoActiveAIAnalysisReferences.mockResolvedValue(undefined);
    mockAssertRoomTagParentActive.mockResolvedValue(undefined);
    mockPrepareRoomSettingInheritance.mockResolvedValue({
      type: 'room',
      childTagIds: [],
      documents: [],
    });
    mockCommitSettingInheritance.mockResolvedValue([]);
    mockRollbackSettingInheritance.mockResolvedValue(undefined);
    RoomTag.deleteMany.mockResolvedValue({ deletedCount: 0 });
    authorizeRoomMetadataAccess.mockResolvedValue({
      room: { _id: 'r1', floor: 'f1' },
      floor: { _id: 'f1' },
    });
  });

  const mockFloorMember = (val) => {
    FloorMember.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(val) });
  };

  const mockReconcileFinds = ({ existing = [], active = [] } = {}) => {
    RoomTag.find.mockImplementation((query) => {
      if (Object.prototype.hasOwnProperty.call(query, 'delete_flg')) {
        const lean = jest.fn().mockResolvedValue(active);
        const sort = jest.fn().mockReturnValue({ lean });
        return { sort };
      }

      return {
        lean: jest.fn().mockResolvedValue(existing),
      };
    });
  };

  describe('一覧取得', () => {
    test('フロア、ルームを指定して取得', async () => {
      const leanMock = jest.fn().mockResolvedValue([{ _id: 'rt1' }]);
      const sortReturn = { lean: leanMock };
      const sortMock = jest.fn().mockReturnValue(sortReturn);
      RoomTag.find.mockReturnValue({ sort: sortMock });

      const body = { floor_id: 'f1', room_id: 'r1' };
      const identity = { jwtPayload: { user_id: 'u1', user_role: 'Author' } };
      const result = await roomTagService.list(body, identity);

      expect(authorizeRoomMetadataAccess).toHaveBeenCalledWith('r1', identity);
      expect(RoomTag.find).toHaveBeenCalledWith({ floor: 'f1', room: 'r1', delete_flg: false });
      expect(sortMock).toHaveBeenCalledWith({ order: 1, created_at: -1 });
      expect(leanMock).toHaveBeenCalled();
      expect(result).toEqual([{ _id: 'rt1' }]);
    });

    test('認可失敗時はタグを検索せずエラーを伝播する', async () => {
      const error = new AppError({ code: 'INVALID_PERMISSION' });
      authorizeRoomMetadataAccess.mockRejectedValue(error);

      await expect(roomTagService.list({ room_id: 'r1' }, { guest: { id: 'guest-1' } })).rejects.toBe(error);
      expect(RoomTag.find).not.toHaveBeenCalled();
    });
  });

  describe('作成', () => {
    const adminJwt = { user_role: 'Administrator', user_id: 'admin' };
    const editorJwt = { user_role: 'Editor', user_id: 'editor' };
    const otherEditorJwt = { user_role: 'Editor', user_id: 'other' };

    const baseBody = {
      room_id: 'roomA',
      order: 1,
      name: 'タグ',
      lang: 'ja',
      target_langs: ['en'],
    };

    beforeEach(() => {
      User.findOne.mockResolvedValue({ _id: 'any' });
      Room.findOne.mockResolvedValue({ _id: 'roomA', floor: 'floorA', delete_flg: false });
      Floor.findOne.mockResolvedValue({ _id: 'floorA', user: 'editor', target_langs: ['en'], delete_flg: false });
      mockFloorMember(null);
      RoomTag.create.mockImplementation((d) => ({ _id: 'new', ...d }));
      translationService.translateTag.mockResolvedValue(['translated']);
    });

    test('管理者が作成（翻訳結果が空の場合）', async () => {
      translationService.translateTag.mockResolvedValueOnce([]);
      Floor.findOne.mockResolvedValue({ _id: 'floorA', user: 'editor', target_langs: [], delete_flg: false });

      const res = await roomTagService.create({ ...baseBody, target_langs: [] }, adminJwt);

      expect(translationService.translateTag).toHaveBeenCalledWith('admin', { lang: 'ja', name: 'タグ' }, []);
      expect(RoomTag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          floor: 'floorA',
          room: 'roomA',
          user: 'admin',
          order: 1,
          name: 'タグ',
          translations: [],
        })
      );
      expect(res._id).toBe('new');
    });

    test('フロア編集ユーザ (フロアオーナ) が作成（翻訳あり）', async () => {
      Floor.findOne.mockResolvedValue({ _id: 'floorA', user: 'editor', target_langs: ['en'] });

      await roomTagService.create(baseBody, editorJwt);

      expect(translationService.translateTag).toHaveBeenCalledWith('editor', { lang: 'ja', name: 'タグ' }, ['en']);
      expect(RoomTag.create).toHaveBeenCalled();
    });

    test('権限なしフロア編集ユーザは 403', async () => {
      mockFloorMember(null);
      await expect(roomTagService.create(baseBody, otherEditorJwt)).rejects.toBeInstanceOf(AppError);
      expect(RoomTag.create).not.toHaveBeenCalled();
    });
  });

  describe('更新', () => {
    const adminJwt = { user_role: 'Administrator', user_id: 'admin' };

    const foundRoomTag = {
      _id: 'rt1',
      floor: 'floor1',
      room: 'room1',
      user: 'editor',
      name: 'old',
      lang: 'ja', // 言語変更による翻訳を発生させないよう、変更前の言語も設定する。
      translations: ['en:old'],
      delete_flg: false,
    };

    beforeEach(() => {
      User.findOne.mockResolvedValue({ _id: 'admin' });
      RoomTag.findOne.mockResolvedValue(foundRoomTag);
      Room.findOne.mockResolvedValue({ _id: 'room1', floor: 'floor1' });
      Floor.findOne.mockResolvedValue({ _id: 'floor1', user: 'owner', target_langs: ['en'] });
      mockFloorMember(null);
      RoomTag.findByIdAndUpdate.mockImplementation((id, data) => ({ _id: id, ...data }));
      translationService.translateTag.mockResolvedValue(['translated']);
    });

    test('name 変更なし ⇒ 翻訳せず更新', async () => {
      const body = {
        _id: 'rt1',
        order: 3,
        name: 'old',
        lang: 'ja',
        target_langs: ['en'],
      };

      const res = await roomTagService.update(body, adminJwt);

      expect(RoomTag.findByIdAndUpdate).toHaveBeenCalledWith(
        'rt1',
        expect.objectContaining({
          order: 3,
          name: 'old',
          translations: ['en:old'],
        }),
        expect.objectContaining({ new: true })
      );
      expect(res._id).toBe('rt1');
      expect(translationService.translateTag).not.toHaveBeenCalled();
    });

    test('name 変更 ⇒ 翻訳実施', async () => {
      const body = {
        _id: 'rt1',
        order: 2,
        name: 'newName',
        lang: 'ja',
        target_langs: ['en'],
      };

      await roomTagService.update(body, adminJwt);

      expect(translationService.translateTag).toHaveBeenCalledWith('admin', { lang: 'ja', name: 'newName' }, ['en']);
      const updateArg = RoomTag.findByIdAndUpdate.mock.calls[0][1];
      expect(updateArg.translations).toEqual(['translated']);
    });

    test('Google翻訳無効時はname変更後も保存済み翻訳を保持する', async () => {
      mockIsGoogleTranslateEnabled.mockReturnValue(false);
      const body = {
        _id: 'rt1',
        order: 2,
        name: 'newName',
        lang: 'ja',
        target_langs: ['en'],
      };

      await roomTagService.update(body, adminJwt);

      expect(translationService.translateTag).not.toHaveBeenCalled();
      expect(RoomTag.findByIdAndUpdate.mock.calls[0][1].translations).toEqual(['en:old']);
    });

    test('ルームタグが存在しない', async () => {
      RoomTag.findOne.mockResolvedValue(null);
      await expect(
        roomTagService.update({ _id: 'rtX', order: 1, name: 'x', lang: 'ja', target_langs: [] }, adminJwt)
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('削除', () => {
    const adminJwt = { user_role: 'Administrator', user_id: 'admin' };
    const userJwt = { user_role: 'User', user_id: 'u1' };

    beforeEach(() => {
      User.findOne.mockResolvedValue({ _id: 'admin' });
      RoomTag.findOne.mockResolvedValue({
        _id: 'rtDel',
        floor: 'f1',
        room: 'r1',
        name: 'del',
        user: 'owner',
        delete_flg: false,
      });
      Room.findOne.mockResolvedValue({ _id: 'r1', floor: 'f1' });
      Floor.findOne.mockResolvedValue({ _id: 'f1', user: 'owner' });
      mockFloorMember(null);
      RoomTag.findByIdAndUpdate.mockResolvedValue({ _id: 'rtDel', delete_flg: true });
    });

    test('管理者が削除', async () => {
      await expect(roomTagService.delete({ _id: 'rtDel' }, adminJwt)).resolves.toEqual(
        expect.objectContaining({ delete_flg: true })
      );
      expect(mockAssertNoActiveAIAnalysisReferences).toHaveBeenCalledWith(
        'room-tag',
        'rtDel'
      );
    });

    test('一般ユーザは 403', async () => {
      await expect(roomTagService.delete({ _id: 'rtDel' }, userJwt)).rejects.toBeInstanceOf(AppError);
    });

    test('AI解析設定から参照中ならルームタグを削除更新しない', async () => {
      mockAssertNoActiveAIAnalysisReferences.mockRejectedValue(
        new AppError({ code: 'CONFLICT' })
      );

      await expect(
        roomTagService.delete({ _id: 'rtDel' }, adminJwt)
      ).rejects.toBeInstanceOf(AppError);

      expect(RoomTag.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('インポート', () => {
    const adminJwt = { user_role: 'Administrator', user_id: 'admin' };
    const body = {
      floor_id: 'floor1',
      room_id: 'room1',
      csv: [
        [1, 'Tag-1'],
        [2, 'Tag-2'],
      ],
    };

    beforeEach(() => {
      User.findOne.mockResolvedValue({ _id: 'admin' });
      Room.findOne.mockResolvedValue({ _id: 'room1', floor: 'floor1' });
      Floor.findOne.mockResolvedValue({ _id: 'floor1', user: 'owner', lang: 'ja', target_langs: ['en'] });
      mockFloorMember(null);
      RoomTag.bulkWrite.mockResolvedValue({ ok: 1 });
      mockReconcileFinds({
        existing: [
          { _id: 'old1', name: 'Tag-1', delete_flg: false },
          { _id: 'oldX', name: 'Tag-X', delete_flg: false },
        ],
        active: [
          { _id: 'old1', order: 1, name: 'Tag-1' },
          { _id: 'new2', order: 2, name: 'Tag-2' },
        ],
      });
      translationService.translateTag.mockResolvedValue(['translated']);
    });

    test('同名タグをupsertし、対象外タグを最後に論理削除する', async () => {
      const result = await roomTagService.import(body, adminJwt);

      expect(RoomTag.bulkWrite).toHaveBeenCalledTimes(1);
      const [operations, options] = RoomTag.bulkWrite.mock.calls[0];
      expect(options).toEqual({ ordered: true });
      expect(operations[0].updateOne).toEqual(
        expect.objectContaining({
          filter: { floor: 'floor1', room: 'room1', name: 'Tag-1' },
          upsert: true,
        })
      );
      expect(operations[0].updateOne.update.$set).toEqual(
        expect.objectContaining({ order: 1, delete_flg: false, deleted_at: null })
      );
      expect(operations[1].updateOne.filter.name).toBe('Tag-2');
      expect(operations[2].updateMany.filter).toEqual({
        floor: 'floor1',
        room: 'room1',
        delete_flg: false,
        _id: { $in: ['oldX'] },
      });
      expect(operations[2].updateMany.update.$set.delete_flg).toBe(true);
      expect(translationService.translateTag).toHaveBeenCalledTimes(2);
      expect(result).toEqual([
        { _id: 'old1', order: 1, name: 'Tag-1' },
        { _id: 'new2', order: 2, name: 'Tag-2' },
      ]);
    });

    test('CSV内の同名タグはDB変更前に拒否する', async () => {
      await expect(
        roomTagService.import(
          {
            ...body,
            csv: [
              [1, 'Tag-1'],
              [2, 'Tag-1'],
            ],
          },
          adminJwt
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(translationService.translateTag).not.toHaveBeenCalled();
      expect(RoomTag.bulkWrite).not.toHaveBeenCalled();
    });

    test('翻訳失敗時はDBを変更しない', async () => {
      translationService.translateTag.mockRejectedValueOnce(new Error('translation failed'));

      await expect(roomTagService.import(body, adminJwt)).rejects.toThrow('translation failed');

      expect(RoomTag.find).not.toHaveBeenCalled();
      expect(RoomTag.bulkWrite).not.toHaveBeenCalled();
    });

    test('既存タグ名が重複している場合は曖昧な更新を拒否する', async () => {
      mockReconcileFinds({
        existing: [
          { _id: 'old1', name: 'Tag-1' },
          { _id: 'old2', name: 'Tag-1' },
        ],
      });

      await expect(roomTagService.import(body, adminJwt)).rejects.toBeInstanceOf(AppError);

      expect(RoomTag.bulkWrite).not.toHaveBeenCalled();
    });
  });

  describe('初期化', () => {
    const adminJwt = { user_role: 'Administrator', user_id: 'admin' };

    beforeEach(() => {
      User.findOne.mockResolvedValue({ _id: 'admin' });
      Room.findOne.mockResolvedValue({ _id: 'room1', floor: 'floor1' });
      Floor.findOne.mockResolvedValue({ _id: 'floor1', user: 'owner' });
      mockFloorMember(null);
      RoomTag.bulkWrite.mockResolvedValue({ ok: 1 });
      FloorTag.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'floor-tag-a', order: 1, name: 'A', lang: 'ja', translations: [] },
          { _id: 'floor-tag-b', order: 2, name: 'B', lang: 'ja', translations: [] },
        ]),
      });
      mockReconcileFinds({
        existing: [
          { _id: 'oldA', name: 'A', delete_flg: false },
          { _id: 'oldX', name: 'X', delete_flg: false },
        ],
        active: [
          { _id: 'oldA', order: 1, name: 'A' },
          { _id: 'newB', order: 2, name: 'B' },
        ],
      });
    });

    test('フロアタグと同名のルームタグ IDを維持して同期する', async () => {
      const result = await roomTagService.init({ room_id: 'room1' }, adminJwt);

      expect(FloorTag.find).toHaveBeenCalledWith({ floor: 'floor1', delete_flg: false });
      const [operations, options] = RoomTag.bulkWrite.mock.calls[0];
      expect(options).toEqual({ ordered: true });
      expect(operations[0].updateOne.filter).toEqual({ floor: 'floor1', room: 'room1', name: 'A' });
      expect(operations[1].updateOne.filter.name).toBe('B');
      expect(operations[0].updateOne.update.$set).not.toHaveProperty('source_floor_tag');
      expect(operations[0].updateOne.update.$setOnInsert.source_floor_tag).toBe(
        'floor-tag-a'
      );
      expect(operations[1].updateOne.update.$setOnInsert.source_floor_tag).toBe(
        'floor-tag-b'
      );
      expect(RoomTag.bulkWrite).toHaveBeenCalledTimes(2);
      expect(RoomTag.bulkWrite.mock.calls[1][0][0].updateMany.filter._id).toEqual({ $in: ['oldX'] });
      expect(mockPrepareRoomSettingInheritance).toHaveBeenCalledWith({
        floorId: 'floor1',
        roomId: 'room1',
        childTags: [
          expect.objectContaining({ name: 'B', source_floor_tag: 'floor-tag-b' }),
        ],
        userId: 'admin',
      });
      expect(result).toEqual([
        { _id: 'oldA', order: 1, name: 'A' },
        { _id: 'newB', order: 2, name: 'B' },
      ]);
    });

    test('フロアタグが空でも既存ルームタグを物理削除せず論理削除する', async () => {
      FloorTag.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
      mockReconcileFinds({
        existing: [{ _id: 'oldA', name: 'A', delete_flg: false }],
        active: [],
      });

      const result = await roomTagService.init({ room_id: 'room1' }, adminJwt);

      const [operations] = RoomTag.bulkWrite.mock.calls[0];
      expect(operations).toHaveLength(1);
      expect(operations[0].updateMany.filter).toEqual({
        floor: 'floor1',
        room: 'room1',
        delete_flg: false,
        _id: { $in: ['oldA'] },
      });
      expect(operations[0].updateMany.update.$set.delete_flg).toBe(true);
      expect(result).toEqual([]);
    });

    test('フロアタグ名が重複している場合はDB変更前に拒否する', async () => {
      FloorTag.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { order: 1, name: 'A' },
          { order: 2, name: 'A' },
        ]),
      });

      await expect(roomTagService.init({ room_id: 'room1' }, adminJwt)).rejects.toBeInstanceOf(AppError);

      expect(RoomTag.find).not.toHaveBeenCalled();
      expect(RoomTag.bulkWrite).not.toHaveBeenCalled();
    });
  });

  describe('管理画面向けのページ単位の一覧取得', () => {
    const adminJwt = { user_role: 'Administrator', user_id: 'admin' };

    beforeEach(() => {
      RoomTag.paginate.mockResolvedValue({ docs: [] });
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator', delete_flg: false });
    });

    test('一覧取得', async () => {
      await roomTagService.managementPaginate({ page: 5 }, adminJwt);
      expect(RoomTag.paginate).toHaveBeenCalledWith({}, expect.objectContaining({ page: 5, limit: 10 }));
    });

    test('検索・削除状態・所属先を一覧の仕様へ含める', async () => {
      await roomTagService.managementPaginate(
        { page: 1, search: 'tag', delete_flg: false },
        adminJwt
      );

      const [query, options] = RoomTag.paginate.mock.calls[0];
      expect(query).toEqual({
        name: { $regex: 'tag', $options: 'i' },
        delete_flg: false,
      });
      expect(options.populate).toEqual(
        expect.arrayContaining([
          { path: 'floor', select: 'title delete_flg' },
          { path: 'room', select: 'title delete_flg floor' },
          { path: 'source_floor_tag', select: 'name delete_flg floor' },
        ])
      );
    });
  });

  describe('管理画面からの更新', () => {
    const adminJwt = { user_role: 'Administrator', user_id: 'admin' };

    beforeEach(() => {
      RoomTag.findOneAndUpdate.mockImplementation((_filter, data) => ({
        _id: 'rtM',
        ...data,
      }));
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator', delete_flg: false });
      RoomTag.findOne.mockResolvedValue({
        _id: 'rtM',
        room: 'r1',
        name: 'Old tag',
        lang: 'ja',
        translations: [{ lang: 'en', name: 'Old tag' }],
        delete_flg: false,
      });
      Room.findOne.mockResolvedValue({ _id: 'r1', floor: 'f1' });
      Floor.findOne.mockResolvedValue({ _id: 'f1', target_langs: ['en'] });
      translationService.translateTag.mockResolvedValue([{ lang: 'en', name: 'Managed tag' }]);
    });

    test('更新', async () => {
      const body = { _id: 'rtM', order: 7, name: 'Mng', lang: 'he', delete_flg: false };
      const res = await roomTagService.managementUpdate(body, adminJwt);

      expect(RoomTag.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'rtM', delete_flg: false },
        expect.objectContaining({
          order: 7,
          name: 'Mng',
          lang: 'he',
          translations: [{ lang: 'en', name: 'Managed tag' }],
        }),
        expect.objectContaining({ new: true })
      );
      const update = RoomTag.findOneAndUpdate.mock.calls[0][1];
      expect(update).not.toHaveProperty('delete_flg');
      expect(update).not.toHaveProperty('deleted_at');
      expect(translationService.translateTag).toHaveBeenCalledWith(
        'admin',
        { lang: 'he', name: 'Mng' },
        ['en']
      );
      expect(res._id).toBe('rtM');
    });

    test('受信した削除状態と保存状態が異なる場合は更新しない', async () => {
      await expect(
        roomTagService.managementUpdate(
          { _id: 'rtM', order: 1, name: 'x', lang: 'ja', delete_flg: true },
          adminJwt
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(RoomTag.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockAssertNoActiveAIAnalysisReferences).not.toHaveBeenCalled();
      expect(mockAssertRoomTagParentActive).not.toHaveBeenCalled();
    });
  });

  describe('管理画面からの削除状態の変更', () => {
    const adminJwt = { user_id: 'admin' };

    test('管理者が状態項目だけを更新する', async () => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      RoomTag.findOne.mockResolvedValue({
        _id: 'rt1',
        room: 'r1',
        name: 'Current',
        order: 3,
        delete_flg: false,
      });
      RoomTag.findOneAndUpdate.mockResolvedValue({ _id: 'rt1', delete_flg: true });

      await roomTagService.managementSetDeleteState(
        { _id: 'rt1', delete_flg: true },
        adminJwt
      );

      expect(RoomTag.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'rt1', delete_flg: false },
        {
          delete_flg: true,
          deleted_at: expect.any(Number),
          updated_at: expect.any(Number),
        },
        { new: true, runValidators: true }
      );
      const update = RoomTag.findOneAndUpdate.mock.calls[0][1];
      expect(update).not.toHaveProperty('name');
      expect(update).not.toHaveProperty('order');
    });
  });
});
