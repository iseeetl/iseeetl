const express = require('express');

const { createGetCapabilities } = require('../controllers/capabilities.controller');

const createCapabilitiesRoute = ({ capabilities } = {}) => {
  const router = express.Router();
  router.get('/', createGetCapabilities({ capabilities }));
  return router;
};

module.exports = createCapabilitiesRoute;
