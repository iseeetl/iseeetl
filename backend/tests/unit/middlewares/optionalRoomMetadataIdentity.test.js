jest.mock('../../../services/auth/tokenAuthentication.service', () => ({
  authenticateGuestToken: jest.fn(),
  authenticateUserToken: jest.fn(),
}));

const {
  authenticateGuestToken,
  authenticateUserToken,
} = require('../../../services/auth/tokenAuthentication.service');
const optionalRoomMetadataIdentity = require('../../../middlewares/optionalRoomMetadataIdentity');
const { buildReq, buildRes } = require('../_helpers/httpMocks');

describe('ルーム情報取得時の任意認証', () => {
  const run = async ({ headers = {}, body = { room_id: 'room-1' } } = {}) => {
    const req = buildReq({ headers, body });
    const res = buildRes();
    res.cookie = jest.fn();
    res.clearCookie = jest.fn();
    const next = jest.fn();

    await optionalRoomMetadataIdentity(req, res, next);
    return { req, res, next, body };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('認証ヘッダがなければ匿名としてbodyとCookieを変更せず通過する', async () => {
    const result = await run();

    expect(result.next).toHaveBeenCalledWith();
    expect(authenticateUserToken).not.toHaveBeenCalled();
    expect(authenticateGuestToken).not.toHaveBeenCalled();
    expect(result.req.body).toBe(result.body);
    expect(result.res.cookie).not.toHaveBeenCalled();
    expect(result.res.clearCookie).not.toHaveBeenCalled();
  });

  test('Bearer トークンをユーザとして検証しjwtPayloadだけを設定する', async () => {
    const payload = { user_id: 'user-1', user_role: 'Author' };
    authenticateUserToken.mockResolvedValue({ payload });

    const result = await run({ headers: { Authorization: 'Bearer user-token' } });

    expect(authenticateUserToken).toHaveBeenCalledWith('user-token');
    expect(result.req.jwtPayload).toBe(payload);
    expect(result.req.body).toBe(result.body);
    expect(result.res.cookie).not.toHaveBeenCalled();
    expect(result.res.clearCookie).not.toHaveBeenCalled();
    expect(result.res.headers).not.toHaveProperty('Set-Cookie');
    expect(result.next).toHaveBeenCalledWith();
  });

  test('ユーザ Authorizationがなければゲストトークンを検証してreq.guestへ格納する', async () => {
    authenticateGuestToken.mockReturnValue({ guestId: 'guest-1', payload: { guest_id: 'guest-1' } });

    const result = await run({ headers: { 'X-Guest-Token': 'guest-token' } });

    expect(authenticateGuestToken).toHaveBeenCalledWith('guest-token');
    expect(result.req.guest).toEqual({ id: 'guest-1' });
    expect(result.req.body).toBe(result.body);
    expect(result.req.body).not.toHaveProperty('guest_id');
    expect(result.res.cookie).not.toHaveBeenCalled();
    expect(result.res.clearCookie).not.toHaveBeenCalled();
    expect(result.res.headers).not.toHaveProperty('Set-Cookie');
    expect(result.next).toHaveBeenCalledWith();
  });

  test('両ヘッダがある場合はユーザだけを検証する', async () => {
    const payload = { user_id: 'user-1', user_role: 'Author' };
    authenticateUserToken.mockResolvedValue({ payload });

    const result = await run({
      headers: {
        Authorization: 'Bearer user-token',
        'X-Guest-Token': 'guest-token',
      },
    });

    expect(authenticateUserToken).toHaveBeenCalledWith('user-token');
    expect(authenticateGuestToken).not.toHaveBeenCalled();
    expect(result.req.jwtPayload).toBe(payload);
    expect(result.req.guest).toBeUndefined();
  });

  test('ユーザのトークンが不正ならゲスト認証へ切り替えず、同じエラーを渡す', async () => {
    const error = new Error('invalid user token');
    error.code = 'TOKEN_INVALID';
    authenticateUserToken.mockRejectedValue(error);

    const result = await run({
      headers: {
        Authorization: 'Bearer invalid-user-token',
        'X-Guest-Token': 'valid-guest-token',
      },
    });

    expect(result.next).toHaveBeenCalledWith(error);
    expect(authenticateGuestToken).not.toHaveBeenCalled();
  });

  test.each(['TOKEN_INVALID', 'TOKEN_EXPIRED'])('ゲストトークンの%sをそのまま渡す', async (code) => {
    const error = new Error(code);
    error.code = code;
    authenticateGuestToken.mockImplementation(() => {
      throw error;
    });

    const result = await run({ headers: { 'X-Guest-Token': 'guest-token' } });

    expect(result.next).toHaveBeenCalledWith(error);
    expect(result.req.guest).toBeUndefined();
  });

  test.each(['Basic token', 'Bearer'])('不正なAuthorization形式 %s をTOKEN_INVALIDにする', async (authorization) => {
    const result = await run({ headers: { Authorization: authorization } });

    expect(result.next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'TOKEN_INVALID', status: 401 })
    );
    expect(authenticateUserToken).not.toHaveBeenCalled();
    expect(authenticateGuestToken).not.toHaveBeenCalled();
  });

  test('空のAuthorizationではゲスト認証へ切り替えずTOKEN_INVALIDを返す', async () => {
    const result = await run({
      headers: { Authorization: '', 'X-Guest-Token': 'guest-token' },
    });

    expect(result.next).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_INVALID' }));
    expect(authenticateGuestToken).not.toHaveBeenCalled();
  });

  test('空のゲスト認証ヘッダを匿名アクセスとして扱わずTOKEN_INVALIDを返す', async () => {
    const error = new Error('invalid guest token');
    error.code = 'TOKEN_INVALID';
    authenticateGuestToken.mockImplementation(() => {
      throw error;
    });

    const result = await run({ headers: { 'X-Guest-Token': '' } });

    expect(authenticateGuestToken).toHaveBeenCalledWith('');
    expect(result.next).toHaveBeenCalledWith(error);
  });
});
