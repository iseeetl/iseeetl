const { OPENAI_MODEL_ENV } = require('../../_helpers/openai');
const fs = require('node:fs');
const path = require('path');

const { buildCapabilities } = require('../../../config/featureFlags');
const environmentModule = require('../../../scripts/e2e/environment');

const {
  assertE2EResetConnection,
  loadE2EEnvironment,
  resolveE2EResetEnvironment,
} = environmentModule;

const ENV_FILE = path.resolve(__dirname, '../../../.env.e2e');
const EXAMPLE_FILE = `${ENV_FILE}.example`;
const RUNTIME_ROOT = path.resolve(__dirname, '../../../../.e2e-runtime');
const ANALYTICS_DUMMY_MEASUREMENT_ID = 'G-E2E0000000';
const ANALYTICS_DUMMY_SECRET = 'e2e-ga4-user-id-secret-public-dummy-0001';
const EXTERNAL_FLAG_KEYS = [
  'EXTERNAL_OPENAI_ENABLED',
  'EXTERNAL_GOOGLE_TRANSLATE_ENABLED',
  'EXTERNAL_GOOGLE_LOGIN_ENABLED',
  'EXTERNAL_LINE_LOGIN_ENABLED',
  'EXTERNAL_ONESIGNAL_ENABLED',
  'EXTERNAL_GOOGLE_ANALYTICS_ENABLED',
  'EXTERNAL_MAIL_DELIVERY_ENABLED',
];
const regularFile = { isFile: () => true, isSymbolicLink: () => false };
const regularDirectory = { isDirectory: () => true, isSymbolicLink: () => false };

const buildPathStubs = () => {
  const directories = new Set([RUNTIME_ROOT, `${RUNTIME_ROOT}/media`, `${RUNTIME_ROOT}/profile`]);
  return {
    lstat: (targetPath) => {
      if (targetPath === ENV_FILE) return regularFile;
      if (directories.has(targetPath)) return regularDirectory;
      throw new Error('テスト用ディレクトリがありません');
    },
    realpath: (targetPath) => targetPath,
  };
};

const buildFileEnvironment = (overrides = {}) => ({
  NODE_ENV: 'development',
  PORT: '5100',
  VUE_APP_APPNAME: 'E2E App',
  VUE_APP_APPURL: 'http://localhost:3100',
  DB_CONNECT: 'mongodb://db:27017/iseeetl_e2e',
  JWT_SECRET: 'e2e-user-jwt-dummy',
  JWT_DEV_SECRET: 'e2e-v1-jwt-dummy',
  GUEST_JWT_SECRET: 'e2e-guest-jwt-dummy',
  GUEST_REFRESH_SECRET: 'e2e-guest-refresh-dummy',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3100',
  SOCKET_CORS_ALLOWED_ORIGINS: 'http://localhost:3100',
  DIST_PATH: '../.e2e-runtime/frontend-dist',
  MEDIA_PATH: '../.e2e-runtime/media',
  PROFILE_PATH: '../.e2e-runtime/profile',
  SEND_MAIL_HOST: 'mailpit',
  SEND_MAIL_PORT: '1025',
  NO_REPLY_MAIL: 'e2e-noreply@example.invalid',
  E2E_MAILPIT_API_URL: 'http://mailpit:8025',
  E2E_ADMIN_USERNAME: 'E2E Administrator',
  E2E_ADMIN_MAIL: 'e2e-admin@example.invalid',
  E2E_ADMIN_PASSWORD: 'e2e-admin-pass',
  E2E_FLOOR_EDITOR_USERNAME: 'E2E Editor',
  E2E_FLOOR_EDITOR_MAIL: 'e2e-editor@example.invalid',
  E2E_FLOOR_EDITOR_PASSWORD: 'e2e-editor-pass',
  E2E_USER_USERNAME: 'E2E Author',
  E2E_USER_MAIL: 'e2e-author@example.invalid',
  E2E_USER_PASSWORD: 'e2e-author-pass',
  EXTERNAL_OPENAI_ENABLED: 'false',
  EXTERNAL_GOOGLE_TRANSLATE_ENABLED: 'false',
  EXTERNAL_GOOGLE_LOGIN_ENABLED: 'false',
  EXTERNAL_LINE_LOGIN_ENABLED: 'false',
  EXTERNAL_ONESIGNAL_ENABLED: 'false',
  EXTERNAL_GOOGLE_ANALYTICS_ENABLED: 'false',
  EXTERNAL_MAIL_DELIVERY_ENABLED: 'false',
  GA4_MEASUREMENT_ID: ANALYTICS_DUMMY_MEASUREMENT_ID,
  GA4_USER_ID_SECRET: ANALYTICS_DUMMY_SECRET,
  ...overrides,
});

