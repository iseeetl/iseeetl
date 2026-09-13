const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

const { isInsideBaseDir, resolveInsideBaseDir, resolveLeafFilePath } = require('../../utils/safePath');

const MEDIA_ID_PATTERN = /^[0-9a-f]{24}$/i;
const TEMP_DIRECTORY_NAME = '.ai-analysis-tmp';
const activeTempWorkspaces = new Set();

const mediaError = (code, message) => {
  const error = new Error(message || code);
  error.code = code;
  return error;
};

const assertNotAborted = (signal) => {
  if (!signal?.aborted) return;
  const error = new Error('Analysis media processing aborted');
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  throw error;
};

const normalizeId = (value) => {
  const normalized = value?.toString?.() || '';
  if (!MEDIA_ID_PATTERN.test(normalized)) throw mediaError('AI_ANALYSIS_MEDIA_PATH_INVALID');
  return normalized;
};

const resolveMediaFilePath = (mediaRoot, source, filename) => {
  if (!mediaRoot) throw mediaError('AI_ANALYSIS_MEDIA_ROOT_INVALID');
  if (!source?.floor || !source?.room || !filename) return null;
  const floorId = normalizeId(source.floor);
  const roomId = normalizeId(source.room);
  const roomDir = resolveInsideBaseDir(mediaRoot, [floorId, roomId], {
    createError: () => mediaError('AI_ANALYSIS_MEDIA_PATH_INVALID'),
  });
  return resolveLeafFilePath(roomDir, filename, {
    createError: () => mediaError('AI_ANALYSIS_MEDIA_PATH_INVALID'),
  });
};

const assertPlainDirectory = async (directoryPath) => {
  const stat = await fs.promises.lstat(directoryPath);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw mediaError('AI_ANALYSIS_MEDIA_PATH_INVALID');
  }
  return stat;
};

const resolveRealMediaRoot = async (mediaRoot) => {
  if (typeof mediaRoot !== 'string' || !mediaRoot) {
    throw mediaError('AI_ANALYSIS_MEDIA_ROOT_INVALID');
  }
  const lexicalRoot = path.resolve(mediaRoot);
  await assertPlainDirectory(lexicalRoot);
  return fs.promises.realpath(lexicalRoot);
};

// sourceのフロア・ルームIDとfilenameから、mediaRoot配下のファイルを解決する。
// mediaRootと配下のフロア・ルームディレクトリ、および対象ファイルのシンボリックリンクを拒否する。
const resolveSafeMediaFilePath = async ({ mediaRoot, source, filename, signal } = {}) => {
  assertNotAborted(signal);
  const lexicalPath = resolveMediaFilePath(mediaRoot, source, filename);
  if (!lexicalPath) return null;

  const lexicalRoot = path.resolve(mediaRoot);
  const floorPath = path.join(lexicalRoot, normalizeId(source.floor));
  const roomPath = path.join(floorPath, normalizeId(source.room));
  const [realRoot] = await Promise.all([
    resolveRealMediaRoot(mediaRoot),
    assertPlainDirectory(floorPath),
    assertPlainDirectory(roomPath),
  ]);
  const leafStat = await fs.promises.lstat(lexicalPath);
  if (leafStat.isSymbolicLink() || !leafStat.isFile()) {
    throw mediaError('AI_ANALYSIS_MEDIA_PATH_INVALID');
  }
  const realPath = await fs.promises.realpath(lexicalPath);
  if (!isInsideBaseDir(realRoot, realPath)) throw mediaError('AI_ANALYSIS_MEDIA_PATH_INVALID');
  assertNotAborted(signal);
  return realPath;
};

const readSafeRegularFile = async ({ filePath, maxBytes, signal } = {}) => {
  assertNotAborted(signal);
  let handle;
  try {
    const noFollow = fs.constants.O_NOFOLLOW || 0;
    handle = await fs.promises.open(filePath, fs.constants.O_RDONLY | noFollow);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) {
      throw mediaError('AI_ANALYSIS_MEDIA_SIZE_INVALID');
    }
    const buffer = await handle.readFile();
    if (buffer.length !== stat.size || buffer.length > maxBytes) {
      throw mediaError('AI_ANALYSIS_MEDIA_SIZE_INVALID');
    }
    assertNotAborted(signal);
    return buffer;
  } finally {
    if (handle) await handle.close();
  }
};

