const AppError = require('../../utils/appError');

const createEnsureGoogleAnalyticsEnabled = ({ enabled } = {}) =>
  (_req, _res, next) => {
    if (enabled === true) return next();
    return next(
      new AppError({
        code: 'EXTERNAL_FEATURE_DISABLED',
        details: { feature: 'googleAnalytics' },
      })
    );
  };

const createGetAnalyticsIdentity = ({ identityService } = {}) => {
  if (!identityService || typeof identityService.buildUserIdentity !== 'function') {
    throw new Error('createGetAnalyticsIdentity requires identityService');
  }

  return (req, res, next) => {
    try {
      const identity = identityService.buildUserIdentity(req.jwtPayload?.user_id);
      res.set('Cache-Control', 'no-store');
      return res.status(200).json(identity);
    } catch (error) {
      return next(error);
    }
  };
};

module.exports = {
  createEnsureGoogleAnalyticsEnabled,
  createGetAnalyticsIdentity,
};
