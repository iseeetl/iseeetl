jest.mock('node:fs', () => {
  const actual = jest.requireActual('node:fs');
  return { ...actual, statSync: jest.fn(actual.statSync), readFileSync: jest.fn(actual.readFileSync) };
});
jest.mock('../../../models/User', () => ({ schema: {} }));

const fs = require('node:fs');
const bcrypt = require('bcrypt');
const { createAdmin, main } = require('../../../scripts/create-admin');

const account = {
  dbConnect: 'mongodb://127.0.0.1:27017/cli_test',
  username: '管理者', mail: 'admin@example.com', password: 'DummyPass123',
};
const uniqueIndex = {
  name: 'uniq_users_mail_string', key: { mail: 1 }, unique: true,
  partialFilterExpression: { mail: { $type: 'string' } },
};
function database() {
  const User = {
    init: jest.fn().mockResolvedValue(undefined),
    collection: { indexes: jest.fn().mockResolvedValue([uniqueIndex]) },
    exists: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ _id: '650000000000000000000001' }),
  };
  const connection = {
    openUri: jest.fn().mockResolvedValue(undefined),
    model: jest.fn().mockReturnValue(User),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return { User, connection, createConnection: jest.fn().mockReturnValue(connection) };
}

test('正規化したメールとハッシュ化したパスワードで新しい管理者を作成する', async () => {
  const db = database();
  expect(await createAdmin({ ...account, mail: ' ADMIN@EXAMPLE.COM ' }, db)).toBe('650000000000000000000001');
  const saved = db.User.create.mock.calls[0][0];
  expect(saved).toEqual({ username: '管理者', mail: 'admin@example.com', password: expect.any(String), role: 'Administrator', lang: 'ja', delete_flg: false });
  expect(saved.password).not.toBe(account.password);
  expect(await bcrypt.compare(account.password, saved.password)).toBe(true);
  expect(bcrypt.getRounds(saved.password)).toBe(10);
  expect(db.User.exists).toHaveBeenCalledWith({ mail: 'admin@example.com' });
  expect(db.connection.close).toHaveBeenCalledTimes(1);
});

test.each([
  { username: '' }, { username: 'a'.repeat(21) },
  { mail: 'invalid' }, { mail: `${'a'.repeat(95)}@example.com` },
  { password: 'short' }, { password: 'a'.repeat(17) },
])('入力不正ならDBへ接続しない: %j', async (change) => {
  const db = database();
  await expect(createAdmin({ ...account, ...change }, db)).rejects.toMatchObject({ code: 'INVALID_ACCOUNT' });
  expect(db.createConnection).not.toHaveBeenCalled();
});

test.each(['mongodb://127.0.0.1:27017', 'mongodb://127.0.0.1:27017/?retryWrites=true', 'https://example.com/db'])('DB名を持つMongoDB接続文字列だけを受け付ける', async (dbConnect) => {
  const db = database();
  await expect(createAdmin({ ...account, dbConnect }, db)).rejects.toMatchObject({ code: 'INVALID_DB_CONNECT' });
  expect(db.createConnection).not.toHaveBeenCalled();
});

test.each(['connection', 'indexes', 'missing-index', 'duplicate', 'concurrent-duplicate', 'write', 'close'])('失敗時の値を表示せず接続を終了する: %s', async (kind) => {
  const db = database();
  const failure = new Error('private-value-must-not-be-shown');
  const codes = {
    connection: 'DB_CONNECTION_FAILED', indexes: 'INDEX_INITIALIZATION_FAILED',
    'missing-index': 'INDEX_INITIALIZATION_FAILED', duplicate: 'USER_EMAIL_ALREADY_USED',
    'concurrent-duplicate': 'USER_EMAIL_ALREADY_USED', write: 'USER_CREATION_FAILED', close: 'DB_DISCONNECTION_FAILED',
  };
  if (kind === 'connection') db.connection.openUri.mockRejectedValue(failure);
  if (kind === 'indexes') db.User.init.mockRejectedValue(failure);
  if (kind === 'missing-index') db.User.collection.indexes.mockResolvedValue([]);
  if (kind === 'duplicate') db.User.exists.mockResolvedValue({ _id: 'existing' });
  if (kind === 'concurrent-duplicate') db.User.create.mockRejectedValue(Object.assign(failure, { code: 11000 }));
  if (kind === 'write') db.User.create.mockRejectedValue(failure);
  if (kind === 'close') db.connection.close.mockRejectedValue(failure);
  await expect(createAdmin(account, db)).rejects.toMatchObject({ code: codes[kind], message: expect.not.stringContaining('private-value') });
  expect(db.connection.close).toHaveBeenCalledTimes(1);
  if (['connection', 'indexes', 'missing-index', 'duplicate'].includes(kind)) expect(db.User.create).not.toHaveBeenCalled();
});

describe('管理者作成CLI', () => {
  const args = ['--env-file', 'staging.env', '--username', '管理者', '--mail', ' ADMIN@EXAMPLE.COM '];
  const io = () => ({
    stdout: { write: jest.fn() }, stderr: { write: jest.fn() },
    promptPassword: jest.fn().mockResolvedValue(account.password),
    createUser: jest.fn().mockResolvedValue('650000000000000000000001'),
  });
  beforeEach(() => {
    fs.statSync.mockReturnValue({ isFile: () => true });
    fs.readFileSync.mockReturnValue(Buffer.from(`DB_CONNECT=${account.dbConnect}\n`));
  });
  test('指定ファイルの接続先と対話入力を使い、パスワードを出力しない', async () => {
    const output = io();
    expect(await main(args, output)).toBe(0);
    expect(output.createUser).toHaveBeenCalledWith(account);
    expect(output.stdout.write).toHaveBeenCalledWith('管理者を作成しました。ユーザID: 650000000000000000000001\n');
    expect(output.stderr.write).not.toHaveBeenCalled();
  });
  test('パスワードをコマンド引数では受け付けない', async () => {
    const output = io();
    expect(await main([...args, '--password', account.password], output)).toBe(1);
    expect(output.promptPassword).not.toHaveBeenCalled();
    expect(output.createUser).not.toHaveBeenCalled();
    expect(output.stderr.write).toHaveBeenCalledWith(expect.not.stringContaining(account.password));
  });
  test('入力中止ではユーザを作成しない', async () => {
    const output = io();
    output.promptPassword.mockRejectedValue(new Error('private-input'));
    expect(await main(args, output)).toBe(1);
    expect(output.createUser).not.toHaveBeenCalled();
    expect(output.stderr.write).toHaveBeenCalledWith(expect.not.stringContaining('private-input'));
  });
  test('ヘルプは設定の読込や対話入力を行わない', async () => {
    const output = io();
    expect(await main(['--help'], output)).toBe(0);
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(output.promptPassword).not.toHaveBeenCalled();
  });
});