const copySafeRegularFile = async ({ filePath, destination, maxBytes, signal } = {}) => {
  assertNotAborted(signal);
  const noFollow = fs.constants.O_NOFOLLOW || 0;
  const sourceHandle = await fs.promises.open(filePath, fs.constants.O_RDONLY | noFollow);
  let destinationHandle;
  let handleClosedByStream = false;
  try {
    const stat = await sourceHandle.stat();
    if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) {
      throw mediaError('AI_ANALYSIS_MEDIA_SIZE_INVALID');
    }
    destinationHandle = await fs.promises.open(
      destination,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
      0o600
    );
    const readStream = sourceHandle.createReadStream({ autoClose: true });
    const writeStream = destinationHandle.createWriteStream({ autoClose: true });
    handleClosedByStream = true;
    await pipeline(readStream, writeStream, { signal });
    const copied = await fs.promises.lstat(destination);
    if (!copied.isFile() || copied.size !== stat.size || copied.size > maxBytes) {
      throw mediaError('AI_ANALYSIS_MEDIA_SIZE_INVALID');
    }
    assertNotAborted(signal);
    return destination;
  } catch (error) {
    await fs.promises.unlink(destination).catch(() => {});
    throw error;
  } finally {
    if (!handleClosedByStream) {
      if (destinationHandle) await destinationHandle.close();
      await sourceHandle.close();
    }
  }
};

const createTempWorkspace = async ({ mediaRoot, signal } = {}) => {
  assertNotAborted(signal);
  const realRoot = await resolveRealMediaRoot(mediaRoot);
  const tempRoot = path.join(realRoot, TEMP_DIRECTORY_NAME);
  await fs.promises.mkdir(tempRoot, { recursive: true, mode: 0o700 });
  const rootStat = await assertPlainDirectory(tempRoot);
  if ((rootStat.mode & 0o077) !== 0) throw mediaError('AI_ANALYSIS_TEMP_ROOT_UNSAFE');

  const realTempRoot = await fs.promises.realpath(tempRoot);
  if (!isInsideBaseDir(realRoot, realTempRoot)) throw mediaError('AI_ANALYSIS_TEMP_ROOT_UNSAFE');
  let workspace;
  try {
    workspace = await fs.promises.mkdtemp(path.join(realTempRoot, 'task-'));
    await fs.promises.chmod(workspace, 0o700);
    const workspaceStat = await fs.promises.lstat(workspace);
    const realWorkspace = await fs.promises.realpath(workspace);
    if (
      workspaceStat.isSymbolicLink() ||
      !workspaceStat.isDirectory() ||
      !isInsideBaseDir(realTempRoot, realWorkspace)
    ) {
      throw mediaError('AI_ANALYSIS_TEMP_ROOT_UNSAFE');
    }
    activeTempWorkspaces.add(realWorkspace);
    assertNotAborted(signal);
    return realWorkspace;
  } catch (error) {
    if (workspace) {
      activeTempWorkspaces.delete(workspace);
      await fs.promises.rm(workspace, { recursive: true, force: true });
    }
    throw error;
  }
};

const cleanupTempWorkspace = async (workspace) => {
  if (!activeTempWorkspaces.has(workspace)) return false;
  try {
    await fs.promises.rm(workspace, { recursive: true, force: true });
    activeTempWorkspaces.delete(workspace);
  } catch (error) {
    const cleanupError = mediaError('AI_ANALYSIS_MEDIA_CLEANUP_FAILED');
    cleanupError.cause = error;
    throw cleanupError;
  }
  return true;
};

const cleanupAllTempWorkspaces = async () => {
  const workspaces = [...activeTempWorkspaces];
  await Promise.all(workspaces.map((workspace) => cleanupTempWorkspace(workspace)));
};

const getActiveTempWorkspaceCount = () => activeTempWorkspaces.size;

module.exports = {
  TEMP_DIRECTORY_NAME,
  assertNotAborted,
  cleanupAllTempWorkspaces,
  cleanupTempWorkspace,
  copySafeRegularFile,
  createTempWorkspace,
  getActiveTempWorkspaceCount,
  mediaError,
  readSafeRegularFile,
  resolveMediaFilePath,
  resolveSafeMediaFilePath,
};
