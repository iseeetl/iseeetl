const AppError = require('../utils/appError');
const { resolveErrorCode, buildErrorResponse } = require('../utils/errorResponse');
const defaultLogger = require('../utils/logger');

const createErrorHandler = ({ logger = defaultLogger } = {}) => {
  return (err, _req, res, _next) => {
    const status = err?.status || err?.statusCode || 500;
    const code = resolveErrorCode(err, status);
    const isAppError = err instanceof AppError || err?.name === 'AppError';
    const details = isAppError ? err.details : undefined;

    if (isAppError) {
      logger.warn(`[AppError] ${err.message}`, { stack: err.stack });
    } else {
      logger.error('[UnhandledError]', { stack: err.stack || err });
    }

    const response = buildErrorResponse({ code, details, status });
    res.status(response.error.status).json(response);
  };
};

const errorHandler = createErrorHandler();

module.exports = {
  createErrorHandler,
  errorHandler,
};
