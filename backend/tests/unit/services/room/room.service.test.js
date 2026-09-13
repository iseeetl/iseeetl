jest.mock('../../../../services/room/roomImage.service', () => ({ validateRoomImage: jest.fn(), removeReplacedRoomImage: jest.fn() }));
const { validateRoomImage, removeReplacedRoomImage } = require('../../../../services/room/roomImage.service');
const path = require('path');

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(true),
    unlink: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../../../../services/translation.service', () => ({
  translateTitleAndDescription: jest.fn(),
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

jest.mock('../../../../models/Floor', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/FloorTag', () => ({ find: jest.fn() }));
jest.mock('../../../../models/FloorMember', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/RoomMember', () => ({ find: jest.fn() }));
jest.mock('../../../../models/FloorQuickTextGroup', () => ({ find: jest.fn() }));
jest.mock('../../../../models/FloorQuickTextItem', () => ({ find: jest.fn() }));
jest.mock('../../../../models/Room', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn(),
  paginate: jest.fn(),
  bulkWrite: jest.fn(),
}));
jest.mock('../../../../models/RoomTag', () => ({ create: jest.fn() }));
jest.mock('../../../../models/RoomQuickTextGroup', () => ({ create: jest.fn() }));
jest.mock('../../../../models/RoomQuickTextItem', () => ({ create: jest.fn() }));
jest.mock('../../../../models/User', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/Chat', () => ({ find: jest.fn(), aggregate: jest.fn() }));

jest.mock(
  '../../../../utils/appError',
  () =>
    function AppError(message, statusCode) {
      this.message = message;
      this.statusCode = statusCode;
    }
);

const roomService = require('../../../../services/room/room.service');

const Floor = require('../../../../models/Floor');
const FloorMember = require('../../../../models/FloorMember');
const RoomMember = require('../../../../models/RoomMember');
const FloorTag = require('../../../../models/FloorTag');
const FloorQuickTextGroup = require('../../../../models/FloorQuickTextGroup');
const FloorQuickTextItem = require('../../../../models/FloorQuickTextItem');
const Room = require('../../../../models/Room');
const RoomTag = require('../../../../models/RoomTag');
const RoomQuickTextGroup = require('../../../../models/RoomQuickTextGroup');
const RoomQuickTextItem = require('../../../../models/RoomQuickTextItem');
const User = require('../../../../models/User');
const Chat = require('../../../../models/Chat');
const translationService = require('../../../../services/translation.service');
const fsPromises = require('fs').promises;
const AppError = require('../../../../utils/appError');

describe('ルームのサービス', () => {
  const ORIGINAL_ENV = process.env;
  const MEDIA_PATH = '/test-fixtures/room-service/media';

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleTranslateEnabled.mockReturnValue(true);
    mockAssertNoActiveAIAnalysisReferences.mockResolvedValue(undefined);
    process.env = { ...ORIGINAL_ENV, MEDIA_PATH };
    FloorQuickTextGroup.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    FloorQuickTextItem.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    RoomQuickTextGroup.create.mockResolvedValue([]);
    RoomQuickTextItem.create.mockResolvedValue([]);
  });

  const mockFloorMember = (val) => {
    FloorMember.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(val) });
  };

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  // 取得結果の順序も検証できるよう、モック内で並び替えを再現する。
  const mockRoomFindChain = (rooms) => {
    const chain = {};
    chain._data = Array.isArray(rooms) ? rooms : [];
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.sort = jest.fn().mockImplementation((_sortObj) => {
      const sorted = [...chain._data].sort((a, b) => {
        const ao = a.display_order ?? 0;
        const bo = b.display_order ?? 0;
        if (ao !== bo) return ao - bo;
        const ac = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bc = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bc - ac;
      });
      chain._data = sorted;
      return chain;
    });
    chain.lean = jest.fn().mockResolvedValue(chain._data);
    return chain;
  };

  const mockChatFindChain = (posts) => ({
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(posts),
  });

  const mockRoomMemberFindChain = (memberships) => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(memberships),
    };
    return chain;
  };

  describe('ゲスト向けの一覧取得', () => {
    test('非表示ルームを除外し display_order 昇順で返却', async () => {
      const floorLean = jest.fn().mockResolvedValue({ _id: 'f1', delete_flg: false });
      Floor.findOne.mockReturnValue({ lean: floorLean });

      const rooms = [
        { _id: 'r1', display_order: 5, created_at: '2025-01-02T00:00:00Z' },
        { _id: 'r2', display_order: 10, created_at: '2025-01-01T00:00:00Z' },
      ];
      const chain = mockRoomFindChain(rooms);
      Room.find.mockReturnValue(chain);

      Chat.aggregate.mockResolvedValue([]);

      const res = await roomService.guestList({ floor_id: 'f1' });

      expect(Floor.findOne).toHaveBeenCalledWith({ _id: 'f1', delete_flg: false });
      expect(Room.find).toHaveBeenCalledWith({
        floor: 'f1',
        room_display_hidden: { $ne: true },
        delete_flg: false,
      });
      expect(chain.sort).toHaveBeenCalledWith({ display_order: 1, created_at: -1 });
      expect(res.map((r) => r._id)).toEqual(['r1', 'r2']);
      expect(RoomMember.find).not.toHaveBeenCalled();
    });
  });

  describe('一覧取得', () => {
    const floor = { _id: 'f1', user: 'owner', delete_flg: false };

    beforeEach(() => {
      Room.find.mockImplementation(() => mockRoomFindChain([]));
      Chat.find.mockImplementation(() => mockChatFindChain([]));
      Floor.findOne.mockResolvedValue(floor);
      RoomMember.find.mockReturnValue(mockRoomMemberFindChain([]));
    });

    test('管理者は非表示を含むすべてのルームを取得できる', async () => {
      const jwt = { user_role: 'Administrator', user_id: 'admin' };
      mockFloorMember(null);

      await roomService.list({ floor_id: 'f1' }, jwt);

      expect(Room.find).toHaveBeenCalledWith({ floor: 'f1', delete_flg: false });
      expect(RoomMember.find).not.toHaveBeenCalled();
    });

    test('フロア作成者は非表示を含むすべてのルームを取得できる', async () => {
      const jwt = { user_role: 'Editor', user_id: 'owner' };
      mockFloorMember(null);

      await roomService.list({ floor_id: 'f1' }, jwt);

      expect(Room.find).toHaveBeenCalledWith({ floor: 'f1', delete_flg: false });
    });

    test('権限のないユーザには非表示ルームを返さない', async () => {
      const jwt = { user_role: 'User', user_id: 'someone' };
      mockFloorMember(null);

      await roomService.list({ floor_id: 'f1' }, jwt);

      expect(Room.find).toHaveBeenCalledWith({
        floor: 'f1',
        room_display_hidden: { $ne: true },
        delete_flg: false,
      });
    });

    test('現在ユーザのルームメンバーの所属を各ルームへ一括付与する', async () => {
      const rooms = [{ _id: 'r1' }, { _id: 'r2' }];
      const membershipChain = mockRoomMemberFindChain([{ room: 'r2' }]);
      Room.find.mockReturnValue(mockRoomFindChain(rooms));
      RoomMember.find.mockReturnValue(membershipChain);
      Chat.aggregate.mockResolvedValue([]);
      mockFloorMember(null);

      const result = await roomService.list(
        { floor_id: 'f1' },
        { user_role: 'Author', user_id: 'current-user' }
      );

      expect(RoomMember.find).toHaveBeenCalledWith({
        room: { $in: ['r1', 'r2'] },
        user: 'current-user',
      });
      expect(RoomMember.find).toHaveBeenCalledTimes(1);
      expect(membershipChain.select).toHaveBeenCalledWith('room');
      expect(result.map((room) => room.current_user_is_room_member)).toEqual([false, true]);
    });
  });

  describe('詳細取得', () => {
    test('populate したルームを返す', async () => {
      const populated = { _id: 'r1', floor: { _id: 'f1' } };
      const populate = jest.fn().mockResolvedValue(populated);
      Room.findOne.mockResolvedValue({ _id: 'r1', floor: 'f1', populate });
      Floor.findOne.mockResolvedValue({ _id: 'f1' });

      const res = await roomService.detail({ _id: 'r1' });

      expect(Room.findOne).toHaveBeenCalledWith({ _id: 'r1', delete_flg: false });
      expect(Floor.findOne).toHaveBeenCalledWith({ _id: 'f1', delete_flg: false });
      expect(populate).toHaveBeenCalledWith([
        { path: 'floor', select: 'title target_langs translations floor_display_hidden' },
        { path: 'user', select: 'username image_name' },
      ]);
      expect(res).toEqual(populated);
    });

    test('ルーム未検出は 404', async () => {
      Room.findOne.mockResolvedValue(null);
      await expect(roomService.detail({ _id: 'missing' })).rejects.toBeInstanceOf(AppError);
      expect(Floor.findOne).not.toHaveBeenCalled();
    });

    test('所属フロアが存在しないか論理削除済みの場合は 404', async () => {
      const populate = jest.fn();
      Room.findOne.mockResolvedValue({ _id: 'r1', floor: 'f1', populate });
      Floor.findOne.mockResolvedValue(null);

      await expect(roomService.detail({ _id: 'r1' })).rejects.toBeInstanceOf(AppError);

      expect(Floor.findOne).toHaveBeenCalledWith({ _id: 'f1', delete_flg: false });
      expect(populate).not.toHaveBeenCalled();
    });
  });

  describe('作成', () => {
    const body = {
      floor_id: 'f1',
      title: 'Room T',
      description: 'Desc',
      lang: 'ja',
      guest_reaction_only: false,
      member_only: false,
      room_display_hidden: false,
      notification: false,
      external_sns_button: false,
    };

    const floor = { _id: 'f1', user: 'owner', target_langs: [], delete_flg: false };

    // Mongooseのドキュメントと同様に、populateはPromiseを返す。
    const createdRoomDoc = {
      _id: 'r1',
      populate: jest.fn().mockResolvedValue({ _id: 'r1', title: 'Room T' }),
    };

    beforeEach(() => {
      translationService.translateTitleAndDescription.mockResolvedValue([]);
      translationService.translateTag.mockResolvedValue([]);

      User.findOne.mockResolvedValue({ _id: 'admin', username: 'A' });
      Floor.findOne.mockResolvedValue(floor);
      mockFloorMember(null);
      Room.create.mockResolvedValue(createdRoomDoc);
      FloorTag.find.mockResolvedValue([]);
      RoomTag.create.mockResolvedValue([]);
    });

    test('管理者が作成', async () => {
      const jwt = { user_role: 'Administrator', user_id: 'admin' };

      await roomService.create(body, jwt);

      expect(translationService.translateTitleAndDescription).toHaveBeenCalledWith('admin', 'Room T', 'Desc', 'ja', []);
      expect(Room.create).toHaveBeenCalledWith(
        expect.objectContaining({
          floor: 'f1',
          title: 'Room T',
          guest_reaction_only: false,
          room_display_hidden: false,
        })
      );
      expect(fsPromises.mkdir).toHaveBeenCalledWith(path.join(MEDIA_PATH, 'f1', 'r1'), expect.any(Object));
    });

    test('権限なしユーザは 403', async () => {
      const jwt = { user_role: 'User', user_id: 'notmember' };
      await expect(roomService.create(body, jwt)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('ルームの表示状態の変更', () => {
    const body = { floor_id: 'f1', room_display_hidden: true };
    const floor = { _id: 'f1', user: 'owner', delete_flg: false };

    beforeEach(() => {
      Floor.findOne.mockResolvedValue(floor);
      Room.updateMany.mockResolvedValue({ modifiedCount: 1 });
      User.findOne.mockResolvedValue({ _id: 'admin', username: 'A' });
      mockFloorMember(null);
    });

    test('管理者が一括更新', async () => {
      const jwt = { user_role: 'Administrator', user_id: 'admin' };

      await roomService.updateRoomDisplayHidden(body, jwt);

      expect(Room.updateMany).toHaveBeenCalledWith(
        { floor: 'f1', delete_flg: false },
        { room_display_hidden: true },
        expect.any(Object)
      );
    });

    test('権限なしユーザは 403', async () => {
      const jwt = { user_role: 'User', user_id: 'u' };
      await expect(roomService.updateRoomDisplayHidden(body, jwt)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('表示順の変更', () => {
    const body = {
      floor_id: 'f1',
      displayorders: [
        { _id: 'r1', display_order: 1 },
        { _id: 'r2', display_order: 2 },
      ],
    };
    const floor = { _id: 'f1', user: 'owner', delete_flg: false };

    beforeEach(() => {
      User.findOne.mockResolvedValue({ _id: 'owner', username: 'O' });
      Floor.findOne.mockResolvedValue(floor);
      mockFloorMember(null);
      Room.bulkWrite.mockResolvedValue({ ok: 1 });
    });

    test('フロア作成者(フロア編集ユーザ) が順序更新', async () => {
      const jwt = { user_role: 'Editor', user_id: 'owner' };

      const status = await roomService.updateDisplayOrder(body, jwt);

      expect(status).toBe(200);
      expect(Room.bulkWrite).toHaveBeenCalledTimes(1);
      const ops = Room.bulkWrite.mock.calls[0][0];
      expect(Array.isArray(ops)).toBe(true);
      expect(ops).toHaveLength(2);
    });
  });

  describe('削除', () => {
    const body = {
      floor_id: 'f1',
      floor_title: 'F',
      _id: 'r1',
      title: 'R',
    };
    const floor = { _id: 'f1', user: 'owner', delete_flg: false };
    const room = { _id: 'r1', floor: 'f1', user: 'owner', delete_flg: false };

    beforeEach(() => {
      User.findOne.mockResolvedValue({ _id: 'admin', username: 'A' });
      Room.findOne.mockResolvedValue(room);
      Floor.findOne.mockResolvedValue(floor);
      mockFloorMember(null);
      Room.findByIdAndUpdate.mockResolvedValue({ _id: 'r1', delete_flg: true });
    });

    test('管理者が削除', async () => {
      const jwt = { user_role: 'Administrator', user_id: 'admin' };

      const res = await roomService.delete(body, jwt);

      expect(res.delete_flg).toBe(true);
      expect(mockWithAIAnalysisIntegrityLock).toHaveBeenCalledWith(expect.any(Function));
      expect(Room.findByIdAndUpdate).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ delete_flg: true }),
        expect.any(Object)
      );
    });

    test('権限なしユーザは 403', async () => {
      const jwt = { user_role: 'User', user_id: 'u' };
      await expect(roomService.delete(body, jwt)).rejects.toBeInstanceOf(AppError);
    });

    test('AI解析設定が有効でも設定を削除せずルームを論理削除する', async () => {
      const jwt = { user_role: 'Administrator', user_id: 'admin' };
      mockAssertNoActiveAIAnalysisReferences.mockRejectedValue(
        new AppError({ code: 'CONFLICT' })
      );

      await expect(roomService.delete(body, jwt)).resolves.toEqual({
        _id: 'r1',
        delete_flg: true,
      });

      expect(mockAssertNoActiveAIAnalysisReferences).not.toHaveBeenCalled();
      expect(Room.findByIdAndUpdate).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ delete_flg: true }),
        expect.any(Object)
      );
    });
  });

  describe('管理画面向けのページ単位の一覧取得', () => {
    const adminJwt = { user_role: 'Administrator', user_id: 'admin' };

    beforeEach(() => {
      Room.paginate.mockResolvedValue({ docs: [] });
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator', delete_flg: false });
    });

    test('ページ取得', async () => {
      await roomService.managementPaginate({ page: 1 }, adminJwt);
      expect(Room.paginate).toHaveBeenCalledWith({}, expect.objectContaining({ page: 1, limit: 10 }));
    });

    test('floor_idで対象フロアのルームだけに絞り込む', async () => {
      await roomService.managementPaginate({ page: 1, floor_id: 'floor1' }, adminJwt);

      expect(Room.paginate).toHaveBeenCalledWith(
        { floor: 'floor1' },
        expect.objectContaining({ page: 1, limit: 10 })
      );
    });

    test('検索条件でクエリを組み立てる', async () => {
      await roomService.managementPaginate({ page: 1, search: 'room' }, adminJwt);
      const query = Room.paginate.mock.calls[0][0];
      expect(query.$or).toBeDefined();
      expect(query.$or).toHaveLength(2);
    });

    test('削除状態を検索条件へ含める', async () => {
      await roomService.managementPaginate({ page: 1, delete_flg: true }, adminJwt);

      expect(Room.paginate).toHaveBeenCalledWith(
        { delete_flg: true },
        expect.objectContaining({ page: 1, limit: 10 })
      );
    });
  });

  describe('管理画面からの更新', () => {
    const adminJwt = { user_role: 'Administrator', user_id: 'admin' };

    const body = {
      _id: 'r1',
      title: 'New',
      description: 'Desc',
      lang: 'he',
      image_name: 'new.png',
      guest_reaction_only: false,
      member_only: false,
      room_display_hidden: false,
      notification: true,
      external_sns_button: false,
      delete_flg: false,
    };

    const foundRoom = {
      _id: 'r1',
      floor: 'f1',
      title: 'Old',
      description: 'Old description',
      lang: 'ja',
      translations: [{ lang: 'en', title: 'Old', description: 'Old description' }],
      image_name: 'old.png',
      delete_flg: false,
    };
    const foundFloor = { _id: 'f1', target_langs: ['en'] };

    beforeEach(() => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator', delete_flg: false });
      Room.findOne.mockResolvedValue(foundRoom);
      Floor.findOne.mockResolvedValue(foundFloor);
      translationService.translateTitleAndDescription.mockResolvedValue([
        { lang: 'en', title: 'New', description: 'Description' },
      ]);
      Room.findOneAndUpdate.mockReturnValue({
        populate: jest.fn().mockResolvedValue({ _id: 'r1', delete_flg: false }),
      });
    });

    test('更新し旧画像削除', async () => {
      await roomService.managementUpdate(body, adminJwt);

      expect(Room.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'r1', delete_flg: false },
        expect.objectContaining({
          lang: 'he',
          notification: true,
          translations: [{ lang: 'en', title: 'New', description: 'Description' }],
        }),
        expect.objectContaining({ new: true })
      );
      const update = Room.findOneAndUpdate.mock.calls[0][1];
      expect(update).not.toHaveProperty('delete_flg');
      expect(update).not.toHaveProperty('deleted_at');
      expect(translationService.translateTitleAndDescription).toHaveBeenCalledWith(
        'admin',
        'New',
        'Desc',
        'he',
        ['en']
      );
      expect(validateRoomImage).toHaveBeenCalledWith({ room: foundRoom, imageName: body.image_name, userId: 'admin' });
      expect(removeReplacedRoomImage).toHaveBeenCalledWith(foundRoom, body.image_name);
    });

    test('受信した削除状態と保存状態が異なる場合は更新しない', async () => {
      await expect(
        roomService.managementUpdate({ ...body, delete_flg: true }, adminJwt)
      ).rejects.toBeInstanceOf(AppError);

      expect(Room.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockAssertNoActiveAIAnalysisReferences).not.toHaveBeenCalled();
      expect(fsPromises.unlink).not.toHaveBeenCalled();
    });

    test('条件付き編集の直前に状態が変わった場合は409にする', async () => {
      Room.findOneAndUpdate.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
      Room.findById.mockResolvedValue({ _id: 'r1', delete_flg: true });

      await expect(roomService.managementUpdate(body, adminJwt)).rejects.toBeInstanceOf(
        AppError
      );

      expect(Room.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'r1', delete_flg: false },
        expect.not.objectContaining({ delete_flg: expect.anything() }),
        expect.objectContaining({ new: true, runValidators: true })
      );
      expect(fsPromises.unlink).not.toHaveBeenCalled();
    });

    test('Google翻訳無効時は保存済み翻訳を保持する', async () => {
      mockIsGoogleTranslateEnabled.mockReturnValue(false);

      await roomService.managementUpdate(body, adminJwt);

      expect(Room.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'r1', delete_flg: false },
        expect.objectContaining({ translations: foundRoom.translations }),
        expect.objectContaining({ new: true })
      );
      expect(translationService.translateTitleAndDescription).not.toHaveBeenCalled();
    });
  });

  describe('管理画面からの削除状態の変更', () => {
    const adminJwt = { user_id: 'admin' };

    beforeEach(() => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
    });

    test('同一状態では更新せず参照先を展開した同じ応答形状で返す', async () => {
      const populated = {
        _id: 'r1',
        user: { _id: 'u1', username: 'Owner', image_name: 'owner.png' },
        floor: { _id: 'f1', title: 'Floor', delete_flg: false },
        delete_flg: true,
      };
      const foundRoom = {
        _id: 'r1',
        user: 'u1',
        floor: 'f1',
        delete_flg: true,
        populate: jest.fn().mockResolvedValue(populated),
      };
      Room.findById.mockResolvedValue(foundRoom);

      await expect(
        roomService.managementSetDeleteState(
          { _id: 'r1', delete_flg: true },
          adminJwt
        )
      ).resolves.toEqual(populated);

      expect(foundRoom.populate).toHaveBeenCalledWith([
        { path: 'user', select: 'username image_name' },
        { path: 'floor', select: 'title delete_flg' },
      ]);
      expect(Room.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockAssertNoActiveAIAnalysisReferences).not.toHaveBeenCalled();
    });

    test('状態と日時だけを更新する', async () => {
      Room.findById.mockResolvedValue({
        _id: 'r1',
        floor: 'f1',
        title: '変更しないタイトル',
        delete_flg: false,
      });
      const updated = {
        _id: 'r1',
        floor: { _id: 'f1', title: 'Floor' },
        delete_flg: true,
      };
      const updateQuery = { populate: jest.fn() };
      updateQuery.populate
        .mockReturnValueOnce(updateQuery)
        .mockResolvedValueOnce(updated);
      Room.findOneAndUpdate.mockReturnValue(updateQuery);

      const result = await roomService.managementSetDeleteState(
        { _id: 'r1', delete_flg: true },
        adminJwt
      );

      expect(mockAssertNoActiveAIAnalysisReferences).not.toHaveBeenCalled();
      expect(Room.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'r1', delete_flg: false },
        {
          delete_flg: true,
          deleted_at: expect.any(Number),
          updated_at: expect.any(Number),
        },
        { new: true, runValidators: true }
      );
      expect(Room.findOneAndUpdate.mock.calls[0][1]).not.toHaveProperty('title');
      expect(result).toEqual(updated);
    });

    test('AI解析設定が有効でも設定を削除せず論理削除する', async () => {
      Room.findById.mockResolvedValue({
        _id: 'r1',
        floor: 'f1',
        delete_flg: false,
      });
      mockAssertNoActiveAIAnalysisReferences.mockRejectedValue(
        new AppError({ code: 'CONFLICT' })
      );
      const updated = { _id: 'r1', floor: { _id: 'f1', title: 'Floor' }, delete_flg: true };
      const updateQuery = { populate: jest.fn() };
      updateQuery.populate
        .mockReturnValueOnce(updateQuery)
        .mockResolvedValueOnce(updated);
      Room.findOneAndUpdate.mockReturnValue(updateQuery);

      await expect(
        roomService.managementSetDeleteState(
          { _id: 'r1', delete_flg: true },
          adminJwt
        )
      ).resolves.toEqual(updated);

      expect(mockAssertNoActiveAIAnalysisReferences).not.toHaveBeenCalled();
      expect(Room.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'r1', delete_flg: false },
        expect.objectContaining({ delete_flg: true }),
        expect.objectContaining({ new: true, runValidators: true })
      );
    });

    test('削除済みフロア配下のルームは復元しない', async () => {
      Room.findById.mockResolvedValue({
        _id: 'r1',
        floor: 'f1',
        delete_flg: true,
      });
      Floor.findOne.mockResolvedValue(null);

      await expect(
        roomService.managementSetDeleteState(
          { _id: 'r1', delete_flg: false },
          adminJwt
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(Floor.findOne).toHaveBeenCalledWith({ _id: 'f1', delete_flg: false });
      expect(Room.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('状態変更の条件付き更新に負けた場合は409にする', async () => {
      Room.findById
        .mockResolvedValueOnce({ _id: 'r1', floor: 'f1', delete_flg: false })
        .mockResolvedValueOnce({ _id: 'r1', floor: 'f1', delete_flg: true });
      const updateQuery = { populate: jest.fn() };
      updateQuery.populate
        .mockReturnValueOnce(updateQuery)
        .mockResolvedValueOnce(null);
      Room.findOneAndUpdate.mockReturnValue(updateQuery);

      await expect(
        roomService.managementSetDeleteState(
          { _id: 'r1', delete_flg: true },
          adminJwt
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(Room.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'r1', delete_flg: false },
        expect.any(Object),
        expect.objectContaining({ new: true, runValidators: true })
      );
      expect(Room.findById).toHaveBeenCalledTimes(2);
    });
  });
});
