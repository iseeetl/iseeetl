const crypto = require('crypto');
const moment = require('moment');

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('dummy-jwt-token'),
}));

jest.mock('nodemailer', () => {
  const sendMail = jest.fn().mockResolvedValue(true);
  return {
    __esModule: true,
    createTransport: jest.fn(() => ({ sendMail })),
    __mockSendMail: sendMail,
  };
});

jest.mock('../../../models/User', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  updateOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../../../models/UserTemp', () => ({
  create: jest.fn(),
  findOne: jest.fn(),
  findByIdAndDelete: jest.fn(),
}));

jest.mock('../../../models/ResetPassword', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
  deleteMany: jest.fn(),
  deleteOne: jest.fn(),
}));
jest.mock('../../../models/AuthIdentity', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));

const mockIsGoogleLoginEnabled = jest.fn(() => true);
const mockIsMailDeliveryEnabled = jest.fn(() => true);
const mockIsOneSignalEnabled = jest.fn(() => true);
const mockGetGoogleLoginConfig = jest.fn(() => ({ clientId: 'google-client-id' }));
const mockGetMailDeliveryConfig = jest.fn(() => ({
  host: 'smtp.example.com',
  port: 25,
  appName: 'TESTAPP',
  appUrl: 'http://localhost',
  noReplyMail: 'noreply@example.com',
}));
const mockGetOneSignalConfig = jest.fn(() => ({
  appId: 'test-onesignal-app',
  restApiKey: 'test-onesignal-rest-key',
  externalIdSecret: 'test-onesignal-external-id-secret-32-bytes',
  host: 'onesignal.com',
  port: '443',
  path: '/api/v1/notifications',
}));
jest.mock('../../../config/featureFlags', () => ({
  getGoogleLoginConfig: mockGetGoogleLoginConfig,
  getMailDeliveryConfig: mockGetMailDeliveryConfig,
  getOneSignalConfig: mockGetOneSignalConfig,
  isGoogleLoginEnabled: mockIsGoogleLoginEnabled,
  isMailDeliveryEnabled: mockIsMailDeliveryEnabled,
  isOneSignalEnabled: mockIsOneSignalEnabled,
}));

const mockVerifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken: mockVerifyIdToken })),
}));

jest.mock(
  '../../../utils/appError',
  () =>
    function AppError(message, statusCode) {
      this.message = message;
      this.statusCode = statusCode;
    }
);

const authService = require('../../../services/auth.service');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../../../models/User');
const UserTemp = require('../../../models/UserTemp');
const ResetPassword = require('../../../models/ResetPassword');
const AuthIdentity = require('../../../models/AuthIdentity');
const AppError = require('../../../utils/appError');
const { OAuth2Client } = require('google-auth-library');
const { buildOneSignalExternalId } = require('../../../integrations/onesignal/identity');

