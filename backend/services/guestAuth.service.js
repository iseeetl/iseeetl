const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ACCESS_TTL_SECONDS = Number(process.env.GUEST_ACCESS_TTL || 15 * 60);
const REFRESH_TTL_SECONDS = Number(process.env.GUEST_REFRESH_TTL || 30 * 24 * 60 * 60);

const requireSecret = (envName) => {
  const value = process.env[envName];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${envName} is required`);
  }
  return value;
};

const ACCESS_SECRET = requireSecret('GUEST_JWT_SECRET');
const REFRESH_SECRET = requireSecret('GUEST_REFRESH_SECRET');

const createGuestId = () => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const buildAccessToken = (guestId) => {
  return jwt.sign({ guest_id: guestId }, ACCESS_SECRET, { expiresIn: ACCESS_TTL_SECONDS });
};

const buildRefreshToken = (guestId) => {
  return jwt.sign({ guest_id: guestId }, REFRESH_SECRET, { expiresIn: REFRESH_TTL_SECONDS });
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, ACCESS_SECRET);
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, REFRESH_SECRET);
};

module.exports = {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  createGuestId,
  buildAccessToken,
  buildRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
