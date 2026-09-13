const mongoose = require('mongoose');
const { createTestIndexes } = require('../../_helpers/createTestIndexes');
const User = require('../../../models/User');
const FloorMember = require('../../../models/FloorMember');
const RoomMember = require('../../../models/RoomMember');
const KickedUser = require('../../../models/KickedUser');

test('繰り返し初期化しても製品モデルの索引と保存済みデータを維持する', async () => {
  const users = User.collection;
  await users.insertMany([{ mail: null }, { mail: null }, { mail: 'index-test@example.invalid' }]);
  await createTestIndexes();
  await createTestIndexes();
  expect(await users.countDocuments()).toBe(3);
  await expect(users.insertOne({ mail: 'index-test@example.invalid' })).rejects.toMatchObject({ code: 11000 });
  expect(await users.indexes()).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'uniq_users_mail_string', key: { mail: 1 }, unique: true,
      partialFilterExpression: { mail: { $type: 'string' } } }),
    expect.objectContaining({ name: 'users_password_reset_token_hash', key: { 'password_reset.token_hash': 1 }, sparse: true }),
  ]));
});

test.each([
  [FloorMember, { floor: 1, user: 1 }],
  [RoomMember, { room: 1, user: 1 }],
  [KickedUser, { floor: 1, user: 1 }],
])('%sの関係の重複を索引で拒否する', async (Model, key) => {
  const document = Object.fromEntries(Object.keys(key).map((field) => [field, new mongoose.Types.ObjectId()]));
  await Model.collection.insertOne({ ...document });
  await expect(Model.collection.insertOne({ ...document })).rejects.toMatchObject({ code: 11000 });
});

test('同名の異なる索引を自動削除せず、初期化を失敗させる', async () => {
  const collection = User.collection;
  const name = 'uniq_users_mail_string';
  await collection.dropIndex(name);
  try {
    await collection.createIndex({ username: 1 }, { name });
    await expect(createTestIndexes()).rejects.toThrow();
    expect(await collection.indexes()).toContainEqual(expect.objectContaining({ name, key: { username: 1 } }));
  } finally {
    await collection.dropIndex(name);
    await createTestIndexes();
  }
});
