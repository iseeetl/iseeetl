const { verifyGoogleIdToken } = require('../../integrations/google/login.client');

const AppError = require('../../utils/appError');
const {
  getGoogleLoginConfig,
  isGoogleLoginEnabled,
  isOneSignalEnabled,
} = require('../../config/featureFlags');
const User = require('../../models/User');
const AuthIdentity = require('../../models/AuthIdentity');
const { findActiveUser } = require('../_shared/activeResource');
const { buildOneSignalExternalId } = require('../../integrations/onesignal/identity');
const { signUserToken } = require('../_shared/userSession');

exports.login = async (body) => {
  const mail = body.mail;
  const password = body.password;

  const user = await User.findOne({ mail, delete_flg: false }).select('+password');
  if (!user) throw new AppError({ code: 'INVALID_PARAMS' });

  if (!user.password) throw new AppError({ code: 'INVALID_PARAMS' });

  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw new AppError({ code: 'INVALID_PARAMS' });

  const token = signUserToken(user);

  return {
    user_id: user._id,
    user_role: user.role,
    user_name: user.username,
    image_name: user.image_name,
    lang: user.lang,
    token,
    eye_friendly_mode: user.eye_friendly_mode,
    push_enabled: user.push_enabled,
    reply_push_enabled: user.reply_push_enabled,
    replied_post_push_enabled: user.replied_post_push_enabled,
    onesignal_external_id: isOneSignalEnabled() ? buildOneSignalExternalId(user._id) : null,
  };
};

// GoogleのIDトークンを検証し、認証情報が未登録なら確認済みメールアドレスで既存ユーザと関連付ける。
// 該当ユーザもいない場合は、パスワードを持たないユーザとGoogleの認証情報を作成する。
exports.googleLogin = async ({ id_token, lang }) => {
  if (!isGoogleLoginEnabled()) {
    throw new AppError({
      code: 'EXTERNAL_FEATURE_DISABLED',
      details: { feature: 'googleLogin' },
    });
  }
  if (!id_token) throw new AppError({ code: 'INVALID_PARAMS' });
  const googleClientId = getGoogleLoginConfig().clientId;

  let payload;
  try {
    payload = await verifyGoogleIdToken({
      idToken: id_token,
      audience: googleClientId,
    });
  } catch (_error) {
    throw new AppError({ code: 'INVALID_PERMISSION' });
  }

  const sub = String(payload.sub || '');
  const email = String(payload.email || '')
    .trim()
    .toLowerCase();
  const emailVerified = !!payload.email_verified;
  const profileName = (payload.name || '').trim();
  if (!sub || !email || !emailVerified) {
    throw new AppError({ code: 'INVALID_PERMISSION' });
  }

  let identity = await AuthIdentity.findOne({ provider: 'google', provider_user_id: sub }).lean();
  let user;
  if (identity) {
    user = await findActiveUser(identity.user_id, {
      error: { code: 'INVALID_PERMISSION' },
    });
  } else {
    user = await User.findOne({ mail: email, delete_flg: false });
    if (user) {
      try {
        await AuthIdentity.create({
          user_id: user._id,
          provider: 'google',
          provider_user_id: sub,
          email,
          email_verified: emailVerified,
        });
      } catch (e) {
        if (e && e.code === 11000) {
          identity = await AuthIdentity.findOne({ provider: 'google', provider_user_id: sub }).lean();
          if (!identity) throw new AppError({ code: 'USER_ALREADY_EXISTS' });
        } else {
          throw e;
        }
      }
    } else {
      const maxLen = 20;
      const baseName = profileName || email.split('@')[0];
      const username = baseName.slice(0, maxLen);

      try {
        user = await User.create({
          username,
          mail: email,
          password: null,
          lang,
        });
      } catch (e) {
        if (e && e.code === 11000) {
          user = await User.findOne({ mail: email, delete_flg: false });
          if (!user) throw new AppError({ code: 'USER_ALREADY_EXISTS' });
        } else {
          throw e;
        }
      }

      try {
        await AuthIdentity.create({
          user_id: user._id,
          provider: 'google',
          provider_user_id: sub,
          email,
          email_verified: emailVerified,
        });
      } catch (e) {
        if (!(e && e.code === 11000)) throw e;
        // 認証情報の重複作成エラーだけを無視して続行する。
      }
    }
  }

  const token = signUserToken(user);
  return {
    user_id: user._id,
    user_role: user.role,
    user_name: user.username,
    image_name: user.image_name,
    lang: user.lang,
    token,
    eye_friendly_mode: user.eye_friendly_mode,
    push_enabled: user.push_enabled,
    reply_push_enabled: user.reply_push_enabled,
    replied_post_push_enabled: user.replied_post_push_enabled,
    onesignal_external_id: isOneSignalEnabled() ? buildOneSignalExternalId(user._id) : null,
  };
};
