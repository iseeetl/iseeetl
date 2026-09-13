const express = require('express');

const {
  createEnsureJsonWebToken,
} = require('../middlewares/ensureJsonWebToken');
const {
  createEnsureGoogleAnalyticsEnabled,
  createGetAnalyticsIdentity,
} = require('../controllers/analytics/identity.controller');
const {
  createGetAnalyticsConfig,
} = require('../controllers/analytics/config.controller');
const {
  createAnalyticsIdentityService,
} = require('../services/analytics/identity.service');

const createAnalyticsRoute = ({ capabilities, analyticsConfig } = {}) => {
  const router = express.Router();
  const enabled = capabilities?.googleAnalytics === true;
  const ensureEnabled = createEnsureGoogleAnalyticsEnabled({ enabled });

  if (!enabled) {
    router.get('/config', ensureEnabled);
    router.get('/identity', ensureEnabled);
    return router;
  }

  const getConfig = createGetAnalyticsConfig({
    measurementId: analyticsConfig?.measurementId,
  });
  const identityService = createAnalyticsIdentityService({
    userIdSecret: analyticsConfig?.userIdSecret,
  });
  const getIdentity = createGetAnalyticsIdentity({ identityService });
  const ensureAnalyticsUser = createEnsureJsonWebToken({ setMediaAccessCookie: false });

  router.get('/config', ensureEnabled, getConfig);
  router.get('/identity', ensureEnabled, ensureAnalyticsUser, getIdentity);
  return router;
};

module.exports = createAnalyticsRoute;
