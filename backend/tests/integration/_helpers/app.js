const express = require('express');
const { createErrorHandler } = require('../../../middlewares/errorHandler');

const noopLogger = {
  warn: () => {},
  error: () => {},
};

const attachErrorHandler = (app, { logger = noopLogger } = {}) => {
  app.use(createErrorHandler({ logger }));
  return app;
};

const buildErrorHandledApp = ({ mounts = [], useJson = true, logger = noopLogger } = {}) => {
  const app = express();
  if (useJson) app.use(express.json());
  mounts.forEach(({ path, handler }) => {
    app.use(path, handler);
  });
  return attachErrorHandler(app, { logger });
};

module.exports = {
  attachErrorHandler,
  buildErrorHandledApp,
};
