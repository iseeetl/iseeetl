const fs = require('fs');
const path = require('path');
const { parseEnv } = require('node:util');

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const ENV_FILE = path.join(BACKEND_ROOT, '.env.e2e');
const RUNTIME_ROOT = path.resolve(BACKEND_ROOT, '../.e2e-runtime');
const DATABASE_NAME = 'iseeetl_e2e';
const DATABASE_HOSTS = ['127.0.0.1', '[::1]', 'db', 'localhost'];
const MAILPIT_HOSTS = ['mailpit', 'localhost', '127.0.0.1', '::1'];
const PROFILES = ['core', 'mail', 'analytics'];
const ANALYTICS_MEASUREMENT_ID_KEY = 'GA4_MEASUREMENT_ID';
const ANALYTICS_SECRET_KEY = 'GA4_USER_ID_SECRET';
const ANALYTICS_DUMMY_MEASUREMENT_ID = 'G-E2E0000000';
const ANALYTICS_DUMMY_SECRET = 'e2e-ga4-user-id-secret-public-dummy-0001';
const ANALYTICS_KEYS = [ANALYTICS_MEASUREMENT_ID_KEY, ANALYTICS_SECRET_KEY];
const EXTERNAL_FLAG_KEYS = [
  'EXTERNAL_OPENAI_ENABLED',
  'EXTERNAL_GOOGLE_TRANSLATE_ENABLED',
  'EXTERNAL_GOOGLE_LOGIN_ENABLED',
  'EXTERNAL_LINE_LOGIN_ENABLED',
  'EXTERNAL_ONESIGNAL_ENABLED',
  'EXTERNAL_GOOGLE_ANALYTICS_ENABLED',
  'EXTERNAL_MAIL_DELIVERY_ENABLED',
];
const EXACT_VALUES = {
  PORT: '5100',
  VUE_APP_APPURL: 'http://localhost:3100',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3100',
  SOCKET_CORS_ALLOWED_ORIGINS: 'http://localhost:3100',
  SEND_MAIL_PORT: '1025',
  EXTERNAL_OPENAI_ENABLED: 'false',
  EXTERNAL_GOOGLE_TRANSLATE_ENABLED: 'false',
  EXTERNAL_GOOGLE_LOGIN_ENABLED: 'false',
  EXTERNAL_LINE_LOGIN_ENABLED: 'false',
  EXTERNAL_ONESIGNAL_ENABLED: 'false',
  EXTERNAL_GOOGLE_ANALYTICS_ENABLED: 'false',
  EXTERNAL_MAIL_DELIVERY_ENABLED: 'false',
};