const loadFixture = ({ environment = {}, profile = 'core', overrides = {}, ...dependencies } = {}) =>
  loadE2EEnvironment({
    environment,
    profile,
    readFile: () => 'fixture',
    parse: () => buildFileEnvironment(overrides),
    ...buildPathStubs(),
    ...dependencies,
  });

describe('E2E環境設定の検証', () => {
  test('公開APIを起動、reset前確認、接続後確認の3関数だけに限定する', () => {
    expect(Object.keys(environmentModule).sort()).toEqual([
      'assertE2EResetConnection',
      'loadE2EEnvironment',
      'resolveE2EResetEnvironment',
    ]);
  });

  test('公開設定例を使い、ローカル設定ファイルなしで各プロファイルの安全条件を検証する', () => {
    const environment = {};

    const example = fs.readFileSync(EXAMPLE_FILE, 'utf8');
    for (const profile of ['core', 'mail', 'analytics']) {
      expect(() => loadE2EEnvironment({
        environment: {}, profile, readFile: () => example, ...buildPathStubs(),
      })).not.toThrow();
    }
    loadE2EEnvironment({ environment, readFile: () => example, ...buildPathStubs() });
    expect(environment.NODE_ENV).toBe('development');
    expect(new URL(environment.DB_CONNECT).pathname).toBe('/iseeetl_e2e');
    expect(environment.MEDIA_PATH).toBe(`${RUNTIME_ROOT}/media`);
    EXTERNAL_FLAG_KEYS.forEach((key) => expect(environment[key]).toBe('false'));
    expect(environment.GA4_MEASUREMENT_ID).toBeUndefined();
    expect(environment.GA4_USER_ID_SECRET).toBeUndefined();
    expect(buildCapabilities(environment).googleAnalytics).toBe(false);
  });

  test('基本構成はE2E設定ファイルで継承した環境変数を上書きし、メールと外部サービスを無効にする', () => {
    const environment = {
      DB_CONNECT: 'mongodb://db:27017/visual_development',
      JWT_SECRET: 'ambient-real-secret',
      MAIL_DELIVERY_MODE: 'smtp',
      OPENAI_API_KEY: 'ambient-provider-value',
      GOOGLE_OAUTH_CLIENT_ID: 'ambient-google-client',
      LINE_LOGIN_CHANNEL_ID: 'ambient-line-client',
      ONESIGNAL_APP_ID: 'ambient-onesignal-app',
      ...OPENAI_MODEL_ENV,
      SUPPORT_USER_ID: 'ambient-legacy-support-user',
      EXTERNAL_OPENAI_ENABLED: 'true',
      EXTERNAL_GOOGLE_TRANSLATE_ENABLED: 'true',
      EXTERNAL_GOOGLE_LOGIN_ENABLED: 'true',
      EXTERNAL_LINE_LOGIN_ENABLED: 'true',
      EXTERNAL_ONESIGNAL_ENABLED: 'true',
      EXTERNAL_GOOGLE_ANALYTICS_ENABLED: 'true',
      EXTERNAL_MAIL_DELIVERY_ENABLED: 'true',
      GA4_MEASUREMENT_ID: 'G-AMBIENT001',
      GA4_USER_ID_SECRET: 'ambient-analytics-secret',
      RESET_TOKEN_TTL_MINUTES: 'ambient-normal-setting',
    };

    loadFixture({ environment });

    expect(environment.DB_CONNECT).toBe('mongodb://db:27017/iseeetl_e2e');
    expect(environment.JWT_SECRET).toBe('e2e-user-jwt-dummy');
    expect(environment.MAIL_DELIVERY_MODE).toBeUndefined();
    expect(environment.SEND_MAIL_HOST).toBeUndefined();
    expect(environment.OPENAI_API_KEY).toBeUndefined();
    expect(environment.GOOGLE_OAUTH_CLIENT_ID).toBeUndefined();
    expect(environment.LINE_LOGIN_CHANNEL_ID).toBeUndefined();
    expect(environment.ONESIGNAL_APP_ID).toBeUndefined();
    Object.keys(OPENAI_MODEL_ENV).forEach((name) => expect(environment[name]).toBeUndefined());
    expect(environment.SUPPORT_USER_ID).toBeUndefined();
    EXTERNAL_FLAG_KEYS.forEach((key) => expect(environment[key]).toBe('false'));
    expect(environment.GA4_MEASUREMENT_ID).toBeUndefined();
    expect(environment.GA4_USER_ID_SECRET).toBeUndefined();
    expect(environment.RESET_TOKEN_TTL_MINUTES).toBeUndefined();
    expect(environment.MEDIA_PATH).toBe(`${RUNTIME_ROOT}/media`);
    expect(environment.PROFILE_PATH).toBe(`${RUNTIME_ROOT}/profile`);
  });

  test('E2E設定ファイルでは許可した項目だけを受け付け、継承した未知の外部サービス設定を除去する', () => {
    expect(() => loadFixture({ overrides: { OPENAI_FUTURE_TOKEN: 'configured' } }))
      .toThrow('backend/.env.e2eに未対応の項目があります: OPENAI_FUTURE_TOKEN。');

    const environment = { OPENAI_FUTURE_TOKEN: 'ambient-provider-value' };
    loadFixture({ environment, overrides: { RESET_TOKEN_TTL_MINUTES: '30' } });

    expect(environment.OPENAI_FUTURE_TOKEN).toBeUndefined();
    expect(environment.RESET_TOKEN_TTL_MINUTES).toBe('30');

    expect(() => loadFixture({ overrides: { SUPPORT_USER_ID: 'legacy-value' } }))
      .toThrow('backend/.env.e2eに未対応の項目があります: SUPPORT_USER_ID。');
    expect(() => loadFixture({ overrides: { OPENAI_VIDEO_MODEL: 'legacy-model' } }))
      .toThrow('backend/.env.e2eに未対応の項目があります: OPENAI_VIDEO_MODEL。');
  });

  test('メール構成だけがE2E設定ファイルのSMTP設定を有効にする', () => {
    const environment = loadFixture({
      environment: {
        GA4_MEASUREMENT_ID: 'G-AMBIENT001',
        GA4_USER_ID_SECRET: 'ambient-analytics-secret',
      },
      profile: 'mail',
    });

    expect(environment.MAIL_DELIVERY_MODE).toBeUndefined();
    EXTERNAL_FLAG_KEYS.forEach((key) => {
      expect(environment[key]).toBe(
        key === 'EXTERNAL_MAIL_DELIVERY_ENABLED' ? 'true' : 'false'
      );
    });
    expect(environment.SEND_MAIL_HOST).toBe('mailpit');
    expect(environment.SEND_MAIL_PORT).toBe('1025');
    expect(environment.NO_REPLY_MAIL).toBe('e2e-noreply@example.invalid');
    expect(environment.GA4_MEASUREMENT_ID).toBeUndefined();
    expect(environment.GA4_USER_ID_SECRET).toBeUndefined();
    expect(buildCapabilities(environment).mailDelivery).toBe(true);
  });

  test('アクセス解析構成だけがE2E設定ファイルのダミー設定を有効にする', () => {
    const environment = loadFixture({
      environment: {
        GA4_MEASUREMENT_ID: 'G-AMBIENT001',
        GA4_USER_ID_SECRET: 'ambient-real-looking-secret-value',
        OPENAI_API_KEY: 'ambient-provider-value',
      },
      profile: 'analytics',
    });

    expect(environment.GA4_MEASUREMENT_ID).toBe(ANALYTICS_DUMMY_MEASUREMENT_ID);
    expect(environment.GA4_USER_ID_SECRET).toBe(ANALYTICS_DUMMY_SECRET);
    EXTERNAL_FLAG_KEYS.forEach((key) => {
      expect(environment[key]).toBe(
        key === 'EXTERNAL_GOOGLE_ANALYTICS_ENABLED' ? 'true' : 'false'
      );
    });
    expect(environment.MAIL_DELIVERY_MODE).toBeUndefined();
    expect(environment.SEND_MAIL_HOST).toBeUndefined();
    expect(environment.OPENAI_API_KEY).toBeUndefined();
    expect(buildCapabilities(environment).googleAnalytics).toBe(true);
  });

  test('固定ファイル以外とシンボリックリンクを拒否する', () => {
    expect(() => loadFixture({ envFilePath: EXAMPLE_FILE }))
      .toThrow('E2E用バックエンドにはbackend/.env.e2eを使用してください。');
    expect(() => loadFixture({ envFilePath: `${ENV_FILE}.local` })).toThrow(
      'E2E用バックエンドにはbackend/.env.e2eを使用してください。'
    );
    expect(() =>
      loadFixture({
        lstat: () => ({ isFile: () => false, isSymbolicLink: () => true }),
      })
    ).toThrow('backend/.env.e2eが通常ファイルとして必要です。');
    expect(() =>
      loadFixture({
        lstat: () => { throw new Error('missing'); },
      })
    ).toThrow('backend/.env.e2eが通常ファイルとして必要です。');
    expect(() => loadFixture({ realpath: () => `${ENV_FILE}.outside` }))
      .toThrow('backend/.env.e2eが通常ファイルとして必要です。');
  });

  test('設定ファイルがない場合は設定例からの作成を案内し、自動読込しない', () => {
    const readFile = jest.fn();
    expect(() => loadFixture({
      lstat: () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
      readFile,
    })).toThrow('backend/.env.e2eがありません。.env.e2e.exampleをコピーし、E2E環境に合わせて設定してください。');
    expect(readFile).not.toHaveBeenCalled();
  });

  test.each(['読み取り', '解析'])('%sの失敗時に設定値をエラーへ含めない', (operation) => {
    const sensitiveValue = 'private-e2e-dummy-value';
    const fail = () => { throw new Error(sensitiveValue); };
    expect(() => loadFixture(operation === '読み取り' ? { readFile: fail } : { parse: fail }))
      .toThrow('backend/.env.e2eを読み取れないか、解析できませんでした。');
  });

  test.each(['localhost', '127.0.0.1', '[::1]', 'db'])('環境に合わせてDB接続先を%sと別ポートへ変更できる', (host) => {
    const databaseUri = `mongodb://${host}:27018/iseeetl_e2e`;
    const environment = loadFixture({ overrides: { DB_CONNECT: databaseUri } });
    expect(resolveE2EResetEnvironment(environment).databaseUri).toBe(databaseUri);
  });

  test('資格情報を含まないローカルMongoDBと固定のDB名だけを許可する', () => {
    expect(() => loadFixture({ overrides: { DB_CONNECT: 'mongodb://shared.example/iseeetl_e2e' } }))
      .toThrow('E2E用DBには、許可されたローカルホストのmongodb://接続先を指定してください。');
    expect(() =>
      loadFixture({ overrides: { DB_CONNECT: 'mongodb://user:pass@db:27017/iseeetl_e2e' } })
    ).toThrow('E2E用DBのURIに認証情報を含めないでください。');
    expect(() => loadFixture({ overrides: { DB_CONNECT: 'mongodb://db:27017/iseeetl_e2e_backup' } }))
      .toThrow('E2E用バックエンドのDB名はiseeetl_e2eにしてください。');
  });

  test('E2E専用ポートとフロントエンドオリジンの誤編集を拒否する', () => {
    expect(() => loadFixture({ overrides: { PORT: '5200' } }))
      .toThrow('PORTは5100にしてください。');
    expect(() => loadFixture({ overrides: { VUE_APP_APPURL: 'http://localhost:3200' } }))
      .toThrow('VUE_APP_APPURLはhttp://localhost:3100にしてください。');
    expect(() =>
      loadFixture({ overrides: { CORS_ALLOWED_ORIGINS: 'http://localhost:3200' } })
    ).toThrow('CORS_ALLOWED_ORIGINSはhttp://localhost:3100にしてください。');
  });

  test('書込先は作業ディレクトリ内のE2E専用ディレクトリだけを許可する', () => {
    expect(() => loadFixture({ overrides: { MEDIA_PATH: '../shared-media' } }))
      .toThrow(`MEDIA_PATHの解決先は${RUNTIME_ROOT}/mediaにしてください。`);
    expect(() =>
      loadFixture({
        lstat: (targetPath) =>
          targetPath === ENV_FILE
            ? regularFile
            : { isDirectory: () => false, isSymbolicLink: () => true },
      })
    ).toThrow('E2Eの実行用パスには、チェックアウト直下の実ディレクトリを指定してください。');
  });

  test.each([
    ['サービス名', 'mailpit', 'mailpit'],
    ['localhost', 'localhost', 'localhost'],
    ['IPv4ループバック', '127.0.0.1', '127.0.0.1'],
    ['IPv6ループバック', '::1', '[::1]'],
  ])('Mailpitの%s接続をメール用プロファイルへ反映する', (_label, smtpHost, apiHost) => {
    const apiUrl = `http://${apiHost}:8025`;
    const environment = loadFixture({
      profile: 'mail', overrides: { SEND_MAIL_HOST: smtpHost, E2E_MAILPIT_API_URL: apiUrl },
    });
    expect(environment.SEND_MAIL_HOST).toBe(smtpHost);
    expect(environment.SEND_MAIL_PORT).toBe('1025');
    expect(environment.E2E_MAILPIT_API_URL).toBe(apiUrl);
    expect(buildCapabilities(environment).mailDelivery).toBe(true);
  });

  test.each(['smtp.example.com', '192.0.2.1', 'mailpit.example.com', '127.0.0.2'])('許可していないSMTPホストを拒否する: %s', (host) => {
    expect(() => loadFixture({ overrides: { SEND_MAIL_HOST: host } }))
      .toThrow('SEND_MAIL_HOSTにはmailpitまたはループバックアドレスを指定してください。');
  });

  test.each(['25', '587', '2525'])('SMTPの専用ポート以外を拒否する: %s', (port) => {
    expect(() => loadFixture({ overrides: { SEND_MAIL_PORT: port } }))
      .toThrow('SEND_MAIL_PORTは1025にしてください。');
  });

  test.each([
    ['外部ホスト', 'http://example.test:8025'],
    ['似たホスト名', 'http://mailpit.example.test:8025'],
    ['別ポート', 'http://localhost:18025'],
    ['HTTPS', 'https://localhost:8025'],
    ['認証情報', 'http://user:password@localhost:8025'],
    ['パス', 'http://localhost:8025/api'],
    ['クエリ', 'http://localhost:8025?query=value'],
    ['フラグメント', 'http://localhost:8025#fragment'],
  ])('Mailpit APIの%s指定を拒否する', (_label, apiUrl) => {
    expect(() => loadFixture({ overrides: { E2E_MAILPIT_API_URL: apiUrl } }))
      .toThrow('E2E_MAILPIT_API_URLにはmailpitまたはループバックのHTTP・8025番ポートを指定してください。');
  });

  test('Mailpit APIのURL形式が不正なら設定値を出さず停止する', () => {
    expect(() => loadFixture({ overrides: { E2E_MAILPIT_API_URL: 'invalid-url' } }))
      .toThrow('E2E_MAILPIT_API_URLには有効なURLを指定してください。');
  });

  test('外部サービスとメールアドレスは隔離したE2E用の値だけを許可する', () => {
    expect(() => loadFixture({ overrides: { NO_REPLY_MAIL: 'e2e@example.com' } }))
      .toThrow('NO_REPLY_MAILのドメインはexample.invalidにしてください。');
    expect(() => loadFixture({ overrides: { OPENAI_API_KEY: 'configured' } }))
      .toThrow('E2E用の外部サービス設定は空にしてください: OPENAI_API_KEY。');
    expect(() => loadFixture({ overrides: { EXTERNAL_OPENAI_ENABLED: 'true' } }))
      .toThrow('EXTERNAL_OPENAI_ENABLEDはfalseにしてください。');
    expect(() => loadFixture({ overrides: { EXTERNAL_GOOGLE_TRANSLATE_ENABLED: 'invalid' } }))
      .toThrow('EXTERNAL_GOOGLE_TRANSLATE_ENABLEDはfalseにしてください。');
    expect(() => loadFixture({ overrides: { EXTERNAL_GOOGLE_LOGIN_ENABLED: 'true' } }))
      .toThrow('EXTERNAL_GOOGLE_LOGIN_ENABLEDはfalseにしてください。');
    expect(() => loadFixture({ overrides: { EXTERNAL_LINE_LOGIN_ENABLED: 'invalid' } }))
      .toThrow('EXTERNAL_LINE_LOGIN_ENABLEDはfalseにしてください。');
    expect(() => loadFixture({ overrides: { EXTERNAL_ONESIGNAL_ENABLED: 'true' } }))
      .toThrow('EXTERNAL_ONESIGNAL_ENABLEDはfalseにしてください。');
    expect(() => loadFixture({ overrides: { EXTERNAL_GOOGLE_ANALYTICS_ENABLED: 'true' } }))
      .toThrow('EXTERNAL_GOOGLE_ANALYTICS_ENABLEDはfalseにしてください。');
    expect(() => loadFixture({ overrides: { EXTERNAL_MAIL_DELIVERY_ENABLED: 'true' } }))
      .toThrow('EXTERNAL_MAIL_DELIVERY_ENABLEDはfalseにしてください。');
    const environment = {
      GA4_MEASUREMENT_ID: 'G-AMBIENT001',
      GA4_USER_ID_SECRET: 'ambient-real-looking-secret-value',
    };
    expect(() => loadFixture({
      environment,
      profile: 'analytics',
      overrides: { GA4_MEASUREMENT_ID: 'G-DIFFERENT01' },
    })).toThrow('GA4_MEASUREMENT_IDには.env.e2e.exampleの公開ダミー値を指定してください。');
    expect(environment.GA4_MEASUREMENT_ID).toBeUndefined();
    expect(environment.GA4_USER_ID_SECRET).toBeUndefined();

    environment.GA4_MEASUREMENT_ID = 'G-AMBIENT001';
    environment.GA4_USER_ID_SECRET = 'ambient-real-looking-secret-value';
    expect(() => loadFixture({
      environment,
      profile: 'analytics',
      overrides: { GA4_USER_ID_SECRET: 'different-analytics-secret-value' },
    })).toThrow('GA4_USER_ID_SECRETには.env.e2e.exampleの公開ダミー値を指定してください。');
    expect(environment.GA4_MEASUREMENT_ID).toBeUndefined();
    expect(environment.GA4_USER_ID_SECRET).toBeUndefined();
  });

  test('固定アカウントの不足と公開ダミー設定の条件違反を拒否する', () => {
    expect(() => loadFixture({ overrides: { E2E_USER_PASSWORD: '' } }))
      .toThrow('backend/.env.e2eの設定が不足しています: E2E_USER_PASSWORD。');
    expect(() => loadFixture({ overrides: { E2E_ADMIN_MAIL: 'admin@example.com' } }))
      .toThrow('E2E用固定アカウントのメールドメインはexample.invalidにしてください。');
    expect(() => loadFixture({ overrides: { E2E_USER_MAIL: 'e2e-admin@example.invalid' } }))
      .toThrow('E2E用固定アカウントのメールアドレスは重複させないでください。');
    expect(() => loadFixture({ overrides: { E2E_USER_PASSWORD: 'seventeen-chars!!' } }))
      .toThrow('E2E用固定アカウントのパスワードは8～16文字にしてください。');
  });

  test('resetは接続前URIと接続後DB名の両方を確認する', () => {
    const environment = buildFileEnvironment();
    expect(resolveE2EResetEnvironment(environment).databaseUri)
      .toBe('mongodb://db:27017/iseeetl_e2e');
    expect(assertE2EResetConnection({ db: { databaseName: 'iseeetl_e2e' } }))
      .toEqual({ databaseName: 'iseeetl_e2e' });
    expect(() => assertE2EResetConnection({ db: { databaseName: 'iseeetl_e2e_backup' } }))
      .toThrow('E2E用DBの初期化対象はiseeetl_e2eに限定されています。');
  });

  test('DB初期化の実行モードと設定構成が不正なら拒否する', () => {
    expect(() => resolveE2EResetEnvironment(buildFileEnvironment({ NODE_ENV: 'test' })))
      .toThrow('E2E用DBの初期化にはNODE_ENV=developmentが必要です。');
    const environment = {
      GA4_MEASUREMENT_ID: 'G-AMBIENT001',
      GA4_USER_ID_SECRET: 'ambient-real-looking-secret-value',
    };
    expect(() => loadFixture({ environment, profile: 'provider' }))
      .toThrow('E2E用バックエンドのプロファイルはcore、mail、analyticsのいずれかにしてください。');
    expect(environment.GA4_MEASUREMENT_ID).toBeUndefined();
    expect(environment.GA4_USER_ID_SECRET).toBeUndefined();
  });
});
