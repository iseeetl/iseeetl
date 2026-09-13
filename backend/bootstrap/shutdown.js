const { createGracefulExit } = require('./gracefulExit');
const {
  abortBackgroundTasks,
  drainBackgroundTasks,
} = require('../services/backgroundTaskRunner');
const { abortAndCleanupAnalysisMedia } = require('../services/analysis/media.service');

const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGUSR2', 'SIGTERM'];

const registerShutdownHandlers = ({
  connection,
  server,
  io,
  abortTasks = abortBackgroundTasks,
  drainTasks = drainBackgroundTasks,
  cleanupMedia = abortAndCleanupAnalysisMedia,
  processRef = process,
  exit = process.exit,
  logger = console,
} = {}) => {
  if (!connection) throw new Error('registerShutdownHandlers requires connection');

  const gracefulExit = createGracefulExit({
    connection,
    server,
    io,
    abortBackgroundTasks: abortTasks,
    drainBackgroundTasks: drainTasks,
    cleanupBackgroundMedia: cleanupMedia,
    exit,
    logger,
  });
  SHUTDOWN_SIGNALS.forEach((signal) => processRef.once(signal, gracefulExit));
  return gracefulExit;
};

module.exports = {
  SHUTDOWN_SIGNALS,
  registerShutdownHandlers,
};
