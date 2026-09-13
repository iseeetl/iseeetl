const jwt = require('jsonwebtoken');

const AppError = require('../../utils/appError');
const { findUserForSession, normalizeSessionVersion } = require('../_shared/userSession');

const tokenError = (error) =>
  new AppError({ code: error?.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID' });

const verifyUserJwt = (token, secret = process.env.JWT_SECRET) =>
  new Promise((resolve, reject) => {
    jwt.verify(token, secret, (error, decoded) => {
      if (error) return reject(tokenError(error));
      return resolve(decoded);
    });
  });

const authenticateUserToken = async (token, { secret = process.env.JWT_SECRET } = {}) => {
  if (!token) throw tokenError();

  const decoded = await verifyUserJwt(token, secret);
  const user = await findUserForSession(decoded);
  if (!user) throw tokenError();

  return {
    user,
    payload: {
      ...decoded,
      user_role: user.role,
      session_version: normalizeSessionVersion(user.session_version),
    },
  };
};

const authenticateGuestToken = (token) => {
  if (!token) throw tokenError();

  let payload;
  try {
    const { verifyAccessToken } = require('../guestAuth.service');
    payload = verifyAccessToken(token);
  } catch (error) {
    throw tokenError(error);
  }

  if (!payload?.guest_id) throw tokenError();
  return { guestId: payload.guest_id, payload };
};

module.exports = {
  authenticateGuestToken,
  authenticateUserToken,
  tokenError,
  verifyUserJwt,
};
