const {
  GA4_MEASUREMENT_ID_PATTERN,
} = require('../../config/featureFlags');

const createGetAnalyticsConfig = ({ measurementId } = {}) => {
  if (
    typeof measurementId !== 'string' ||
    !GA4_MEASUREMENT_ID_PATTERN.test(measurementId)
  ) {
    throw new Error('createGetAnalyticsConfig requires a valid measurementId');
  }

  const publicConfig = Object.freeze({ measurement_id: measurementId });

  return (_req, res) => {
    res.set('Cache-Control', 'no-store');
    return res.status(200).json(publicConfig);
  };
};

module.exports = { createGetAnalyticsConfig };
