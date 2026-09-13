const jwt = require('jsonwebtoken');
const { buildReq, buildRes, runMiddleware } = require('../_helpers/httpMocks');
const { snapshotEnv, restoreEnv } = require('../_helpers/env');

jest.mock('../../../constants/messages', () => ({
  TOKEN_INVALID: '認証情報が無効です',
  TOKEN_EXPIRED: '認証の有効期限が切れています',
}));

const ensureJsonWebTokenV1 = require('../../../middlewares/ensureJsonWebTokenV1');
const Messages = require('../../../constants/messages');
const AppError = require('../../../utils/appError');
const { resolveErrorCode, buildErrorResponse } = require('../../../utils/errorResponse');

describe('v1のJWT認証', () => {
  const JWT_DEV_SECRET = 'unit-test-dev-secret';
  const ORIGINAL_ENV = snapshotEnv(['JWT_DEV_SECRET']);

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
    return runMiddleware(ensureJsonWebTokenV1, req, res, {
      onSuccess: (req, res) => res.status(200).json({ ok: true, payload: req.jwtPayload }),
      onError: handleError,
    });
  };

  beforeAll(() => {
    process.env.JWT_DEV_SECRET = JWT_DEV_SECRET;
  });

  afterAll(() => {
    restoreEnv(ORIGINAL_ENV);
  });

  test('有効なBearerトークンなら200を返して認証情報を付与する', async () => {
    const payload = { sub: 'user1', user_role: 'developer' };
    const token = jwt.sign(payload, JWT_DEV_SECRET, { expiresIn: '1h' });

    const res = await run(`Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.payload.sub).toBe('user1');
  });

  test('Authorizationヘッダがなければ401（TOKEN_INVALID）を返す', async () => {
    const res = await run();

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
    expect(res.body.error.status).toBe(401);
    expect(res.body.error.message).toBe(Messages.TOKEN_INVALID);
    expect(res.body.error.requestId).toBeUndefined();
  });

  test('不正なトークンには401（TOKEN_INVALID）を返す', async () => {
    const res = await run('Bearer not-a-jwt');

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
    expect(res.body.error.status).toBe(401);
    expect(res.body.error.message).toBe(Messages.TOKEN_INVALID);
  });

  test('期限切れトークンには401（TOKEN_EXPIRED）を返す', async () => {
    const payload = { sub: 'user1', user_role: 'developer' };
    const token = jwt.sign(payload, JWT_DEV_SECRET, { expiresIn: '-1s' });

    const res = await run(`Bearer ${token}`);

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    expect(res.body.error.status).toBe(401);
    expect(res.body.error.message).toBe(Messages.TOKEN_EXPIRED);
  });
});
