jest.mock('../../../../services/_shared/userSession', () => ({
  findUserForSession: jest.fn(),
  normalizeSessionVersion: jest.fn((value) => (Number.isSafeInteger(value) ? value : 0)),
}));
jest.mock('../../../../services/guestAuth.service', () => ({
  verifyAccessToken: jest.fn(),
}));
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const { verifyAccessToken } = require('../../../../services/guestAuth.service');
const { findUserForSession } = require('../../../../services/_shared/userSession');
const {
  authenticateGuestToken,
  authenticateUserToken,
} = require('../../../../services/auth/tokenAuthentication.service');

describe('認証トークンの検証', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('ユーザJWTを検証して現在の権限とセッション世代を返す', async () => {
    jwt.verify.mockImplementation((_token, _secret, callback) =>
      callback(null, { user_id: 'user-1', user_role: 'old-role', session_version: 2 })
    );
    findUserForSession.mockResolvedValue({ _id: 'user-1', role: 'Editor', session_version: 2 });

    await expect(authenticateUserToken('token', { secret: 'secret' })).resolves.toMatchObject({
      user: { _id: 'user-1', role: 'Editor' },
      payload: { user_id: 'user-1', user_role: 'Editor', session_version: 2 },
    });
    expect(jwt.verify).toHaveBeenCalledWith('token', 'secret', expect.any(Function));
  });

  test('期限切れユーザJWTをTOKEN_EXPIREDへ正規化する', async () => {
    const error = new Error('expired');
    error.name = 'TokenExpiredError';
    jwt.verify.mockImplementation((_token, _secret, callback) => callback(error));

    await expect(authenticateUserToken('expired')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(findUserForSession).not.toHaveBeenCalled();
  });

  test('失効済みユーザセッションをTOKEN_INVALIDとして拒否する', async () => {
    jwt.verify.mockImplementation((_token, _secret, callback) => callback(null, { user_id: 'user-1' }));
    findUserForSession.mockResolvedValue(null);

    await expect(authenticateUserToken('token')).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });

  test('ゲストJWTからゲスト idを返す', () => {
    verifyAccessToken.mockReturnValue({ guest_id: 'guest-1' });

    expect(authenticateGuestToken('guest-token')).toEqual({
      guestId: 'guest-1',
      payload: { guest_id: 'guest-1' },
    });
  });

  test('ゲスト idがないJWTを拒否する', () => {
    verifyAccessToken.mockReturnValue({});

    expect(() => authenticateGuestToken('guest-token')).toThrow(
      expect.objectContaining({ code: 'TOKEN_INVALID' })
    );
  });
});
