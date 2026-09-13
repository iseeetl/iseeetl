const { getErrorEntry } = require('../constants/errorCatalog');

class AppError extends Error {
  constructor(input = {}) {
    const payload = typeof input === 'string' ? { code: input } : input || {};
    const fallbackCode = 'INTERNAL_SERVER_ERROR';
    const code = payload.code || fallbackCode;
    const matched = getErrorEntry(code);
    const entry = matched || getErrorEntry(fallbackCode);
    super(entry.message);
    this.status = entry.status;
    this.code = matched ? code : fallbackCode;
    if (payload.details) this.details = payload.details;
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
