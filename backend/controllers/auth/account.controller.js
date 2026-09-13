const authService = require('../../services/auth.service');
const { setUserMediaAccessCookie, clearUserMediaAccessCookie } = require('../../utils/mediaAccessCookie');

// Cookieの消去はゲスト認証やJWTの有効性に依存させない。
exports.logout = (_req, res) => {
  clearUserMediaAccessCookie(res);
  res.sendStatus(204);
};

exports.register = async (req, res, next) => {
  try {
    await authService.register(req.body);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
};

exports.activate = async (req, res, next) => {
  try {
    const result = await authService.activate(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const userData = await authService.login(req.body);
    setUserMediaAccessCookie(res, userData.token);
    res.json(userData);
  } catch (err) {
    next(err);
  }
};

exports.googleLogin = async (req, res, next) => {
  try {
    const result = await authService.googleLogin(req.body);
    setUserMediaAccessCookie(res, result.token);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

exports.getPushIdentity = async (req, res, next) => {
  try {
    const result = authService.getPushIdentity(req.jwtPayload.user_id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
