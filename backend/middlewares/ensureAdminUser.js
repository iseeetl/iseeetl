const ROLES = require('../constants/roles');
const AppError = require('../utils/appError');

module.exports = function ensureAdminUser(req, _res, next) {
  const role = req.jwtPayload?.user_role;
  if (!role) {
    // 認証ミドルウェアの設定漏れに備え、認証情報のない要求をここでも拒否する。
    return next(new AppError({ code: 'INVALID_PERMISSION' }));
  }
  if (role !== ROLES.ADMINISTRATOR) {
    return next(new AppError({ code: 'FORBIDDEN' }));
  }
  return next();
};
