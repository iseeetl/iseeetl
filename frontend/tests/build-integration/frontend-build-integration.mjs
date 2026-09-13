#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildFrontend } from '../../scripts/vue3-build.mjs';

const repositoryRoot = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const execFileAsync = promisify(execFile);
const worktreeFrontendDist = path.join(repositoryRoot, 'frontend/dist');
const defaultTemporaryParent = path.join(
  repositoryRoot,
  '.test-runtime/frontend-build'
);
const requestedTemporaryParent = path.resolve(
  process.env.ISEEETL_TEST_TMP_PARENT || defaultTemporaryParent
);

const resolveProspectivePath = async (targetPath) => {
  const suffix = [];
  let existing = path.resolve(targetPath);
  while (true) {
    try {
      const canonical = await fs.realpath(existing);
      return path.join(canonical, ...suffix);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(existing);
      if (parent === existing) throw error;
      suffix.unshift(path.basename(existing));
      existing = parent;
    }
  }
};

const isSameOrDescendant = (parentPath, candidatePath) => {
  const relative = path.relative(parentPath, candidatePath);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
};

const isStrictDescendant = (parentPath, candidatePath) =>
  parentPath !== candidatePath && isSameOrDescendant(parentPath, candidatePath);

const canonicalRepositoryRoot = await fs.realpath(repositoryRoot);
const allowedRepositoryParent = path.join(
  canonicalRepositoryRoot,
  '.test-runtime/frontend-build'
);

const ensureSafeTemporaryParent = async (
  requestedPath,
  { homePath = os.homedir() } = {}
) => {
  const lexical = path.resolve(requestedPath);
  if (lexical === path.parse(lexical).root) {
    throw new Error('テスト用一時ディレクトリの親パスが安全条件を満たしません');
  }
  const canonical = await resolveProspectivePath(lexical);
  if (canonical !== lexical) {
    throw new Error('テスト用一時ディレクトリの親パスが安全条件を満たしません');
  }

  if (homePath) {
    const resolvedHomePath = path.resolve(homePath);
    if (isSameOrDescendant(canonical, resolvedHomePath)) {
      throw new Error('テスト用一時ディレクトリの親パスが安全条件を満たしません');
    }
  }

  if (isSameOrDescendant(canonical, canonicalRepositoryRoot)) {
    throw new Error('テスト用一時ディレクトリの親パスが安全条件を満たしません');
  }
  if (
    isSameOrDescendant(canonicalRepositoryRoot, canonical) &&
    !isSameOrDescendant(allowedRepositoryParent, canonical)
  ) {
    throw new Error('テスト用一時ディレクトリの親パスが安全条件を満たしません');
  }
  for (const directory of ['backend', 'frontend', 'docs']) {
    if (
      isSameOrDescendant(
        path.join(canonicalRepositoryRoot, directory),
        canonical
      )
    ) {
      throw new Error('テスト用一時ディレクトリの親パスが安全条件を満たしません');
    }
  }

  const existing = await fs.lstat(lexical).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing && (existing.isSymbolicLink() || !existing.isDirectory())) {
    throw new Error('テスト用一時ディレクトリの親パスが安全条件を満たしません');
  }

  await fs.mkdir(lexical, { recursive: true });
  const created = await fs.lstat(lexical);
  if (
    created.isSymbolicLink() ||
    !created.isDirectory() ||
    (await fs.realpath(lexical)) !== lexical
  ) {
    throw new Error('テスト用一時ディレクトリの親パスが安全条件を満たしません');
  }
  return lexical;
};

const removeOwnedTemporaryChild = async (parentPath, childPath) => {
  if (!childPath) return;
  const stat = await fs.lstat(childPath).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!stat) return;
  const canonical = await fs.realpath(childPath);
  if (
    stat.isSymbolicLink() ||
    !stat.isDirectory() ||
    !isStrictDescendant(parentPath, canonical) ||
    !path.basename(canonical).startsWith('frontend-build-')
  ) {
    throw new Error('テストが管理するディレクトリが安全条件を満たしません');
  }
  await fs.rm(canonical, { recursive: true, force: true });
};

