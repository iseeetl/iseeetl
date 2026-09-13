const mongoose = require('mongoose');
const User = require('../../models/User');
const AuthIdentity = require('../../models/AuthIdentity');
const { findActiveUser } = require('../_shared/activeResource');

// LINEのユーザIDを一意キーとしてアプリのユーザIDを先に確保し、途中停止後も同じIDで作成を再開する。
async function provisionLineUser({ sub, email, displayName, lang }) {
  const key = { provider: 'line', provider_user_id: sub };
  const normalizedMail = email ? email.trim().toLowerCase() : null;
  const existingUser = normalizedMail ? await User.findOne({ mail: normalizedMail, delete_flg: false }) : null;
  let identity;
  try {
    identity = await AuthIdentity.findOneAndUpdate(key, { $setOnInsert: {
      ...key, user_id: existingUser?._id || new mongoose.Types.ObjectId(),
      email: normalizedMail, email_verified: Boolean(normalizedMail), provisioning: true,
    } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    identity = await AuthIdentity.findOne(key);
    if (!identity) throw error;
  }
  if (identity.provisioning) {
    let user = await User.findOne({ _id: identity.user_id });
    if (!user) {
      try {
        user = await User.create({
          _id: identity.user_id,
          username: (displayName || `line_${sub.slice(0, 8)}`).slice(0, 20),
          mail: identity.email || null, password: null,
          lang: typeof lang === 'string' ? lang : null,
        });
      } catch (error) {
        if (error.code !== 11000) throw error;
        user = await User.findOne({ _id: identity.user_id });
        if (!user && identity.email) user = await User.findOne({ mail: identity.email, delete_flg: false });
        if (!user) throw error;
      }
    }
    await AuthIdentity.updateOne(
      { _id: identity._id, user_id: identity.user_id, provisioning: true },
      { $set: { user_id: user._id, provisioning: false } }
    );
  }
  // 同時実行の結果を再取得し、登録が完了した認証情報からだけログイン先のユーザを返す。
  const resolved = await AuthIdentity.findOne(key);
  if (!resolved || resolved.provisioning) throw new Error('LINE_IDENTITY_NOT_READY');
  return findActiveUser(resolved.user_id, { error: { code: 'INVALID_PERMISSION' } });
}

module.exports = { provisionLineUser };
