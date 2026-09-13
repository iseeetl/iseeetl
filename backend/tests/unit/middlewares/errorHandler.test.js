const Messages = require('../../../constants/messages');
const AppError = require('../../../utils/appError');
const defaultLogger = require('../../../utils/logger');
const {
  createErrorHandler,
  errorHandler,
} = require('../../../middlewares/errorHandler');

const buildResponse = () => {
  const res = {
    json: jest.fn(),
    status: jest.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
};

const buildLogger = () => ({
  warn: jest.fn(),
  error: jest.fn(),
});

describe('エラー応答の共通処理', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('4引数のExpressエラーミドルウェアを生成する', () => {
    expect(createErrorHandler()).toHaveLength(4);
  });

  test('AppErrorをエラー定義に従った応答へ変換する', () => {
    const logger = buildLogger();
    const handler = createErrorHandler({ logger });
    const err = new AppError({ code: 'INVALID_PARAMS' });
    const res = buildResponse();

    handler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'INVALID_PARAMS',
        status: 400,
        message: Messages.INVALID_PARAMS,
      },
    });
  });

  test('名前がAppErrorのオブジェクトもAppErrorとして扱う', () => {
    const logger = buildLogger();
    const handler = createErrorHandler({ logger });
    const err = {
      name: 'AppError',
      code: 'NOT_FOUND',
      status: 404,
      message: 'not exposed directly',
      stack: 'named-app-error-stack',
    };
    const res = buildResponse();

    handler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'NOT_FOUND',
        status: 404,
        message: Messages.NOT_FOUND,
      },
    });
    expect(logger.warn).toHaveBeenCalledWith('[AppError] not exposed directly', {
      stack: 'named-app-error-stack',
    });
  });

  test('AppErrorの詳細情報は真と評価される場合だけ応答へ含める', () => {
    const handler = createErrorHandler({ logger: buildLogger() });
    const withDetails = new AppError({
      code: 'INVALID_PARAMS',
      details: { field: 'name' },
    });
    const withDetailsResponse = buildResponse();
    const withoutDetails = new AppError({ code: 'INVALID_PARAMS' });
    withoutDetails.details = '';
    const withoutDetailsResponse = buildResponse();

    handler(withDetails, {}, withDetailsResponse, jest.fn());
    handler(withoutDetails, {}, withoutDetailsResponse, jest.fn());

    expect(withDetailsResponse.json).toHaveBeenCalledWith({
      error: {
        code: 'INVALID_PARAMS',
        status: 400,
        message: Messages.INVALID_PARAMS,
        details: { field: 'name' },
      },
    });
    expect(withoutDetailsResponse.json.mock.calls[0][0].error).not.toHaveProperty('details');
  });

  test('未処理のエラーを正規化し、内部プロパティを公開しない', () => {
    const logger = buildLogger();
    const handler = createErrorHandler({ logger });
    const err = new Error('database password leaked');
    err.internalProperty = 'secret';
    const res = buildResponse();

    handler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        status: 500,
        message: Messages.INTERNAL_SERVER_ERROR,
      },
    });
    const body = res.json.mock.calls[0][0];
    expect(JSON.stringify(body)).not.toContain('database password leaked');
    expect(JSON.stringify(body)).not.toContain('internalProperty');
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  test('statusCodeよりstatusを優先する', () => {
    const handler = createErrorHandler({ logger: buildLogger() });
    const res = buildResponse();

    handler({ status: 404, statusCode: 400 }, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error.code).toBe('NOT_FOUND');
  });

  test('statusが未指定ならstatusCodeを使う', () => {
    const handler = createErrorHandler({ logger: buildLogger() });
    const res = buildResponse();

    handler({ statusCode: 403 }, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].error).toEqual({
      code: 'FORBIDDEN',
      status: 403,
      message: Messages.FORBIDDEN,
    });
  });

  test('未知のコードと未対応のステータスには既定のエラー応答を使う', () => {
    const handler = createErrorHandler({ logger: buildLogger() });
    const knownStatusResponse = buildResponse();
    const unsupportedStatusResponse = buildResponse();

    handler({ code: 'UNKNOWN_CODE', status: 401 }, {}, knownStatusResponse, jest.fn());
    handler({ code: 'UNKNOWN_CODE', status: 418 }, {}, unsupportedStatusResponse, jest.fn());

    expect(knownStatusResponse.json.mock.calls[0][0].error).toEqual({
      code: 'UNAUTHORIZED',
      status: 401,
      message: Messages.UNAUTHORIZED,
    });
    expect(unsupportedStatusResponse.json.mock.calls[0][0].error).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      status: 500,
      message: Messages.INTERNAL_SERVER_ERROR,
    });
  });

  test('AppErrorを所定の引数で警告ログだけに記録する', () => {
    const logger = buildLogger();
    const handler = createErrorHandler({ logger });
    const err = new AppError({ code: 'INVALID_PARAMS' });

    handler(err, {}, buildResponse(), jest.fn());

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(`[AppError] ${Messages.INVALID_PARAMS}`, {
      stack: err.stack,
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('未処理のエラーを所定の引数でエラーログだけに記録する', () => {
    const logger = buildLogger();
    const handler = createErrorHandler({ logger });
    const err = new Error('boom');

    handler(err, {}, buildResponse(), jest.fn());

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('[UnhandledError]', { stack: err.stack });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('応答送信後はnextを呼ばない', () => {
    const handler = createErrorHandler({ logger: buildLogger() });
    const next = jest.fn();

    handler(new Error('boom'), {}, buildResponse(), next);

    expect(next).not.toHaveBeenCalled();
  });

  test('既定のロガーを使う製品用ミドルウェアを公開する', () => {
    const warn = jest.spyOn(defaultLogger, 'warn').mockImplementation(() => {});
    const error = jest.spyOn(defaultLogger, 'error').mockImplementation(() => {});

    errorHandler(new AppError({ code: 'INVALID_PARAMS' }), {}, buildResponse(), jest.fn());

    expect(errorHandler).toHaveLength(4);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });
});
