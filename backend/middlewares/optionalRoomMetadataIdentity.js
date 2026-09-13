const AppError = require('../utils/appError');
const {
  authenticateGuestToken,
  authenticateUserToken,
} = require('../services/auth/tokenAuthentication.service');

module.exports = async (req, _res, next) => {
  const authorization = req.get('authorization');
  if (authorization !== undefined) {
    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return next(new AppError({ code: 'TOKEN_INVALID' }));
    }

    try {
      const { payload } = await authenticateUserToken(token);
      req.jwtPayload = payload;
      return next();
    } catch (error) {
      return next(error);
    }
  }

  const guestToken = req.get('x-guest-token');
  if (guestToken === undefined) return next();

  try {
    const { guestId } = authenticateGuestToken(guestToken);
    req.guest = { id: guestId };
    return next();
  } catch (error) {
    return next(error);
  }
};