const assertUnsafeTemporaryParent = async (candidatePath, options) => {
  try {
    await ensureSafeTemporaryParent(candidatePath, options);
  } catch {
    return;
  }
  throw new Error('安全条件を満たさない一時ディレクトリの親パスが許可されました');
};

const temporaryParent = await ensureSafeTemporaryParent(
  requestedTemporaryParent
);

const readManifest = async (outputDirectory) =>
  JSON.parse(
    await fs.readFile(
      path.join(outputDirectory, 'vue3-build-manifest.json'),
      'utf8'
    )
  );

const readGitStatus = async () => {
  const { stdout } = await execFileAsync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { cwd: repositoryRoot, maxBuffer: 10 * 1024 * 1024 }
  );
  return stdout;
};

const snapshotPaths = async (roots, { skipDirectoryNames = new Set() } = {}) => {
  const entries = [];
  const walk = async (absolutePath, relativePath) => {
    const stat = await fs.lstat(absolutePath).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!stat) {
      entries.push([relativePath, 'absent']);
      return;
    }
    if (stat.isSymbolicLink()) {
      entries.push([relativePath, 'symlink', await fs.readlink(absolutePath)]);
      return;
    }
    if (stat.isDirectory()) {
      if (skipDirectoryNames.has(path.basename(absolutePath))) {
        entries.push([relativePath, 'excluded-directory']);
        return;
      }
      entries.push([relativePath, 'directory']);
      const children = await fs.readdir(absolutePath);
      children.sort();
      for (const child of children) {
        await walk(
          path.join(absolutePath, child),
          relativePath ? `${relativePath}/${child}` : child
        );
      }
      return;
    }
    if (stat.isFile()) {
      const digest = crypto
        .createHash('sha256')
        .update(await fs.readFile(absolutePath))
        .digest('hex');
      entries.push([relativePath, 'file', digest]);
      return;
    }
    const otherType = stat.isBlockDevice()
      ? 'block-device'
      : stat.isCharacterDevice()
        ? 'character-device'
        : stat.isFIFO()
          ? 'fifo'
          : stat.isSocket()
            ? 'socket'
            : 'unknown';
    entries.push([relativePath, 'other', otherType, stat.mode & 0o7777]);
  };
  for (const root of roots) {
    await walk(root.absolutePath, root.relativePath);
  }
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(entries))
    .digest('hex');
};

const snapshotPath = async (targetPath) =>
  snapshotPaths([{ absolutePath: targetPath, relativePath: '.' }]);

const publicConfiguration = {
  VITE_APP_URL: 'https://frontend-build.example.invalid',
  VITE_ONESIGNAL_APP_ID: 'frontend-build-onesignal-app-id',
  VITE_GOOGLE_OAUTH_CLIENT_ID: 'frontend-build-google-client-id',
};
const forbiddenFrontendAnalyticsConfiguration = {
  VITE_GOOGLE_ANALYTICS_MEASUREMENT_ID: 'G-FRONTENDPOISON01',
};
const loadPublicTestEnvironment = () => ({
  ...publicConfiguration,
  ...forbiddenFrontendAnalyticsConfiguration,
});

const readBundledJavaScript = async (outputDirectory) => {
  const assetsDirectory = path.join(outputDirectory, 'assets');
  const sources = await Promise.all(
    (await fs.readdir(assetsDirectory))
      .filter((fileName) => fileName.endsWith('.js'))
      .map((fileName) => fs.readFile(path.join(assetsDirectory, fileName), 'utf8'))
  );
  return sources.join('\n');
};

const verifyPublicConfiguration = async (outputDirectory) => {
  const bundledSource = await readBundledJavaScript(outputDirectory);
  for (const value of Object.values(publicConfiguration)) {
    if (!bundledSource.includes(value)) {
      throw new Error('フロントエンドの公開設定が埋め込まれていません');
    }
  }
  for (const value of Object.values(forbiddenFrontendAnalyticsConfiguration)) {
    if (bundledSource.includes(value)) {
      throw new Error('フロントエンドの成果物にGA4の設定を含めないでください');
    }
  }
};

