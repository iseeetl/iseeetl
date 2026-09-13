const { revokeUserSessions } = require('../../socket/configurationRevocation');
const crypto = require('crypto');
const logger = require('../../utils/logger');
const { hashToken, expiresAt, resolveResetState, prepareResetState } = require('./passwordResetState.service');
const { deliverPasswordChangeNotice } = require('../mail/passwordChangeNotice');

const AppError = require('../../utils/appError');
const { isMailDeliveryEnabled } = require('../../config/featureFlags');
const User = require('../../models/User');
const ResetPassword = require('../../models/ResetPassword');
const { sendResetPasswordLink } = require('../mail/resetPasswordLink');

exports.sendResetPasswordMail = async (mail) => {
  if (!isMailDeliveryEnabled()) {
    throw new AppError({
      code: 'EXTERNAL_FEATURE_DISABLED',
      details: { feature: 'mailDelivery' },
    });
  }

  const foundUser = await User.findOne({ mail, delete_flg: false }).select('+password_reset');
  if (!foundUser) return;

  const token = crypto.randomBytes(24).toString('hex');
  const version = foundUser.session_version || 0;
  const state = { token_hash: hashToken(token), mail, expires_at: expiresAt(Date.now()), consumed: false };
  try {
    await sendResetPasswordLink({ mail, lang: foundUser.lang, token });
    // 送信中の再発行・消費・宛先変更・セッション失効を上書きしない。
    const result = await User.updateOne({
      _id: foundUser._id, mail, delete_flg: false,
      ...(foundUser.password_reset
        ? { 'password_reset.token_hash': foundUser.password_reset.token_hash }
        : { password_reset: { $exists: false } }),
      $expr: { $and: [
        { $eq: [{ $ifNull: ['$session_version', 0] }, version] },
        { $gt: [state.expires_at, '$$NOW'] },
      ] },
    }, { $set: { password_reset: state } }, { runValidators: true });
    if (result.modifiedCount !== 1) throw new AppError({ code: 'INTERNAL_SERVER_ERROR' });
  } catch (_error) {
    // 接続先・宛先・トークンを含む外部エラーは応答やログへ渡さない。
    logger.warn('PASSWORD_RESET_LINK_FAILED');
    throw new AppError({ code: 'INTERNAL_SERVER_ERROR' });
  }
};

exports.verifyResetPasswordToken = async (token) => {
  await resolveResetState(token);
};

// Userの条件付き更新で、トークンの消費・パスワードの変更・セッションの失効を同時に確定する。
exports.resetPassword = async ({ password, token }, io) => {
  const { user, state, legacy } = await prepareResetState(token);
  const updatedUser = await User.findOneAndUpdate({
    _id: user._id, mail: user.mail, delete_flg: false,
    'password_reset.token_hash': state.token_hash,
    'password_reset.consumed': false,
    $expr: { $gt: ['$password_reset.expires_at', '$$NOW'] },
  }, {
    $set: {
      password, updated_at: Date.now(), 'password_reset.consumed': true,
    },
    $inc: { session_version: 1 },
  }, { new: true, runValidators: true });
  if (!updatedUser) throw new AppError({ code: 'INVALID_PARAMS' });

  await revokeUserSessions(io, updatedUser._id);
  // 消費済みトークンは再利用できないため、旧コレクションの削除失敗で再設定の成功を取り消さない。
  if (legacy) {
    try { await ResetPassword.deleteOne({ _id: legacy._id, token }); }
    catch { logger.warn('PASSWORD_RESET_LEGACY_CLEANUP_PENDING'); }
  }
  await deliverPasswordChangeNotice({ mail: updatedUser.mail, lang: updatedUser.lang, kind: 'reset' });
};
