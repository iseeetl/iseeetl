const crypto = require('crypto');
const User = require('../../models/User');
const ResetPassword = require('../../models/ResetPassword');
const AppError = require('../../utils/appError');
const { readIntEnv } = require('../../config/env');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const expiresAt = (createdAt) => new Date(new Date(createdAt).getTime() + readIntEnv('RESET_TOKEN_TTL_MINUTES', { defaultValue: 60, min: 1 }) * 60000);
const assertPending = (state) => {
  if (state.consumed) throw new AppError({ code: 'INVALID_PARAMS' });
  if (Date.now() > new Date(state.expires_at).getTime()) throw new AppError({ code: 'RESET_TOKEN_EXPIRED' });
};

async function resolveResetState(token) {
  const tokenHash = hashToken(token);
  const current = await User.findOne({ 'password_reset.token_hash': tokenHash, delete_flg: false }).select('+password_reset');
  if (current) {
    if (current.password_reset.mail !== current.mail) throw new AppError({ code: 'INVALID_PERMISSION' });
    assertPending(current.password_reset);
    return { user: current, state: current.password_reset };
  }
  // 旧形式のリンクは未移行のユーザだけに許可し、再発行・消費済みの状態を旧形式の情報で戻さない。
  const legacy = await ResetPassword.findOne({ token });
  if (!legacy) throw new AppError({ code: 'INVALID_PARAMS' });
  const state = { mail: legacy.mail, token_hash: tokenHash, expires_at: expiresAt(legacy.created_at), consumed: false };
  assertPending(state);
  const user = await User.findOne({ mail: legacy.mail, delete_flg: false }).select('+password_reset');
  if (!user) throw new AppError({ code: 'INVALID_PERMISSION' });
  if (user.password_reset) throw new AppError({ code: 'INVALID_PARAMS' });
  return { user, state, legacy };
}

async function prepareResetState(token) {
  const result = await resolveResetState(token);
  if (result.legacy) {
    await User.updateOne({ _id: result.user._id, mail: result.user.mail, delete_flg: false, password_reset: { $exists: false } }, { $set: { password_reset: result.state } });
  }
  return result;
}

module.exports = { hashToken, expiresAt, resolveResetState, prepareResetState };
