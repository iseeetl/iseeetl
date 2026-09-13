const noopMiddleware = (_req, _res, next) => next();
const attachIoToRequest = (io) => (req, _res, next) => {
  req.io = io;
  next();
};

const resolveAuthLogMiddleware = (logRequest) => {
  if (typeof logRequest !== 'function') return noopMiddleware;
  const middleware = logRequest('AuthRequest');
  return typeof middleware === 'function' ? middleware : noopMiddleware;
};

const buildApiMounts = ({ io, capabilities, analyticsConfig, logRequest } = {}) => {
  const capabilitiesRouteFactory = require('./capabilities.route');
  const analyticsRouteFactory = require('./analytics.route');
  const authRoute = require('./auth.route');
  const guestTokenRoute = require('./guest.route');
  const userRoute = require('./user.route');
  const floorRouteFactory = require('./floor');
  const roomRouteFactory = require('./room');
  const uploadRoute = require('./upload.route');
  const timelineRouteFactory = require('./timeline');
  const postResourceRouteFactory = require('./timeline/postResource.route');
  const uploadResourceRouteFactory = require('./timeline/uploadResource.route');
  const guestTimelineRouteFactory = require('./timeline/guest');
  const categoryTagRoute = require('./categoryTag.route');
  const soundTagRoute = require('./soundTag.route');
  const spamRoute = require('./spam.route');
  const kickedUserRouteFactory = require('./kickedUser.route');
  const quickTextRoute = require('./quickText.route');
  const v1RouteFactory = require('./v1');
  const aiAnalysisSettingRoute = require('./aiAnalysisSetting.route');
  const floorAIAnalysisSettingRoute = require('./floor/floorAIAnalysisSetting.route');
  const roomAIAnalysisSettingRoute = require('./room/roomAIAnalysisSetting.route');

  return [
    { path: '/api/capabilities', middlewares: [capabilitiesRouteFactory({ capabilities })] },
    {
      path: '/api/analytics',
      middlewares: [analyticsRouteFactory({ capabilities, analyticsConfig })],
    },
    { path: '/api/auth', middlewares: [attachIoToRequest(io), resolveAuthLogMiddleware(logRequest), authRoute] },
    { path: '/api/guest', middlewares: [guestTokenRoute] },
    { path: '/api/user', middlewares: [attachIoToRequest(io), userRoute] },
    { path: '/api', middlewares: [attachIoToRequest(io), floorRouteFactory(io), roomRouteFactory(io), quickTextRoute] },
    { path: '/api/fileupload', middlewares: [uploadRoute] },
    { path: '/api/chat', middlewares: [attachIoToRequest(io), timelineRouteFactory()] },
    { path: '/api', middlewares: [attachIoToRequest(io), postResourceRouteFactory(), uploadResourceRouteFactory()] },
    { path: '/api/chat/guest', middlewares: [attachIoToRequest(io), guestTimelineRouteFactory()] },
    { path: '/api/categorytag', middlewares: [categoryTagRoute] },
    { path: '/api/soundtag', middlewares: [soundTagRoute] },
    { path: '/api/spam', middlewares: [spamRoute] },
    { path: '/api/kickeduser', middlewares: [kickedUserRouteFactory(io)] },
    { path: '/api/v1', middlewares: [v1RouteFactory(io)] },
    { path: '/api/aianalysissetting', middlewares: [aiAnalysisSettingRoute] },
    { path: '/api/flooraianalysissetting', middlewares: [floorAIAnalysisSettingRoute] },
    { path: '/api/roomaianalysissetting', middlewares: [roomAIAnalysisSettingRoute] },
  ];
};

const registerApiMounts = ({
  app,
  io,
  capabilities,
  analyticsConfig,
  logRequest,
} = {}) => {
  if (!app || typeof app.use !== 'function') {
    throw new Error('registerApiMounts requires express app');
  }

  const mounts = buildApiMounts({
    io,
    capabilities,
    analyticsConfig,
    logRequest,
  });
  mounts.forEach(({ path, middlewares }) => {
    middlewares.forEach((middleware) => {
      app.use(path, middleware);
    });
  });
  return mounts;
};

module.exports = {
  buildApiMounts,
  registerApiMounts,
};