const PATHS = {
  DIST_PATH: 'frontend-dist',
  MEDIA_PATH: 'media',
  PROFILE_PATH: 'profile',
};
const RUNTIME_DIRECTORIES = ['media', 'profile'];
const MAIL_KEYS = ['SEND_MAIL_HOST', 'SEND_MAIL_PORT', 'NO_REPLY_MAIL'];
const ACCOUNT_FIELDS = {
  admin: ['E2E_ADMIN_USERNAME', 'E2E_ADMIN_MAIL', 'E2E_ADMIN_PASSWORD'],
  editor: ['E2E_FLOOR_EDITOR_USERNAME', 'E2E_FLOOR_EDITOR_MAIL', 'E2E_FLOOR_EDITOR_PASSWORD'],
  author: ['E2E_USER_USERNAME', 'E2E_USER_MAIL', 'E2E_USER_PASSWORD'],
};
const ACCOUNT_KEYS = Object.values(ACCOUNT_FIELDS).flat();
const PROVIDER_ENABLE_KEYS = [
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_PROJECT_ID',
  'LINE_LOGIN_CHANNEL_ID',
  'LINE_LOGIN_CHANNEL_SECRET',
  'LINE_LOGIN_REDIRECT_URI',
  'ONESIGNAL_APP_ID',
  'ONESIGNAL_REST_API_KEYS',
  'ONESIGNAL_EXTERNAL_ID_SECRET',
  'OPENAI_API_KEY',
];
const REQUIRED_KEYS = [
  'NODE_ENV',
  'PORT',
  'VUE_APP_APPNAME',
  'VUE_APP_APPURL',
  'DB_CONNECT',
  'JWT_SECRET',
  'JWT_DEV_SECRET',
  'GUEST_JWT_SECRET',
  'GUEST_REFRESH_SECRET',
  'CORS_ALLOWED_ORIGINS',
  'SOCKET_CORS_ALLOWED_ORIGINS',
  ...Object.keys(PATHS),
  ...MAIL_KEYS,
  'E2E_MAILPIT_API_URL',
  ...EXTERNAL_FLAG_KEYS,
  ...ACCOUNT_KEYS,
  ...ANALYTICS_KEYS,
];
const OPTIONAL_FILE_KEYS = [
  'JWT_EXPIRES_IN',
  'GUEST_ACCESS_TTL',
  'GUEST_REFRESH_TTL',
  'SIGNUP_TOKEN_TTL_MINUTES',
  'RESET_TOKEN_TTL_MINUTES',
  'LINE_OAUTH_COOKIE_TTL_MS',
  'LOGIN_RATE_LIMIT_WINDOW_MS',
  'LOGIN_RATE_LIMIT_MAX',
  'RESET_MAIL_RATE_LIMIT_WINDOW_MS',
  'RESET_MAIL_RATE_LIMIT_MAX',
  'RESET_MAIL_IP_RATE_LIMIT_MAX',
  'GOOGLE_TRANSLATE_API_LIMIT',
  'GOOGLE_TRANSLATE_LOCATION',
  'ONESIGNAL_HOST',
  'ONESIGNAL_PORT',
  'ONESIGNAL_PATH',
];
const FILE_ENV_KEYS = new Set([
  ...REQUIRED_KEYS,
  ...OPTIONAL_FILE_KEYS,
  ...PROVIDER_ENABLE_KEYS,
]);

const APPLICATION_NAMES = new Set([
  'NODE_ENV',
  'PORT',
  'VUE_APP_APPNAME',
  'VUE_APP_APPURL',
  'DB_CONNECT',
  'CORS_ALLOWED_ORIGINS',
  'SOCKET_CORS_ALLOWED_ORIGINS',
  'DIST_PATH',
  'MEDIA_PATH',
  'PROFILE_PATH',
  'MAIL_DELIVERY_MODE',
  'SEND_MAIL_HOST',
  'SEND_MAIL_PORT',
  'NO_REPLY_MAIL',
  // 廃止済みのAI解析設定も除外し、開発用シェルからE2E環境へ持ち込ませない。
  'SUPPORT_USER_ID',
]);
const APPLICATION_PREFIXES = [
  'E2E_',
  'GOOGLE_',
  'LINE_',
  'ONESIGNAL_',
  'OPENAI_',
  'JWT_',
  'GUEST_',
  'GA4_',
  'SIGNUP_',
  'LOGIN_',
  'RESET_',
  'EXTERNAL_',
];

const hasValue = (value) => typeof value === 'string' && value.trim() !== '';
const isDummyMail = (value) => /^[^@\s]+@example\.invalid$/.test(value);
const isApplicationKey = (key) =>
  APPLICATION_NAMES.has(key) || APPLICATION_PREFIXES.some((prefix) => key.startsWith(prefix));
const runtimePath = (directory) => path.join(RUNTIME_ROOT, directory);

const assertDatabaseUri = (databaseUri) => {
  let parsed;
  try {
    parsed = new URL(databaseUri);
  } catch (_error) {
    parsed = null;
  }
  const hostname = parsed ? parsed.hostname.toLowerCase() : '';
  if (!parsed || parsed.protocol !== 'mongodb:' || !DATABASE_HOSTS.includes(hostname)) {
    throw new Error('E2E用DBには、許可されたローカルホストのmongodb://接続先を指定してください。');
  }
  if (parsed.username || parsed.password) {
    throw new Error('E2E用DBのURIに認証情報を含めないでください。');
  }
  if (decodeURIComponent(parsed.pathname.replace(/^\/+/, '')) !== DATABASE_NAME) {
    throw new Error(`E2E用バックエンドのDB名は${DATABASE_NAME}にしてください。`);
  }
};

