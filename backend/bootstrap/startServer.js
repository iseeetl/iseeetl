const mongoose = require('mongoose');
const { validateStaticRoot } = require('./validateStaticRoot');
const bluebird = require('bluebird');

const defaultLogger = require('../utils/logger');
const { createDatabaseConnectionOptions } = require('../config/database');
const { CAPABILITY_KEYS } = require('../config/featureFlags');
const { loadRuntimeConfig } = require('./runtimeConfig');
const { createServer } = require('./createServer');
const { initializeIndexes: initializeModelIndexes } = require('./initializeIndexes');
const { registerShutdownHandlers } = require('./shutdown');

const logStartup = ({ capabilities, port, consoleRef }) => {
  const states = CAPABILITY_KEYS
    .map((name) => `${name}=${capabilities[name] ? 'enabled' : 'disabled'}`)
    .join(' ');
  consoleRef.log(`[EXTERNAL_CAPABILITIES] ${states}`);
  consoleRef.log(`[SERVER] listening port=${port}`);
};

const startServer = async ({
  config,
  env = process.env,
  database = mongoose,
  promiseImplementation = bluebird,
  createRuntimeServer = createServer,
  initializeIndexes = initializeModelIndexes,
  registerShutdown = registerShutdownHandlers,
  logger = defaultLogger,
  consoleRef = console,
  exit = process.exit,
  processRef = process,
} = {}) => {
  if (!config) throw new Error('startServer requires config');

  validateStaticRoot(config);

  database.Promise = promiseImplementation;
  const connectionPromise = database.connect(env.DB_CONNECT, createDatabaseConnectionOptions());
  const runtime = createRuntimeServer({ config, logger });

  if (config.nodeEnv === 'development') {
    consoleRef.log('[CORS] development configuration enabled');
  } else if (config.nodeEnv === 'production' && config.socketCors?.originLabel) {
    consoleRef.log(`[SOCKET_CORS] allowed origins=${config.socketCors.originLabel}`);
  }

  await connectionPromise;
  consoleRef.log('[DATABASE] connected');
  await initializeIndexes();
  consoleRef.log('[DATABASE] indexes ready');

  const port = env.PORT || 5000;
  await new Promise((resolve, reject) => {
    const server = runtime.server;
    const cleanup = () => {
      server.removeListener('error', onError);
      server.removeListener('listening', onListening);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onListening = () => {
      cleanup();
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    try {
      server.listen(port);
    } catch (error) {
      onError(error);
    }
  });
  logStartup({ capabilities: config.capabilities, port, consoleRef });
  registerShutdown({
    connection: database.connection,
    server: runtime.server,
    io: runtime.io,
    processRef,
    exit,
    logger: consoleRef,
  });

  return { ...runtime, port };
};

const runServer = async ({
  env = process.env,
  exit = process.exit,
  consoleRef = console,
  resolveConfig = loadRuntimeConfig,
  start = startServer,
  ...dependencies
} = {}) => {
  let config;
  try {
    config = resolveConfig({ env });
  } catch (error) {
    consoleRef.error(`[ENV] ${error.message}`);
    exit(1);
    return null;
  }

  try {
    return await start({ config, env, exit, consoleRef, ...dependencies });
  } catch (error) {
    consoleRef.error('[SERVER] startup failed:', error);
    exit(1);
    return null;
  }
};

module.exports = {
  logStartup,
  startServer,
  runServer,
};