describe('authのサービス', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleLoginEnabled.mockReturnValue(true);
    mockIsMailDeliveryEnabled.mockReturnValue(true);
    mockIsOneSignalEnabled.mockReturnValue(true);
    mockGetGoogleLoginConfig.mockReturnValue({ clientId: 'google-client-id' });
    mockGetMailDeliveryConfig.mockReturnValue({
      host: 'smtp.example.com',
      port: 25,
      appName: 'TESTAPP',
      appUrl: 'http://localhost',
      noReplyMail: 'noreply@example.com',
    });
    mockGetOneSignalConfig.mockReturnValue({
      appId: 'test-onesignal-app',
      restApiKey: 'test-onesignal-rest-key',
      externalIdSecret: 'test-onesignal-external-id-secret-32-bytes',
      host: 'onesignal.com',
      port: '443',
      path: '/api/v1/notifications',
    });
    global.fetch = jest.fn();

    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'production',
      JWT_SECRET: 'secret',
      JWT_EXPIRES_IN: '30d',
      SIGNUP_TOKEN_TTL_MINUTES: '60',
      RESET_TOKEN_TTL_MINUTES: '60',
      GOOGLE_OAUTH_CLIENT_ID: 'google-client-id',
      SEND_MAIL_HOST: 'smtp.example.com',
      SEND_MAIL_PORT: '25',
      VUE_APP_APPNAME: 'TESTAPP',
      VUE_APP_APPURL: 'http://localhost',
      NO_REPLY_MAIL: 'noreply@example.com',
      ONESIGNAL_APP_ID: 'test-onesignal-app',
      ONESIGNAL_REST_API_KEYS: 'test-onesignal-rest-key',
      ONESIGNAL_EXTERNAL_ID_SECRET: 'test-onesignal-external-id-secret-32-bytes',
    };

    jest.spyOn(crypto, 'randomBytes').mockReturnValue(Buffer.from('123456789012345678901234', 'utf8'));
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  describe('ユーザ仮登録', () => {
    const input = { username: 'alice', mail: 'alice@example.com', password: 'pass1234', lang: 'en' };

    test('仮ユーザ登録しメール送信', async () => {
      User.findOne.mockResolvedValue(null);
      UserTemp.create.mockResolvedValue({});

      await expect(authService.register(input)).resolves.toBeUndefined();

      expect(User.findOne).toHaveBeenCalledWith({ mail: input.mail });
      expect(UserTemp.create).toHaveBeenCalledWith(
        expect.objectContaining({ username: input.username, mail: input.mail, password: input.password, lang: 'en' })
      );
      expect(nodemailer.__mockSendMail).toHaveBeenCalledTimes(1);
      expect(nodemailer.__mockSendMail.mock.calls[0][0].html).toContain('lang="en"');
    });

    test('メール無効時はDB変更前にEXTERNAL_FEATURE_DISABLEDとなる', async () => {
      mockIsMailDeliveryEnabled.mockReturnValue(false);

      await expect(authService.register(input)).rejects.toMatchObject({
        message: {
          code: 'EXTERNAL_FEATURE_DISABLED',
          details: { feature: 'mailDelivery' },
        },
      });
      expect(User.findOne).not.toHaveBeenCalled();
      expect(UserTemp.create).not.toHaveBeenCalled();
      expect(nodemailer.__mockSendMail).not.toHaveBeenCalled();
    });

    test('既存メールでエラー', async () => {
      User.findOne.mockResolvedValue({ _id: 'exists' });
      await expect(authService.register(input)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('ログイン', () => {
    const input = { mail: 'bob@example.com', password: 'secret' };

    test('ログイン成功', async () => {
      const userDoc = {
        _id: 'user1',
        role: 'user',
        username: 'Bob',
        password: 'hashed',
        image_name: null,
        lang: 'ja',
        eye_friendly_mode: false,
        push_enabled: true,
        reply_push_enabled: true,
        replied_post_push_enabled: false,
        comparePassword: jest.fn().mockResolvedValue(true),
      };
      const selectMock = jest.fn().mockResolvedValue(userDoc);
      User.findOne.mockReturnValue({ select: selectMock });

      const result = await authService.login(input);

      expect(User.findOne).toHaveBeenCalledWith({ mail: input.mail, delete_flg: false });
      expect(selectMock).toHaveBeenCalledWith('+password');
      expect(userDoc.comparePassword).toHaveBeenCalledWith(input.password);
      expect(jwt.sign).toHaveBeenCalledWith({
        user_id: 'user1',
        user_role: 'user',
        session_version: 0,
      }, process.env.JWT_SECRET, {
        expiresIn: '30d',
      });
      expect(result.token).toBe('dummy-jwt-token');
      expect(result.onesignal_external_id).toBe(buildOneSignalExternalId('user1'));
    });

    test('OneSignal無効時は専用秘密値が残っていてもExternal IDを返さない', async () => {
      mockIsOneSignalEnabled.mockReturnValue(false);
      const userDoc = {
        _id: 'user1',
        role: 'user',
        username: 'Bob',
        password: 'hashed',
        lang: 'ja',
        comparePassword: jest.fn().mockResolvedValue(true),
      };
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(userDoc) });

      const result = await authService.login(input);

      expect(process.env.ONESIGNAL_EXTERNAL_ID_SECRET).toBeTruthy();
      expect(result.onesignal_external_id).toBeNull();
    });

    test('JWT_EXPIRES_IN が設定されている場合はその値を使う', async () => {
      process.env.JWT_EXPIRES_IN = '7d';
      const userDoc = {
        _id: 'user1',
        role: 'user',
        username: 'Bob',
        password: 'hashed',
        image_name: null,
        lang: 'ja',
        eye_friendly_mode: false,
        push_enabled: true,
        reply_push_enabled: true,
        replied_post_push_enabled: false,
        comparePassword: jest.fn().mockResolvedValue(true),
      };
      const selectMock = jest.fn().mockResolvedValue(userDoc);
      User.findOne.mockReturnValue({ select: selectMock });

      await authService.login(input);

      expect(jwt.sign).toHaveBeenCalledWith({
        user_id: 'user1',
        user_role: 'user',
        session_version: 0,
      }, process.env.JWT_SECRET, {
        expiresIn: '7d',
      });
    });

    test('ユーザなし', async () => {
      const selectMock = jest.fn().mockResolvedValue(null);
      User.findOne.mockReturnValue({ select: selectMock });
      await expect(authService.login(input)).rejects.toBeInstanceOf(AppError);
    });

    test('パスワード不一致', async () => {
      const userDoc = {
        _id: 'user1',
        role: 'user',
        password: 'hashed',
        comparePassword: jest.fn().mockResolvedValue(false),
      };
      const selectMock = jest.fn().mockResolvedValue(userDoc);
      User.findOne.mockReturnValue({ select: selectMock });
      await expect(authService.login(input)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('ユーザ本登録', () => {
    test('仮ユーザを本登録', async () => {
      const temp = {
        _id: 'tempid',
        username: 'tempuser',
        mail: 'temp@example.com',
        password: 'tempPw',
        created_at: moment().subtract(10, 'minutes').toDate(),
        lang: 'he',
      };
      UserTemp.findOne.mockResolvedValue(temp);
      User.findOne.mockResolvedValue(null);
      User.create.mockResolvedValue({});
      UserTemp.findByIdAndDelete.mockResolvedValue({});

      await expect(authService.activate({ invite_token: 'activetoken' })).resolves.toEqual({
        roomId: null,
        roomTitle: null,
        floorId: null,
        floorTitle: null,
      });
      expect(User.create).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'tempuser', mail: 'temp@example.com', password: 'tempPw', lang: 'he' })
      );
      expect(UserTemp.findByIdAndDelete).toHaveBeenCalledWith(temp._id);
    });

    test('トークン不正', async () => {
      UserTemp.findOne.mockResolvedValue(null);
      await expect(authService.activate({ invite_token: 'badtoken' })).rejects.toBeInstanceOf(AppError);
    });

    test('有効期限切れ', async () => {
      const temp = { _id: 'tempid', mail: 't@example.com', created_at: moment().subtract(70, 'minutes').toDate() };
      UserTemp.findOne.mockResolvedValue(temp);
      await expect(authService.activate({ invite_token: 'token' })).rejects.toBeInstanceOf(AppError);
    });

    test('SIGNUP_TOKEN_TTL_MINUTES が設定されている場合は期限判定に反映される', async () => {
      process.env.SIGNUP_TOKEN_TTL_MINUTES = '120';
      const temp = {
        _id: 'tempid',
        username: 'tempuser',
        mail: 'temp@example.com',
        password: 'tempPw',
        created_at: moment().subtract(70, 'minutes').toDate(),
      };
      UserTemp.findOne.mockResolvedValue(temp);
      User.findOne.mockResolvedValue(null);
      User.create.mockResolvedValue({});
      UserTemp.findByIdAndDelete.mockResolvedValue({});

      await expect(authService.activate({ invite_token: 'activetoken' })).resolves.toEqual({
        roomId: null,
        roomTitle: null,
        floorId: null,
        floorTitle: null,
      });
    });

    test('既存ユーザがいる', async () => {
      const temp = { _id: 'tempid', mail: 't@example.com', created_at: moment().subtract(5, 'minutes').toDate() };
      UserTemp.findOne.mockResolvedValue(temp);
      User.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ _id: 'userexists' }).mockResolvedValueOnce(null);
      await expect(authService.activate({ invite_token: 'token' })).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('パスワード再設定メールの送信', () => {
    test('メール送信後にハッシュだけを確定する', async () => {
      User.findOne.mockReturnValue({ select: async () => ({ _id: 'user1', mail: 'alice@example.com', lang: 'he' }) });
      User.updateOne.mockResolvedValue({ modifiedCount: 1 });
      await expect(authService.sendResetPasswordMail('alice@example.com')).resolves.toBeUndefined();
      expect(User.updateOne).toHaveBeenCalledWith(expect.objectContaining({ _id: 'user1' }),
        { $set: { password_reset: expect.objectContaining({ mail: 'alice@example.com', token_hash: expect.stringMatching(/^[a-f0-9]{64}$/), consumed: false }) } },
        { runValidators: true });
      expect(nodemailer.__mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'alice@example.com', html: expect.stringContaining('lang="he"') }));
      expect(nodemailer.__mockSendMail.mock.invocationCallOrder[0]).toBeLessThan(User.updateOne.mock.invocationCallOrder[0]);
    });

    test('ユーザが存在しない場合でも成功扱い', async () => {
      User.findOne.mockReturnValue({ select: async () => null });
      await expect(authService.sendResetPasswordMail('none@example.com')).resolves.toBeUndefined();
      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
      expect(nodemailer.__mockSendMail).not.toHaveBeenCalled();
    });

    test('メール無効時は再設定トークン作成前にEXTERNAL_FEATURE_DISABLEDとなる', async () => {
      mockIsMailDeliveryEnabled.mockReturnValue(false);

      await expect(authService.sendResetPasswordMail('alice@example.com')).rejects.toMatchObject({
        message: {
          code: 'EXTERNAL_FEATURE_DISABLED',
          details: { feature: 'mailDelivery' },
        },
      });
      expect(User.findOne).not.toHaveBeenCalled();
      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
      expect(nodemailer.__mockSendMail).not.toHaveBeenCalled();
    });
  });

  describe('パスワード再設定トークンの検証', () => {
    beforeEach(() => {
      User.findOne.mockReturnValueOnce({ select: async () => null }).mockReturnValue({ select: async () => ({ _id: 'user1' }) });
    });
    test('トークン有効', async () => {
      const rec = { created_at: moment().subtract(30, 'minutes').toDate() };
      ResetPassword.findOne.mockResolvedValue(rec);
      await expect(authService.verifyResetPasswordToken('tok')).resolves.toBeUndefined();
    });

    test('トークンなし', async () => {
      ResetPassword.findOne.mockResolvedValue(null);
      await expect(authService.verifyResetPasswordToken('tok')).rejects.toBeInstanceOf(AppError);
    });

    test('期限切れ', async () => {
      const rec = { created_at: moment().subtract(70, 'minutes').toDate() };
      ResetPassword.findOne.mockResolvedValue(rec);
      await expect(authService.verifyResetPasswordToken('tok')).rejects.toBeInstanceOf(AppError);
    });

    test('RESET_TOKEN_TTL_MINUTES が設定されている場合は期限判定に反映される', async () => {
      process.env.RESET_TOKEN_TTL_MINUTES = '120';
      const rec = { created_at: moment().subtract(70, 'minutes').toDate() };
      ResetPassword.findOne.mockResolvedValue(rec);

      await expect(authService.verifyResetPasswordToken('tok')).resolves.toBeUndefined();
    });
  });

  describe('パスワードの再設定', () => {
    beforeEach(() => mockIsMailDeliveryEnabled.mockReturnValue(false));
    const input = { password: 'newPass', token: 'rstTok' };

    test('パスワードリセット', async () => {
      const rec = { _id: 'rec1', mail: 'bob@example.com', created_at: moment().subtract(10, 'minutes').toDate() };
      ResetPassword.findOne.mockResolvedValue(rec);
      User.findOne.mockReturnValueOnce({ select: async () => null }).mockReturnValue({ select: async () => ({ _id: 'user1', mail: rec.mail }) });
      User.findOneAndUpdate.mockResolvedValue({ _id: 'user1', mail: 'bob@example.com' });
      ResetPassword.deleteOne.mockResolvedValue({ deletedCount: 1 });

      await expect(authService.resetPassword(input)).resolves.toBeUndefined();
      expect(User.findOneAndUpdate).toHaveBeenCalled();
      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'user1', 'password_reset.consumed': false }),
        { $set: { password: input.password, updated_at: expect.any(Number), 'password_reset.consumed': true }, $inc: { session_version: 1 } },
        { new: true, runValidators: true }
      );
      expect(ResetPassword.findOneAndDelete).not.toHaveBeenCalled();
      expect(ResetPassword.deleteOne).toHaveBeenCalledWith({ _id: rec._id, token: input.token });
      expect(nodemailer.__mockSendMail).not.toHaveBeenCalled();
    });

    test('トークン不正', async () => {
      ResetPassword.findOne.mockResolvedValue(null);
      User.findOne.mockReturnValue({ select: async () => null });
      await expect(authService.resetPassword(input)).rejects.toBeInstanceOf(AppError);
      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('期限切れ', async () => {
      const rec = { mail: 'bob@example.com', created_at: moment().subtract(70, 'minutes').toDate() };
      ResetPassword.findOne.mockResolvedValue(rec);
      User.findOne.mockReturnValueOnce({ select: async () => null }).mockReturnValue({ select: async () => ({ _id: 'user1', mail: rec.mail }) });
      await expect(authService.resetPassword(input)).rejects.toBeInstanceOf(AppError);
      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('ユーザ更新失敗', async () => {
      const rec = { _id: 'rec1', mail: 'bob@example.com', created_at: moment().subtract(10, 'minutes').toDate() };
      ResetPassword.findOne.mockResolvedValue(rec);
      User.findOne.mockReturnValueOnce({ select: async () => null }).mockReturnValue({ select: async () => ({ _id: 'user1', mail: rec.mail }) });
      User.findOneAndUpdate.mockResolvedValue(null);
      await expect(authService.resetPassword(input)).rejects.toBeInstanceOf(AppError);
      expect(ResetPassword.deleteOne).not.toHaveBeenCalled();
    });
  });

  describe('Googleログイン', () => {
    test('id_token が無い場合は 400', async () => {
      await expect(authService.googleLogin({ id_token: '', lang: 'ja' })).rejects.toBeInstanceOf(AppError);
      expect(OAuth2Client).not.toHaveBeenCalled();
    });

    test('Googleログインが無効なら共通の503エラーを返す', async () => {
      mockIsGoogleLoginEnabled.mockReturnValue(false);
      await expect(authService.googleLogin({ id_token: 'token', lang: 'ja' })).rejects.toMatchObject({
        message: {
          code: 'EXTERNAL_FEATURE_DISABLED',
          details: { feature: 'googleLogin' },
        },
      });
      expect(OAuth2Client).not.toHaveBeenCalled();
    });

    test('識別情報があればログインする', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ sub: 'sub1', email: 'u@example.com', email_verified: true, name: 'User' }),
      });
      AuthIdentity.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ user_id: 'u1' }) });
      User.findOne.mockResolvedValue({
        _id: 'u1',
        role: 'User',
        username: 'User',
        image_name: null,
        lang: 'ja',
        eye_friendly_mode: false,
        push_enabled: true,
        reply_push_enabled: true,
        replied_post_push_enabled: false,
      });

      const res = await authService.googleLogin({ id_token: 'token', lang: 'ja' });

      expect(OAuth2Client).toHaveBeenCalledTimes(1);
      expect(jwt.sign).toHaveBeenCalled();
      expect(res.user_id).toBe('u1');
      expect(res.token).toBe('dummy-jwt-token');
    });

    test('OneSignalが無効なら専用秘密値が残っていてもGoogleログイン時にExternal IDを返さない', async () => {
      mockIsOneSignalEnabled.mockReturnValue(false);
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ sub: 'sub1', email: 'u@example.com', email_verified: true, name: 'User' }),
      });
      AuthIdentity.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ user_id: 'u1' }) });
      User.findOne.mockResolvedValue({
        _id: 'u1',
        role: 'User',
        username: 'User',
        lang: 'ja',
      });

      const res = await authService.googleLogin({ id_token: 'token', lang: 'ja' });

      expect(process.env.ONESIGNAL_EXTERNAL_ID_SECRET).toBeTruthy();
      expect(res.onesignal_external_id).toBeNull();
    });
  });

  describe('LINE認証URLの生成', () => {
    test('clientId 未指定', async () => {
      await expect(authService.buildLineAuthorize({ lang: 'ja' })).rejects.toBeInstanceOf(AppError);
    });

    test('URL を組み立てる', async () => {
      const res = await authService.buildLineAuthorize({
        lang: 'ja',
        clientId: 'cid',
        redirectUri: 'https://example.com/cb',
      });
      expect(res.url).toContain('client_id=cid');
      expect(res.url).toContain('redirect_uri=');
      expect(res.state).toBeDefined();
      expect(res.nonce).toBeDefined();
    });
  });

  describe('LINE認証トークンの取得', () => {
    test('コード未指定', async () => {
      await expect(authService.exchangeLineToken({ code: '' })).rejects.toBeInstanceOf(AppError);
    });

    test('トークンを返す', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: async () => ({ id_token: 'id', access_token: 'acc' }) });
      const res = await authService.exchangeLineToken({
        code: 'code',
        clientId: 'cid',
        clientSecret: 'sec',
        redirectUri: 'https://example.com/cb',
      });
      expect(res).toEqual({ id_token: 'id', access_token: 'acc' });
    });
  });

  describe('LINE認証トークンの検証', () => {
    test('id_token 未指定', async () => {
      await expect(authService.verifyLineIdToken({ id_token: '' })).rejects.toBeInstanceOf(AppError);
    });

    test('検証レスポンスを返す', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: async () => ({ sub: 's1' }) });
      const res = await authService.verifyLineIdToken({ id_token: 'id', clientId: 'cid' });
      expect(res).toEqual({ sub: 's1' });
    });
  });

  describe('LINEの表示名取得', () => {
    test('アクセストークンがなければ既定の表示名を返す', async () => {
      const res = await authService.fetchLineDisplayName({ access_token: '', fallback: 'F' });
      expect(res).toBe('F');
    });

    test('表示名を取得できた場合はその値を返す', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: async () => ({ displayName: 'LINE User' }) });
      const res = await authService.fetchLineDisplayName({ access_token: 'acc', fallback: null });
      expect(res).toBe('LINE User');
    });
  });

  describe('LINEユーザの連携と作成', () => {
    test('sub が無い場合は 401', async () => {
      await expect(authService.linkOrCreateUserFromLine({ sub: '' })).rejects.toBeInstanceOf(AppError);
    });

    test('識別情報があれば既存ユーザを返す', async () => {
      AuthIdentity.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ user_id: 'u1' }) });
      User.findOne.mockResolvedValue({ _id: 'u1' });

      const res = await authService.linkOrCreateUserFromLine({ sub: 'sub1' });

      expect(res.user).toEqual({ _id: 'u1' });
    });
  });

  describe('ログイン応答の生成', () => {
    test('JWT を含めて返す', async () => {
      const res = await authService.buildLoginPayload({
        _id: 'u1',
        role: 'User',
        username: 'U',
        session_version: 4,
      });
      expect(res.token).toBe('dummy-jwt-token');
      expect(res.user_id).toBe('u1');
      expect(jwt.sign).toHaveBeenCalledWith(
        { user_id: 'u1', user_role: 'User', session_version: 4 },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );
    });

    test('OneSignal無効時は専用秘密値が残っていてもExternal IDを返さない', async () => {
      mockIsOneSignalEnabled.mockReturnValue(false);

      const res = await authService.buildLoginPayload({
        _id: 'u1',
        role: 'User',
        username: 'U',
        session_version: 4,
      });

      expect(process.env.ONESIGNAL_EXTERNAL_ID_SECRET).toBeTruthy();
      expect(res.onesignal_external_id).toBeNull();
    });
  });
});