const validateMailpitEnvironment = (environment) => {
  if (!MAILPIT_HOSTS.includes(environment.SEND_MAIL_HOST)) {
    throw new Error('SEND_MAIL_HOSTにはmailpitまたはループバックアドレスを指定してください。');
  }
  let apiUrl;
  try {
    apiUrl = new URL(environment.E2E_MAILPIT_API_URL);
  } catch (_error) {
    throw new Error('E2E_MAILPIT_API_URLには有効なURLを指定してください。');
  }
  const apiHost = apiUrl.hostname === '[::1]' ? '::1' : apiUrl.hostname;
  if (
    apiUrl.protocol !== 'http:' || !MAILPIT_HOSTS.includes(apiHost) || apiUrl.port !== '8025' ||
    apiUrl.username || apiUrl.password || apiUrl.pathname !== '/' || apiUrl.search || apiUrl.hash
  ) {
    throw new Error('E2E_MAILPIT_API_URLにはmailpitまたはループバックのHTTP・8025番ポートを指定してください。');
  }
};

const readAccounts = (environment) => {
  const missing = ACCOUNT_KEYS.filter((key) => !hasValue(environment[key]));
  if (missing.length > 0) {
    throw new Error(`E2E用固定アカウントの設定が不足しています: ${missing.join(', ')}。`);
  }
  const accounts = Object.fromEntries(
    Object.entries(ACCOUNT_FIELDS).map(([role, [username, mail, password]]) => [
      role,
      {
        username: environment[username].trim(),
        mail: environment[mail].trim(),
        password: environment[password],
      },
    ])
  );
  const accountValues = Object.values(accounts);
  const invalidMail = accountValues.filter(({ mail }) => !isDummyMail(mail));
  const invalidPassword = accountValues.filter(({ password }) => {
    const length = password.length;
    return length < 8 || length > 16;
  });
  if (invalidMail.length > 0) throw new Error('E2E用固定アカウントのメールドメインはexample.invalidにしてください。');
  if (new Set(accountValues.map(({ mail }) => mail)).size !== accountValues.length) {
    throw new Error('E2E用固定アカウントのメールアドレスは重複させないでください。');
  }
  if (invalidPassword.length > 0) {
    throw new Error('E2E用固定アカウントのパスワードは8～16文字にしてください。');
  }
  return accounts;
};

const validateFileEnvironment = (environment) => {
  const unsupported = Object.keys(environment).filter((key) => !FILE_ENV_KEYS.has(key));
  if (unsupported.length > 0) {
    throw new Error(`backend/.env.e2eに未対応の項目があります: ${unsupported.join(', ')}。`);
  }
  const missing = REQUIRED_KEYS.filter((key) => !hasValue(environment[key]));
  if (missing.length > 0) {
    throw new Error(`backend/.env.e2eの設定が不足しています: ${missing.join(', ')}。`);
  }
  if (environment.NODE_ENV !== 'development') {
    throw new Error('E2E用バックエンドにはbackend/.env.e2eでNODE_ENV=developmentを指定してください。');
  }
  assertDatabaseUri(environment.DB_CONNECT);

  Object.entries(EXACT_VALUES).forEach(([key, expected]) => {
    if (environment[key] !== expected) throw new Error(`${key}は${expected}にしてください。`);
  });
  validateMailpitEnvironment(environment);
  if (!isDummyMail(environment.NO_REPLY_MAIL)) {
    throw new Error('NO_REPLY_MAILのドメインはexample.invalidにしてください。');
  }
  if (environment[ANALYTICS_MEASUREMENT_ID_KEY] !== ANALYTICS_DUMMY_MEASUREMENT_ID) {
    throw new Error('GA4_MEASUREMENT_IDには.env.e2e.exampleの公開ダミー値を指定してください。');
  }
  if (environment[ANALYTICS_SECRET_KEY] !== ANALYTICS_DUMMY_SECRET) {
    throw new Error('GA4_USER_ID_SECRETには.env.e2e.exampleの公開ダミー値を指定してください。');
  }

  Object.entries(PATHS).forEach(([key, directory]) => {
    const expected = runtimePath(directory);
    if (path.resolve(BACKEND_ROOT, environment[key]) !== expected) {
      throw new Error(`${key}の解決先は${expected}にしてください。`);
    }
  });
  const configuredProviders = PROVIDER_ENABLE_KEYS.filter((key) => hasValue(environment[key]));
  if (configuredProviders.length > 0) {
    throw new Error(`E2E用の外部サービス設定は空にしてください: ${configuredProviders.join(', ')}。`);
  }
  readAccounts(environment);
};

