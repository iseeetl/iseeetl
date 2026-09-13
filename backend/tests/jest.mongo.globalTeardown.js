const fs = require('fs');
const { MongoClient } = require('mongodb');

const MONGO_URI_ENV_KEY = 'JEST_MONGODB_MEMORY_SERVER_URI';
const MONGOD_EXIT_TIMEOUT_MS = 60000;

function waitForExit(childProcess, timeoutMs) {
  if (
    !childProcess ||
    childProcess.exitCode !== null ||
    childProcess.signalCode !== null
  ) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let timeout;
    const onExit = () => {
      clearTimeout(timeout);
      resolve(true);
    };

    childProcess.once('exit', onExit);
    timeout = setTimeout(() => {
      childProcess.off('exit', onExit);
      resolve(false);
    }, timeoutMs);
  });
}

async function shutdownMongod(mongo, uri) {
  const mongodProcess = mongo.instanceInfo?.instance?.mongodProcess;
  if (!mongodProcess) return;

  let client;
  let shutdownError;

  try {
    client = await MongoClient.connect(uri, {
      directConnection: true,
      serverSelectionTimeoutMS: 5000,
    });
    await client.db('admin').command({
      shutdown: 1,
      force: true,
      timeoutSecs: 1,
    });
  } catch (error) {
    // 正常終了でも接続切断エラーが出るため、MongoDBプロセスの終了結果で判定する。
    shutdownError = error;
  } finally {
    await client?.close().catch(() => undefined);
  }

  const exited = await waitForExit(mongodProcess, MONGOD_EXIT_TIMEOUT_MS);
  if (!exited) {
    const error = new Error(
      `停止コマンドの実行後、${MONGOD_EXIT_TIMEOUT_MS}ミリ秒以内にMongoDBが終了しませんでした`
    );
    error.cause = shutdownError;
    throw error;
  }
}

module.exports = async () => {
  const mongo = globalThis.__JEST_MONGO_MEMORY_SERVER__;
  const mongoDbPath = globalThis.__JEST_MONGO_DB_PATH__;
  const uri = process.env[MONGO_URI_ENV_KEY];
  let teardownError;

  try {
    if (mongo && uri) {
      await shutdownMongod(mongo, uri);
    }
  } catch (error) {
    teardownError = error;
  } finally {
    await mongo?.stop({ doCleanup: false }).catch((error) => {
      teardownError ??= error;
    });

    if (mongoDbPath) {
      await fs.promises
        .rm(mongoDbPath, { recursive: true, force: true })
        .catch((error) => {
          teardownError ??= error;
        });
    }

    const originalUri = globalThis.__JEST_MONGO_ORIGINAL_URI__;
    if (originalUri === undefined) {
      delete process.env[MONGO_URI_ENV_KEY];
    } else {
      process.env[MONGO_URI_ENV_KEY] = originalUri;
    }

    delete globalThis.__JEST_MONGO_MEMORY_SERVER__;
    delete globalThis.__JEST_MONGO_DB_PATH__;
    delete globalThis.__JEST_MONGO_ORIGINAL_URI__;
  }

  if (teardownError) throw teardownError;
};
