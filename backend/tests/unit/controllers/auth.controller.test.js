jest.mock('../../../services/auth.service', () => ({
  register: jest.fn(),
  activate: jest.fn(),
  login: jest.fn(),
  googleLogin: jest.fn(),
  getPushIdentity: jest.fn(),
  buildLineAuthorize: jest.fn(),
  exchangeLineToken: jest.fn(),
  verifyLineIdToken: jest.fn(),
  fetchLineDisplayName: jest.fn(),
  linkOrCreateUserFromLine: jest.fn(),
  buildLoginPayload: jest.fn(),
  sendResetPasswordMail: jest.fn(),
  verifyResetPasswordToken: jest.fn(),
  resetPassword: jest.fn(),
}));
const mockGetLineLoginConfig = jest.fn(() => ({
  clientId: 'line-client-id',
  clientSecret: 'line-client-secret',
  redirectUri: 'http://localhost:3000/line/callback',
}));
jest.mock('../../../config/featureFlags', () => ({
  getLineLoginConfig: mockGetLineLoginConfig,
  isLineLoginEnabled: jest.fn(() => true),
}));
jest.mock('../../../utils/mediaAccessCookie', () => ({
  setUserMediaAccessCookie: jest.fn(),
}));

const authService = require('../../../services/auth.service');
const controller = require('../../../controllers/auth.controller.js');
const { setUserMediaAccessCookie } = require('../../../utils/mediaAccessCookie');
const { snapshotEnv, restoreEnv } = require('../_helpers/env');

