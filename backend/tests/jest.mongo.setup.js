const mongoose = require('mongoose');
const { createTestIndexes } = require('./_helpers/createTestIndexes');

const MONGO_URI_ENV_KEY = 'JEST_MONGODB_MEMORY_SERVER_URI';

async function clearCollections() {
  if (mongoose.connection.readyState !== 1) return;

  const collections = await mongoose.connection.db.collections();
  await Promise.all(
    collections
      .filter((collection) => !collection.collectionName.startsWith('system.'))
      .map((collection) => collection.deleteMany({}))
  );
}

beforeAll(async () => {
  const uri = process.env[MONGO_URI_ENV_KEY];
  if (!uri) {
    throw new Error('JestのglobalSetupで共有MongoDBのURIが設定されていません');
  }

  await mongoose.connect(uri, { dbName: 'test' });
  await clearCollections();
  await createTestIndexes();
}, 90000);

afterEach(clearCollections);

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});
