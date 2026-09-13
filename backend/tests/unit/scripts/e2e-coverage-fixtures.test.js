const mongoose = require('mongoose');
jest.mock('../../../scripts/e2e/environment', () => ({
  ...jest.requireActual('../../../scripts/e2e/environment'),
  loadE2EEnvironment: jest.fn(() => ({})),
  resolveE2EResetEnvironment: jest.fn(() => ({ databaseUri: 'mongodb://db:27017/iseeetl_e2e' })),
}));
const environment = require('../../../scripts/e2e/environment');
const { expireInvite } = require('../../../scripts/e2e/expire-invite');
const { createV1Actor } = require('../../../scripts/e2e/create-v1-actor');

const target = { kind: 'floor', inviteId: 'a'.repeat(24), floorId: 'b'.repeat(24), userId: 'c'.repeat(24) };
let connection;
let collection;
beforeEach(() => {
  collection = { findOne: jest.fn().mockResolvedValue({}), updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }) };
  connection = {
    db: { databaseName: 'iseeetl_e2e', collection: jest.fn(() => collection) },
    openUri: jest.fn().mockResolvedValue(undefined), close: jest.fn().mockResolvedValue(undefined), model: jest.fn(),
  };
  jest.spyOn(mongoose, 'createConnection').mockReturnValue(connection);
});
afterEach(() => jest.restoreAllMocks());

test('不正な招待対象をDB接続前に拒否する', async () => {
  await expect(expireInvite({ ...target, kind: 'users' })).rejects.toThrow('E2E用の招待データの対象が不正です');
  await expect(expireInvite({ ...target, floorId: '../other' })).rejects.toThrow('E2E用の招待データの対象が不正です');
  expect(connection.openUri).not.toHaveBeenCalled();
});

test.each([expireInvite, createV1Actor])('E2E以外のDB接続ではデータを変更せず切断する', async (operation) => {
  connection.db.databaseName = 'another_database';
  await expect(operation(target)).rejects.toThrow('準備に失敗しました');
  expect(connection.db.collection).not.toHaveBeenCalled();
  expect(connection.model).not.toHaveBeenCalled();
  expect(connection.close).toHaveBeenCalledTimes(1);
});

test('所有者・発行日時・一意性を確認できた招待だけを期限切れにする', async () => {
  await expireInvite(target);
  const query = collection.updateOne.mock.calls[0][0];
  expect(String(query._id)).toBe(target.inviteId);
  expect(String(query.floor)).toBe(target.floorId);
  expect(String(query.user)).toBe(target.userId);
  expect(query.created_at.$gte).toBeInstanceOf(Date);
  expect(query.token_expiry.$gt).toBeInstanceOf(Date);
  expect(environment.loadE2EEnvironment).toHaveBeenCalledWith({ environment: {} });
  expect(connection.close).toHaveBeenCalledTimes(1);
});

test('所有者が一致しなければ招待を更新しない', async () => {
  collection.findOne.mockResolvedValue(null);
  await expect(expireInvite(target)).rejects.toThrow('準備に失敗しました');
  expect(collection.updateOne).not.toHaveBeenCalled();
  expect(connection.close).toHaveBeenCalledTimes(1);
});

test('招待が存在しないか期限切れなら処理を失敗させる', async () => {
  collection.updateOne.mockResolvedValue({ modifiedCount: 0 });
  await expect(expireInvite(target)).rejects.toThrow('準備に失敗しました');
  expect(connection.close).toHaveBeenCalledTimes(1);
});
