const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const ROLES = require('../../constants/roles');
const User = require('../../models/User');
const { createTestIndexes } = require('../../tests/_helpers/createTestIndexes');
const {
  assertE2EResetConnection,
  resolveE2EResetEnvironment,
} = require('./environment');

const BCRYPT_COST = 10;

const clearApplicationCollections = async (database) => {
  const collections = await database.collections();
  const applicationCollections = collections.filter(
    (collection) => !collection.collectionName.startsWith('system.')
  );

  await Promise.all(applicationCollections.map((collection) => collection.deleteMany({})));
  return applicationCollections.length;
};

const buildSeedUsers = async (accounts, hashPassword) =>
  Promise.all(
    [
      { ...accounts.admin, role: ROLES.ADMINISTRATOR },
      { ...accounts.editor, role: ROLES.EDITOR },
      { ...accounts.author, role: ROLES.AUTHOR },
    ].map(async (account) => ({
      username: account.username,
      mail: account.mail,
      password: await hashPassword(account.password, BCRYPT_COST),
      lang: 'ja',
      role: account.role,
    }))
  );

const resetE2EDatabase = async ({
  env = process.env,
  mongooseInstance = mongoose,
  UserModel = User,
  hashPassword = bcrypt.hash,
  prepareIndexes = createTestIndexes,
} = {}) => {
  const config = resolveE2EResetEnvironment(env);

  try {
    await mongooseInstance.connect(config.databaseUri);
    const database = assertE2EResetConnection(mongooseInstance.connection);
    const users = await buildSeedUsers(config.accounts, hashPassword);
    const clearedCollectionCount = await clearApplicationCollections(database);
    await prepareIndexes();
    await UserModel.create(users);

    return {
      clearedCollectionCount,
      seededUserCount: users.length,
    };
  } finally {
    await mongooseInstance.disconnect();
  }
};

const runCli = async ({
  reset = resetE2EDatabase,
  logger = console,
} = {}) => {
  try {
    const result = await reset();
    logger.log(
      `[e2e:db:reset] 初期化しました（コレクション${result.clearedCollectionCount}件、ユーザ${result.seededUserCount}件）。`
    );
  } catch (_error) {
    logger.error('[e2e:db:reset] 初期化に失敗しました。E2E環境とDBの設定を確認してください。');
    process.exitCode = 1;
  }
};

if (require.main === module) {
  runCli();
}

module.exports = {
  BCRYPT_COST,
  buildSeedUsers,
  clearApplicationCollections,
  resetE2EDatabase,
  runCli,
};
