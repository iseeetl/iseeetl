const fs = require('fs');
const path = require('path');
const { testRuntimePath, ensureDir, removeDirSafe } = require('./_helpers/testRuntime');

const MONGO_URI_ENV_KEY = 'JEST_MONGODB_MEMORY_SERVER_URI';

function restoreEnvironmentVariable(key, originalValue) {
  if (originalValue === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = originalValue;
  }
}

module.exports = async () => {
  const mongoRoot = await ensureDir(testRuntimePath('mongo-memory'));
  const binaryDownloadDir = await ensureDir(testRuntimePath('mongo-memory', 'binary-cache'));

  const mongoDbPath = await fs.promises.mkdtemp(path.join(mongoRoot, 'db-'));
  const originalDownloadDir = process.env.MONGOMS_DOWNLOAD_DIR;
  const originalPreferGlobalPath = process.env.MONGOMS_PREFER_GLOBAL_PATH;
  let mongo;

  try {
    process.env.MONGOMS_DOWNLOAD_DIR = binaryDownloadDir;
    process.env.MONGOMS_PREFER_GLOBAL_PATH = 'false';
    const { MongoMemoryServer } = require('mongodb-memory-server');

    mongo = await MongoMemoryServer.create({
      binary: {
        downloadDir: binaryDownloadDir,
      },
      instance: {
        ip: '127.0.0.1',
        dbPath: mongoDbPath,
        args: ['--nounixsocket'],
        launchTimeout: 60000,
      },
    });

    globalThis.__JEST_MONGO_MEMORY_SERVER__ = mongo;
    globalThis.__JEST_MONGO_DB_PATH__ = mongoDbPath;
    globalThis.__JEST_MONGO_ORIGINAL_URI__ = process.env[MONGO_URI_ENV_KEY];
    process.env[MONGO_URI_ENV_KEY] = await mongo.getUri();
  } catch (error) {
    await mongo?.stop({ doCleanup: false }).catch(() => undefined);
    await removeDirSafe(mongoDbPath);
    throw error;
  } finally {
    restoreEnvironmentVariable('MONGOMS_DOWNLOAD_DIR', originalDownloadDir);
    restoreEnvironmentVariable('MONGOMS_PREFER_GLOBAL_PATH', originalPreferGlobalPath);
  }
};
