const { getErrorEntry } = require('../constants/errorCatalog');

const DEFAULT_CODE_BY_STATUS = {
  400: 'INVALID_PARAMS',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMIT_EXCEEDED',
  500: 'INTERNAL_SERVER_ERROR',
};

const resolveErrorCode = (err, status) => {
  if (err && err.code && getErrorEntry(err.code)) return err.code;
  if (status && DEFAULT_CODE_BY_STATUS[status]) return DEFAULT_CODE_BY_STATUS[status];
  return DEFAULT_CODE_BY_STATUS[500];
};

const resolveErrorEntry = (code, status) => {
  const entry = getErrorEntry(code);
  if (entry) return { code, entry };
  const fallbackCode = DEFAULT_CODE_BY_STATUS[status] || DEFAULT_CODE_BY_STATUS[500];
  return { code: fallbackCode, entry: getErrorEntry(fallbackCode) };
};

const buildErrorResponse = ({ code, details, status }) => {
  const resolved = resolveErrorEntry(code, status);
  const error = {
    code: resolved.code,
    status: resolved.entry.status,
    message: resolved.entry.message,
  };
  if (details) error.details = details;
  return { error };
};

module.exports = {
  DEFAULT_CODE_BY_STATUS,
  resolveErrorCode,
  buildErrorResponse,
};
