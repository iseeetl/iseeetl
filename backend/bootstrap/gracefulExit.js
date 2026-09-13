const createGracefulExit = ({
  connection,
  server,
  io,
  abortBackgroundTasks = async () => {},
  drainBackgroundTasks = async () => {},
  cleanupBackgroundMedia = async () => {},
  timeoutMs = 10000,
  exit = process.exit,
  logger = console,
}) => {
  let shutdownPromise = null;

  const closeCallbackTarget = (target) => {
    if (!target || typeof target.close !== 'function') return Promise.resolve();
    return new Promise((resolve, reject) => {
      try {
        target.close((error) => {
          if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') return reject(error);
          return resolve();
        });
      } catch (error) {
        if (error?.code === 'ERR_SERVER_NOT_RUNNING') return resolve();
        return reject(error);
      }
    });
  };

  const withTimeout = (promise) => {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
    let timeout;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('graceful shutdown timed out')), timeoutMs);
      }),
    ]).finally(() => clearTimeout(timeout));
  };

  return () => {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
      let shutdownError = null;
      let backgroundTasksDrained = false;
      const serverClose = closeCallbackTarget(server);

      try {
        await withTimeout((async () => {
          await abortBackgroundTasks();
          await drainBackgroundTasks({ timeoutMs });
          backgroundTasksDrained = true;
          await closeCallbackTarget(io);
          await serverClose;
        })());
      } catch (error) {
        shutdownError = error;
        logger.error('Application shutdown failed:', error);
      }

      if (!backgroundTasksDrained) {
        try {
          await cleanupBackgroundMedia();
        } catch (error) {
          shutdownError = shutdownError || error;
          logger.error('Analysis media cleanup failed:', error);
        }
      }

      try {
        await connection.close();
        logger.log('MongoDB connection closed');
      } catch (error) {
        shutdownError = shutdownError || error;
        logger.error('MongoDB connection close failed:', error);
      }

      exit(shutdownError ? 1 : 0);
    })();

    return shutdownPromise;
  };
};

module.exports = { createGracefulExit };
