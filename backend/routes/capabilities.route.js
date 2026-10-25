const express = require('express');

const { createGetCapabilities, createGetGoogleLoginConfig } = require('../controllers/capabilities.controller');

const createCapabilitiesRoute = ({ capabilities } = {}) => {
  const router = express.Router();
  router.get('/', createGetCapabilities({ capabilities }));
  router.get('/google-login', createGetGoogleLoginConfig({ capabilities }));
  return router;
};

module.exports = createCapabilitiesRoute;
