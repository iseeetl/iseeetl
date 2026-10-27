const express = require('express');

const { createGetCapabilities, createGetGoogleLoginConfig, createGetOneSignalPublicConfig } = require('../controllers/capabilities.controller');

const createCapabilitiesRoute = ({ capabilities } = {}) => {
  const router = express.Router();
  router.get('/activity', (_req, res) => res.set('Cache-Control', 'no-store').json({ enabled: process.env.ACTIVITY_NOTIFICATIONS_ENABLED === 'true' }));
  router.get('/onesignal', createGetOneSignalPublicConfig({ capabilities }));
  router.get('/', createGetCapabilities({ capabilities }));
  router.get('/google-login', createGetGoogleLoginConfig({ capabilities }));
  return router;
};

module.exports = createCapabilitiesRoute;
