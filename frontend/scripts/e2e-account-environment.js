const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');

const E2E_ENV_FILE = path.resolve(__dirname, '../../backend/.env.e2e');
const ACCOUNT_KEYS = Object.freeze([
  'E2E_ADMIN_MAIL',
  'E2E_ADMIN_PASSWORD',
  'E2E_FLOOR_EDITOR_MAIL',
  'E2E_FLOOR_EDITOR_PASSWORD',
  'E2E_USER_MAIL',
  'E2E_USER_PASSWORD',
]);
const NIGHTWATCH_ENV_KEYS = Object.freeze([
  ...ACCOUNT_KEYS,
  'E2E_MAILPIT_API_URL',
]);

const requireEnvironmentFile = ({
  envFilePath = E2E_ENV_FILE,
  lstat = fs.lstatSync,
  realpath = fs.realpathSync,
} = {}) => {
  if (typeof envFilePath !== 'string' || path.resolve(envFilePath) !== E2E_ENV_FILE) {
    throw new Error('フロントエンドのE2Eにはbackend/.env.e2eを使用してください。');
  }

  let stats;
  let resolvedPath;
  try {
    stats = lstat(E2E_ENV_FILE);
    resolvedPath = realpath(E2E_ENV_FILE);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('backend/.env.e2eがありません。.env.e2e.exampleをコピーし、E2E環境に合わせて設定してください。');
    }
    throw new Error('backend/.env.e2eが通常ファイルとして必要です。');
  }
  if (stats.isSymbolicLink() || !stats.isFile() || path.resolve(resolvedPath) !== E2E_ENV_FILE) {
    throw new Error('backend/.env.e2eが通常ファイルとして必要です。');
  }

  return E2E_ENV_FILE;
};

const readEnvironmentFile = ({
  readFile = fs.readFileSync,
  parse = parseEnv,
  ...fileDependencies
} = {}) => {
  const envFilePath = requireEnvironmentFile(fileDependencies);
  let fileEnvironment;
  try {
    fileEnvironment = parse(readFile(envFilePath, 'utf8'));
  } catch (_error) {
    throw new Error('backend/.env.e2eを読み取れないか、解析できませんでした。');
  }

  const missingKeys = NIGHTWATCH_ENV_KEYS.filter((key) => {
    const value = fileEnvironment && fileEnvironment[key];
    return typeof value !== 'string' || value.trim() === '';
  });
  if (missingKeys.length > 0) {
    throw new Error(`backend/.env.e2eの設定が不足しています: ${missingKeys.join(', ')}。`);
  }

  return fileEnvironment;
};

const loadE2EAccountEnvironment = ({
  environment = process.env,
  ...fileDependencies
} = {}) => {
  const fileEnvironment = readEnvironmentFile(fileDependencies);

  NIGHTWATCH_ENV_KEYS.forEach((key) => {
    environment[key] = fileEnvironment[key];
  });
  return environment;
};

module.exports = {
  ACCOUNT_KEYS,
  E2E_ENV_FILE,
  NIGHTWATCH_ENV_KEYS,
  loadE2EAccountEnvironment,
};
