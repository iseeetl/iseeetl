const path = require('path');
const { promisify } = require('util');
const ffmpeg = require('fluent-ffmpeg');

const AppError = require('../../utils/appError');
const { VIDEO_THUMB_LONG } = require('../../constants/uploads');
const { assertStoredFile, replaceExtension } = require('./fileOperations');

const ffprobeAsync = promisify(ffmpeg.ffprobe);

const resolveVideoThumbnailTarget = (videoFile) => {
  assertStoredFile(videoFile);
  const filename = replaceExtension(videoFile.filename, '.png');
  return { filename, path: path.join(path.dirname(videoFile.path), filename) };
};

const readRotation = async (videoPath) => {
  try {
    const probe = await ffprobeAsync(videoPath);
    const stream = (probe.streams || []).find((entry) => entry.codec_type === 'video') || {};
    const tagRotation = parseInt(stream?.tags?.rotate ?? '0', 10);
    let rotation = Number.isNaN(tagRotation)
      ? stream.side_data_list?.find((entry) => typeof entry.rotation === 'number')?.rotation ?? 0
      : tagRotation;
    rotation = ((rotation % 360) + 360) % 360;
    return [0, 90, 180, 270].includes(rotation) ? rotation : 0;
  } catch (_error) {
    return 0;
  }
};

const buildVideoFilters = (rotation) => {
  const filters = [];
  if (rotation === 90) filters.push('transpose=1');
  else if (rotation === 180) filters.push('hflip', 'vflip');
  else if (rotation === 270) filters.push('transpose=2');
  filters.push(`scale=${VIDEO_THUMB_LONG}:${VIDEO_THUMB_LONG}:force_original_aspect_ratio=decrease`);
  filters.push('setsar=1');
  return filters.join(',');
};

const createVideoThumbnail = async (videoFile) => {
  assertStoredFile(videoFile);
  const target = resolveVideoThumbnailTarget(videoFile);
  const filters = buildVideoFilters(await readRotation(videoFile.path));

  await new Promise((resolve, reject) => {
    ffmpeg(videoFile.path)
      .seekInput(1)
      .outputOptions(['-vframes', '1', '-vf', filters, '-sws_flags', 'lanczos'])
      .output(target.path)
      .on('end', resolve)
      .on('error', () => reject(new AppError({ code: 'INVALID_PARAMS' })))
      .run();
  });

  return target;
};

module.exports = {
  buildVideoFilters,
  createVideoThumbnail,
  readRotation,
  resolveVideoThumbnailTarget,
};
