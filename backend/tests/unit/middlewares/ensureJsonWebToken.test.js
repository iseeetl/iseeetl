const jwt = require('jsonwebtoken');
const { buildReq, buildRes, runMiddleware } = require('../_helpers/httpMocks');
const { snapshotEnv, restoreEnv } = require('../_helpers/env');

jest.mock('../../../constants/messages', () => ({
  TOKEN_INVALID: '認証情報が無効です',
  TOKEN_EXPIRED: '認証の有効期限が切れています',
}));

jest.mock('../../../services/_shared/userSession', () => ({
  findUserForSession: jest.fn(),
  normalizeSessionVersion: jest.fn((value) => (Number.isInteger(value) ? value : 0)),
}));
jest.mock('../../../utils/mediaAccessCookie', () => ({
  setUserMediaAccessCookie: jest.fn(),
}));

const ensureJsonWebToken = require('../../../middlewares/ensureJsonWebToken');
const { createEnsureJsonWebToken } = ensureJsonWebToken;
const Messages = require('../../../constants/messages');
const AppError = require('../../../utils/appError');
const { resolveErrorCode, buildErrorResponse } = require('../../../utils/errorResponse');
const { findUserForSession } = require('../../../services/_shared/userSession');
const { setUserMediaAccessCookie } = require('../../../utils/mediaAccessCookie');

describe('JWT認証', () => {
  const JWT_SECRET = 'unit-test-secret';
  const ORIGINAL_ENV = snapshotEnv(['JWT_SECRET']);

  const handleError = (err, req, res) => {
    const status = err?.status || err?.statusCode || 500;
    const code = resolveErrorCode(err, status);
    const isAppError = err instanceof AppError || err?.name === 'AppError';
    const message = isAppError ? err.message : 'サーバーでエラーが発生しました';
    const details = isAppError ? err.details : undefined;
    res.status(status).json(buildErrorResponse({ code, message, details, status }));
  };

  const run = async (authorization) => {
    const req = buildReq({ headers: authorization ? { authorization } : {} });
    const res = buildRes();
    return runMiddleware(ensureJsonWebToken, req, res, {
      onSuccess: (req, res) => res.status(200).json({ ok: true, payload: req.jwtPayload }),
      onError: handleError,
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    findUserForSession.mockResolvedValue({ _id: 'user1', role: 'Author', session_version: 0 });
  });

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterAll(() => {
    restoreEnv(ORIGINAL_ENV);
  });

  test('有効な Bearer トークンなら 200、データが付与される', async () => {
    const payload = { user_id: 'user1', user_role: 'StaleRole' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

    const res = await run(`Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.payload.user_id).toBe('user1');
    expect(res.body.payload.user_role).toBe('Author');
    expect(res.body.payload.session_version).toBe(0);
    expect(findUserForSession).toHaveBeenCalledWith(expect.objectContaining(payload));
    expect(setUserMediaAccessCookie).toHaveBeenCalledWith(expect.any(Object), token);
  });

  test('メディア用Cookieが無効ならトークンを応答へ複製しない', async () => {
    const payload = { user_id: 'user1' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    const req = buildReq({ headers: { authorization: `Bearer ${token}` } });
    const res = buildRes();

    await runMiddleware(
      createEnsureJsonWebToken({ setMediaAccessCookie: false }),
      req,
      res,
      {
        onSuccess: (_req, response) => response.status(200).json({ ok: true }),
        onError: handleError,
      }
    );

    expect(res.statusCode).toBe(200);
    expect(setUserMediaAccessCookie).not.toHaveBeenCalled();
  });

  test('ユーザが存在しないかセッション世代が一致しないトークンは401', async () => {
    findUserForSession.mockResolvedValue(null);
    const token = jwt.sign({ user_id: 'user1', session_version: 0 }, JWT_SECRET, { expiresIn: '1h' });

    const res = await run(`Bearer ${token}`);

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  test('Authorization ヘッダ無しは 401 (TOKEN_INVALID)', async () => {
    const res = await run();
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
    expect(res.body.error.status).toBe(401);
    expect(res.body.error.message).toBe(Messages.TOKEN_INVALID);
    expect(res.body.error.requestId).toBeUndefined();
  });

  test('スキーム不正（Basic）や Bearer だがトークン欠落は 401', async () => {
    let res = await run('Basic abcdefg');
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
    expect(res.body.error.status).toBe(401);
    expect(res.body.error.message).toBe(Messages.TOKEN_INVALID);

    res = await run('Bearer');
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
    expect(res.body.error.status).toBe(401);
    expect(res.body.error.message).toBe(Messages.TOKEN_INVALID);

    res = await run('Bearer ');
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
    expect(res.body.error.status).toBe(401);
    expect(res.body.error.message).toBe(Messages.TOKEN_INVALID);
  });

  test('署名不正/改ざんトークンは 401', async () => {
    const badToken = jwt.sign({ sub: 'user1' }, 'wrong-secret', { expiresIn: '1h' });

    const res = await run(`Bearer ${badToken}`);

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
    expect(res.body.error.status).toBe(401);
    expect(res.body.error.message).toBe(Messages.TOKEN_INVALID);
  });

  test('明らかに不正な文字列トークンも 401', async () => {
    const res = await run('Bearer not-a-jwt-token');

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
    expect(res.body.error.message).toBe(Messages.TOKEN_INVALID);
  });

  test('期限切れトークンは 401 (TOKEN_EXPIRED)', async () => {
    const payload = { sub: 'user1', user_role: 'Author' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '-1s' });

    const res = await run(`Bearer ${token}`);

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    expect(res.body.error.status).toBe(401);
    expect(res.body.error.message).toBe(Messages.TOKEN_EXPIRED);
  });
});
