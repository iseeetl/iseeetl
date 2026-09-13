const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const { EventEmitter } = require('events');
const { runServer } = require('../../../bootstrap/startServer');
const { initializeIndexes } = require('../../../bootstrap/initializeIndexes');

const cases = [
  { model: require('../../../models/User'), collection: 'users', name: 'uniq_users_mail_string',
    key: { mail: 1 }, data: () => ({ username: 'Test', mail: 'index-test@example.invalid' }) },
  { model: require('../../../models/FloorMember'), collection: 'floormembers', name: 'uniq_floormembers_floor_user',
    key: { floor: 1, user: 1 }, data: () => ({ floor: new mongoose.Types.ObjectId(), user: new mongoose.Types.ObjectId() }) },
  { model: require('../../../models/RoomMember'), collection: 'roommembers', name: 'uniq_roommembers_room_user',
    key: { room: 1, user: 1 }, data: () => ({ floor: new mongoose.Types.ObjectId(), room: new mongoose.Types.ObjectId(), user: new mongoose.Types.ObjectId() }) },
  { model: require('../../../models/KickedUser'), collection: 'kickedusers', name: 'uniq_kickedusers_floor_user',
    key: { floor: 1, user: 1 }, data: () => ({ floor: new mongoose.Types.ObjectId(), user: new mongoose.Types.ObjectId(),
      kicked_by: new mongoose.Types.ObjectId(), room: new mongoose.Types.ObjectId() }) },
];

let uri;
let client;
let db;
let runtimes;

beforeEach(async () => {
  uri = process.env.JEST_MONGODB_MEMORY_SERVER_URI;
  if (!uri) throw new Error('隔離MongoDBが初期化されていません');
  client = await MongoClient.connect(uri);
  db = client.db(`startup_indexes_${new mongoose.Types.ObjectId()}`);
  runtimes = [];
});

afterEach(async () => {
  for (const runtime of runtimes) {
    await runtime.indexesSettled;
    await runtime.database.disconnect();
  }
  await db.dropDatabase();
  await client.close();
});

const boot = async () => {
  // 新しいMongooseインスタンスで、再起動後のモデル初期化を再現する。
  const database = new mongoose.Mongoose();
  const models = cases.map(({ model, collection }) => database.model(model.modelName, model.schema.clone(), collection));
  const server = new EventEmitter();
  server.listen = jest.fn(() => server.emit('listening'));
  const consoleRef = { log: jest.fn(), error: jest.fn() };
  const exit = jest.fn();
  const indexesSettled = Promise.allSettled(models.map((model) => model.init()));
  const runtime = { database, models, indexesSettled, server, consoleRef, exit };
  runtimes.push(runtime);
  runtime.result = await runServer({
    env: { DB_CONNECT: uri, PORT: '5500' },
    resolveConfig: () => ({ nodeEnv: 'test', capabilities: {} }),
    database: {
      connection: database.connection,
      connect: (connectionUri, options) => database.connect(connectionUri, { ...options, dbName: db.databaseName }),
    },
    promiseImplementation: Promise,
    createRuntimeServer: () => ({ server, io: {} }),
    initializeIndexes: () => initializeIndexes(models),
    registerShutdown: jest.fn(),
    consoleRef, exit,
  });
  return runtime;
};

test.each([false, true])('索引のないDBで作成が完了してから受付を開始する（既存データ=%s）', async (hasData) => {
  if (hasData) {
    for (const item of cases) await db.collection(item.collection).insertOne(item.data());
    await db.collection('users').insertMany([{ mail: null }, { mail: null }, { username: 'No mail' }]);
  }
  const runtime = await boot();
  expect(runtime.result.server).toBe(runtime.server);
  expect(runtime.exit).not.toHaveBeenCalled();
  expect(runtime.server.listen).toHaveBeenCalledTimes(1);
  expect(runtime.consoleRef.log).toHaveBeenCalledWith('[DATABASE] indexes ready');
  for (const item of cases) {
    expect(await db.collection(item.collection).indexes()).toContainEqual(expect.objectContaining({
      name: item.name, key: item.key, unique: true,
    }));
    expect(await db.collection(item.collection).countDocuments()).toBe(hasData ? (item.collection === 'users' ? 4 : 1) : 0);
    const data = item.data();
    if (item.collection === 'users') data.mail = 'another@example.invalid';
    await db.collection(item.collection).insertOne({ ...data });
    await expect(db.collection(item.collection).insertOne({ ...data })).rejects.toMatchObject({ code: 11000 });
  }
  expect(await db.collection('users').indexes()).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'uniq_users_mail_string', partialFilterExpression: { mail: { $type: 'string' } } }),
    expect.objectContaining({ name: 'users_password_reset_token_hash', key: { 'password_reset.token_hash': 1 }, sparse: true }),
  ]));
});

test('再起動しても既存の索引とデータを維持する', async () => {
  await db.collection('users').insertOne(cases[0].data());
  await db.collection('users').createIndex({ username: 1 }, { name: 'extra_users_username' });
  const first = await boot();
  expect(first.exit).not.toHaveBeenCalled();
  const indexes = await Promise.all(cases.map((item) => db.collection(item.collection).indexes()));
  const documents = await db.collection('users').find({}).toArray();
  await first.database.disconnect();
  const second = await boot();
  expect(second.server.listen).toHaveBeenCalledTimes(1);
  expect(second.exit).not.toHaveBeenCalled();
  expect(await Promise.all(cases.map((item) => db.collection(item.collection).indexes()))).toEqual(indexes);
  expect(await db.collection('users').find({}).toArray()).toEqual(documents);
});

test.each(cases)('$collectionに重複がある場合はデータを変更せず起動に失敗する', async (item) => {
  const collection = db.collection(item.collection);
  const data = item.data();
  await collection.insertMany([{ ...data }, { ...data }]);
  const documents = await collection.find({}).toArray();
  const runtime = await boot();
  expect(runtime.result).toBeNull();
  expect(runtime.server.listen).not.toHaveBeenCalled();
  expect(runtime.exit).toHaveBeenCalledWith(1);
  expect(await collection.find({}).toArray()).toEqual(documents);
  expect(await collection.indexes()).not.toContainEqual(expect.objectContaining({ name: item.name }));
  const loggedError = runtime.consoleRef.error.mock.calls[0][1];
  expect(loggedError.message).toContain(`model=${item.model.modelName} databaseCode=11000`);
  expect(loggedError.stack).not.toContain('index-test@example.invalid');
  expect(loggedError).not.toHaveProperty('cause');
});

test('既存索引の定義が競合する場合は索引を削除せず起動に失敗する', async () => {
  const collection = db.collection('users');
  await collection.insertOne(cases[0].data());
  await collection.createIndex({ username: 1 }, { name: cases[0].name });
  const documents = await collection.find({}).toArray();
  const runtime = await boot();
  expect(runtime.result).toBeNull();
  expect(runtime.server.listen).not.toHaveBeenCalled();
  expect(runtime.exit).toHaveBeenCalledWith(1);
  expect(await collection.find({}).toArray()).toEqual(documents);
  expect(await collection.indexes()).toContainEqual(expect.objectContaining({ name: cases[0].name, key: { username: 1 } }));
});
