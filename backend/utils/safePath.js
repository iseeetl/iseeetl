const path = require('path');

const MONGO_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

const isMongoId = (value) => typeof value === 'string' && MONGO_ID_PATTERN.test(value);

const isInsideBaseDir = (baseDir, targetPath) =>
  targetPath === baseDir || targetPath.startsWith(`${baseDir}${path.sep}`);

const invalidPath = () => new TypeError('invalid path');

const resolveInsideBaseDir = (baseDir, segments = [], { createError = invalidPath } = {}) => {
  if (typeof baseDir !== 'string' || baseDir.length === 0 || !Array.isArray(segments)) {
    throw createError();
  }

  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, ...segments);
  if (!isInsideBaseDir(resolvedBase, resolvedTarget)) throw createError();
  return resolvedTarget;
};

const resolveMongoIdPath = (baseDir, ids, { createError = invalidPath } = {}) => {
  if (!Array.isArray(ids) || ids.some((id) => !isMongoId(id))) throw createError();
  return resolveInsideBaseDir(baseDir, ids, { createError });
};

const resolveLeafFilePath = (
  baseDir,
  fileName,
  { createError = invalidPath, validateFileName = () => true } = {}
) => {
  if (
    typeof fileName !== 'string' ||
    fileName.length === 0 ||
    path.basename(fileName) !== fileName ||
    !validateFileName(fileName)
  ) {
    throw createError();
  }
  return resolveInsideBaseDir(baseDir, [fileName], { createError });
};

module.exports = {
  isInsideBaseDir,
  isMongoId,
  resolveInsideBaseDir,
  resolveLeafFilePath,
  resolveMongoIdPath,
};
