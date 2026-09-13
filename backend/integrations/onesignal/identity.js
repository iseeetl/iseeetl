const crypto = require('crypto');
const { getOneSignalConfig } = require('../../config/featureFlags');

const EXTERNAL_ID_PREFIX = 'osv1_';
const MIN_SECRET_BYTES = 32;

const resolveSecret = () => {
  const secret = getOneSignalConfig()?.externalIdSecret || '';
  if (Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) return null;
  return secret;
};

const buildOneSignalExternalId = (userId) => {
  const normalizedUserId = userId == null ? '' : String(userId).trim();
  const secret = resolveSecret();
  if (!normalizedUserId || !secret) return null;

  const digest = crypto
    .createHmac('sha256', secret)
    .update(`iseeetl:onesignal:user:${normalizedUserId}`)
    .digest('hex');
  return `${EXTERNAL_ID_PREFIX}${digest}`;
};

module.exports = {
  buildOneSignalExternalId,
  EXTERNAL_ID_PREFIX,
  MIN_SECRET_BYTES,
};
