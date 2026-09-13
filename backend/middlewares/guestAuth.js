const AppError = require('../utils/appError');
const { authenticateGuestToken } = require('../services/auth/tokenAuthentication.service');
const { setGuestMediaAccessCookie } = require('../utils/mediaAccessCookie');

module.exports = (req, res, next) => {
  const token = req.get('x-guest-token');
  if (!token) return next(new AppError({ code: 'TOKEN_INVALID' }));

  try {
    const { guestId } = authenticateGuestToken(token);
    if (!req.body) req.body = {};
    req.body.guest_id = guestId;
    req.guest = { id: guestId };
    setGuestMediaAccessCookie(res, token);
    return next();
  } catch (err) {
    return next(err);
  }
};
