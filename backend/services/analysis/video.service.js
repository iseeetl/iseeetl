const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

const { analyzeWithProvider } = require('./provider.service');
const { convertImageBufferForAnalysis } = require('./image.service');
const { copySafeRegularFile, mediaError, readSafeRegularFile } = require('./mediaPath');
const { probeMediaFile, runFfmpegCommand } = require('./ffmpegRunner');

const VIDEO_MAX_BYTES = 150 * 1024 * 1024;
const VIDEO_MAX_DURATION_SECONDS = 30;
const FRAME_INPUT_MAX_BYTES = 3 * 1024 * 1024;
const FRAME_RATIOS = Object.freeze([0.25, 0.5, 0.75]);
const OGG_EXTENSIONS = new Set(['.ogg', '.ogv']);

const formatNames = (probe) =>
  new Set(
    String(probe?.format?.format_name || '')
      .toLowerCase()
      .split(',')
      .filter(Boolean)
  );

const validateVideoProbe = (probe, { streamType = 'video' } = {}) => {
  if (!['video', 'audio'].includes(streamType)) throw new TypeError('unsupported video stream type');
  const names = formatNames(probe);
  if (names.has('ogg')) return { skip: true, reason: 'ogg' };
  if (!['mov', 'mp4', 'webm'].some((name) => names.has(name))) {
    throw mediaError('AI_ANALYSIS_VIDEO_INVALID');
  }

  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const candidates = streams
    .filter((stream) => stream?.codec_type === streamType && stream?.disposition?.attached_pic !== 1)
    .sort((left, right) => left.index - right.index);
  const selected = candidates.find((stream) => stream.disposition?.default === 1) || candidates[0];
  if (!selected) return { skip: true, reason: 'no_stream' };

  // 補助トラックの長さは使わず、選択トラックの長さが不明な場合だけコンテナの長さを使う。
  const streamDuration = Number(selected.duration);
  const duration = Number.isFinite(streamDuration) && streamDuration > 0
    ? streamDuration
    : Number(probe?.format?.duration);
  if (
    !Number.isInteger(selected.index) ||
    selected.index < 0 ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > VIDEO_MAX_DURATION_SECONDS
  ) {
    throw mediaError('AI_ANALYSIS_VIDEO_INVALID');
  }
  return { streamIndex: selected.index, duration, skip: false };
};

const prepareVideoSource = async ({ filePath, workspace, streamType = 'video', signal } = {}) => {
  const extension = path.extname(filePath).toLowerCase();
  if (OGG_EXTENSIONS.has(extension)) return null;
  const inputPath = path.join(workspace, `source-video${extension || '.bin'}`);
  await copySafeRegularFile({ filePath, destination: inputPath, maxBytes: VIDEO_MAX_BYTES, signal });
  const probe = await probeMediaFile(inputPath, { signal });
  const details = validateVideoProbe(probe, { streamType });
  if (details.skip) return null;
  return { ...details, videoPath: inputPath };
};

const extractSingleFrame = async ({ videoPath, streamIndex, timestamp, outputPath, signal } = {}) => {
  const command = ffmpeg(videoPath)
    .seekInput(timestamp)
    .videoFilters('scale=512:512:force_original_aspect_ratio=decrease')
    .videoCodec('mjpeg')
    .outputOptions(['-map', `0:${streamIndex}`, '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', '-an', '-sn', '-dn'])
    .format('image2')
    .output(outputPath);
  await runFfmpegCommand(command, { signal });
  const frame = await readSafeRegularFile({ filePath: outputPath, maxBytes: FRAME_INPUT_MAX_BYTES, signal });
  return (await convertImageBufferForAnalysis(frame, { signal })).toString('base64');
};

const extractVideoFramesForAnalysis = async ({ videoPath, streamIndex, duration, workspace, signal } = {}) => {
  const frames = [];
  for (let index = 0; index < FRAME_RATIOS.length; index += 1) {
    frames.push(
      await extractSingleFrame({
        videoPath,
        streamIndex,
        timestamp: duration * FRAME_RATIOS[index],
        outputPath: path.join(workspace, `frame-${index + 1}.jpg`),
        signal,
      })
    );
  }
  return { frameBase64s: frames };
};

const getVideoDurationSec = async (videoPath, { signal } = {}) => {
  const probe = await probeMediaFile(videoPath, { signal });
  return Number(probe?.format?.duration);
};

const describeVideoWithChat = (videoPathOrFrames, { additionalPrompt = '', signal } = {}) => {
  if (!Array.isArray(videoPathOrFrames)) {
    throw mediaError('AI_ANALYSIS_VIDEO_PREPARATION_REQUIRED');
  }
  return analyzeWithProvider({
    kind: 'video',
    additionalPrompt,
    media: { frameBase64s: videoPathOrFrames },
    signal,
  });
};

module.exports = {
  FRAME_RATIOS,
  OGG_EXTENSIONS,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_DURATION_SECONDS,
  describeVideoWithChat,
  extractVideoFramesForAnalysis,
  getVideoDurationSec,
  prepareVideoSource,
  validateVideoProbe,
};
