jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    promises: {
      ...actualFs.promises,
      unlink: jest.fn().mockResolvedValue(true),
    },
  };
});

jest.mock('nodemailer', () => {
  const mockSendMail = jest.fn().mockResolvedValue(true);
  return {
    __esModule: true,
    createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
    mockSendMail,
  };
});

jest.mock('../../../models/User', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  paginate: jest.fn(),
}));
jest.mock('../../../services/_shared/activeResource', () => ({
  findActiveUser: jest.fn(),
}));
jest.mock('../../../services/_shared/userSession', () => ({ signUserToken: jest.fn(() => 'new-session-token') }));
const mockIsMailDeliveryEnabled = jest.fn(() => false);
const mockIsOneSignalEnabled = jest.fn(() => true);
const mockGetMailDeliveryConfig = jest.fn(() => ({
  host: 'smtp.example.com',
  port: 25,
  appName: 'TESTAPP',
  appUrl: 'http://localhost',
  noReplyMail: 'noreply@example.com',
}));
const mockGetOneSignalConfig = jest.fn(() => ({
  externalIdSecret: 'test-onesignal-external-id-secret-32-bytes',
}));
jest.mock('../../../config/featureFlags', () => ({
  getMailDeliveryConfig: mockGetMailDeliveryConfig,
  getOneSignalConfig: mockGetOneSignalConfig,
  isMailDeliveryEnabled: mockIsMailDeliveryEnabled,
  isOneSignalEnabled: mockIsOneSignalEnabled,
}));
jest.mock('../../../socket/accessControl', () => ({
  disconnectUserSessionSockets: jest.fn(),
  revalidateUserSockets: jest.fn(),
}));
const mockSearchResultUsers = jest.fn();
jest.mock('../../../services/analysis/settings/setting.service', () => ({
  searchResultUsers: mockSearchResultUsers,
}));
const mockAssertNoActiveAIAnalysisReferences = jest.fn();
const mockWithAIAnalysisIntegrityLock = jest.fn((task) => task());
jest.mock('../../../services/analysis/settings/referenceIntegrity', () => ({
  assertNoActiveAIAnalysisReferences: mockAssertNoActiveAIAnalysisReferences,
  withAIAnalysisIntegrityLock: mockWithAIAnalysisIntegrityLock,
}));

jest.mock(
  '../../../utils/appError',
  () =>
    function AppError(message, statusCode) {
      this.message = message;
      this.statusCode = statusCode;
    }
);

const userService = require('../../../services/user.service');
const User = require('../../../models/User');
const { findActiveUser } = require('../../../services/_shared/activeResource');
const { signUserToken } = require('../../../services/_shared/userSession');
const { disconnectUserSessionSockets, revalidateUserSockets } = require('../../../socket/accessControl');
const fs = require('fs');
const nodemailer = require('nodemailer');
const sendMailMock = nodemailer.mockSendMail;
const AppError = require('../../../utils/appError');

