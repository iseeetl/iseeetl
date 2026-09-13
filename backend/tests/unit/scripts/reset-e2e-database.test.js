const ROLES = require('../../../constants/roles');
const { resolveE2EResetEnvironment } = require('../../../scripts/e2e/environment');
const {
  BCRYPT_COST,
  clearApplicationCollections,
  resetE2EDatabase,
  runCli,
} = require('../../../scripts/e2e/reset-database');

describe('E2E用DBの初期化', () => {
  const buildEnv = (overrides = {}) => ({
    NODE_ENV: 'development',
    DB_CONNECT: 'mongodb://db:27017/iseeetl_e2e',
    E2E_ADMIN_USERNAME: 'E2E Administrator',
    E2E_ADMIN_MAIL: 'e2e-admin@example.invalid',
    E2E_ADMIN_PASSWORD: 'e2e-admin-pass',
    E2E_FLOOR_EDITOR_USERNAME: 'E2E Editor',
    E2E_FLOOR_EDITOR_MAIL: 'e2e-editor@example.invalid',
    E2E_FLOOR_EDITOR_PASSWORD: 'e2e-editor-pass',
    E2E_USER_USERNAME: 'E2E Author',
    E2E_USER_MAIL: 'e2e-author@example.invalid',
    E2E_USER_PASSWORD: 'e2e-author-pass',
    ...overrides,
  });

  const buildDependencies = ({ databaseName = 'iseeetl_e2e', collections = [] } = {}) => {
    const database = {
      databaseName,
      collection: jest.fn(() => ({ id: "users-collection" })),
      collections: jest.fn().mockResolvedValue(collections),
    };
    const mongooseInstance = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      connection: { db: database },
    };
    const UserModel = {
      create: jest.fn().mockResolvedValue(undefined),
    };
    const hashPassword = jest.fn(async (password) => `hashed:${password}`);
    return {
      database,
      prepareIndexes: jest.fn().mockResolvedValue({ changes: 0 }),
      mongooseInstance,
      UserModel,
      hashPassword,
    };
  };

  afterEach(() => {
    process.exitCode = undefined;
  });

  test('索引を準備してからテストデータを作り、索引作成失敗時はテストデータを作らない', async () => {
    const dependencies = buildDependencies();
    await resetE2EDatabase({ env: buildEnv(), ...dependencies });
    expect(dependencies.prepareIndexes.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.UserModel.create.mock.invocationCallOrder[0]
    );
    dependencies.UserModel.create.mockClear();
    dependencies.prepareIndexes.mockRejectedValue(new Error('index failure'));
    await expect(resetE2EDatabase({ env: buildEnv(), ...dependencies })).rejects.toThrow('index failure');
    expect(dependencies.UserModel.create).not.toHaveBeenCalled();
    expect(dependencies.mongooseInstance.disconnect).toHaveBeenCalledTimes(2);
  });

  test.each([undefined, 'test', 'staging', 'production'])(
    'NODE_ENV=%p は接続前に拒否する',
    async (nodeEnv) => {
      const dependencies = buildDependencies();
      const env = buildEnv({ NODE_ENV: nodeEnv });

      await expect(resetE2EDatabase({ env, ...dependencies })).rejects.toThrow(
        'E2E用DBの初期化にはNODE_ENV=developmentが必要です。'
      );
      expect(dependencies.mongooseInstance.connect).not.toHaveBeenCalled();
      expect(dependencies.UserModel.create).not.toHaveBeenCalled();
    }
  );

  test('必須変数の不足は変数名だけを示して接続前に拒否する', async () => {
    const dependencies = buildDependencies();
    const env = buildEnv({
      DB_CONNECT: ' ',
    });

    expect(() => resolveE2EResetEnvironment(env)).toThrow('必須の環境変数が未設定です: DB_CONNECT');
    await expect(resetE2EDatabase({ env, ...dependencies })).rejects.toThrow('必須の環境変数が未設定です:');
    expect(dependencies.mongooseInstance.connect).not.toHaveBeenCalled();
    expect(dependencies.UserModel.create).not.toHaveBeenCalled();
  });

  test('接続後のDB名が完全一致しない場合は消去せず必ず切断する', async () => {
    const dependencies = buildDependencies({ databaseName: 'iseeetl_e2e_backup' });

    await expect(resetE2EDatabase({ env: buildEnv(), ...dependencies })).rejects.toThrow(
      'E2E用DBの初期化対象はiseeetl_e2eに限定されています。'
    );

    expect(dependencies.mongooseInstance.connect).toHaveBeenCalledTimes(1);
    expect(dependencies.database.collections).not.toHaveBeenCalled();
    expect(dependencies.UserModel.create).not.toHaveBeenCalled();
    expect(dependencies.mongooseInstance.disconnect).toHaveBeenCalledTimes(1);
  });

  test('許可されていないMongoDB hostは接続前に拒否する', async () => {
    const dependencies = buildDependencies();
    const env = buildEnv({ DB_CONNECT: 'mongodb://shared.example/iseeetl_e2e' });

    await expect(resetE2EDatabase({ env, ...dependencies })).rejects.toThrow(
      'E2E用DBには、許可されたローカルホストのmongodb://接続先を指定してください。'
    );
    expect(dependencies.mongooseInstance.connect).not.toHaveBeenCalled();
    expect(dependencies.database.collections).not.toHaveBeenCalled();
    expect(dependencies.UserModel.create).not.toHaveBeenCalled();
  });

  test('システムコレクションを除き、通常のコレクションをすべて消去する', async () => {
    const users = { collectionName: 'users', deleteMany: jest.fn().mockResolvedValue(undefined) };
    const posts = { collectionName: 'posts', deleteMany: jest.fn().mockResolvedValue(undefined) };
    const system = {
      collectionName: 'system.profile',
      deleteMany: jest.fn().mockResolvedValue(undefined),
    };
    const database = {
      collections: jest.fn().mockResolvedValue([users, system, posts]),
    };

    await expect(clearApplicationCollections(database)).resolves.toBe(2);
    expect(users.deleteMany).toHaveBeenCalledWith({});
    expect(posts.deleteMany).toHaveBeenCalledWith({});
    expect(system.deleteMany).not.toHaveBeenCalled();
  });

  test('通常のコレクションを消去して固定の3権限のテストデータを登録する', async () => {
    const usersCollection = {
      collectionName: 'users',
      deleteMany: jest.fn().mockResolvedValue(undefined),
    };
    const dependencies = buildDependencies({ collections: [usersCollection] });
    const env = buildEnv();
    const fixedAccounts = resolveE2EResetEnvironment(env).accounts;

    await expect(resetE2EDatabase({ env, ...dependencies })).resolves.toEqual({
      clearedCollectionCount: 1,
      seededUserCount: 3,
    });

    expect(dependencies.mongooseInstance.connect).toHaveBeenCalledWith(env.DB_CONNECT);
    expect(dependencies.hashPassword.mock.calls).toEqual([
      [fixedAccounts.admin.password, BCRYPT_COST],
      [fixedAccounts.editor.password, BCRYPT_COST],
      [fixedAccounts.author.password, BCRYPT_COST],
    ]);
    expect(usersCollection.deleteMany).toHaveBeenCalledWith({});
    expect(dependencies.UserModel.create).toHaveBeenCalledWith([
      {
        username: fixedAccounts.admin.username,
        mail: fixedAccounts.admin.mail,
        password: `hashed:${fixedAccounts.admin.password}`,
        lang: 'ja',
        role: ROLES.ADMINISTRATOR,
      },
      {
        username: fixedAccounts.editor.username,
        mail: fixedAccounts.editor.mail,
        password: `hashed:${fixedAccounts.editor.password}`,
        lang: 'ja',
        role: ROLES.EDITOR,
      },
      {
        username: fixedAccounts.author.username,
        mail: fixedAccounts.author.mail,
        password: `hashed:${fixedAccounts.author.password}`,
        lang: 'ja',
        role: ROLES.AUTHOR,
      },
    ]);
    expect(dependencies.mongooseInstance.disconnect).toHaveBeenCalledTimes(1);
  });

  test('固定アカウント不足はDB接続前に拒否する', async () => {
    const dependencies = buildDependencies();
    const env = buildEnv({ E2E_USER_PASSWORD: '' });

    await expect(resetE2EDatabase({ env, ...dependencies })).rejects.toThrow(
      'E2E用固定アカウントの設定が不足しています: E2E_USER_PASSWORD。'
    );
    expect(dependencies.mongooseInstance.connect).not.toHaveBeenCalled();
    expect(dependencies.UserModel.create).not.toHaveBeenCalled();
  });

  test('消去に失敗したらテストデータを登録せず、必ず切断する', async () => {
    const collection = {
      collectionName: 'users',
      deleteMany: jest.fn().mockRejectedValue(new Error('delete failed')),
    };
    const dependencies = buildDependencies({ collections: [collection] });

    await expect(resetE2EDatabase({ env: buildEnv(), ...dependencies })).rejects.toThrow('delete failed');
    expect(dependencies.UserModel.create).not.toHaveBeenCalled();
    expect(dependencies.mongooseInstance.disconnect).toHaveBeenCalledTimes(1);
  });

  test('接続処理が失敗しても切断を試みる', async () => {
    const dependencies = buildDependencies();
    dependencies.mongooseInstance.connect.mockRejectedValue(new Error('connect failed'));

    await expect(resetE2EDatabase({ env: buildEnv(), ...dependencies })).rejects.toThrow('connect failed');
    expect(dependencies.database.collections).not.toHaveBeenCalled();
    expect(dependencies.UserModel.create).not.toHaveBeenCalled();
    expect(dependencies.mongooseInstance.disconnect).toHaveBeenCalledTimes(1);
  });

  test('CLIは設定値や下位エラーをログへ出さず、安全な成功・失敗文だけを出す', async () => {
    const logger = { log: jest.fn(), error: jest.fn() };
    const reset = jest
      .fn()
      .mockResolvedValueOnce({
        clearedCollectionCount: 2,
        seededUserCount: 3,
      })
      .mockRejectedValueOnce(new Error('mongodb://secret.invalid/value'));

    await runCli({ reset, logger });
    expect(logger.log).toHaveBeenCalledWith(
      '[e2e:db:reset] 初期化しました（コレクション2件、ユーザ3件）。'
    );
    expect(logger.error).not.toHaveBeenCalled();

    await runCli({ reset, logger });
    expect(logger.error).toHaveBeenCalledWith(
      '[e2e:db:reset] 初期化に失敗しました。E2E環境とDBの設定を確認してください。'
    );
    expect(JSON.stringify(logger)).not.toContain('secret.invalid');
    expect(process.exitCode).toBe(1);
  });

  test('reset失敗時は完了扱いにしない', async () => {
    const logger = { log: jest.fn(), error: jest.fn() };
    const reset = jest.fn().mockRejectedValue(new Error('schema initialization failed'));

    await runCli({ reset, logger });

    expect(reset).toHaveBeenCalledTimes(1);
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      '[e2e:db:reset] 初期化に失敗しました。E2E環境とDBの設定を確認してください。'
    );
    expect(process.exitCode).toBe(1);
  });
});
