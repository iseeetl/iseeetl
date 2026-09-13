const AppError = require('../utils/appError');
const {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  createGuestId,
  buildAccessToken,
  buildRefreshToken,
  verifyRefreshToken,
} = require('../services/guestAuth.service');
const { setGuestMediaAccessCookie } = require('../utils/mediaAccessCookie');

const buildCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: REFRESH_TTL_SECONDS * 1000,
});

const setGuestRefreshCookie = (res, refreshToken) => {
  res.cookie('guest_refresh', refreshToken, buildCookieOptions());
};

exports.bootstrap = async (req, res, next) => {
  try {
    const guestId = createGuestId();
    const guestToken = buildAccessToken(guestId);
    const refreshToken = buildRefreshToken(guestId);

    setGuestRefreshCookie(res, refreshToken);
    setGuestMediaAccessCookie(res, guestToken);

    return res.status(200).json({
      guest_id: guestId,
      guest_name: req.body.guest_name,
      lang: req.body.lang,
      guest_token: guestToken,
      expires_in: ACCESS_TTL_SECONDS,
    });
  } catch (err) {
    return next(err);
  }
};

exports.refresh = async (req, res, next) => {
  const refreshToken = req.cookies?.guest_refresh;
  if (!refreshToken) return next(new AppError({ code: 'TOKEN_INVALID' }));

  try {
    const decoded = verifyRefreshToken(refreshToken);
    const guestId = decoded?.guest_id;
    if (!guestId) return next(new AppError({ code: 'TOKEN_INVALID' }));

    const guestToken = buildAccessToken(guestId);
    setGuestRefreshCookie(res, refreshToken);
    setGuestMediaAccessCookie(res, guestToken);

    return res.status(200).json({
      guest_id: guestId,
      guest_token: guestToken,
      expires_in: ACCESS_TTL_SECONDS,
    });
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
    return next(new AppError({ code }));
  }
};