describe('userのサービス', () => {
  const ORIGINAL_ENV = process.env;
  const PROFILE_PATH = '/test-fixtures/user-service/profile/';
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsMailDeliveryEnabled.mockReturnValue(false);
    mockIsOneSignalEnabled.mockReturnValue(true);
    mockGetMailDeliveryConfig.mockReturnValue({
      host: 'smtp.example.com',
      port: 25,
      appName: 'TESTAPP',
      appUrl: 'http://localhost',
      noReplyMail: 'noreply@example.com',
    });
    mockAssertNoActiveAIAnalysisReferences.mockResolvedValue(undefined);
    process.env = { ...ORIGINAL_ENV, PROFILE_PATH, NODE_ENV: 'test' };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  describe('ユーザ詳細取得', () => {
    test('条件どおり取得', async () => {
      const fakeUser = { _id: 'u' };
      findActiveUser.mockResolvedValue(fakeUser);

      await expect(userService.getUserDetail('u')).resolves.toBe(fakeUser);
      expect(findActiveUser).toHaveBeenCalledWith(
        'u',
        expect.objectContaining({
          select:
            'username image_name lang eye_friendly_mode push_enabled reply_push_enabled replied_post_push_enabled',
        })
      );
    });
  });

  describe('ユーザ更新', () => {
    const userId = 'uid42';
    const body = {
      username: 'Alice',
      image_name: 'new.png',
      lang: 'en',
      eye_friendly_mode: true,
      push_enabled: true,
      reply_push_enabled: false,
      replied_post_push_enabled: true,
    };

    const setFoundUser = (found) => findActiveUser.mockResolvedValue(found);

    test('更新 + 旧画像削除', async () => {
      setFoundUser({ _id: userId, image_name: 'old.png', username: 'Old' });
      User.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockResolvedValue({ _id: userId, username: 'Alice', image_name: 'new.png' }),
      });

      const result = await userService.updateUser(body, userId);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ username: 'Alice', image_name: 'new.png' }),
        { new: true, runValidators: true }
      );
      expect(fs.promises.unlink).toHaveBeenCalledWith(`${PROFILE_PATH}${userId}/old.png`);
      expect(result).toMatchObject({ username: 'Alice' });
    });

    test('旧画像が存在しない(ENOENT)でも更新成功する', async () => {
      setFoundUser({ _id: userId, image_name: 'old.png', username: 'Old' });
      fs.promises.unlink.mockRejectedValueOnce({ code: 'ENOENT' });
      User.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockResolvedValue({ _id: userId, username: 'Alice', image_name: 'new.png' }),
      });

      const result = await userService.updateUser(body, userId);

      expect(fs.promises.unlink).toHaveBeenCalledWith(`${PROFILE_PATH}${userId}/old.png`);
      expect(result).toMatchObject({ username: 'Alice' });
    });

    test('OneSignal無効時はpush設定の新規有効化をDB更新前に拒否する', async () => {
      mockIsOneSignalEnabled.mockReturnValue(false);
      setFoundUser({
        _id: userId,
        image_name: null,
        username: 'Old',
        push_enabled: false,
        reply_push_enabled: false,
        replied_post_push_enabled: false,
      });

      await expect(userService.updateUser(body, userId)).rejects.toMatchObject({
        message: {
          code: 'EXTERNAL_FEATURE_DISABLED',
          details: { feature: 'oneSignalPush' },
        },
      });
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test('OneSignal無効時の構成更新は保存済みpush設定を変更しない', async () => {
      mockIsOneSignalEnabled.mockReturnValue(false);
      setFoundUser({
        _id: userId,
        image_name: null,
        username: 'Old',
        push_enabled: true,
        reply_push_enabled: false,
        replied_post_push_enabled: true,
      });
      User.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockResolvedValue({ _id: userId, username: 'Alice' }),
      });
      const unrelatedUpdate = {
        ...body,
        push_enabled: false,
        reply_push_enabled: false,
        replied_post_push_enabled: false,
      };

      await userService.updateUser(unrelatedUpdate, userId);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          push_enabled: true,
          reply_push_enabled: false,
          replied_post_push_enabled: true,
        }),
        { new: true, runValidators: true }
      );
    });
  });

  describe('管理画面からのユーザ更新', () => {
    const id = 'mid';
    const base = {
      _id: id,
      username: 'New',
      mail: 'new@example.com',
      password: 'pw',
      role: 'User',
      delete_flg: false,
    };

    test('パスワード更新時は同一更新でセッション世代を増分する', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findOne.mockResolvedValue(null);
      User.findById.mockResolvedValue({
        _id: id,
        username: 'Old',
        mail: 'old@example.com',
        role: 'User',
        delete_flg: false,
      });
      User.findOneAndUpdate.mockResolvedValue({ _id: id });

      const res = await userService.managementUpdateUser(base, { user_id: 'admin' });
      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: id, delete_flg: false },
        {
          $set: expect.objectContaining({ password: 'pw' }),
          $inc: { session_version: 1 },
        },
        { new: true, runValidators: true }
      );
      expect(res).toEqual({ _id: id });
    });

    test('パスワード未指定ではセッション世代を増分しない', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findOne.mockResolvedValue(null);
      User.findById.mockResolvedValue({
        _id: id,
        username: 'Old',
        mail: 'old@example.com',
        role: 'User',
        delete_flg: false,
      });
      User.findOneAndUpdate.mockResolvedValue({ _id: id });
      const withoutPassword = { ...base };
      delete withoutPassword.password;

      await userService.managementUpdateUser(withoutPassword, { user_id: 'admin' });

      const updateOperation = User.findOneAndUpdate.mock.calls[0][1];
      expect(updateOperation).not.toHaveProperty('$inc');
      expect(updateOperation).not.toHaveProperty('password');
    });

    test('ロール変更後にユーザの既存Socketを現在権限で再評価する', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById.mockResolvedValue({
        _id: id,
        username: 'Target',
        mail: 'target@example.com',
        role: 'Editor',
        delete_flg: false,
      });
      User.findOneAndUpdate.mockResolvedValue({ _id: id, role: 'Author', delete_flg: false });
      const io = { in: jest.fn() };

      const result = await userService.managementUpdateUser(
        {
          ...base,
          username: 'Target',
          mail: 'target@example.com',
          password: undefined,
          role: 'Author',
          delete_flg: false,
        },
        { user_id: 'admin' },
        io
      );

      const updateOperation = User.findOneAndUpdate.mock.calls[0][1];
      expect(updateOperation).toEqual(expect.objectContaining({ role: 'Author' }));
      expect(updateOperation).not.toHaveProperty('$inc');
      expect(revalidateUserSockets).toHaveBeenCalledWith(io, { userId: id, userRole: 'Author' });
      expect(disconnectUserSessionSockets).not.toHaveBeenCalled();
      expect(mockWithAIAnalysisIntegrityLock).not.toHaveBeenCalled();
      expect(result).toMatchObject({ role: 'Author', delete_flg: false });
    });

    test('ロール同値の再送でも既存Socketを再評価する', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById.mockResolvedValue({
        _id: id,
        username: 'Target',
        mail: 'target@example.com',
        role: 'Author',
        delete_flg: false,
      });
      User.findOneAndUpdate.mockResolvedValue({ _id: id, role: 'Author', delete_flg: false });

      const io = { in: jest.fn() };
      await userService.managementUpdateUser(
        {
          ...base,
          username: 'Target',
          mail: 'target@example.com',
          password: undefined,
          role: 'Author',
          delete_flg: false,
        },
        { user_id: 'admin' },
        io
      );

      expect(revalidateUserSockets).toHaveBeenCalledWith(io, {
        userId: id,
        userRole: 'Author',
      });
      expect(disconnectUserSessionSockets).not.toHaveBeenCalled();
    });

    test('再評価だけ失敗した権限更新は同じデータの再送で再評価を再試行できる', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById
        .mockResolvedValueOnce({
          _id: id,
          username: 'Target',
          mail: 'target@example.com',
          role: 'Editor',
          delete_flg: false,
        })
        .mockResolvedValueOnce({
          _id: id,
          username: 'Target',
          mail: 'target@example.com',
          role: 'Author',
          delete_flg: false,
        });
      User.findOneAndUpdate.mockResolvedValue({
        _id: id,
        role: 'Author',
        delete_flg: false,
      });
      revalidateUserSockets
        .mockRejectedValueOnce(new Error('socket adapter failed'))
        .mockResolvedValueOnce(undefined);
      const io = { in: jest.fn() };
      const payload = {
        ...base,
        username: 'Target',
        mail: 'target@example.com',
        password: undefined,
        role: 'Author',
        delete_flg: false,
      };

      await expect(
        userService.managementUpdateUser(payload, { user_id: 'admin' }, io)
      ).rejects.toThrow('socket adapter failed');
      await expect(
        userService.managementUpdateUser(payload, { user_id: 'admin' }, io)
      ).resolves.toMatchObject({ role: 'Author' });

      expect(revalidateUserSockets).toHaveBeenCalledTimes(2);
      expect(revalidateUserSockets).toHaveBeenLastCalledWith(io, {
        userId: id,
        userRole: 'Author',
      });
    });

    test('削除済みユーザも同じ期待状態なら編集項目だけを更新できる', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById.mockResolvedValue({
        _id: id,
        username: 'LineUser',
        mail: null,
        role: 'Author',
        delete_flg: true,
      });
      User.findOneAndUpdate.mockResolvedValue({
        _id: id,
        mail: null,
        role: 'Editor',
        delete_flg: true,
      });
      const io = { in: jest.fn() };
      const result = await userService.managementUpdateUser(
        {
          ...base,
          username: 'LineUser',
          mail: null,
          password: undefined,
          role: 'Editor',
          delete_flg: 'true',
        },
        { user_id: 'admin' },
        io
      );

      expect(User.findOne).not.toHaveBeenCalled();
      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: id, delete_flg: true },
        expect.objectContaining({ role: 'Editor' }),
        { new: true, runValidators: true }
      );
      const updateOperation = User.findOneAndUpdate.mock.calls[0][1];
      expect(updateOperation).not.toHaveProperty('$inc');
      expect(updateOperation).not.toHaveProperty('mail');
      expect(updateOperation).not.toHaveProperty('delete_flg');
      expect(updateOperation).not.toHaveProperty('deleted_at');
      expect(disconnectUserSessionSockets).not.toHaveBeenCalled();
      expect(revalidateUserSockets).toHaveBeenCalledWith(io, {
        userId: id,
        userRole: 'Editor',
      });
      expect(result).toMatchObject({ mail: null, role: 'Editor', delete_flg: true });
      expect(mockAssertNoActiveAIAnalysisReferences).not.toHaveBeenCalled();
    });

    test('受信した削除状態と保存状態が異なる場合は更新しない', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById.mockResolvedValue({
        _id: id,
        username: 'Target',
        mail: null,
        role: 'Author',
        delete_flg: false,
      });
      await expect(
        userService.managementUpdateUser(
          {
            ...base,
            username: 'Target',
            mail: null,
            password: undefined,
            role: 'Author',
            delete_flg: true,
          },
          { user_id: 'admin' },
          { in: jest.fn() }
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(mockAssertNoActiveAIAnalysisReferences).not.toHaveBeenCalled();
      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(disconnectUserSessionSockets).not.toHaveBeenCalled();
    });

    test('ユーザを削除しない更新ではAI解析参照ガードを呼ばない', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById.mockResolvedValue({
        _id: id,
        username: 'Old',
        mail: 'old@example.com',
        role: 'Author',
        delete_flg: false,
      });
      User.findOneAndUpdate.mockResolvedValue({ _id: id, username: 'New' });

      await userService.managementUpdateUser(
        {
          ...base,
          password: undefined,
          role: 'Author',
          delete_flg: false,
        },
        { user_id: 'admin' }
      );

      expect(mockAssertNoActiveAIAnalysisReferences).not.toHaveBeenCalled();
    });

    test('パスワード変更でも状態項目を更新せずセッション世代だけを増分する', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById.mockResolvedValue({
        _id: id,
        username: 'Target',
        mail: null,
        role: 'Author',
        delete_flg: false,
      });
      User.findOneAndUpdate.mockResolvedValue({ _id: id, delete_flg: false });

      await userService.managementUpdateUser(
        {
          ...base,
          username: 'Target',
          mail: null,
          password: 'NewPassw0rd',
          role: 'Author',
          delete_flg: false,
        },
        { user_id: 'admin' },
        { in: jest.fn() }
      );

      const updateOperation = User.findOneAndUpdate.mock.calls[0][1];
      expect(updateOperation.$set.password).toBe('NewPassw0rd');
      expect(updateOperation.$inc).toEqual({ session_version: 1 });
      expect(updateOperation.$set).not.toHaveProperty('delete_flg');
      expect(updateOperation.$set).not.toHaveProperty('deleted_at');
    });

    test('削除済みユーザの通常編集ではSocketを切断しない', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById.mockResolvedValue({
        _id: id,
        username: 'Target',
        mail: null,
        role: 'Author',
        delete_flg: true,
      });
      User.findOneAndUpdate.mockResolvedValue({ _id: id, delete_flg: true, session_version: 1 });
      const io = { in: jest.fn() };

      await userService.managementUpdateUser(
        {
          ...base,
          username: 'Target',
          mail: null,
          password: undefined,
          role: 'Author',
          delete_flg: 'true',
        },
        { user_id: 'admin' },
        io
      );

      const updateOperation = User.findOneAndUpdate.mock.calls[0][1];
      expect(updateOperation).not.toHaveProperty('$inc');
      expect(updateOperation).not.toHaveProperty('delete_flg');
      expect(updateOperation).not.toHaveProperty('deleted_at');
      expect(disconnectUserSessionSockets).not.toHaveBeenCalled();
    });

    test('通常編集では削除済みユーザを復元できない', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById.mockResolvedValue({
        _id: id,
        username: 'Target',
        mail: null,
        role: 'Author',
        delete_flg: true,
      });
      await expect(
        userService.managementUpdateUser(
          {
            ...base,
            username: 'Target',
            mail: null,
            password: undefined,
            role: 'Author',
            delete_flg: 'false',
          },
          { user_id: 'admin' },
          { in: jest.fn() }
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
      expect(disconnectUserSessionSockets).not.toHaveBeenCalled();
    });

    test('条件付き編集の直前に削除された場合は409にする', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById
        .mockResolvedValueOnce({
          _id: id,
          username: 'Target',
          mail: null,
          role: 'Author',
          delete_flg: false,
        })
        .mockResolvedValueOnce({ _id: id, delete_flg: true, session_version: 1 });
      User.findOneAndUpdate.mockResolvedValue(null);
      const io = { in: jest.fn() };

      await expect(
        userService.managementUpdateUser(
          {
            ...base,
            username: 'Target',
            mail: null,
            password: undefined,
            role: 'Author',
            delete_flg: false,
          },
          { user_id: 'admin' },
          io
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: id, delete_flg: false },
        expect.not.objectContaining({ delete_flg: expect.anything() }),
        { new: true, runValidators: true }
      );
      expect(disconnectUserSessionSockets).not.toHaveBeenCalled();
    });

    test('mail=nullのユーザへメールを設定できる', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findOne.mockResolvedValue(null);
      User.findById.mockResolvedValue({
        _id: id,
        username: 'New',
        mail: null,
        role: 'Author',
        delete_flg: false,
      });
      User.findOneAndUpdate.mockResolvedValue({
        _id: id,
        mail: 'new@example.com',
        role: 'Author',
      });

      const result = await userService.managementUpdateUser(
        { ...base, password: undefined, role: 'Author' },
        { user_id: 'admin' }
      );

      expect(User.findOne).toHaveBeenCalledWith({ mail: 'new@example.com' });
      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: id, delete_flg: false },
        expect.objectContaining({ mail: 'new@example.com' }),
        { new: true, runValidators: true }
      );
      expect(result).toMatchObject({ mail: 'new@example.com' });
    });

    test('メールをnullへ変更する場合は重複検索を行わない', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById.mockResolvedValue({
        _id: id,
        username: 'New',
        mail: 'old@example.com',
        role: 'Author',
        delete_flg: false,
      });
      User.findOneAndUpdate.mockResolvedValue({
        _id: id,
        mail: null,
        role: 'Author',
      });

      const result = await userService.managementUpdateUser(
        { ...base, mail: null, password: undefined, role: 'Author' },
        { user_id: 'admin' }
      );

      expect(User.findOne).not.toHaveBeenCalled();
      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: id, delete_flg: false },
        expect.objectContaining({ mail: null }),
        { new: true, runValidators: true }
      );
      expect(result).toMatchObject({ mail: null });
    });

    test('一般ユーザを管理者へ昇格できない', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById.mockResolvedValue({
        _id: id,
        username: 'New',
        mail: 'new@example.com',
        role: 'Author',
        delete_flg: false,
      });

      await expect(
        userService.managementUpdateUser(
          { ...base, password: undefined, role: 'Administrator' },
          { user_id: 'admin' }
        )
      ).rejects.toBeInstanceOf(AppError);
      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('一般ユーザを開発者へ変更できる', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById.mockResolvedValue({
        _id: id,
        username: 'New',
        mail: 'new@example.com',
        role: 'Author',
        delete_flg: false,
      });
      User.findOneAndUpdate.mockResolvedValue({ _id: id, role: 'developer' });

      const result = await userService.managementUpdateUser(
        { ...base, password: undefined, role: 'developer' },
        { user_id: 'admin' }
      );

      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: id, delete_flg: false },
        expect.objectContaining({ role: 'developer' }),
        { new: true, runValidators: true }
      );
      expect(result).toMatchObject({ role: 'developer' });
    });

    test('管理者を降格できない', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById.mockResolvedValue({
        _id: id,
        username: 'TargetAdmin',
        mail: 'target-admin@example.com',
        role: 'Administrator',
        delete_flg: false,
      });

      await expect(
        userService.managementUpdateUser(
          {
            ...base,
            password: undefined,
            username: 'TargetAdmin',
            mail: 'target-admin@example.com',
            role: 'Editor',
          },
          { user_id: 'admin' }
        )
      ).rejects.toBeInstanceOf(AppError);
      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('管理者の論理削除状態を変更できない', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById.mockResolvedValue({
        _id: id,
        username: 'TargetAdmin',
        mail: 'target-admin@example.com',
        role: 'Administrator',
        delete_flg: false,
      });

      await expect(
        userService.managementUpdateUser(
          {
            ...base,
            password: undefined,
            username: 'TargetAdmin',
            mail: 'target-admin@example.com',
            role: 'Administrator',
            delete_flg: true,
          },
          { user_id: 'admin' }
        )
      ).rejects.toBeInstanceOf(AppError);
      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('管理者のロールと論理削除状態を維持すればユーザ情報を更新できる', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById.mockResolvedValue({
        _id: id,
        username: 'OldAdmin',
        mail: 'target-admin@example.com',
        role: 'Administrator',
        delete_flg: false,
      });
      User.findOneAndUpdate.mockResolvedValue({
        _id: id,
        username: 'UpdatedAdmin',
        role: 'Administrator',
      });

      const result = await userService.managementUpdateUser(
        {
          ...base,
          password: undefined,
          username: 'UpdatedAdmin',
          mail: 'target-admin@example.com',
          role: 'Administrator',
        },
        { user_id: 'admin' }
      );

      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: id, delete_flg: false },
        expect.objectContaining({ username: 'UpdatedAdmin' }),
        { new: true, runValidators: true }
      );
      const updateOperation = User.findOneAndUpdate.mock.calls[0][1];
      expect(updateOperation).not.toHaveProperty('role');
      expect(updateOperation).not.toHaveProperty('delete_flg');
      expect(result).toMatchObject({ username: 'UpdatedAdmin', role: 'Administrator' });
    });

    test('対象なし → 400', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById.mockResolvedValue(null);
      await expect(userService.managementUpdateUser(base, { user_id: 'admin' })).rejects.toBeInstanceOf(AppError);
    });

    test('メール重複 → AppError', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findOne.mockResolvedValue({ _id: 'dup' });
      User.findById.mockResolvedValue({
        _id: id,
        username: 'Old',
        mail: 'old@example.com',
        role: 'User',
        delete_flg: false,
      });
      await expect(userService.managementUpdateUser(base, { user_id: 'admin' })).rejects.toBeInstanceOf(AppError);
    });

    test('非管理者は 403', async () => {
      findActiveUser.mockResolvedValue({ _id: 'u1', role: 'User' });
      await expect(userService.managementUpdateUser(base, { user_id: 'u1' })).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('管理画面からの削除状態の変更', () => {
    const id = 'managed-user';

    test('対象ユーザが存在しない場合は404を返す', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById.mockResolvedValue(null);

      await expect(
        userService.managementSetDeleteState(
          { _id: id, delete_flg: true },
          { user_id: 'admin' }
        )
      ).rejects.toMatchObject({ message: { code: 'NOT_FOUND' } });

      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('論理削除は状態項目だけを更新しセッションを無効化する', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById.mockResolvedValue({
        _id: id,
        username: 'Before',
        mail: 'before@example.com',
        role: 'Author',
        delete_flg: false,
      });
      User.findOneAndUpdate.mockResolvedValue({
        _id: id,
        username: 'Before',
        role: 'Author',
        delete_flg: true,
      });
      const io = { in: jest.fn() };

      const result = await userService.managementSetDeleteState(
        { _id: id, delete_flg: true },
        { user_id: 'admin' },
        io
      );

      expect(mockAssertNoActiveAIAnalysisReferences).toHaveBeenCalledWith('user', id);
      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: id, delete_flg: false },
        {
          $set: {
            delete_flg: true,
            deleted_at: expect.any(Number),
            updated_at: expect.any(Number),
          },
          $inc: { session_version: 1 },
        },
        { new: true, runValidators: true }
      );
      const updateOperation = User.findOneAndUpdate.mock.calls[0][1];
      expect(updateOperation.$set).not.toHaveProperty('username');
      expect(updateOperation.$set).not.toHaveProperty('mail');
      expect(updateOperation.$set).not.toHaveProperty('role');
      expect(disconnectUserSessionSockets).toHaveBeenCalledWith(io, id);
      expect(result).toMatchObject({ _id: id, delete_flg: true });
    });

    test('削除済みユーザへの再削除はDBを更新せずSocket切断だけ再試行する', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      const deletedUser = {
        _id: id,
        role: 'Author',
        delete_flg: true,
        session_version: 3,
      };
      User.findById.mockResolvedValue(deletedUser);
      const io = { in: jest.fn() };

      await expect(
        userService.managementSetDeleteState(
          { _id: id, delete_flg: true },
          { user_id: 'admin' },
          io
        )
      ).resolves.toBe(deletedUser);

      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockAssertNoActiveAIAnalysisReferences).not.toHaveBeenCalled();
      expect(disconnectUserSessionSockets).toHaveBeenCalledWith(io, id);
    });

    test('Socket切断はAI参照整合性ロックの解放後に実行する', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById.mockResolvedValue({
        _id: id,
        role: 'Author',
        delete_flg: true,
      });
      let insideIntegrityLock = false;
      mockWithAIAnalysisIntegrityLock.mockImplementationOnce(async (task) => {
        insideIntegrityLock = true;
        try {
          return await task();
        } finally {
          insideIntegrityLock = false;
        }
      });
      disconnectUserSessionSockets.mockImplementationOnce(() => {
        expect(insideIntegrityLock).toBe(false);
      });

      await userService.managementSetDeleteState(
        { _id: id, delete_flg: true },
        { user_id: 'admin' },
        { in: jest.fn() }
      );

      expect(disconnectUserSessionSockets).toHaveBeenCalledTimes(1);
    });

    test('復元は状態項目だけを更新しセッション世代を変更しない', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById.mockResolvedValue({
        _id: id,
        username: 'Before',
        role: 'Author',
        delete_flg: true,
      });
      User.findOneAndUpdate.mockResolvedValue({ _id: id, delete_flg: false });

      await userService.managementSetDeleteState(
        { _id: id, delete_flg: false },
        { user_id: 'admin' },
        { in: jest.fn() }
      );

      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: id, delete_flg: true },
        {
          $set: {
            delete_flg: false,
            deleted_at: null,
            updated_at: expect.any(Number),
          },
        },
        { new: true, runValidators: true }
      );
      expect(mockAssertNoActiveAIAnalysisReferences).not.toHaveBeenCalled();
      expect(disconnectUserSessionSockets).not.toHaveBeenCalled();
    });

    test('管理者の状態は変更できない', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById.mockResolvedValue({
        _id: id,
        role: 'Administrator',
        delete_flg: false,
      });

      await expect(
        userService.managementSetDeleteState(
          { _id: id, delete_flg: true },
          { user_id: 'admin' }
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('読み取り後に状態が変わった場合は上書きしない', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById.mockResolvedValue({
        _id: id,
        role: 'Author',
        delete_flg: false,
      });
      User.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        userService.managementSetDeleteState(
          { _id: id, delete_flg: true },
          { user_id: 'admin' }
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(disconnectUserSessionSockets).not.toHaveBeenCalled();
    });

    test('条件付き更新の直前に対象ユーザが消えた場合は404を返す', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.findById
        .mockResolvedValueOnce({
          _id: id,
          role: 'Author',
          delete_flg: false,
        })
        .mockResolvedValueOnce(null);
      User.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        userService.managementSetDeleteState(
          { _id: id, delete_flg: true },
          { user_id: 'admin' }
        )
      ).rejects.toMatchObject({ message: { code: 'NOT_FOUND' } });

      expect(disconnectUserSessionSockets).not.toHaveBeenCalled();
    });
  });

  describe('パスワード変更', () => {
    test('パスワード更新', async () => {
      const foundUser = {
        _id: 'u1',
        mail: 'u1@example.com',
        lang: 'he',
        username: 'User',
        comparePassword: jest.fn().mockResolvedValue(true),
      };
      findActiveUser.mockResolvedValue(foundUser);
      const updatedUser = { _id: 'u1', username: 'User', role: 'User', session_version: 1 };
      User.findOneAndUpdate.mockResolvedValue(updatedUser);

      const result = await userService.changePassword(
        { old_password: 'old', new_password: 'new' },
        { user_id: 'u1' }
      );

      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'u1', delete_flg: false },
        {
          $set: {
            password: 'new',
            updated_at: expect.any(Number),
          },
          $inc: { session_version: 1 },
        },
        { new: true, runValidators: true }
      );
      expect(signUserToken).not.toHaveBeenCalled();
      expect(result).toEqual({});
      expect(sendMailMock).not.toHaveBeenCalled();
    });

    test('メール送信時は保存済み言語設定を使用する', async () => {
      mockIsMailDeliveryEnabled.mockReturnValue(true);
      process.env = {
        ...process.env,
        NODE_ENV: 'production',
        SEND_MAIL_HOST: 'smtp.example.com',
        SEND_MAIL_PORT: '25',
        NO_REPLY_MAIL: 'noreply@example.com',
        VUE_APP_APPNAME: 'TESTAPP',
      };
      const foundUser = {
        _id: 'u1',
        mail: 'u1@example.com',
        lang: 'he',
        username: 'User',
        comparePassword: jest.fn().mockResolvedValue(true),
      };
      findActiveUser.mockResolvedValue(foundUser);
      User.findOneAndUpdate.mockResolvedValueOnce({ _id: 'u1', session_version: 1, mail: foundUser.mail, lang: foundUser.lang });

      await userService.changePassword({ old_password: 'old', new_password: 'new' }, { user_id: 'u1' });

      expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ html: expect.stringContaining('lang="he"') }));
    });

    test('パスワード不一致', async () => {
      const foundUser = { comparePassword: jest.fn().mockResolvedValue(false) };
      findActiveUser.mockResolvedValue(foundUser);

      await expect(
        userService.changePassword({ old_password: 'old', new_password: 'new' }, { user_id: 'u1' })
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('ユーザのページ単位の一覧取得', () => {
    test('管理者は paginate できる', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.paginate.mockResolvedValue({ docs: [] });

      const res = await userService.getUserListPaginate({ page: 1, search: 'a' }, { user_id: 'admin' });

      expect(User.paginate).toHaveBeenCalledWith(
        expect.objectContaining({ $or: expect.any(Array) }),
        expect.objectContaining({ page: 1, limit: 10 })
      );
      expect(res).toEqual({ docs: [] });
    });

    test('削除状態を検索条件へ含める', async () => {
      findActiveUser.mockResolvedValue({ _id: 'admin', role: 'Administrator' });
      User.paginate.mockResolvedValue({ docs: [] });

      await userService.getUserListPaginate(
        { page: 1, search: null, delete_flg: true },
        { user_id: 'admin' }
      );

      expect(User.paginate).toHaveBeenCalledWith(
        { delete_flg: true },
        expect.objectContaining({ page: 1 })
      );
    });

    test('非管理者は 403', async () => {
      findActiveUser.mockResolvedValue({ _id: 'u1', role: 'User' });
      await expect(userService.getUserListPaginate({ page: 1 }, { user_id: 'u1' })).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('AI解析結果ユーザの候補検索', () => {
    test('AI解析設定サービスへbodyとJWTを委譲する', async () => {
      const body = { search: 'support' };
      const jwtPayload = { user_id: 'admin', user_role: 'Administrator' };
      const result = [{ _id: 'result-user' }];
      mockSearchResultUsers.mockResolvedValue(result);

      await expect(
        userService.searchAIAnalysisResultUsers(body, jwtPayload)
      ).resolves.toBe(result);

      expect(mockSearchResultUsers).toHaveBeenCalledWith(body, jwtPayload);
    });
  });
});
