const mongoose = require('mongoose');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const { loadE2EEnvironment, resolveE2EResetEnvironment, assertE2EResetConnection } = require('./environment');

// 共通の初期ユーザを変更せず、外部API v1の検証専用アカウントを作成する。
const createV1Actor = async () => {
  const environment = loadE2EEnvironment({ environment: {} });
  const { databaseUri } = resolveE2EResetEnvironment(environment);
  const connection = mongoose.createConnection();
  try {
    await connection.openUri(databaseUri, { serverSelectionTimeoutMS: 10000 });
    assertE2EResetConnection(connection);
    const suffix = crypto.randomUUID();
    const user = await connection.model('User', User.schema).create({
      username: `E2E v1 ${suffix.slice(0, 8)}`, mail: `e2e-v1-${suffix}@example.invalid`,
      role: 'developer', lang: 'ja',
    });
    return jwt.sign({ user_id: String(user._id), user_role: 'developer' }, environment.JWT_DEV_SECRET, { expiresIn: '10m' });
  } catch {
    throw new Error('E2E用のv1ユーザの準備に失敗しました。');
  } finally {
    await connection.close();
  }
};

module.exports = { createV1Actor };