describe('認証コントローラ', () => {
  const ORIGINAL_ENV = snapshotEnv([
    'LINE_LOGIN_CHANNEL_ID',
    'LINE_LOGIN_CHANNEL_SECRET',
    'LINE_LOGIN_REDIRECT_URI',
    'VUE_APP_APPURL',
  ]);
  const makeReq = (body = {}) => ({ body });
  const makeRes = () => {
    const res = {};
    res.json = jest.fn().mockReturnValue(res);
    res.sendStatus = jest.fn().mockReturnValue(res);
    res.cookie = jest.fn().mockReturnValue(res);
    res.clearCookie = jest.fn().mockReturnValue(res);
    res.redirect = jest.fn().mockReturnValue(res);
    res.set = jest.fn().mockReturnValue(res);
    res.status = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
  };
  const makeNext = () => jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    restoreEnv(ORIGINAL_ENV);
  });

  describe('ユーザ登録', () => {
    test('body を渡し、200 を返す', async () => {
      const body = { mail: 'user@example.com', password: 'secret' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();

      authService.register.mockResolvedValue(undefined);

      await controller.register(req, res, next);

      expect(authService.register).toHaveBeenCalledWith(body);
      expect(res.sendStatus).toHaveBeenCalledWith(200);
      expect(res.json).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    test('サービス例外: next にエラーを渡す', async () => {
      const body = { mail: 'user@example.com' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('register failed');

      authService.register.mockRejectedValue(err);

      await controller.register(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('ユーザ本登録', () => {
    test('body を渡し、結果を返す', async () => {
      const body = { invite_token: 'tok_abc' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const result = { ok: true };

      authService.activate.mockResolvedValue(result);

      await controller.activate(req, res, next);

      expect(authService.activate).toHaveBeenCalledWith(body);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { invite_token: 'tok_abc' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('activate failed');

      authService.activate.mockRejectedValue(err);

      await controller.activate(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('ログイン', () => {
    test('body を渡し、userData を返す', async () => {
      const body = { mail: 'user@example.com', password: 'pw' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const userData = { token: 'jwt', user: { id: 'U1' } };

      authService.login.mockResolvedValue(userData);

      await controller.login(req, res, next);

      expect(authService.login).toHaveBeenCalledWith(body);
      expect(setUserMediaAccessCookie).toHaveBeenCalledWith(res, 'jwt');
      expect(res.json).toHaveBeenCalledWith(userData);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { mail: 'x', password: 'y' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('login failed');

      authService.login.mockRejectedValue(err);

      await controller.login(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('通知用IDの取得', () => {
    test('JWTのユーザIDから通知用External IDを返す', async () => {
      const req = { jwtPayload: { user_id: 'user-1' } };
      const res = makeRes();
      const next = makeNext();
      const result = { onesignal_external_id: 'osv1_hmac' };
      authService.getPushIdentity.mockReturnValue(result);

      await controller.getPushIdentity(req, res, next);

      expect(authService.getPushIdentity).toHaveBeenCalledWith('user-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('LINE認証の開始', () => {
    test('floor_id/room_id を Cookie に保持して認可URLへリダイレクトする', async () => {
      process.env.LINE_LOGIN_CHANNEL_ID = 'line-client-id';
      process.env.LINE_LOGIN_REDIRECT_URI = 'http://localhost:3000/line/callback';
      authService.buildLineAuthorize.mockResolvedValue({
        state: 'state-1',
        nonce: 'nonce-1',
        url: 'https://line.example/authorize',
      });

      const req = { query: { lang: 'ja', floor_id: 'floor-1', room_id: 'room-1' } };
      const res = makeRes();
      const next = makeNext();

      await controller.lineAuthorize(req, res, next);

      expect(authService.buildLineAuthorize).toHaveBeenCalledWith({
        lang: 'ja',
        clientId: 'line-client-id',
        redirectUri: 'http://localhost:3000/line/callback',
      });
      expect(res.cookie).toHaveBeenCalledWith('line_floor_id', 'floor-1', expect.any(Object));
      expect(res.cookie).toHaveBeenCalledWith('line_room_id', 'room-1', expect.any(Object));
      expect(res.redirect).toHaveBeenCalledWith('https://line.example/authorize');
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('LINE認証の完了', () => {
    test('代替処理用 loginPath に floor_id/room_id を埋め込んだ HTML を返す', async () => {
      process.env.LINE_LOGIN_CHANNEL_ID = 'line-client-id';
      process.env.LINE_LOGIN_CHANNEL_SECRET = 'line-client-secret';
      process.env.LINE_LOGIN_REDIRECT_URI = 'http://localhost:3000/line/callback';
      process.env.VUE_APP_APPURL = 'http://localhost:3000';

      authService.exchangeLineToken.mockResolvedValue({ id_token: 'id-token', access_token: 'access-token' });
      authService.verifyLineIdToken.mockResolvedValue({ sub: 'line-sub-001', nonce: 'nonce-1', email: 'line@example.com' });
      authService.fetchLineDisplayName.mockResolvedValue('Line User');
      authService.linkOrCreateUserFromLine.mockResolvedValue({ user: { _id: 'user-1' } });
      authService.buildLoginPayload.mockResolvedValue({ token: 'jwt-token', user_id: 'user-1' });

      const req = {
        query: { code: 'code-1', state: 'state-1' },
        cookies: {
          line_oauth_state: 'state-1',
          line_oauth_nonce: 'nonce-1',
          line_lang: 'ja',
          line_floor_id: 'floor-1',
          line_room_id: 'room-1',
        },
      };
      const res = makeRes();
      const next = makeNext();

      await controller.lineCallback(req, res, next);

      expect(authService.exchangeLineToken).toHaveBeenCalledWith({
        code: 'code-1',
        clientId: 'line-client-id',
        clientSecret: 'line-client-secret',
        redirectUri: 'http://localhost:3000/line/callback',
      });
      expect(res.clearCookie).toHaveBeenCalledWith('line_floor_id');
      expect(res.clearCookie).toHaveBeenCalledWith('line_room_id');
      expect(setUserMediaAccessCookie).toHaveBeenCalledWith(res, 'jwt-token');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(
        expect.stringContaining('loginPath = "/login?floor_id=floor-1\\u0026room_id=room-1"')
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('状態不一致はトークン交換前に拒否する', async () => {
      const req = {
        query: { code: 'code-1', state: 'unexpected-state' },
        cookies: {
          line_oauth_state: 'expected-state',
          line_oauth_nonce: 'nonce-1',
        },
      };
      const res = makeRes();
      const next = makeNext();

      await controller.lineCallback(req, res, next);

      expect(authService.exchangeLineToken).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_PERMISSION' }));
    });

    test('script コンテキストを壊しうる user_name をエスケープして埋め込む', async () => {
      process.env.LINE_LOGIN_CHANNEL_ID = 'line-client-id';
      process.env.LINE_LOGIN_CHANNEL_SECRET = 'line-client-secret';
      process.env.LINE_LOGIN_REDIRECT_URI = 'http://localhost:3000/line/callback';
      process.env.VUE_APP_APPURL = 'http://localhost:3000';

      authService.exchangeLineToken.mockResolvedValue({ id_token: 'id-token', access_token: 'access-token' });
      authService.verifyLineIdToken.mockResolvedValue({ sub: 'line-sub-001', nonce: 'nonce-1', email: 'line@example.com' });
      authService.fetchLineDisplayName.mockResolvedValue('Line User');
      authService.linkOrCreateUserFromLine.mockResolvedValue({ user: { _id: 'user-1' } });
      authService.buildLoginPayload.mockResolvedValue({
        token: 'jwt-token',
        user_id: 'user-1',
        user_name: '</script><script>alert(1)</script>',
      });

      const req = {
        query: { code: 'code-1', state: 'state-1' },
        cookies: {
          line_oauth_state: 'state-1',
          line_oauth_nonce: 'nonce-1',
          line_lang: 'ja',
          line_floor_id: 'floor-1',
          line_room_id: 'room-1',
        },
      };
      const res = makeRes();
      const next = makeNext();

      await controller.lineCallback(req, res, next);

      const html = res.send.mock.calls[0][0];
      expect(html).toContain('\\u003C/script\\u003E\\u003Cscript\\u003Ealert(1)\\u003C/script\\u003E');
      expect(html).not.toContain('</script><script>alert(1)</script>');
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('パスワード再設定メールの送信', () => {
    test('メールを渡し、200 を返す', async () => {
      const body = { mail: 'user@example.com' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();

      authService.sendResetPasswordMail.mockResolvedValue(undefined);

      await controller.sendResetPasswordMail(req, res, next);

      expect(authService.sendResetPasswordMail).toHaveBeenCalledWith('user@example.com');
      expect(res.sendStatus).toHaveBeenCalledWith(200);
      expect(res.json).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { mail: 'user@example.com' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('sendResetPasswordMail failed');

      authService.sendResetPasswordMail.mockRejectedValue(err);

      await controller.sendResetPasswordMail(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('パスワード再設定トークンの検証', () => {
    test('トークンを渡し、200 を返す', async () => {
      const body = { token: 'rst_123' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();

      authService.verifyResetPasswordToken.mockResolvedValue(undefined);

      await controller.verifyResetPasswordToken(req, res, next);

      expect(authService.verifyResetPasswordToken).toHaveBeenCalledWith('rst_123');
      expect(res.sendStatus).toHaveBeenCalledWith(200);
      expect(res.json).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { token: 'rst_123' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('verifyResetPasswordToken failed');

      authService.verifyResetPasswordToken.mockRejectedValue(err);

      await controller.verifyResetPasswordToken(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('パスワードの再設定', () => {
    test('body を渡し、200 を返す', async () => {
      const body = { token: 'rst_123', password: 'newpw' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();

      authService.resetPassword.mockResolvedValue(undefined);

      await controller.resetPassword(req, res, next);

      expect(authService.resetPassword).toHaveBeenCalledWith(body, req.io);
      expect(res.sendStatus).toHaveBeenCalledWith(200);
      expect(res.json).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { token: 'rst_123', password: 'newpw' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('resetPassword failed');

      authService.resetPassword.mockRejectedValue(err);

      await controller.resetPassword(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
