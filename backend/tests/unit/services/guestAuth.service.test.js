const crypto = require('crypto');

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn(),
}));

const ORIGINAL_ENV = process.env;
process.env = {
  ...ORIGINAL_ENV,
  GUEST_ACCESS_TTL: '120',
  GUEST_REFRESH_TTL: '360',
  GUEST_JWT_SECRET: 'access-secret',
  GUEST_REFRESH_SECRET: 'refresh-secret',
};

const jwt = require('jsonwebtoken');
const guestAuth = require('../../../services/guestAuth.service');

describe('ゲスト用トークンの管理', () => {
  afterAll(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('randomUUIDが利用できればゲストIDの生成に使う', () => {
    if (typeof crypto.randomUUID !== 'function') return;
    const spy = jest.spyOn(crypto, 'randomUUID').mockReturnValue('uuid-1234');

    const id = guestAuth.createGuestId();

    expect(id).toBe('uuid-1234');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('randomUUIDがなければrandomBytesでゲストIDを生成する', () => {
    const originalRandomUUID = crypto.randomUUID;
    crypto.randomUUID = undefined;
    const randomBytesSpy = jest
      .spyOn(crypto, 'randomBytes')
      .mockReturnValue(Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex'));

    const id = guestAuth.createGuestId();

    expect(randomBytesSpy).toHaveBeenCalledWith(16);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    randomBytesSpy.mockRestore();
    crypto.randomUUID = originalRandomUUID;
  });

  test('アクセストークン用の秘密値と有効期限で発行する', () => {
    jwt.sign.mockReturnValue('access-token');

    const token = guestAuth.buildAccessToken('guest-1');

    expect(jwt.sign).toHaveBeenCalledWith({ guest_id: 'guest-1' }, 'access-secret', { expiresIn: 120 });
    expect(token).toBe('access-token');
  });

  test('更新用トークンの秘密値と有効期限で発行する', () => {
    jwt.sign.mockReturnValue('refresh-token');

    const token = guestAuth.buildRefreshToken('guest-1');

    expect(jwt.sign).toHaveBeenCalledWith({ guest_id: 'guest-1' }, 'refresh-secret', { expiresIn: 360 });
    expect(token).toBe('refresh-token');
  });

  test('アクセストークン用の秘密値で検証する', () => {
    jwt.verify.mockReturnValue({ guest_id: 'guest-1' });

    const decoded = guestAuth.verifyAccessToken('access-token');

    expect(jwt.verify).toHaveBeenCalledWith('access-token', 'access-secret');
    expect(decoded).toEqual({ guest_id: 'guest-1' });
  });

  test('更新用トークンの秘密値で検証する', () => {
    jwt.verify.mockReturnValue({ guest_id: 'guest-1' });

    const decoded = guestAuth.verifyRefreshToken('refresh-token');

    expect(jwt.verify).toHaveBeenCalledWith('refresh-token', 'refresh-secret');
    expect(decoded).toEqual({ guest_id: 'guest-1' });
  });

  test('GUEST_JWT_SECRET が未設定なら初期化で例外', () => {
    const currentEnv = process.env;
    process.env = { ...currentEnv };
    delete process.env.GUEST_JWT_SECRET;

    jest.resetModules();
    expect(() => require('../../../services/guestAuth.service')).toThrow('GUEST_JWT_SECRET is required');

    process.env = currentEnv;
    jest.resetModules();
  });

  test('GUEST_REFRESH_SECRET が未設定なら初期化で例外', () => {
    const currentEnv = process.env;
    process.env = { ...currentEnv };
    delete process.env.GUEST_REFRESH_SECRET;

    jest.resetModules();
    expect(() => require('../../../services/guestAuth.service')).toThrow('GUEST_REFRESH_SECRET is required');

    process.env = currentEnv;
    jest.resetModules();
  });
});
