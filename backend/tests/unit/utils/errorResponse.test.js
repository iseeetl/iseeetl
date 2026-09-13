const { getErrorEntry } = require('../../../constants/errorCatalog');
const {
  DEFAULT_CODE_BY_STATUS,
  resolveErrorCode,
  buildErrorResponse,
} = require('../../../utils/errorResponse');

describe('エラー応答の生成', () => {
  test('有効なエラーコードをそのまま返す', () => {
    const err = { code: 'INVALID_PARAMS' };
    expect(resolveErrorCode(err, 400)).toBe('INVALID_PARAMS');
  });

  test('コードを解決できなければHTTPステータスから判定する', () => {
    expect(resolveErrorCode({}, 404)).toBe('NOT_FOUND');
  });

  test('未知のHTTPステータスは500として扱う', () => {
    expect(resolveErrorCode({}, 999)).toBe(DEFAULT_CODE_BY_STATUS[500]);
  });

  test('指定された有効なエラーコードで応答を生成する', () => {
    const code = 'INVALID_PARAMS';
    const entry = getErrorEntry(code);

    expect(buildErrorResponse({ code, status: 400 })).toEqual({
      error: {
        code,
        status: entry.status,
        message: entry.message,
      },
    });
  });

  test('未知のエラーコードには既定の応答を使う', () => {
    const fallbackCode = DEFAULT_CODE_BY_STATUS[401];
    const entry = getErrorEntry(fallbackCode);
    const result = buildErrorResponse({ code: 'UNKNOWN_CODE', status: 401 });

    expect(result).toEqual({
      error: {
        code: fallbackCode,
        status: entry.status,
        message: entry.message,
      },
    });
  });

  test('詳細情報が指定されていれば応答へ含める', () => {
    const result = buildErrorResponse({
      code: 'INVALID_PARAMS',
      status: 400,
      details: { field: 'name' },
    });

    expect(result.error.details).toEqual({ field: 'name' });
  });
});
