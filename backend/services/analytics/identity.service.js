const crypto = require('crypto');

const ANALYTICS_IDENTITY_VERSION = 'v1';
const ANALYTICS_USER_ID_PREFIX = 'ga1_';
const USER_ID_PATTERN = /^[a-f\d]{24}$/i;
const MIN_USER_ID_SECRET_BYTES = 32;

const normalizeUserId = (value) => {
  const userId = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!USER_ID_PATTERN.test(userId)) {
    throw new TypeError('Analytics identity requires a registered user ID');
  }
  return userId;
};

const createAnalyticsIdentityService = ({ userIdSecret } = {}) => {
  if (
    typeof userIdSecret !== 'string' ||
    Buffer.byteLength(userIdSecret, 'utf8') < MIN_USER_ID_SECRET_BYTES
  ) {
    throw new Error('createAnalyticsIdentityService requires validated private config');
  }

  const buildUserIdentity = (value) => {
    const userId = normalizeUserId(value);
    const digest = crypto
      .createHmac('sha256', userIdSecret)
      .update(`iseeetl:ga4:${ANALYTICS_IDENTITY_VERSION}:user:${userId}`)
      .digest('hex');

    return Object.freeze({
      analytics_user_id: `${ANALYTICS_USER_ID_PREFIX}${digest}`,
      visitor_type: 'registered',
      identity_version: ANALYTICS_IDENTITY_VERSION,
    });
  };

  return Object.freeze({ buildUserIdentity });
};

module.exports = {
  ANALYTICS_IDENTITY_VERSION,
  ANALYTICS_USER_ID_PREFIX,
  USER_ID_PATTERN,
  MIN_USER_ID_SECRET_BYTES,
  normalizeUserId,
  createAnalyticsIdentityService,
};