const verifyE2ERuntimeExcluded = async (outputDirectory) => {
  const bundledSource = await readBundledJavaScript(outputDirectory);
  if (bundledSource.includes('__ISEEETL_E2E__')) {
    throw new Error('製品ビルドにE2E用の診断機能を含めないでください');
  }
};

const verifyLicenses = async (outputDirectory) => {
  const entries = JSON.parse(await fs.readFile(path.join(outputDirectory, 'licenses.json'), 'utf8'));
  if (!Array.isArray(entries) || !entries.length || entries.some((entry) =>
    ['name', 'version', 'identifier', 'text'].some((key) => typeof entry[key] !== 'string' || !entry[key].trim())
  )) throw new Error('ライセンス一覧に名前・バージョン・ライセンス・本文が必要です');
  for (const name of ['@socket.io/component-emitter', '@vue/devtools-api', '@vuelidate/core', 'engine.io-client', 'engine.io-parser', 'socket.io-client']) {
    const entry = entries.find((item) => item.name === name);
    const installed = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'frontend/node_modules', name, 'package.json'), 'utf8'));
    if (!entry || entry.version !== installed.version || entry.identifier !== installed.license || !entry.text.includes('Copyright')) {
      throw new Error(`依存ライブラリのライセンス情報が不足しています: ${name}`);
    }
  }
  if (!(await readBundledJavaScript(outputDirectory)).includes('(c) Cure53 and other contributors')) {
    throw new Error('DOMPurifyの権利表示が生成コードから削除されています');
  }
};

const frontendPackage = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'frontend/package.json'), 'utf8'));
const releaseTag = `v${frontendPackage.version}`;
const releaseCommit = 'a'.repeat(40);
const releaseId = `${releaseTag}@${releaseCommit}`;
const frontendDistSnapshotBefore = await snapshotPath(worktreeFrontendDist);
const gitStatusBefore = await readGitStatus();

let operationError = null;
let invariantError = null;
let cleanupError = null;
let temporaryRoot = null;
let siblingRoot = null;
let siblingSentinel = null;

