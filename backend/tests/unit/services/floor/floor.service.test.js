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

jest.mock('../../../../services/floor/floorProvisioning.service', () => ({
  provisionFloorResources: jest.fn(),
  refreshFloorResourceTranslations: jest.fn(),
  rollbackFloorProvisioning: jest.fn(),
  targetLanguagesChanged: jest.fn(
    (current = [], next = []) =>
      current.length !== next.length || current.some((language, index) => language !== next[index])
  ),
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

jest.mock('../../../../models/User', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/CategoryTag', () => ({ find: jest.fn() }));
jest.mock('../../../../models/Floor', () => ({
  find: jest.fn(),
  paginate: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn(),
}));
jest.mock('../../../../models/FloorMember', () => ({ find: jest.fn(), findOne: jest.fn() }));
jest.mock('../../../../models/FloorTag', () => ({ find: jest.fn(), create: jest.fn() }));

jest.mock(
  '../../../../utils/appError',
  () =>
    function AppError(message, statusCode) {
      this.message = message;
      this.statusCode = statusCode;
    }
);

const floorService = require('../../../../services/floor/floor.service');
const User = require('../../../../models/User');
const Floor = require('../../../../models/Floor');
const FloorMember = require('../../../../models/FloorMember');
const translationService = require('../../../../services/translation.service');
const floorProvisioningService = require('../../../../services/floor/floorProvisioning.service');
const AppError = require('../../../../utils/appError');

describe('フロアのサービス', () => {
  const ORIGINAL_ENV = process.env;
  const MEDIA_PATH = '/test-fixtures/floor-service/media';

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleTranslateEnabled.mockReturnValue(true);
    mockAssertNoActiveAIAnalysisReferences.mockResolvedValue(undefined);
    process.env = { ...ORIGINAL_ENV, MEDIA_PATH };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  describe('ゲスト向けのページ単位の一覧取得', () => {
    test('検索なし', async () => {
      Floor.paginate.mockResolvedValue({ docs: [] });

      await expect(floorService.guestPaginate({ page: 1, search: null })).resolves.toEqual({ docs: [] });

      expect(Floor.paginate).toHaveBeenCalledWith(
        { floor_display_hidden: { $ne: true }, delete_flg: false },
        expect.objectContaining({ page: 1, limit: 9 })
      );
    });

    test('検索あり', async () => {
      Floor.paginate.mockResolvedValue({ docs: [] });

      await floorService.guestPaginate({ page: 2, search: 'test' });

      const query = Floor.paginate.mock.calls[0][0];
      expect(query.$or).toBeDefined();
      expect(query.$or[0].title).toMatchObject({ $regex: 'test', $options: expect.stringContaining('i') });
      expect(query.$or[1].description).toMatchObject({ $regex: 'test', $options: expect.stringContaining('i') });
    });
  });

  describe('ページ単位の一覧取得', () => {
    const jwtAdmin = { user_role: 'Administrator', user_id: 'adminId' };
    const jwtEditor = { user_role: 'Editor', user_id: 'editorId' };
    const jwtUser = { user_role: 'User', user_id: 'userId' };

    beforeEach(() => {
      FloorMember.find.mockImplementation(() => ({
        distinct: jest.fn().mockResolvedValue([]),
      }));
      Floor.paginate.mockResolvedValue({ docs: [] });
    });

    test('管理者は全件取得', async () => {
      await floorService.paginate({ page: 1, search: null }, jwtAdmin);
      expect(Floor.paginate).toHaveBeenCalledWith(
        { delete_flg: false },
        expect.objectContaining({ page: 1, limit: 9 })
      );
    });

    test('フロア編集ユーザは非表示を含め関連するフロアを取得できる', async () => {
      FloorMember.find.mockImplementation(() => ({
        distinct: jest.fn().mockResolvedValue(['f1', 'f2']),
      }));

      await floorService.paginate({ page: 1, search: null }, jwtEditor);

      const query = Floor.paginate.mock.calls[0][0];
      expect(query.$or).toHaveLength(3); // 表示中・非表示だが所属済み・自分が作成したフロアの3条件を確認する。
    });

    test('一般ユーザは検索語と表示状態・所属の条件を組み合わせて取得する', async () => {
      FloorMember.find.mockImplementation(() => ({
        distinct: jest.fn().mockResolvedValue(['fx']),
      }));

      await floorService.paginate({ page: 3, search: 'abc' }, jwtUser);

      const query = Floor.paginate.mock.calls[0][0];
      expect(query.$and).toBeDefined(); // 検索語に一致し、表示・所属・作成者のいずれかの条件を満たすフロアを取得する。
    });
  });

  describe('権限取得', () => {
    const floorId = 'floor1';
    const adminJwt = { user_role: 'Administrator', user_id: 'uid1' };
    const editorJwt = { user_role: 'Editor', user_id: 'uid2' };
    const userJwt = { user_role: 'User', user_id: 'uid3' };

    test('管理者にはAdministratorを返す', async () => {
      User.findOne.mockResolvedValue({ _id: 'uid1' });
      Floor.findOne.mockResolvedValue({ _id: floorId });
      await expect(floorService.getRole({ floor_id: floorId }, adminJwt)).resolves.toEqual({
        role: 'Administrator',
      });
    });

    test('フロアを作成した編集ユーザにはFloorEditorを返す', async () => {
      User.findOne.mockResolvedValue({ _id: 'uid2' });
      Floor.findOne.mockResolvedValue({ _id: floorId, user: 'uid2' });
      await expect(floorService.getRole({ floor_id: floorId }, editorJwt)).resolves.toEqual({
        role: 'FloorEditor',
      });
    });

    test('フロアメンバーにはFloorMemberを返す', async () => {
      User.findOne.mockResolvedValue({ _id: 'uid3' });
      Floor.findOne.mockResolvedValue({ _id: floorId, user: 'someone' });
      FloorMember.findOne.mockResolvedValue({ _id: 'fm1' });
      await expect(floorService.getRole({ floor_id: floorId }, userJwt)).resolves.toEqual({ role: 'FloorMember' });
    });

    test('それ以外のユーザにはAuthorを返す', async () => {
      User.findOne.mockResolvedValue({ _id: 'uid3' });
      Floor.findOne.mockResolvedValue({ _id: floorId, user: 'someone' });
      FloorMember.findOne.mockResolvedValue(null);
      await expect(floorService.getRole({ floor_id: floorId }, userJwt)).resolves.toEqual({ role: 'Author' });
    });

    test('ユーザが存在しない', async () => {
      User.findOne.mockResolvedValue(null);
      await expect(floorService.getRole({ floor_id: floorId }, userJwt)).rejects.toBeInstanceOf(AppError);
    });

    test('フロアが存在しない', async () => {
      User.findOne.mockResolvedValue({ _id: 'uid3' });
      Floor.findOne.mockResolvedValue(null);
      await expect(floorService.getRole({ floor_id: floorId }, userJwt)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('フロアの表示状態の変更', () => {
    const adminJwt = { user_role: 'Administrator', user_id: 'admin' };
    const editorJwt = { user_role: 'Editor', user_id: 'editor' };
    const userJwt = { user_role: 'User', user_id: 'user' };

    beforeEach(() => {
      Floor.updateMany.mockResolvedValue({ modifiedCount: 1 });
      User.findOne.mockResolvedValue({ _id: 'dummy', username: 'test' });
    });

    test('管理者は全フロア対象', async () => {
      await floorService.updateFloorDisplayHidden({ floor_display_hidden: true }, adminJwt);
      expect(Floor.updateMany).toHaveBeenCalledWith(
        { delete_flg: false },
        { floor_display_hidden: true },
        expect.any(Object)
      );
    });

    test('フロア編集ユーザは自分のフロアのみ', async () => {
      await floorService.updateFloorDisplayHidden({ floor_display_hidden: false }, editorJwt);
      expect(Floor.updateMany).toHaveBeenCalledWith(
        { user: 'editor', delete_flg: false },
        { floor_display_hidden: false },
        expect.any(Object)
      );
    });

    test('一般ユーザは 401', async () => {
      await expect(
        floorService.updateFloorDisplayHidden({ floor_display_hidden: false }, userJwt)
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('削除', () => {
    const floorId = 'floorDel';
    const adminJwt = { user_role: 'Administrator', user_id: 'admin' };
    const editorJwt = { user_role: 'Editor', user_id: 'editor' };
    const otherEditorJwt = { user_role: 'Editor', user_id: 'other' };

    beforeEach(() => {
      User.findOne.mockResolvedValue({ _id: 'any', username: 'U' });
      Floor.findOne.mockResolvedValue({ _id: floorId, user: 'editor', title: 'F' });
      Floor.findByIdAndUpdate.mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue({ _id: floorId, title: 'F', user: {} }),
      }));
    });

    test('管理者が削除', async () => {
      await expect(floorService.delete({ _id: floorId }, adminJwt)).resolves.toBeDefined();
      expect(mockWithAIAnalysisIntegrityLock).toHaveBeenCalledWith(expect.any(Function));
      expect(Floor.findByIdAndUpdate).toHaveBeenCalledWith(
        floorId,
        expect.objectContaining({ delete_flg: true }),
        expect.any(Object)
      );
    });

    test('フロア編集ユーザ (作成者) が削除', async () => {
      await expect(floorService.delete({ _id: floorId }, editorJwt)).resolves.toBeDefined();
    });

    test('作成者ではないフロア編集ユーザによる削除を拒否する', async () => {
      await expect(floorService.delete({ _id: floorId }, otherEditorJwt)).rejects.toBeInstanceOf(AppError);
    });

    test('フロアが存在しない', async () => {
      Floor.findOne.mockResolvedValue(null);
      await expect(floorService.delete({ _id: floorId }, adminJwt)).rejects.toBeInstanceOf(AppError);
    });

    test('AI解析設定が有効でも設定を削除せずフロアを論理削除する', async () => {
      mockAssertNoActiveAIAnalysisReferences.mockRejectedValue(
        new AppError({ code: 'CONFLICT' })
      );

      await expect(
        floorService.delete({ _id: floorId }, adminJwt)
      ).resolves.toBeDefined();

      expect(mockAssertNoActiveAIAnalysisReferences).not.toHaveBeenCalled();
      expect(Floor.findByIdAndUpdate).toHaveBeenCalledWith(
        floorId,
        expect.objectContaining({ delete_flg: true }),
        expect.any(Object)
      );
    });
  });

  describe('管理画面向けのページ単位の一覧取得', () => {
    test('管理者は paginate を呼ぶ', async () => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      Floor.paginate.mockResolvedValue({ docs: [] });

      const res = await floorService.managementPaginate({ page: 1, search: 'x' }, { user_id: 'admin' });

      const query = Floor.paginate.mock.calls[0][0];
      expect(query.$or).toBeDefined();
      expect(res).toEqual({ docs: [] });
    });

    test('削除状態を検索条件へ含める', async () => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      Floor.paginate.mockResolvedValue({ docs: [] });

      await floorService.managementPaginate(
        { page: 1, search: null, delete_flg: false },
        { user_id: 'admin' }
      );

      expect(Floor.paginate).toHaveBeenCalledWith(
        { delete_flg: false },
        expect.objectContaining({ page: 1 })
      );
    });

    test('非管理者は 403', async () => {
      User.findOne.mockResolvedValue({ _id: 'u1', role: 'User' });
      await expect(
        floorService.managementPaginate({ page: 1, search: null }, { user_id: 'u1' })
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('管理画面向けの詳細取得', () => {
    test('管理者は論理削除済みフロアも取得できる', async () => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      const deletedFloor = { _id: 'f1', title: 'Deleted Floor', delete_flg: true };
      const populate = jest.fn().mockResolvedValue(deletedFloor);
      Floor.findById.mockReturnValue({ populate });

      const result = await floorService.managementGetDetail(
        { _id: 'f1' },
        { user_id: 'admin' }
      );

      expect(Floor.findById).toHaveBeenCalledWith('f1');
      expect(populate).toHaveBeenCalledWith('user', 'username image_name');
      expect(result).toEqual(deletedFloor);
    });

    test('存在しないフロアは拒否する', async () => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      Floor.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });

      await expect(
        floorService.managementGetDetail({ _id: 'missing' }, { user_id: 'admin' })
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('管理画面からの更新', () => {
    test('変更なしでも更新できる', async () => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      Floor.findOne.mockResolvedValue({
        _id: 'f1',
        title: 'T',
        description: 'D',
        lang: 'ja',
        target_langs: ['en'],
        image_name: null,
        delete_flg: false,
      });
      const updated = { _id: 'f1', image_name: null };
      Floor.findOneAndUpdate.mockReturnValue({ populate: jest.fn().mockResolvedValue(updated) });

      const res = await floorService.managementUpdate(
        {
          _id: 'f1',
          title: 'T',
          description: 'D',
          lang: 'ja',
          target_langs: ['en'],
          image_name: null,
          floor_display_hidden: false,
          delete_flg: false,
        },
        { user_id: 'admin' }
      );

      expect(Floor.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'f1', delete_flg: false },
        expect.not.objectContaining({ delete_flg: expect.anything() }),
        expect.objectContaining({ new: true, runValidators: true })
      );
      const update = Floor.findOneAndUpdate.mock.calls[0][1];
      expect(update).not.toHaveProperty('deleted_at');
      expect(res).toEqual(updated);
    });

    test('受信した削除状態と保存状態が異なる場合は更新しない', async () => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      Floor.findOne.mockResolvedValue({
        _id: 'f1',
        title: 'T',
        description: 'D',
        lang: 'ja',
        target_langs: [],
        image_name: null,
        delete_flg: false,
      });

      await expect(
        floorService.managementUpdate(
          {
            _id: 'f1',
            title: 'T',
            description: 'D',
            lang: 'ja',
            target_langs: [],
            image_name: null,
            floor_display_hidden: false,
            delete_flg: true,
          },
          { user_id: 'admin' }
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(Floor.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockAssertNoActiveAIAnalysisReferences).not.toHaveBeenCalled();
    });

    test('条件付き編集の直前に状態が変わった場合は409にする', async () => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      Floor.findOne.mockResolvedValue({
        _id: 'f1',
        title: 'T',
        description: 'D',
        lang: 'ja',
        target_langs: [],
        image_name: null,
        delete_flg: false,
      });
      Floor.findOneAndUpdate.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
      Floor.findById.mockResolvedValue({ _id: 'f1', delete_flg: true });

      await expect(
        floorService.managementUpdate(
          {
            _id: 'f1',
            title: 'T',
            description: 'D',
            lang: 'ja',
            target_langs: [],
            image_name: null,
            floor_display_hidden: false,
            delete_flg: false,
          },
          { user_id: 'admin' }
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(Floor.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'f1', delete_flg: false },
        expect.not.objectContaining({ delete_flg: expect.anything() }),
        expect.objectContaining({ new: true, runValidators: true })
      );
    });

    test('翻訳先言語の変更を関連リソースへ伝播する', async () => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      Floor.findOne.mockResolvedValue({
        _id: 'f1',
        title: 'T',
        description: 'D',
        lang: 'ja',
        target_langs: ['en'],
        image_name: null,
        delete_flg: false,
      });
      Floor.findOneAndUpdate.mockReturnValue({
        populate: jest.fn().mockResolvedValue({ _id: 'f1', image_name: null }),
      });
      const translations = [{ lang: 'he', title: 'כותרת', description: 'תיאור' }];
      translationService.translateTitleAndDescription.mockResolvedValue(translations);

      await floorService.managementUpdate(
        {
          _id: 'f1',
          title: 'T',
          description: 'D',
          lang: 'ja',
          target_langs: ['en', 'he'],
          image_name: null,
          floor_display_hidden: false,
          delete_flg: false,
        },
        { user_id: 'admin' }
      );

      expect(Floor.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'f1', delete_flg: false },
        expect.objectContaining({ translations }),
        expect.objectContaining({ new: true, runValidators: true })
      );
      expect(floorProvisioningService.refreshFloorResourceTranslations).toHaveBeenCalledWith({
        floorId: 'f1',
        userId: 'admin',
        targetLangs: ['en', 'he'],
      });
    });

    test('Google翻訳無効時はtarget_langsと保存済み翻訳を変更しない', async () => {
      mockIsGoogleTranslateEnabled.mockReturnValue(false);
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      Floor.findOne.mockResolvedValue({
        _id: 'f1',
        title: 'Old',
        description: 'Old description',
        lang: 'ja',
        target_langs: ['en'],
        translations: [{ lang: 'en', title: 'Old EN' }],
        image_name: null,
        delete_flg: false,
      });
      Floor.findOneAndUpdate.mockReturnValue({
        populate: jest.fn().mockResolvedValue({ _id: 'f1', image_name: null }),
      });

      await floorService.managementUpdate(
        {
          _id: 'f1',
          title: 'New',
          description: 'New description',
          lang: 'ja',
          target_langs: [],
          image_name: null,
          floor_display_hidden: false,
          delete_flg: false,
        },
        { user_id: 'admin' }
      );

      const update = Floor.findOneAndUpdate.mock.calls[0][1];
      expect(update.target_langs).toEqual(['en']);
      expect(update).not.toHaveProperty('translations');
      expect(translationService.translateTitleAndDescription).not.toHaveBeenCalled();
      expect(floorProvisioningService.refreshFloorResourceTranslations).not.toHaveBeenCalled();
    });

    test('フロア未検出は 400', async () => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      Floor.findOne.mockResolvedValue(null);

      await expect(
        floorService.managementUpdate({ _id: 'f1', title: 'T' }, { user_id: 'admin' })
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('管理画面からの削除状態の変更', () => {
    test('同一状態では更新せず参照先を展開した同じ応答形状で返す', async () => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      const populated = {
        _id: 'f1',
        user: { _id: 'u1', username: 'Owner', image_name: 'owner.png' },
        delete_flg: true,
      };
      const foundFloor = {
        _id: 'f1',
        user: 'u1',
        delete_flg: true,
        populate: jest.fn().mockResolvedValue(populated),
      };
      Floor.findById.mockResolvedValue(foundFloor);

      await expect(
        floorService.managementSetDeleteState(
          { _id: 'f1', delete_flg: true },
          { user_id: 'admin' }
        )
      ).resolves.toEqual(populated);

      expect(foundFloor.populate).toHaveBeenCalledWith('user', 'username image_name');
      expect(Floor.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockAssertNoActiveAIAnalysisReferences).not.toHaveBeenCalled();
    });

    test('状態と日時だけを更新する', async () => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      Floor.findById.mockResolvedValue({
        _id: 'f1',
        title: '変更しないタイトル',
        delete_flg: false,
      });
      const updated = { _id: 'f1', title: '変更しないタイトル', delete_flg: true };
      Floor.findOneAndUpdate.mockReturnValue({
        populate: jest.fn().mockResolvedValue(updated),
      });

      const result = await floorService.managementSetDeleteState(
        { _id: 'f1', delete_flg: true },
        { user_id: 'admin' }
      );

      expect(mockAssertNoActiveAIAnalysisReferences).not.toHaveBeenCalled();
      expect(Floor.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'f1', delete_flg: false },
        {
          delete_flg: true,
          deleted_at: expect.any(Number),
          updated_at: expect.any(Number),
        },
        { new: true, runValidators: true }
      );
      expect(Floor.findOneAndUpdate.mock.calls[0][1]).not.toHaveProperty('title');
      expect(result).toEqual(updated);
    });

    test('AI解析設定が有効でも設定を削除せず論理削除する', async () => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      Floor.findById.mockResolvedValue({ _id: 'f1', delete_flg: false });
      mockAssertNoActiveAIAnalysisReferences.mockRejectedValue(
        new AppError({ code: 'CONFLICT' })
      );
      const updated = { _id: 'f1', delete_flg: true };
      Floor.findOneAndUpdate.mockReturnValue({
        populate: jest.fn().mockResolvedValue(updated),
      });

      await expect(
        floorService.managementSetDeleteState(
          { _id: 'f1', delete_flg: true },
          { user_id: 'admin' }
        )
      ).resolves.toEqual(updated);

      expect(mockAssertNoActiveAIAnalysisReferences).not.toHaveBeenCalled();
      expect(Floor.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'f1', delete_flg: false },
        expect.objectContaining({ delete_flg: true }),
        expect.objectContaining({ new: true, runValidators: true })
      );
    });

    test('状態変更の条件付き更新に負けた場合は409にする', async () => {
      User.findOne.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      Floor.findById
        .mockResolvedValueOnce({ _id: 'f1', delete_flg: false })
        .mockResolvedValueOnce({ _id: 'f1', delete_flg: true });
      Floor.findOneAndUpdate.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });

      await expect(
        floorService.managementSetDeleteState(
          { _id: 'f1', delete_flg: true },
          { user_id: 'admin' }
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(Floor.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'f1', delete_flg: false },
        expect.any(Object),
        expect.objectContaining({ new: true, runValidators: true })
      );
      expect(Floor.findById).toHaveBeenCalledTimes(2);
    });
  });
});
