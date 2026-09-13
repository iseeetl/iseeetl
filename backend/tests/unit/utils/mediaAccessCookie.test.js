const jwt = require('jsonwebtoken');

const {
  USER_MEDIA_COOKIE,
  GUEST_MEDIA_COOKIE,
  setUserMediaAccessCookie,
  setGuestMediaAccessCookie,
} = require('../../../utils/mediaAccessCookie');

describe('mediaAccessCookieの検証', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const buildRes = () => ({ cookie: jest.fn(), clearCookie: jest.fn() });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  test('ユーザトークンをHttpOnly・メディア限定Cookieへ保存し、ゲスト Cookieを消す', () => {
    process.env.NODE_ENV = 'production';
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const token = jwt.sign({ user_id: 'user-1', exp: 1060 }, 'unused');
    const res = buildRes();

    expect(setUserMediaAccessCookie(res, token)).toBe(true);
    expect(res.cookie).toHaveBeenCalledWith(
      USER_MEDIA_COOKIE,
      token,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        secure: true,
        path: '/media',
        maxAge: 60_000,
      })
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      GUEST_MEDIA_COOKIE,
      expect.objectContaining({ path: '/media', secure: true })
    );
  });

  test('ゲストトークンを開発環境用Cookieへ保存し、ユーザ Cookieを消す', () => {
    process.env.NODE_ENV = 'development';
    const token = jwt.sign({ guest_id: 'guest-1' }, 'unused', { expiresIn: '1h' });
    const res = buildRes();

    expect(setGuestMediaAccessCookie(res, token)).toBe(true);
    expect(res.cookie).toHaveBeenCalledWith(
      GUEST_MEDIA_COOKIE,
      token,
      expect.objectContaining({ httpOnly: true, secure: false, path: '/media' })
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      USER_MEDIA_COOKIE,
      expect.objectContaining({ path: '/media', secure: false })
    );
  });

  test('有効期限を読めない値はCookieへ保存しない', () => {
    const res = buildRes();

    expect(setUserMediaAccessCookie(res, 'not-a-token')).toBe(false);
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
  });
});
