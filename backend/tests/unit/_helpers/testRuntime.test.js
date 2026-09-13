const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const defaultRuntime = require('../../_helpers/testRuntime');
const { createTestRuntime } = defaultRuntime;

const repositoryRoot = path.resolve(__dirname, '../../../..');
const runtimeContainer = path.join(repositoryRoot, '.test-runtime');
const defaultRuntimeRoot = path.join(runtimeContainer, 'backend');
const runRelativeRoot = `test-runtime-unit-${randomUUID()}`;
const runRoot = path.join(runtimeContainer, runRelativeRoot);
const runtimeRelativeRoot = path.join(runRelativeRoot, 'backend');
const runtimeRoot = path.join(runRoot, 'backend');
const siblingRoot = path.join(runRoot, 'backend-sibling');
const outsideRoot = path.join(runRoot, 'outside-runtime');
let runtime;

const pathState = (targetPath) => {
  try {
    const stats = fs.lstatSync(targetPath);
    return {
      device: stats.dev,
      inode: stats.ino,
      mode: stats.mode,
      symbolicLink: stats.isSymbolicLink(),
      directory: stats.isDirectory(),
    };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};

const defaultRuntimeInitialState = pathState(defaultRuntimeRoot);

const removeOwnedFixture = (fixturePath) => {
  const relative = path.relative(runRoot, fixturePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('テストが自身の管理対象外のデータを削除しようとしました');
  }

  let stats;
  try {
    stats = fs.lstatSync(fixturePath);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  if (stats.isSymbolicLink()) {
    fs.unlinkSync(fixturePath);
  } else {
    fs.rmSync(fixturePath, { recursive: true, force: true });
  }
};

const resetOwnedFixtures = () => {
  removeOwnedFixture(runRoot);
  const runRuntime = createTestRuntime(runRelativeRoot);
  runRuntime.ensureDirSync(runRuntime.testRuntimePath());
  runtime = createTestRuntime(runtimeRelativeRoot);
  runtime.ensureDirSync(runtime.testRuntimePath());
};

beforeEach(resetOwnedFixtures);
afterEach(() => removeOwnedFixture(runRoot));
afterAll(() => {
  removeOwnedFixture(runRoot);
  expect(pathState(defaultRuntimeRoot)).toEqual(defaultRuntimeInitialState);
});

describe('テスト用ファイル領域の管理', () => {
  test('既定の保存先をリポジトリ内のバックエンドテスト領域に固定する', () => {
    expect(defaultRuntime.testRuntimePath()).toBe(defaultRuntimeRoot);
    expect(defaultRuntime).toEqual(
      expect.objectContaining({
        ensureDirSync: expect.any(Function),
        ensureDir: expect.any(Function),
        createTestTempDir: expect.any(Function),
        removeDirSafe: expect.any(Function),
        trailingSlash: expect.any(Function),
      })
    );
  });

  test('指定されたテスト領域と配下のパスを解決する', () => {
    expect(runtime.testRuntimePath()).toBe(runtimeRoot);
    expect(runtime.testRuntimePath('fixtures', 'media')).toBe(
      path.join(runtimeRoot, 'fixtures', 'media')
    );
  });

  test('同期・非同期のディレクトリ作成と一意な一時ディレクトリ作成に対応する', async () => {
    const syncDir = runtime.ensureDirSync(runtime.testRuntimePath('fixtures', 'sync'));
    const asyncDir = await runtime.ensureDir(runtime.testRuntimePath('fixtures', 'async'));
    const tempDir = runtime.createTestTempDir('fixture');

    expect(fs.statSync(syncDir).isDirectory()).toBe(true);
    expect(fs.statSync(asyncDir).isDirectory()).toBe(true);
    expect(fs.statSync(tempDir).isDirectory()).toBe(true);
    expect(path.dirname(tempDir)).toBe(path.join(runtimeRoot, 'tmpdirs'));
    expect(runtime.trailingSlash(syncDir)).toBe(`${syncDir}${path.sep}`);
  });

  test.each([
    ['絶対パス', [path.join(path.sep, 'outside')]],
    ['Windowsの絶対パス', ['C:\\outside']],
    ['親ディレクトリへの参照', ['fixtures', '..', 'outside']],
    ['階層内の親ディレクトリへの参照', ['fixtures/../outside']],
  ])('%sを含むパスを拒否する', (_label, segments) => {
    expect(() => runtime.testRuntimePath(...segments)).toThrow('テスト実行用のパスが不正です');
  });

  test.each([
    ['空のルート', ''],
    ['コンテナのルート', '.'],
    ['絶対パスのルート', path.join(path.sep, 'outside')],
    ['Windowsの絶対パスのルート', 'C:\\outside'],
    ['親ディレクトリへの参照', path.join('fixtures', '..', '..', 'outside')],
  ])('指定された保存先の%sを拒否する', (_label, relativeRoot) => {
    expect(() => createTestRuntime(relativeRoot)).toThrow('テスト実行用のパスが不正です');
  });

  test('隣接・領域外のディレクトリは変更せず、削除を拒否する', async () => {
    fs.mkdirSync(siblingRoot, { recursive: true });
    fs.mkdirSync(outsideRoot, { recursive: true });
    const siblingSentinel = path.join(siblingRoot, 'sentinel.txt');
    const outsideSentinel = path.join(outsideRoot, 'sentinel.txt');
    fs.writeFileSync(siblingSentinel, 'sibling');
    fs.writeFileSync(outsideSentinel, 'outside');

    await expect(runtime.removeDirSafe(siblingRoot)).rejects.toThrow(
      'テスト実行用のパスが不正です'
    );
    await expect(runtime.removeDirSafe(outsideRoot)).rejects.toThrow(
      'テスト実行用のパスが不正です'
    );
    expect(fs.readFileSync(siblingSentinel, 'utf8')).toBe('sibling');
    expect(fs.readFileSync(outsideSentinel, 'utf8')).toBe('outside');
  });

  test('指定したテスト領域内のディレクトリだけを削除する', async () => {
    const fixtureDir = runtime.ensureDirSync(runtime.testRuntimePath('removable'));
    fs.writeFileSync(path.join(fixtureDir, 'sentinel.txt'), 'fixture');

    await runtime.removeDirSafe(fixtureDir);

    expect(fs.existsSync(fixtureDir)).toBe(false);
  });

  test('テスト領域のルートがシンボリックリンクなら拒否する', () => {
    removeOwnedFixture(runtimeRoot);
    fs.mkdirSync(outsideRoot, { recursive: true });
    fs.symlinkSync(outsideRoot, runtimeRoot, 'dir');

    expect(() => createTestRuntime(runtimeRelativeRoot)).toThrow('テスト実行用のパスが不正です');
  });

  test('テスト領域のルートが通常ファイルなら拒否する', () => {
    removeOwnedFixture(runtimeRoot);
    fs.writeFileSync(runtimeRoot, 'not-a-directory');

    expect(() => createTestRuntime(runtimeRelativeRoot)).toThrow('テスト実行用のパスが不正です');
  });

  test('テスト領域のルートまでのパスにシンボリックリンクがあれば拒否する', () => {
    const target = path.join(runRoot, 'link-target');
    const link = path.join(runRoot, 'linked-parent');
    fs.mkdirSync(target, { recursive: true });
    fs.symlinkSync(target, link, 'dir');

    expect(() =>
      createTestRuntime(path.join(runRelativeRoot, 'linked-parent', 'backend'))
    ).toThrow('テスト実行用のパスが不正です');
  });

  test('子ディレクトリのシンボリックリンクを拒否し、参照先を保持する', async () => {
    fs.mkdirSync(outsideRoot, { recursive: true });
    const sentinel = path.join(outsideRoot, 'sentinel.txt');
    fs.writeFileSync(sentinel, 'outside');
    fs.symlinkSync(outsideRoot, path.join(runtimeRoot, 'linked'), 'dir');

    expect(() => runtime.testRuntimePath('linked', 'child')).toThrow(
      'テスト実行用のパスが不正です'
    );
    await expect(runtime.removeDirSafe(path.join(runtimeRoot, 'linked'))).rejects.toThrow(
      'テスト実行用のパスが不正です'
    );
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('outside');
  });

  test('ディレクトリとして使うパスに通常ファイルがあれば拒否する', () => {
    fs.writeFileSync(path.join(runtimeRoot, 'file'), 'not-a-directory');

    expect(() => runtime.testRuntimePath('file', 'child')).toThrow(
      'テスト実行用のパスが不正です'
    );
  });

  test('指定された2つのテスト領域を分離する', async () => {
    const first = createTestRuntime(path.join(runRelativeRoot, 'first'));
    const second = createTestRuntime(path.join(runRelativeRoot, 'second'));
    const firstRoot = first.ensureDirSync(first.testRuntimePath());
    const secondRoot = second.ensureDirSync(second.testRuntimePath());
    const secondSentinel = path.join(secondRoot, 'sentinel.txt');
    fs.writeFileSync(path.join(firstRoot, 'sentinel.txt'), 'first');
    fs.writeFileSync(secondSentinel, 'second');

    await first.removeDirSafe(firstRoot);

    expect(firstRoot).not.toBe(secondRoot);
    expect(fs.readFileSync(secondSentinel, 'utf8')).toBe('second');
  });
});
