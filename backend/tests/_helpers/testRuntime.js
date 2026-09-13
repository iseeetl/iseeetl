const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '../../..');
const runtimeContainer = path.join(repositoryRoot, '.test-runtime');

const invalidPath = () => new Error('テスト実行用のパスが不正です');

const isMissing = (error) => error?.code === 'ENOENT';

const assertRelativeSegment = (segment) => {
  if (
    typeof segment !== 'string' ||
    path.isAbsolute(segment) ||
    path.win32.isAbsolute(segment) ||
    segment.split(/[\\/]+/).includes('..')
  ) {
    throw invalidPath();
  }
};

const trailingSlash = (dirPath) => `${dirPath}${path.sep}`;

const assertStrictRuntimeChild = (relativeRoot) => {
  if (
    typeof relativeRoot !== 'string' ||
    relativeRoot.length === 0 ||
    path.isAbsolute(relativeRoot) ||
    path.win32.isAbsolute(relativeRoot)
  ) {
    throw invalidPath();
  }

  const components = relativeRoot.split(/[\\/]+/);
  if (components.some((component) => component === '' || component === '.' || component === '..')) {
    throw invalidPath();
  }

  const resolved = path.resolve(runtimeContainer, relativeRoot);
  const relative = path.relative(runtimeContainer, resolved);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw invalidPath();
  }
  return resolved;
};

const createRuntimeApi = (runtimeRoot) => {
  const assertWithinRuntime = (candidate) => {
    const relative = path.relative(runtimeRoot, candidate);
    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return;
    throw invalidPath();
  };

  const assertExistingDirectories = (candidate) => {
    assertWithinRuntime(candidate);

    const relative = path.relative(runtimeContainer, candidate);
    const components = relative === '' ? [] : relative.split(path.sep);
    const pathsToCheck = [
      runtimeContainer,
      ...components.map((_, index) =>
        path.join(runtimeContainer, ...components.slice(0, index + 1))
      ),
    ];

    for (const currentPath of pathsToCheck) {
      let stats;
      try {
        stats = fs.lstatSync(currentPath);
      } catch (error) {
        if (isMissing(error)) return;
        throw error;
      }

      if (stats.isSymbolicLink() || !stats.isDirectory()) throw invalidPath();
    }
  };

  const normalizeRuntimePath = (candidate) => {
    if (typeof candidate !== 'string') throw invalidPath();
    const resolved = path.resolve(candidate);
    assertWithinRuntime(resolved);
    assertExistingDirectories(resolved);
    return resolved;
  };

  const testRuntimePath = (...segments) => {
    segments.forEach(assertRelativeSegment);
    return normalizeRuntimePath(path.resolve(runtimeRoot, ...segments));
  };

  const ensureDirSync = (dirPath) => {
    const resolved = normalizeRuntimePath(dirPath);
    fs.mkdirSync(resolved, { recursive: true });
    assertExistingDirectories(resolved);
    return resolved;
  };

  const ensureDir = async (dirPath) => {
    const resolved = normalizeRuntimePath(dirPath);
    await fs.promises.mkdir(resolved, { recursive: true });
    assertExistingDirectories(resolved);
    return resolved;
  };

  const createTestTempDir = (prefix) => {
    if (
      typeof prefix !== 'string' ||
      prefix.length === 0 ||
      path.isAbsolute(prefix) ||
      path.win32.isAbsolute(prefix) ||
      /[\\/]/.test(prefix) ||
      prefix === '.' ||
      prefix === '..'
    ) {
      throw invalidPath();
    }

    const parent = ensureDirSync(testRuntimePath('tmpdirs'));
    const tempDir = fs.mkdtempSync(path.join(parent, `${prefix}-`));
    assertExistingDirectories(tempDir);
    return tempDir;
  };

  const removeDirSafe = async (dirPath) => {
    const resolved = normalizeRuntimePath(dirPath);
    let stats;
    try {
      stats = await fs.promises.lstat(resolved);
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }

    if (stats.isSymbolicLink() || !stats.isDirectory()) throw invalidPath();
    await fs.promises.rm(resolved, { recursive: true, force: true });
  };

  return {
    testRuntimePath,
    ensureDirSync,
    ensureDir,
    createTestTempDir,
    removeDirSafe,
    trailingSlash,
  };
};

const createTestRuntime = (relativeRoot) => {
  const runtimeRoot = assertStrictRuntimeChild(relativeRoot);
  const runtime = createRuntimeApi(runtimeRoot);
  runtime.testRuntimePath();
  return runtime;
};

const defaultRuntime = createRuntimeApi(path.join(runtimeContainer, 'backend'));

module.exports = {
  ...defaultRuntime,
  createTestRuntime,
};
