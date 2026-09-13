const fsPromises = require('fs').promises;
const defaultLogger = require('../../utils/logger');
const { resolveInsideBaseDir, resolveLeafFilePath } = require('../../utils/safePath');

const removeFileBestEffort = async ({ baseDir, segments = [], fileName, logger = defaultLogger, context = {} }) => {
  if (!fileName) return false;
  try {
    const targetDir = resolveInsideBaseDir(baseDir, segments.map(String));
    const filePath = resolveLeafFilePath(targetDir, fileName);
    await fsPromises.unlink(filePath);
    return true;
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      logger.error('Failed to remove replaced file', {
        ...context,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return false;
  }
};

module.exports = {
  removeFileBestEffort,
};