try {
  temporaryRoot = await fs.mkdtemp(
    path.join(temporaryParent, 'frontend-build-')
  );
  siblingRoot = await fs.mkdtemp(
    path.join(temporaryParent, 'frontend-build-')
  );
  if (temporaryRoot === siblingRoot) {
    throw new Error('ビルド用一時ディレクトリが重複しています');
  }
  siblingSentinel = path.join(siblingRoot, 'sentinel.txt');
  await fs.writeFile(siblingSentinel, 'sibling\n');
  await assertUnsafeTemporaryParent(path.parse(temporaryParent).root);
  await assertUnsafeTemporaryParent(repositoryRoot);
  await assertUnsafeTemporaryParent(path.join(repositoryRoot, 'backend'));
  const syntheticHome = path.join(siblingRoot, 'synthetic-home');
  await fs.mkdir(syntheticHome);
  await assertUnsafeTemporaryParent(syntheticHome, {
    homePath: syntheticHome,
  });
  await assertUnsafeTemporaryParent(siblingRoot, {
    homePath: syntheticHome,
  });
  const safeHomeDescendant = path.join(syntheticHome, 'allowed-child');
  if (
    (await ensureSafeTemporaryParent(safeHomeDescendant, {
      homePath: syntheticHome,
    })) !== safeHomeDescendant
  ) {
    throw new Error('ホーム配下の安全なパスが拒否されました');
  }
  const nonDirectoryParent = path.join(siblingRoot, 'not-a-directory');
  await fs.writeFile(nonDirectoryParent, 'fixture\n');
  await assertUnsafeTemporaryParent(nonDirectoryParent);
  const linkTarget = path.join(siblingRoot, 'link-target');
  const linkedParent = path.join(siblingRoot, 'linked-parent');
  await fs.mkdir(linkTarget);
  await fs.symlink(linkTarget, linkedParent, 'dir');
  await assertUnsafeTemporaryParent(linkedParent);

  const developmentOutput = path.join(temporaryRoot, 'development');
  const stagingOutput = path.join(temporaryRoot, 'staging');
  const productionOutput = path.join(temporaryRoot, 'production');
  const cacheDir = path.join(temporaryRoot, 'cache');

  await buildFrontend({
    mode: 'development',
    kind: 'local',
    releaseId: 'local@test',
    outDir: developmentOutput,
    cacheDir,
    loadEnvironment: loadPublicTestEnvironment,
  });
  const developmentManifest = await readManifest(developmentOutput);
  if (
    developmentManifest.kind !== 'local' ||
    developmentManifest.mode !== 'development' ||
    developmentManifest.releaseId !== 'local@test'
  ) {
    throw new Error('developmentビルドのマニフェストが不正です');
  }
  await verifyPublicConfiguration(developmentOutput);
  await verifyE2ERuntimeExcluded(developmentOutput);
  await verifyLicenses(developmentOutput);

  await buildFrontend({
    mode: 'staging',
    kind: 'local',
    releaseId: 'local@staging@test',
    outDir: stagingOutput,
    cacheDir,
    loadEnvironment: loadPublicTestEnvironment,
  });
  const stagingManifest = await readManifest(stagingOutput);
  if (
    stagingManifest.kind !== 'local' ||
    stagingManifest.mode !== 'staging' ||
    stagingManifest.releaseId !== 'local@staging@test'
  ) {
    throw new Error('stagingビルドのマニフェストが不正です');
  }
  await verifyPublicConfiguration(stagingOutput);
  await verifyE2ERuntimeExcluded(stagingOutput);
  await verifyLicenses(stagingOutput);

  await buildFrontend({
    mode: 'production',
    kind: 'release',
    releaseTag,
    releaseCommit,
    releaseId,
    outDir: productionOutput,
    cacheDir,
    loadEnvironment: loadPublicTestEnvironment,
  });
  const productionManifest = await readManifest(productionOutput);
  if (
    productionManifest.kind !== 'release' ||
    productionManifest.mode !== 'production' ||
    productionManifest.releaseTag !== releaseTag ||
    productionManifest.releaseCommit !== releaseCommit ||
    productionManifest.releaseId !== releaseId
  ) {
    throw new Error('productionビルドのマニフェストが不正です');
  }
  await verifyPublicConfiguration(productionOutput);
  await verifyE2ERuntimeExcluded(productionOutput);
  await verifyLicenses(productionOutput);

} catch (error) {
  operationError = error;
} finally {
  const cleanupErrors = [];
  try {
    await removeOwnedTemporaryChild(temporaryParent, temporaryRoot);
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    if (siblingSentinel && (await fs.readFile(siblingSentinel, 'utf8')) !== 'sibling\n') {
      throw new Error('同じ親パスにある別の一時ディレクトリが変更されました');
    }
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    await removeOwnedTemporaryChild(temporaryParent, siblingRoot);
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (cleanupErrors.length === 1) {
    [cleanupError] = cleanupErrors;
  } else if (cleanupErrors.length > 1) {
    cleanupError = new AggregateError(
      cleanupErrors,
      'フロントエンドのビルド用一時ディレクトリを削除できませんでした'
    );
  }
  try {
    if ((await snapshotPath(worktreeFrontendDist)) !== frontendDistSnapshotBefore) {
      throw new Error('作業ディレクトリのfrontend/distが変更されました');
    }
    if ((await readGitStatus()) !== gitStatusBefore) {
      throw new Error('ビルド結合テスト中に作業ディレクトリのGit状態が変わりました');
    }
  } catch (error) {
    invariantError = error;
  }
}

const errors = [operationError, cleanupError, invariantError].filter(Boolean);
if (errors.length > 1) {
  throw new AggregateError(
    errors,
    'フロントエンドのビルド検証、後片付け、またはソースが変わっていないことの確認に失敗しました'
  );
}
if (errors.length === 1) throw errors[0];

process.stdout.write('フロントエンドのビルド結合テストに成功しました\n');
