const { buildReq, buildRes, runMiddleware } = require('../_helpers/httpMocks');

jest.mock('../../../constants/messages', () => ({
  INVALID_PERMISSION: 'INVALID_PERMISSION',
  FORBIDDEN: 'FORBIDDEN',
}));

const ensureAdminUser = require('../../../middlewares/ensureAdminUser');
const AppError = require('../../../utils/appError');
const { resolveErrorCode, buildErrorResponse } = require('../../../utils/errorResponse');

describe('管理者権限の確認', () => {
  const handleError = (err, req, res) => {
    const status = err?.status || err?.statusCode || 500;
    const code = resolveErrorCode(err, status);
    const isAppError = err instanceof AppError || err?.name === 'AppError';
    const message = isAppError ? err.message : 'サーバーでエラーが発生しました';
    const details = isAppError ? err.details : undefined;
    res.status(status).json(buildErrorResponse({ code, message, details, status }));
  };

  const run = async (jwtPayload) => {
    const req = buildReq({ jwtPayload });
    const res = buildRes();
    return runMiddleware(ensureAdminUser, req, res, {
      onSuccess: (_req, res) => res.status(200).send('OK'),
      onError: handleError,
    });
  };

  test('管理者ロールなら通過して 200', async () => {
    const res = await run({ user_role: 'Administrator' });
    expect(res.statusCode).toBe(200);
    expect(res.text).toBe('OK');
  });

  test('JWT が無い／user_role 無しなら 401 (INVALID_PERMISSION)', async () => {
    let res = await run(undefined);
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('INVALID_PERMISSION');
    expect(res.body.error.status).toBe(401);
    expect(res.body.error.message).toBe('INVALID_PERMISSION');
    expect(res.body.error.requestId).toBeUndefined();

    res = await run({});
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('INVALID_PERMISSION');
    expect(res.body.error.status).toBe(401);
    expect(res.body.error.message).toBe('INVALID_PERMISSION');
  });

  test('認証済みだが管理者以外なら 403 (FORBIDDEN)', async () => {
    const nonAdminRoles = ['Editor', 'Author', 'developer', 'User'];
    for (const r of nonAdminRoles) {
      const res = await run({ user_role: r });
      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.status).toBe(403);
      expect(res.body.error.message).toBe('FORBIDDEN');
    }
  });

  test('user_role が空文字等の偽値なら 401 (INVALID_PERMISSION)', async () => {
    const falsyRoles = ['', null, undefined];
    for (const r of falsyRoles) {
      const res = await run({ user_role: r });
      expect(res.statusCode).toBe(401);
      expect(res.body.error.code).toBe('INVALID_PERMISSION');
      expect(res.body.error.status).toBe(401);
      expect(res.body.error.message).toBe('INVALID_PERMISSION');
    }
  });
});
