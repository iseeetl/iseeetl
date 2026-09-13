const fs = require('fs');
const path = require('path');

const INTEGRATION_ROOT = __dirname;
const BACKEND_ROOT = path.resolve(INTEGRATION_ROOT, '../..');

const EXTERNAL_MOCKED_SPECS = [
  'controllers/spam.controller.int.test.js',
  'routes/auth.recovery.int.test.js',
  'routes/auth.register-reset.int.test.js',
  'routes/auth.route.int.test.js',
  'routes/floor-room.crud.int.test.js',
  'routes/guest.timeline.route.int.test.js',
  'routes/recovery.guards.int.test.js',
  'routes/timeline.core.int.test.js',
  'routes/timeline.resource-post.int.test.js',
  'routes/timeline.transcription.route.int.test.js',
  'routes/upload.media.int.test.js',
  'routes/user.route.int.test.js',
  'routes/v1.mutation-main-service.int.test.js',
  'routes/v1.route.int.test.js',
  'services/onesignal.notification.int.test.js',
  'services/timelinePostSave.int.test.js',
  'services/transcription.service.int.test.js',
];

const walkJavaScriptFiles = (rootDir, relativeDir = '') => {
  const currentDir = path.join(rootDir, relativeDir);
  return fs
    .readdirSync(currentDir, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.posix.join(relativeDir.split(path.sep).join(path.posix.sep), entry.name);
      if (entry.isDirectory()) return walkJavaScriptFiles(rootDir, relativePath);
      return entry.isFile() && entry.name.endsWith('.js') ? [relativePath] : [];
    })
    .sort();
};

const listIntegrationSpecs = (rootDir = INTEGRATION_ROOT) =>
  walkJavaScriptFiles(rootDir).filter((filePath) => filePath.endsWith('.int.test.js'));

const listNonstandardIntegrationTests = (rootDir = INTEGRATION_ROOT) =>
  walkJavaScriptFiles(rootDir).filter(
    (filePath) =>
      !filePath.endsWith('.int.test.js') &&
      (filePath.endsWith('.test.js') || filePath.endsWith('.spec.js'))
  );

const listDirectJestMockSpecs = (rootDir = INTEGRATION_ROOT) =>
  listIntegrationSpecs(rootDir).filter((filePath) =>
    fs.readFileSync(path.join(rootDir, filePath), 'utf8').includes('jest.mock(')
  );

const validateIntegrationManifest = ({
  allSpecs = listIntegrationSpecs(),
  externalMockedSpecs = EXTERNAL_MOCKED_SPECS,
  directJestMockSpecs = listDirectJestMockSpecs(),
  nonstandardTests = listNonstandardIntegrationTests(),
} = {}) => {
  const duplicateEntries = externalMockedSpecs.filter(
    (filePath, index) => externalMockedSpecs.indexOf(filePath) !== index
  );
  const missingEntries = externalMockedSpecs.filter((filePath) => !allSpecs.includes(filePath));
  const unclassifiedMockSpecs = directJestMockSpecs.filter(
    (filePath) => !externalMockedSpecs.includes(filePath)
  );
  const incorrectlyClassifiedSpecs = externalMockedSpecs.filter(
    (filePath) => !directJestMockSpecs.includes(filePath)
  );

  const problems = [
    duplicateEntries.length ? `external-mockedの項目が重複しています: ${duplicateEntries.join(', ')}` : null,
    missingEntries.length ? `external-mockedのテストが見つかりません: ${missingEntries.join(', ')}` : null,
    unclassifiedMockSpecs.length ? `jest.mockを使用するテストが未分類です: ${unclassifiedMockSpecs.join(', ')}` : null,
    incorrectlyClassifiedSpecs.length
      ? `external-mockedのテストにjest.mockがありません: ${incorrectlyClassifiedSpecs.join(', ')}`
      : null,
    nonstandardTests.length ? `Integrationテストのファイル名が規則に沿っていません: ${nonstandardTests.join(', ')}` : null,
  ].filter(Boolean);

  if (problems.length) {
    throw new Error(`Integrationテストの一覧が不正です:
- ${problems.join('\n- ')}`);
  }

  const externalMocked = [...externalMockedSpecs].sort();
  const remaining = allSpecs.filter((filePath) => !externalMocked.includes(filePath)).sort();
  return {
    all: [...allSpecs].sort(),
    externalMocked,
    remaining,
  };
};

const toBackendRelativePath = (filePath) =>
  path.posix.join('tests/integration', filePath.split(path.sep).join(path.posix.sep));

const resolveIntegrationGroup = (groupName) => {
  const groups = validateIntegrationManifest();
  if (groupName === 'all') return groups.all.map(toBackendRelativePath);
  if (groupName === 'external-mocked') return groups.externalMocked.map(toBackendRelativePath);
  if (groupName === 'remaining') return groups.remaining.map(toBackendRelativePath);
  throw new Error(`未定義のIntegrationテストグループです: ${groupName}`);
};

module.exports = {
  BACKEND_ROOT,
  EXTERNAL_MOCKED_SPECS,
  listIntegrationSpecs,
  listNonstandardIntegrationTests,
  listDirectJestMockSpecs,
  validateIntegrationManifest,
  resolveIntegrationGroup,
};
