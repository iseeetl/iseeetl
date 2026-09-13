const express = require('express');
const router = express.Router();
const {
  validateMongoId,
  validateLang,
  validateLangQueryOptional,
  validateOptionalQueryString,
  validateString,
  validateUserName,
} = require('../validates/base.validate');
const { normalizeMail, validateMail, validatePassword } = require('../validates/user.validate');
const { validateInviteToken, validateResetPasswordToken } = require('../validates/auth.validate');
const { finalize } = require('../middlewares/validation');
const authController = require('../controllers/auth.controller');
router.post('/logout', authController.logout);
const ensureJsonWebToken = require('../middlewares/ensureJsonWebToken');
const rateLimit = require('express-rate-limit');
const { readIntEnv } = require('../config/env');

const RESET_MAIL_RATE_LIMIT_WINDOW_MS = readIntEnv('RESET_MAIL_RATE_LIMIT_WINDOW_MS', {
  defaultValue: 60 * 60 * 1000,
  min: 1000,
});
const RESET_MAIL_RATE_LIMIT_MAX = readIntEnv('RESET_MAIL_RATE_LIMIT_MAX', {
  defaultValue: 5,
  min: 1,
});
const RESET_MAIL_IP_RATE_LIMIT_MAX = readIntEnv('RESET_MAIL_IP_RATE_LIMIT_MAX', {
  defaultValue: 20,
  min: 1,
});
const LOGIN_RATE_LIMIT_WINDOW_MS = readIntEnv('LOGIN_RATE_LIMIT_WINDOW_MS', {
  defaultValue: 15 * 60 * 1000,
  min: 1000,
});
const LOGIN_RATE_LIMIT_MAX = readIntEnv('LOGIN_RATE_LIMIT_MAX', {
  defaultValue: 20,
  min: 1,
});

const buildResetMailRateLimitKey = (req) => {
  const mail = req.body?.mail;
  if (typeof mail !== 'string') return `invalid-mail:${req.ip || 'unknown'}`;

  const normalizedMail = normalizeMail(mail);
  return normalizedMail ? `mail:${normalizedMail}` : `invalid-mail:${req.ip || 'unknown'}`;
};

const limitResetMailByMail = rateLimit({
  windowMs: RESET_MAIL_RATE_LIMIT_WINDOW_MS,
  max: RESET_MAIL_RATE_LIMIT_MAX,
  keyGenerator: buildResetMailRateLimitKey,
});
const limitResetMailByIp = rateLimit({
  windowMs: RESET_MAIL_RATE_LIMIT_WINDOW_MS,
  max: RESET_MAIL_IP_RATE_LIMIT_MAX,
});
const limitLogin = rateLimit({
  windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
  max: LOGIN_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
});

router.post(
  '/register',
  [
    validateUserName('username'),
    validateMail('mail'),
    validatePassword('password'),
    validateLang('lang'),
    validateMongoId('room_id', { required: false }),
  ],
  finalize,
  authController.register
);

router.post(
  '/activate',
  [
    validateInviteToken('invite_token'),
    validateMongoId('room_id', { required: false }),
  ],
  finalize,
  authController.activate
);

router.post(
  '/login',
  limitLogin,
  [validateMail('mail'), validatePassword('password')],
  finalize,
  authController.login
);

router.post(
  '/google/login',
  [validateString('id_token', { min: 10, max: 5000 }), validateLang('lang')],
  finalize,
  authController.googleLogin
);

router.get('/push-identity', ensureJsonWebToken, authController.getPushIdentity);

// ポップアップで認可を開始し、コールバックから親画面へpostMessageで結果を返す。
router.get(
  '/line/authorize',
  [
    validateLangQueryOptional('lang'),
    validateOptionalQueryString('floor_id', { max: 64 }),
    validateOptionalQueryString('room_id', { max: 64 }),
  ],
  finalize,
  authController.lineAuthorize
);
router.get('/line/callback', authController.lineCallback);

router.post(
  '/resetpassword/sendmail',
  limitResetMailByIp,
  limitResetMailByMail,
  [validateMail('mail')],
  finalize,
  authController.sendResetPasswordMail
);

router.post(
  '/resetpassword/verify',
  [validateResetPasswordToken('token')],
  finalize,
  authController.verifyResetPasswordToken
);

router.post(
  '/resetpassword',
  [validatePassword('password'), validateResetPasswordToken('token')],
  finalize,
  authController.resetPassword
);

module.exports = router;
