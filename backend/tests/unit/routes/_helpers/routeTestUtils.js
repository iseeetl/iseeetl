const express = require('express');

const passMiddleware = () => (req, _res, next) => next();

const buildRouteApp = (mountPath, router) => {
  const app = express();
  app.use(express.json());
  app.use(mountPath, router);
  return app;
};

const clearMockObject = (obj) => {
  if (!obj) return;
  Object.values(obj).forEach((fn) => {
    if (fn && typeof fn.mockClear === 'function') fn.mockClear();
  });
};

module.exports = {
  passMiddleware,
  buildRouteApp,
  clearMockObject,
};
