const crypto = require('crypto');
const lineClient = require('../../integrations/line/login.client');

const AppError = require('../../utils/appError');
const { provisionLineUser } = require('./lineProvisioning.service');
const AuthIdentity = require('../../models/AuthIdentity');
const { findActiveUser } = require('../_shared/activeResource');
const { buildOneSignalExternalId } = require('../../integrations/onesignal/identity');
const { isOneSignalEnabled } = require('../../config/featureFlags');
const { signUserToken } = require('../_shared/userSession');

const LINE_AUTH_ENDPOINT = 'https://access.line.me/oauth2/v2.1/authorize';

const randomHex = (length = 16) => crypto.randomBytes(length).toString('hex');

exports.buildLineAuthorize = async ({ lang, clientId, redirectUri }) => {
  if (!clientId || !redirectUri) throw new AppError({ code: 'LINE_LOGIN_NOT_CONFIGURED' });
  const state = randomHex(16);
  const nonce = randomHex(16);
  const scope = encodeURIComponent('openid profile email');
  const url =
    `${LINE_AUTH_ENDPOINT}?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${scope}` +
    `&state=${encodeURIComponent(state)}` +
    `&nonce=${encodeURIComponent(nonce)}`;
  return { state, nonce, url, lang: typeof lang === 'string' ? lang : null };
};
exports.exchangeLineToken = lineClient.exchangeLineToken;
exports.verifyLineIdToken = lineClient.verifyLineIdToken;
exports.fetchLineDisplayName = lineClient.fetchLineDisplayName;

exports.linkOrCreateUserFromLine = async ({ sub, email, displayName, lang }) => {
  if (!sub) throw new AppError({ code: 'INVALID_PERMISSION' });

  let identity = await AuthIdentity.findOne({ provider: 'line', provider_user_id: sub }).lean();
  let user;
  if (identity && !identity.provisioning) {
    user = await findActiveUser(identity.user_id, {
      error: { code: 'INVALID_PERMISSION' },
    });
  } else {
    user = await provisionLineUser({ sub, email, displayName, lang });
  }
  return { user };
};
exports.buildLoginPayload = async (user) => {
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

exports.getPushIdentity = (userId) => {
  if (!isOneSignalEnabled()) {
    throw new AppError({
      code: 'EXTERNAL_FEATURE_DISABLED',
      details: { feature: 'oneSignalPush' },
    });
  }
  return {
    onesignal_external_id: buildOneSignalExternalId(userId),
  };
};