const readEnvironmentFile = ({
  envFilePath = ENV_FILE,
  lstat = fs.lstatSync,
  realpath = fs.realpathSync,
  readFile = fs.readFileSync,
  parse = parseEnv,
} = {}) => {
  if (path.resolve(envFilePath) !== ENV_FILE) {
    throw new Error('E2E用バックエンドにはbackend/.env.e2eを使用してください。');
  }
  let stats;
  let resolved;
  try {
    stats = lstat(ENV_FILE);
    resolved = realpath(ENV_FILE);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('backend/.env.e2eがありません。.env.e2e.exampleをコピーし、E2E環境に合わせて設定してください。');
    }
    throw new Error('backend/.env.e2eが通常ファイルとして必要です。');
  }
  if (stats.isSymbolicLink() || !stats.isFile() || path.resolve(resolved) !== ENV_FILE) {
    throw new Error('backend/.env.e2eが通常ファイルとして必要です。');
  }
  let environment;
  try {
    environment = parse(readFile(ENV_FILE, 'utf8'));
  } catch (_error) {
    throw new Error('backend/.env.e2eを読み取れないか、解析できませんでした。');
  }
  validateFileEnvironment(environment);
  return environment;
};

const validateRuntimeDirectories = ({ lstat = fs.lstatSync, realpath = fs.realpathSync } = {}) => {
  [RUNTIME_ROOT, ...RUNTIME_DIRECTORIES.map(runtimePath)].forEach((expected) => {
    let stats;
    let resolved;
    try {
      stats = lstat(expected);
      resolved = realpath(expected);
    } catch (_error) {
      throw new Error('E2Eの実行用パスには、チェックアウト直下の実ディレクトリを指定してください。');
    }
    if (stats.isSymbolicLink() || !stats.isDirectory() || path.resolve(resolved) !== expected) {
      throw new Error('E2Eの実行用パスには、チェックアウト直下の実ディレクトリを指定してください。');
    }
  });
};

const loadE2EEnvironment = ({ environment = process.env, profile = 'core', ...dependencies } = {}) => {
  Object.keys(environment).filter(isApplicationKey).forEach((key) => delete environment[key]);
  if (!PROFILES.includes(profile)) {
    throw new Error('E2E用バックエンドのプロファイルはcore、mail、analyticsのいずれかにしてください。');
  }

  const fileEnvironment = readEnvironmentFile(dependencies);
  validateRuntimeDirectories(dependencies);

  Object.entries(fileEnvironment)
    .filter(([key]) => FILE_ENV_KEYS.has(key) && !ANALYTICS_KEYS.includes(key))
    .forEach(([key, value]) => { environment[key] = value; });
  Object.entries(PATHS).forEach(([key, directory]) => { environment[key] = runtimePath(directory); });
  if (profile !== 'mail') MAIL_KEYS.forEach((key) => delete environment[key]);
  if (profile === 'mail') environment.EXTERNAL_MAIL_DELIVERY_ENABLED = 'true';
  if (profile === 'analytics') {
    environment.EXTERNAL_GOOGLE_ANALYTICS_ENABLED = 'true';
    ANALYTICS_KEYS.forEach((key) => { environment[key] = fileEnvironment[key]; });
  }
  return environment;
};

const resolveE2EResetEnvironment = (environment = process.env) => {
  if (environment.NODE_ENV !== 'development') {
    throw new Error('E2E用DBの初期化にはNODE_ENV=developmentが必要です。');
  }
  if (!hasValue(environment.DB_CONNECT)) throw new Error('必須の環境変数が未設定です: DB_CONNECT');
  const databaseUri = environment.DB_CONNECT.trim();
  assertDatabaseUri(databaseUri);
  return { databaseUri, accounts: readAccounts(environment) };
};

const assertE2EResetConnection = (connection) => {
  if (!connection || !connection.db || connection.db.databaseName !== DATABASE_NAME) {
    throw new Error(`E2E用DBの初期化対象は${DATABASE_NAME}に限定されています。`);
  }
  return connection.db;
};

module.exports = { assertE2EResetConnection, loadE2EEnvironment, resolveE2EResetEnvironment };
