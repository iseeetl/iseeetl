const express = require('express');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const cors = require('cors');
const history = require('connect-history-api-fallback');

const AppError = require('./utils/appError');
const { createErrorHandler } = require('./middlewares/errorHandler');
const defaultLogger = require('./utils/logger');
const { shouldReturnNotFoundOnFallback } = require('./utils/routeFallback');
const { setStaticMediaHeaders } = require('./utils/staticMediaHeaders');
const { registerApiMounts } = require('./routes/apiMounts');
const createMediaRoute = require('./routes/media.route');

const configureApp = ({ app, io, config, logger = defaultLogger }) => {
  const {
    nodeEnv,
    capabilities,
    privateConfig,
    corsAllowedOrigins,
    mediaRoot,
    profileRoot,
    distRoot,
  } = config;

  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.disable('x-powered-by');
  app.use(cookieParser());
  app.use(mongoSanitize());

  if (nodeEnv === 'development') {
    app.use(
      cors({
        origin: corsAllowedOrigins,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        credentials: true,
      })
    );
  } else if (nodeEnv === 'production') {
    app.use(
      cors({
        origin: corsAllowedOrigins,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        credentials: true,
      })
    );
  }

  const staticMediaOptions = { setHeaders: setStaticMediaHeaders };
  app.use('/media', createMediaRoute({ mediaRoot }));
  app.use('/media', express.static(mediaRoot, staticMediaOptions));
  app.use('/profile', express.static(profileRoot, staticMediaOptions));

  app.use(
    history({
      rewrites: [
        {
          from: /^\/api\/.*$/,
          to: (context) => context.parsedUrl.path,
        },
        {
          from: /^\/media\/.*$/,
          to: (context) => context.parsedUrl.path,
        },
        {
          from: /^\/profile\/.*$/,
          to: (context) => context.parsedUrl.path,
        },
      ],
    })
  );
  app.use(express.static(distRoot));

  const requestLogEnabled = nodeEnv === 'development';
  const logRequest = (label) => (req, res, next) => {
    if (!requestLogEnabled) return next();
    const startTime = Date.now();
    res.on('finish', () => {
      logger.info(`[${label}]`, {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - startTime,
      });
    });
    next();
  };

  registerApiMounts({
    app,
    io,
    capabilities,
    analyticsConfig: privateConfig?.analytics,
    logRequest,
  });

  app.get('*', (req, res, next) => {
    const requestPath = typeof req.path === 'string' ? req.path : req.originalUrl;
    if (shouldReturnNotFoundOnFallback(requestPath)) {
      return next(new AppError({ code: 'NOT_FOUND' }));
    }
    return res.redirect('/');
  });

  app.use(createErrorHandler({ logger }));
  return app;
};

const createApp = ({ io, config, logger }) => {
  const app = express();
  return configureApp({ app, io, config, logger });
};

module.exports = {
  configureApp,
  createApp,
};
