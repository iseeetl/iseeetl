const jwt = require('jsonwebtoken');

const USER_MEDIA_COOKIE = 'iseeetl_media_user';
const GUEST_MEDIA_COOKIE = 'iseeetl_media_guest';
const MEDIA_COOKIE_PATH = '/media';

const buildBaseCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  path: MEDIA_COOKIE_PATH,
});

const resolveTokenMaxAge = (token) => {
  const decoded = jwt.decode(token);
  if (!decoded || !Number.isFinite(decoded.exp)) return null;
  return Math.max(1, decoded.exp * 1000 - Date.now());
};

const setCookieFromToken = (res, name, token) => {
  const maxAge = resolveTokenMaxAge(token);
  if (!res || typeof res.cookie !== 'function' || maxAge === null) return false;
  res.cookie(name, token, { ...buildBaseCookieOptions(), maxAge });
  return true;
};

const clearCookie = (res, name) => {
  if (!res || typeof res.clearCookie !== 'function') return;
  res.clearCookie(name, buildBaseCookieOptions());
};

const setUserMediaAccessCookie = (res, token) => {
  const set = setCookieFromToken(res, USER_MEDIA_COOKIE, token);
  if (set) clearCookie(res, GUEST_MEDIA_COOKIE);
  return set;
};

const setGuestMediaAccessCookie = (res, token) => {
  const set = setCookieFromToken(res, GUEST_MEDIA_COOKIE, token);
  if (set) clearCookie(res, USER_MEDIA_COOKIE);
  return set;
};

module.exports = {
  USER_MEDIA_COOKIE,
  GUEST_MEDIA_COOKIE,
  MEDIA_COOKIE_PATH,
  setUserMediaAccessCookie,
  setGuestMediaAccessCookie,
  clearUserMediaAccessCookie: (res) => clearCookie(res, USER_MEDIA_COOKIE),
};
