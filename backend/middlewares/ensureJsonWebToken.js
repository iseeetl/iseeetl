const AppError = require('../utils/appError');
const { authenticateUserToken } = require('../services/auth/tokenAuthentication.service');
const { setUserMediaAccessCookie } = require('../utils/mediaAccessCookie');

const createEnsureJsonWebToken = ({ setMediaAccessCookie = true } = {}) =>
  async (req, res, next) => {
    const auth = req.get('authorization');
    if (!auth) return next(new AppError({ code: 'TOKEN_INVALID' }));

    const [scheme, token] = auth.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return next(new AppError({ code: 'TOKEN_INVALID' }));
    }

    try {
      const { payload } = await authenticateUserToken(token);
      req.jwtPayload = payload;
      if (setMediaAccessCookie) setUserMediaAccessCookie(res, token);
      return next();
    } catch (err) {
      return next(err);
    }
  };

const ensureJsonWebToken = createEnsureJsonWebToken();

module.exports = ensureJsonWebToken;
module.exports.createEnsureJsonWebToken = createEnsureJsonWebToken;
