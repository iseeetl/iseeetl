const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

const AppError = require('../../utils/appError');
const { assertStoredFile, removeFileIfExists, replaceExtension } = require('./fileOperations');

const convertAudioToMp3 = async (file) => {
  assertStoredFile(file);
  if (path.extname(file.filename).toLowerCase() === '.mp3') return { filename: file.filename, converted: false };

  const filename = replaceExtension(file.filename, '.mp3');
  const outputPath = path.join(path.dirname(file.path), filename);
  try {
    await new Promise((resolve, reject) => {
      ffmpeg(file.path)
        .output(outputPath)
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
  } catch (_error) {
    await removeFileIfExists(outputPath).catch(() => false);
    throw new AppError({ code: 'INTERNAL_SERVER_ERROR' });
  }

  await removeFileIfExists(file.path).catch(() => false);
  return { filename, converted: true };
};

module.exports = { convertAudioToMp3 };
