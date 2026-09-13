const jwt = require('jsonwebtoken');
const { buildReq, buildRes, runMiddleware } = require('../_helpers/httpMocks');

jest.mock('../../../constants/messages', () => ({
  TOKEN_INVALID: '認証情報が無効です',
  TOKEN_EXPIRED: '認証の有効期限が切れています',
}));
jest.mock('../../../utils/mediaAccessCookie', () => ({
  setGuestMediaAccessCookie: jest.fn(),
}));

const ORIGINAL_GUEST_JWT_SECRET = process.env.GUEST_JWT_SECRET;
const ORIGINAL_GUEST_REFRESH_SECRET = process.env.GUEST_REFRESH_SECRET;

process.env.GUEST_JWT_SECRET = 'unit-test-guest-secret';
process.env.GUEST_REFRESH_SECRET = 'unit-test-guest-refresh-secret';

const guestAuth = require('../../../middlewares/guestAuth');
const Messages = require('../../../constants/messages');
const { setGuestMediaAccessCookie } = require('../../../utils/mediaAccessCookie');
const AppError = require('../../../utils/appError');
const { resolveErrorCode, buildErrorResponse } = require('../../../utils/errorResponse');

describe('ゲスト認証', () => {
  afterAll(() => {
    if (ORIGINAL_GUEST_JWT_SECRET === undefined) {
      delete process.env.GUEST_JWT_SECRET;
    } else {
      process.env.GUEST_JWT_SECRET = ORIGINAL_GUEST_JWT_SECRET;
    }

    if (ORIGINAL_GUEST_REFRESH_SECRET === undefined) {
      delete process.env.GUEST_REFRESH_SECRET;
    } else {
      process.env.GUEST_REFRESH_SECRET = ORIGINAL_GUEST_REFRESH_SECRET;
    }
  });

  const handleError = (err, req, res) => {
    const status = err?.status || err?.statusCode || 500;
    const code = resolveErrorCode(err, status);
    const isAppError = err instanceof AppError || err?.name === 'AppError';
    const message = isAppError ? err.message : 'サーバーでエラーが発生しました';
    const details = isAppError ? err.details : undefined;
    res.status(status).json(buildErrorResponse({ code, message, details, status }));
  };

  const run = async (token) => {
    const req = buildReq({ headers: token ? { 'x-guest-token': token } : {} });
    const res = buildRes();
    return runMiddleware(guestAuth, req, res, {
      onSuccess: (req, res) => res.status(200).json({ ok: true, guest: req.guest, bodyGuestId: req.body.guest_id }),
      onError: handleError,
    });
  };

  test('有効なゲストトークンなら 200、ゲストが付与される', async () => {
    const token = jwt.sign({ guest_id: 'guest-1' }, process.env.GUEST_JWT_SECRET, { expiresIn: '1h' });

    const res = await run(token);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.guest.id).toBe('guest-1');
    expect(res.body.bodyGuestId).toBe('guest-1');
    expect(setGuestMediaAccessCookie).toHaveBeenCalledWith(expect.any(Object), token);
  });

  test('ヘッダ無しは 401 (TOKEN_INVALID)', async () => {
    const res = await run();
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
    expect(res.body.error.message).toBe(Messages.TOKEN_INVALID);
  });

  test('不正トークンは 401 (TOKEN_INVALID)', async () => {
    const badToken = jwt.sign({ guest_id: 'guest-1' }, 'wrong-secret', { expiresIn: '1h' });

    const res = await run(badToken);

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
    expect(res.body.error.message).toBe(Messages.TOKEN_INVALID);
  });

  test('guest_id を含まないトークンは 401 (TOKEN_INVALID)', async () => {
    const token = jwt.sign({ foo: 'bar' }, process.env.GUEST_JWT_SECRET, { expiresIn: '1h' });

    const res = await run(token);

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
    expect(res.body.error.message).toBe(Messages.TOKEN_INVALID);
  });

  test('期限切れトークンは 401 (TOKEN_EXPIRED)', async () => {
    const token = jwt.sign({ guest_id: 'guest-1' }, process.env.GUEST_JWT_SECRET, { expiresIn: '-1s' });

    const res = await run(token);

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    expect(res.body.error.message).toBe(Messages.TOKEN_EXPIRED);
  });
});
