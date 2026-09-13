jest.mock('jsonwebtoken', () => ({ sign: jest.fn(() => 'signed-token') }));
jest.mock('../../../../models/User', () => ({ findOne: jest.fn() }));

const jwt = require('jsonwebtoken');
const User = require('../../../../models/User');
const {
  normalizeSessionVersion,
  resolveJwtExpiresIn,
  buildUserTokenPayload,
  signUserToken,
  findUserForSession,
} = require('../../../../services/_shared/userSession');

describe('ユーザセッションの共通処理', () => {
  const originalJwtExpiresIn = process.env.JWT_EXPIRES_IN;
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'unit-secret';
    delete process.env.JWT_EXPIRES_IN;
  });

  afterAll(() => {
    if (originalJwtExpiresIn === undefined) delete process.env.JWT_EXPIRES_IN;
    else process.env.JWT_EXPIRES_IN = originalJwtExpiresIn;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  test('世代がない既存JWTとユーザを世代0として扱う', () => {
    expect(normalizeSessionVersion(undefined)).toBe(0);
    expect(normalizeSessionVersion(-1)).toBe(0);
    expect(normalizeSessionVersion(2)).toBe(2);
    expect(buildUserTokenPayload({ _id: 'u1', role: 'Author' })).toEqual({
      user_id: 'u1',
      user_role: 'Author',
      session_version: 0,
    });
  });

  test('JWT_EXPIRES_INの既定値と設定値を解決する', () => {
    expect(resolveJwtExpiresIn()).toBe('30d');
    process.env.JWT_EXPIRES_IN = '7d';
    expect(resolveJwtExpiresIn()).toBe('7d');
  });

  test('現在のセッション世代を含むJWTを発行する', () => {
    const user = { _id: 'u1', role: 'Author', session_version: 3 };

    expect(signUserToken(user)).toBe('signed-token');
    expect(jwt.sign).toHaveBeenCalledWith(
      { user_id: 'u1', user_role: 'Author', session_version: 3 },
      'unit-secret',
      { expiresIn: '30d' }
    );
  });

  test('既存JWTの世代0が有効なユーザの世代0と一致する', async () => {
    const user = { _id: 'u1', role: 'Author' };
    const select = jest.fn().mockResolvedValue(user);
    User.findOne.mockReturnValue({ select });

    await expect(findUserForSession({ user_id: 'u1' })).resolves.toBe(user);
    expect(User.findOne).toHaveBeenCalledWith({ _id: 'u1', delete_flg: false });
    expect(select).toHaveBeenCalledWith('_id role session_version');
  });

  test('JWTとユーザの世代が一致しない場合はnullを返す', async () => {
    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'u1', role: 'Author', session_version: 2 }),
    });

    await expect(findUserForSession({ user_id: 'u1', session_version: 1 })).resolves.toBeNull();
  });

  test('ユーザが存在しない場合とユーザIDが不正な場合はnullを返す', async () => {
    User.findOne.mockReturnValueOnce({ select: jest.fn().mockResolvedValue(null) });
    await expect(findUserForSession({ user_id: 'missing' })).resolves.toBeNull();

    const castError = Object.assign(new Error('cast'), { name: 'CastError' });
    User.findOne.mockReturnValueOnce({ select: jest.fn().mockRejectedValue(castError) });
    await expect(findUserForSession({ user_id: 'invalid' })).resolves.toBeNull();
  });
});
