const {
  DATABASE_CONNECTION_TIMEOUT_MS,
  createDatabaseConnectionOptions,
} = require('../../../config/database');

describe('MongoDBの接続設定', () => {
  test('MongoDBの接続とサーバ選択を120秒待機する', () => {
    expect(DATABASE_CONNECTION_TIMEOUT_MS).toBe(120000);
    expect(createDatabaseConnectionOptions()).toEqual({
      connectTimeoutMS: 120000,
      serverSelectionTimeoutMS: 120000,
    });
  });

  test('呼び出しごとに独立した接続オプションを返す', () => {
    expect(createDatabaseConnectionOptions()).not.toBe(createDatabaseConnectionOptions());
  });
});
