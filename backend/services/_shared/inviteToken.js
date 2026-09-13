const crypto = require('crypto');
const AppError = require('../../utils/appError');

function createInviteToken() {
  return crypto.randomBytes(24).toString('hex');
}

function buildInviteTokenExpiry(period) {
  const now = new Date();
  switch (period) {
    case '8h':
      return new Date(now.getTime() + 8 * 60 * 60 * 1000);
    case '3d':
      return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    case '1m': {
      const nextMonth = new Date(now);
      nextMonth.setMonth(now.getMonth() + 1);
      return nextMonth;
    }
    default:
      throw new AppError({ code: 'INVALID_PARAMS' });
  }
}

module.exports = {
  buildInviteTokenExpiry,
  createInviteToken,
};
