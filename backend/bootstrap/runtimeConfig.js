const path = require('path');

const { assertRequiredEnv, readCsvEnv } = require('../config/env');
const { initializeApplicationConfig } = require('../config/application');
const { initializeFeatureConfiguration } = require('../config/featureFlags');

const REQUIRED_ENV_AT_STARTUP = [
  'DB_CONNECT',
  'JWT_SECRET',
  'MEDIA_PATH',
  'PROFILE_PATH',
  'VUE_APP_APPURL',
  'GUEST_JWT_SECRET',
  'GUEST_REFRESH_SECRET',
];

const DEFAULT_DEV_ORIGINS = ['http://localhost:3000'];

const normalizeDirectoryEnv = (name, env = process.env) => {
  const raw = env[name];
  if (typeof raw !== 'string') return;
  const value = raw.trim();
  if (!value) return;
  env[name] = /[\\/]$/.test(value) ? value : `${value}${path.sep}`;
};

const applyDefaultEnvValues = (defaults, env = process.env) => {
  Object.entries(defaults).forEach(([name, defaultValue]) => {
    const value = typeof env[name] === 'string' ? env[name].trim() : '';
    if (!value) env[name] = defaultValue;
  });
};

const resolveStaticRoot = (name, { fallback, env = process.env, rootDir = path.resolve(__dirname, '..') } = {}) => {
  const raw = typeof env[name] === 'string' ? env[name].trim() : '';
  const value = raw || fallback;
  if (!value) throw new Error(`${name} is required`);
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(rootDir, value);
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const resolveSocketCors = ({ nodeEnv, allowedOrigins, appUrl } = {}) => {
  if (nodeEnv === 'development') {
    return {
      cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        credentials: true,
      },
      originLabel: 'development',
    };
  }

  if (nodeEnv !== 'production') return { cors: null, originLabel: null };

  if (allowedOrigins.length > 0) {
    return {
      cors: {
        origin: (origin, callback) => {
          if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
          return callback(new Error('Not allowed by socket CORS'));
        },
        methods: ['GET', 'POST', 'OPTIONS'],
        credentials: true,
      },
      originLabel: allowedOrigins.join(','),
    };
  }

  if (!appUrl) return { cors: null, originLabel: null };

  let baseOrigin = null;
  try {
    baseOrigin = new URL(appUrl).origin;
  } catch (_) {
    const host = String(appUrl).split(':');
    if (host.length >= 2) baseOrigin = `${host[0]}:${host[1]}`;
  }
  if (!baseOrigin) return { cors: null, originLabel: null };

  const matcher = new RegExp(`^${escapeRegExp(baseOrigin)}(:\\d+)?$`);
  return {
    cors: {
      origin: (origin, callback) => {
        if (!origin || matcher.test(origin)) return callback(null, true);
        return callback(new Error('Not allowed by socket CORS'));
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      credentials: true,
    },
    originLabel: `${baseOrigin}:*`,
  };
};

const loadRuntimeConfig = ({ env = process.env, rootDir = path.resolve(__dirname, '..') } = {}) => {
  if (env === process.env) {
    assertRequiredEnv(REQUIRED_ENV_AT_STARTUP);
  } else {
    const missing = REQUIRED_ENV_AT_STARTUP.filter(
      (name) => typeof env[name] !== 'string' || env[name].trim().length === 0
    );
    if (missing.length) throw new Error(`Missing required env: ${missing.join(', ')}`);
  }

  normalizeDirectoryEnv('MEDIA_PATH', env);
  normalizeDirectoryEnv('PROFILE_PATH', env);
  const applicationConfig = initializeApplicationConfig(env);
  const featureConfiguration = initializeFeatureConfiguration(env);

  const nodeEnv = env.NODE_ENV;
  const defaultOrigins = nodeEnv === 'production' ? [] : DEFAULT_DEV_ORIGINS;
  const readCsv = (name, defaultValue) => {
    if (env === process.env) return readCsvEnv(name, { defaultValue });
    const raw = typeof env[name] === 'string' ? env[name].trim() : '';
    return raw
      ? raw.split(',').map((entry) => entry.trim()).filter(Boolean)
      : [...defaultValue];
  };
  const corsAllowedOrigins = readCsv('CORS_ALLOWED_ORIGINS', defaultOrigins);
  const socketCorsAllowedOrigins = readCsv('SOCKET_CORS_ALLOWED_ORIGINS', corsAllowedOrigins);

  return {
    nodeEnv,
    applicationConfig,
    capabilities: featureConfiguration.capabilities,
    privateConfig: featureConfiguration.privateConfig,
    corsAllowedOrigins,
    mediaRoot: resolveStaticRoot('MEDIA_PATH', { env, rootDir }),
    profileRoot: resolveStaticRoot('PROFILE_PATH', { env, rootDir }),
    distRoot: resolveStaticRoot('DIST_PATH', { fallback: nodeEnv === 'production' ? null : '../frontend/dist/', env, rootDir }),
    socketCors: resolveSocketCors({
      nodeEnv,
      allowedOrigins: socketCorsAllowedOrigins,
      appUrl: applicationConfig.appUrl,
    }),
  };
};

module.exports = {
  REQUIRED_ENV_AT_STARTUP,
  DEFAULT_DEV_ORIGINS,
  normalizeDirectoryEnv,
  applyDefaultEnvValues,
  resolveStaticRoot,
  resolveSocketCors,
  loadRuntimeConfig,
};
