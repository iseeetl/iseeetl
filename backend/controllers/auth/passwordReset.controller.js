const authService = require('../../services/auth.service');

exports.sendResetPasswordMail = async (req, res, next) => {
  try {
    await authService.sendResetPasswordMail(req.body.mail);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
};

exports.verifyResetPasswordToken = async (req, res, next) => {
  try {
    await authService.verifyResetPasswordToken(req.body.token);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    await authService.resetPassword(req.body, req.io);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
};
