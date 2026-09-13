const AppError = require('../../utils/appError');
const { internalError } = require('../../services/v1/common');

function normalizeError(error) {
  if (error instanceof AppError || (error && error.name === 'AppError')) return error;
  const code = error && error.code;
  return internalError(code && String(code).startsWith('FILE_') ? code : undefined);
}

function createJsonHandler(operation, io) {
  return async (req, res, next) => {
    try {
      const { result, afterResponse } = await operation({
        body: req.body || {},
        files: req.files,
        jwtPayload: req.jwtPayload || {},
        io,
        params: req.params || {},
      });
      res.json(result);
      if (afterResponse) {
        Promise.resolve()
          .then(afterResponse)
          .catch(() => {});
      }
    } catch (error) {
      return next(normalizeError(error));
    }
  };
}

module.exports = {
  createJsonHandler,
  normalizeError,
};
