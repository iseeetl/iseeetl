const jwt = require('jsonwebtoken');

const User = require('../../models/User');

const DEFAULT_JWT_EXPIRES_IN = '30d';

const normalizeSessionVersion = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : 0;

const resolveJwtExpiresIn = () => {
  const raw = typeof process.env.JWT_EXPIRES_IN === 'string' ? process.env.JWT_EXPIRES_IN.trim() : '';
  return raw || DEFAULT_JWT_EXPIRES_IN;
};

const buildUserTokenPayload = (user) => ({
  user_id: user._id,
  user_role: user.role,
  session_version: normalizeSessionVersion(user.session_version),
});

const signUserToken = (user) =>
  jwt.sign(buildUserTokenPayload(user), process.env.JWT_SECRET, {
    expiresIn: resolveJwtExpiresIn(),
  });

const findUserForSession = async (payload) => {
  if (!payload?.user_id) return null;

  let user;
  try {
    user = await User.findOne({
      _id: payload.user_id,
      delete_flg: false,
    }).select('_id role session_version');
  } catch (err) {
    if (err?.name === 'CastError') return null;
    throw err;
  }

  if (!user) return null;
  if (normalizeSessionVersion(user.session_version) !== normalizeSessionVersion(payload.session_version)) {
    return null;
  }

  return user;
};

module.exports = {
  DEFAULT_JWT_EXPIRES_IN,
  normalizeSessionVersion,
  resolveJwtExpiresIn,
  buildUserTokenPayload,
  signUserToken,
  findUserForSession,
};
