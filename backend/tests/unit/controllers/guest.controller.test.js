jest.mock('../../../services/guestAuth.service', () => ({
  ACCESS_TTL_SECONDS: 1800,
  REFRESH_TTL_SECONDS: 7200,
  createGuestId: jest.fn(),
  buildAccessToken: jest.fn(),
  buildRefreshToken: jest.fn(),
  verifyRefreshToken: jest.fn(),
}));
jest.mock('../../../utils/mediaAccessCookie', () => ({
  setGuestMediaAccessCookie: jest.fn(),
}));

const AppError = require('../../../utils/appError');
const guestAuth = require('../../../services/guestAuth.service');
const controller = require('../../../controllers/guest.controller');
const { setGuestMediaAccessCookie } = require('../../../utils/mediaAccessCookie');

const ORIGINAL_ENV = process.env;

describe('ゲスト認証のコントローラ', () => {
  const makeReq = (body = {}, cookies = {}) => ({ body, cookies });
  const makeRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.cookie = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, NODE_ENV: 'production' };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('ゲストを作成して更新用Cookieとゲスト情報を返す', async () => {
    const req = makeReq({ guest_name: 'Guest', lang: 'en' });
    const res = makeRes();
    const next = jest.fn();

    guestAuth.createGuestId.mockReturnValue('guest-1');
    guestAuth.buildAccessToken.mockReturnValue('access-token');
    guestAuth.buildRefreshToken.mockReturnValue('refresh-token');

    await controller.bootstrap(req, res, next);

    expect(guestAuth.createGuestId).toHaveBeenCalledTimes(1);
    expect(guestAuth.buildAccessToken).toHaveBeenCalledWith('guest-1');
    expect(guestAuth.buildRefreshToken).toHaveBeenCalledWith('guest-1');
    expect(setGuestMediaAccessCookie).toHaveBeenCalledWith(res, 'access-token');
    expect(res.cookie).toHaveBeenCalledWith(
      'guest_refresh',
      'refresh-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        maxAge: guestAuth.REFRESH_TTL_SECONDS * 1000,
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      guest_id: 'guest-1',
      guest_name: 'Guest',
      lang: 'en',
      guest_token: 'access-token',
      expires_in: guestAuth.ACCESS_TTL_SECONDS,
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('本番環境以外では更新用Cookieのsecureをfalseにする', async () => {
    process.env = { ...ORIGINAL_ENV, NODE_ENV: 'development' };
    const req = makeReq({ guest_name: 'Guest', lang: 'ja' });
    const res = makeRes();
    const next = jest.fn();

    guestAuth.createGuestId.mockReturnValue('guest-1');
    guestAuth.buildAccessToken.mockReturnValue('access-token');
    guestAuth.buildRefreshToken.mockReturnValue('refresh-token');

    await controller.bootstrap(req, res, next);

    expect(res.cookie).toHaveBeenCalledWith(
      'guest_refresh',
      'refresh-token',
      expect.objectContaining({ secure: false })
    );
  });

  test('ゲスト作成のエラーをnextへ渡す', async () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();
    const err = new Error('boom');

    guestAuth.createGuestId.mockImplementation(() => {
      throw err;
    });

    await controller.bootstrap(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });

  test('更新用CookieがなければTOKEN_INVALIDを返す', async () => {
    const req = makeReq({}, {});
    const res = makeRes();
    const next = jest.fn();

    await controller.refresh(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('TOKEN_INVALID');
  });

  test('更新用Cookieを維持して新しいアクセストークンを返す', async () => {
    const req = makeReq({}, { guest_refresh: 'refresh-token' });
    const res = makeRes();
    const next = jest.fn();

    guestAuth.verifyRefreshToken.mockReturnValue({ guest_id: 'guest-2' });
    guestAuth.buildAccessToken.mockReturnValue('access-token');

    await controller.refresh(req, res, next);

    expect(guestAuth.verifyRefreshToken).toHaveBeenCalledWith('refresh-token');
    expect(guestAuth.buildAccessToken).toHaveBeenCalledWith('guest-2');
    expect(setGuestMediaAccessCookie).toHaveBeenCalledWith(res, 'access-token');
    expect(res.cookie).toHaveBeenCalledWith(
      'guest_refresh',
      'refresh-token',
      expect.objectContaining({ maxAge: guestAuth.REFRESH_TTL_SECONDS * 1000 })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      guest_id: 'guest-2',
      guest_token: 'access-token',
      expires_in: guestAuth.ACCESS_TTL_SECONDS,
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('復号したトークンにguest_idがなければTOKEN_INVALIDを返す', async () => {
    const req = makeReq({}, { guest_refresh: 'refresh-token' });
    const res = makeRes();
    const next = jest.fn();

    guestAuth.verifyRefreshToken.mockReturnValue({});

    await controller.refresh(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('TOKEN_INVALID');
  });

  test('期限切れの更新用トークンにはTOKEN_EXPIREDを返す', async () => {
    const req = makeReq({}, { guest_refresh: 'refresh-token' });
    const res = makeRes();
    const next = jest.fn();
    const err = new Error('expired');
    err.name = 'TokenExpiredError';

    guestAuth.verifyRefreshToken.mockImplementation(() => {
      throw err;
    });

    await controller.refresh(req, res, next);

    const nextErr = next.mock.calls[0][0];
    expect(nextErr).toBeInstanceOf(AppError);
    expect(nextErr.code).toBe('TOKEN_EXPIRED');
  });

  test('その他の更新エラーはTOKEN_INVALIDを返す', async () => {
    const req = makeReq({}, { guest_refresh: 'refresh-token' });
    const res = makeRes();
    const next = jest.fn();
    const err = new Error('boom');

    guestAuth.verifyRefreshToken.mockImplementation(() => {
      throw err;
    });

    await controller.refresh(req, res, next);

    const nextErr = next.mock.calls[0][0];
    expect(nextErr).toBeInstanceOf(AppError);
    expect(nextErr.code).toBe('TOKEN_INVALID');
  });
});
