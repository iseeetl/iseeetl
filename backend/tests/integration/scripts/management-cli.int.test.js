const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../../../models/User');
const { createAdmin, main: createAdminCli } = require('../../../scripts/create-admin');
const { login } = require('../../../services/auth/login.service');
const ensureJsonWebTokenV1 = require('../../../middlewares/ensureJsonWebTokenV1');
const ensureDeveloperUserV1 = require('../../../middlewares/ensureDeveloperUserV1');
const { createTestTempDir, removeDirSafe } = require('../../_helpers/testRuntime');

const ACCOUNT = { username: '初期管理者', mail: 'admin-cli@example.com', password: 'DummyPass123' };
const SECRET = 'test-jwt-dev-secret';
let directory;
let envFile;
let dbConnect;

beforeEach(() => {
  const uri = new URL(process.env.JEST_MONGODB_MEMORY_SERVER_URI);
  uri.pathname = '/test';
  dbConnect = uri.toString();
  directory = createTestTempDir('management-cli');
  envFile = path.join(directory, 'settings.env');
  fs.writeFileSync(envFile, `DB_CONNECT=${dbConnect}\nJWT_DEV_SECRET=${SECRET}\n`);
});

afterEach(async () => { await removeDirSafe(directory); });

test('CLIで作成した管理者が通常のログイン処理を利用できる', async () => {
  const stdout = { write: jest.fn() };
  const stderr = { write: jest.fn() };
  const code = await createAdminCli([
    '--env-file', envFile, '--username', ACCOUNT.username, '--mail', ' ADMIN-CLI@EXAMPLE.COM ',
  ], { stdout, stderr, promptPassword: async () => ACCOUNT.password });
  expect(code).toBe(0);
  const user = await User.findOne({ mail: ACCOUNT.mail }).select('+password').lean();
  expect(user).toMatchObject({ role: 'Administrator', lang: 'ja', delete_flg: false, session_version: 0 });
  expect(user.password).not.toBe(ACCOUNT.password);
  expect(await bcrypt.compare(ACCOUNT.password, user.password)).toBe(true);
  const result = await login({ mail: ACCOUNT.mail, password: ACCOUNT.password });
  expect(result.user_role).toBe('Administrator');
  expect(result.user_id.toString()).toBe(user._id.toString());
  expect(stderr.write).not.toHaveBeenCalled();
  expect(stdout.write).toHaveBeenCalledWith(expect.stringContaining(user._id.toString()));
});

test.each([false, true])('同じメールの既存ユーザを昇格・復元・上書きしない（削除済み: %s）', async (deleteFlag) => {
  const existing = await User.create({ username: '既存ユーザ', mail: ACCOUNT.mail, role: 'Author', delete_flg: deleteFlag });
  const before = await User.findById(existing._id).select('+password').lean();
  await expect(createAdmin({ ...ACCOUNT, dbConnect })).rejects.toMatchObject({ code: 'USER_EMAIL_ALREADY_USED' });
  expect(await User.countDocuments({ mail: ACCOUNT.mail })).toBe(1);
  expect(await User.findById(existing._id).select('+password').lean()).toEqual(before);
});

test('同時作成でも管理者が重複しない', async () => {
  const results = await Promise.allSettled([
    createAdmin({ ...ACCOUNT, dbConnect }), createAdmin({ ...ACCOUNT, dbConnect }),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((result) => result.status === 'rejected').reason.code).toBe('USER_EMAIL_ALREADY_USED');
  expect(await User.countDocuments({ mail: ACCOUNT.mail })).toBe(1);
});

test('メールの一意索引がないDBでは作成してから管理者を保存する', async () => {
  await User.collection.dropIndex('uniq_users_mail_string');
  try {
    await createAdmin({ ...ACCOUNT, dbConnect });
    const indexes = await User.collection.indexes();
    expect(indexes).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'uniq_users_mail_string', unique: true })]));
    expect(await User.countDocuments({ role: 'Administrator' })).toBe(1);
  } finally {
    await User.createIndexes();
  }
});

test('既存の重複で索引を作れない場合は管理者を保存しない', async () => {
  await User.collection.dropIndex('uniq_users_mail_string');
  const duplicateMail = 'duplicate-cli@example.com';
  try {
    await User.collection.insertMany([
      { username: '重複1', mail: duplicateMail }, { username: '重複2', mail: duplicateMail },
    ]);
    await expect(createAdmin({ ...ACCOUNT, dbConnect })).rejects.toMatchObject({ code: 'INDEX_INITIALIZATION_FAILED' });
    expect(await User.countDocuments({ mail: ACCOUNT.mail })).toBe(0);
  } finally {
    await User.deleteMany({ mail: duplicateMail });
    await User.createIndexes();
  }
});

const invokeMiddleware = (middleware, request) => new Promise((resolve, reject) => {
  middleware(request, {}, (error) => { if (error) reject(error); else resolve(); });
});

test('実際のトークンCLIの出力がv1認証を通り、ロール変更・ユーザ削除後は拒否される', async () => {
  const user = await User.create({ username: 'API利用者', mail: 'developer-cli@example.com', role: 'developer' });
  const result = spawnSync(process.execPath, [
    path.resolve(__dirname, '../../../scripts/create-v1-token.js'),
    '--env-file', envFile, '--user-id', user._id.toString(),
  ], { encoding: 'utf8', timeout: 10000 });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  const token = result.stdout.trim();
  expect(jwt.verify(token, SECRET, { clockTimestamp: 4102444800 })).not.toHaveProperty('exp');
  const request = { headers: { authorization: `Bearer ${token}` } };
  await invokeMiddleware(ensureJsonWebTokenV1, request);
  await invokeMiddleware(ensureDeveloperUserV1, request);
  expect(request.jwtPayload).toEqual({ user_id: user._id.toString(), user_role: 'developer' });
  await User.updateOne({ _id: user._id }, { $set: { role: 'Administrator' } });
  await expect(invokeMiddleware(ensureDeveloperUserV1, request)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await User.updateOne({ _id: user._id }, { $set: { role: 'developer', delete_flg: true } });
  await expect(invokeMiddleware(ensureDeveloperUserV1, request)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  expect(mongoose.connection.readyState).toBe(1);
});
