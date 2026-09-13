const DATABASE_CONNECTION_TIMEOUT_MS = 120000;

const createDatabaseConnectionOptions = () => ({
  connectTimeoutMS: DATABASE_CONNECTION_TIMEOUT_MS,
  serverSelectionTimeoutMS: DATABASE_CONNECTION_TIMEOUT_MS,
});

module.exports = {
  DATABASE_CONNECTION_TIMEOUT_MS,
  createDatabaseConnectionOptions,
};
