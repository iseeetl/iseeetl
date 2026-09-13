const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

const { analyzeWithProvider } = require('./provider.service');
const { convertImageBufferForAnalysis } = require('./image.service');
const {
  assertNotAborted,
  copySafeRegularFile,
  mediaError,
  readSafeRegularFile,
} = require('./mediaPath');
const { probeMediaFile, runFfmpegCommand } = require('./ffmpegRunner');

const VIDEO_MAX_BYTES = 150 * 1024 * 1024;
const VIDEO_MAX_DURATION_SECONDS = 30;
const FRAME_INPUT_MAX_BYTES = 3 * 1024 * 1024;
const FRAME_RATIOS = Object.freeze([0.25, 0.5, 0.75]);
const OGG_EXTENSIONS = new Set(['.ogg', '.ogv']);
const EBML_HEADER_MAX_BYTES = 64 * 1024;
const ISO_BMFF_HEADER_MAX_BYTES = 64 * 1024;
const MP4_QUICKTIME_BRANDS = new Set([
  'isom',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'iso7',
  'iso8',
  'iso9',
  'mp41',
  'mp42',
  'avc1',
  'qt  ',
]);

const formatNames = (probe) =>
  new Set(
    String(probe?.format?.format_name || '')
      .toLowerCase()
      .split(',')
      .filter(Boolean)
  );

const getActualDuration = (probe) => {
  const durations = [probe?.format?.duration, ...(probe?.streams || []).map((stream) => stream?.duration)]
    .map(Number)
    .filter((duration) => Number.isFinite(duration) && duration > 0);
  return durations.length > 0 ? Math.max(...durations) : NaN;
};

const isActualWebm = (probe, names) => {
  return names.has('webm') && probe?.ebmlDocType === 'webm';
};

const isActualMp4OrQuickTime = (probe, names) => {
  if (!names.has('mov') && !names.has('mp4')) return false;
  const brands = probe?.isoBmffBrands;
  if (!brands || !MP4_QUICKTIME_BRANDS.has(brands.majorBrand)) return false;
  return (
    Array.isArray(brands.compatibleBrands) &&
    brands.compatibleBrands.every((brand) => MP4_QUICKTIME_BRANDS.has(brand))
  );
};

const parseIsoBmffBrands = (header) => {
  let offset = 0;
  while (offset + 8 <= header.length) {
    const size32 = header.readUInt32BE(offset);
    const type = header.subarray(offset + 4, offset + 8).toString('ascii');
    let boxHeaderSize = 8;
    let boxSize = size32;
    if (size32 === 1) {
      if (offset + 16 > header.length) return null;
      const extendedSize = header.readBigUInt64BE(offset + 8);
      if (extendedSize > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      boxSize = Number(extendedSize);
      boxHeaderSize = 16;
    } else if (size32 === 0) {
      boxSize = header.length - offset;
    }
    if (boxSize < boxHeaderSize || offset + boxSize > header.length) return null;

    if (type === 'ftyp') {
      const payloadStart = offset + boxHeaderSize;
      const payloadSize = boxSize - boxHeaderSize;
      if (payloadSize < 8 || (payloadSize - 8) % 4 !== 0) return null;
      const majorBrand = header.subarray(payloadStart, payloadStart + 4).toString('ascii');
      const compatibleBrands = [];
      for (let brandOffset = payloadStart + 8; brandOffset < offset + boxSize; brandOffset += 4) {
        compatibleBrands.push(header.subarray(brandOffset, brandOffset + 4).toString('ascii'));
      }
      return { majorBrand, compatibleBrands };
    }
    offset += boxSize;
  }
  return null;
};

const readIsoBmffBrands = async (filePath, { signal } = {}) => {
  const handle = await fs.promises.open(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const stat = await handle.stat();
    const length = Math.min(stat.size, ISO_BMFF_HEADER_MAX_BYTES);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    assertNotAborted(signal);
    return parseIsoBmffBrands(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
};

const readEbmlVint = (buffer, offset) => {
  const first = buffer[offset];
  if (first == null || first === 0) return null;
  let width = 1;
  let marker = 0x80;
  while (width <= 8 && (first & marker) === 0) {
    width += 1;
    marker >>= 1;
  }
  if (width > 8 || offset + width > buffer.length) return null;
  let value = first & (marker - 1);
  for (let index = 1; index < width; index += 1) value = value * 256 + buffer[offset + index];
  return { value, width };
};

const readEbmlElementIdWidth = (buffer, offset) => {
  const first = buffer[offset];
  if (first == null || first === 0) return 0;
  let width = 1;
  let marker = 0x80;
  while (width <= 4 && (first & marker) === 0) {
    width += 1;
    marker >>= 1;
  }
  return width <= 4 && offset + width <= buffer.length ? width : 0;
};

const parseEbmlDocType = (header) => {
  const EBML_ID = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
  if (header.length < EBML_ID.length + 1 || !header.subarray(0, 4).equals(EBML_ID)) return null;
  const headerSize = readEbmlVint(header, 4);
  if (!headerSize) return null;
  let offset = 4 + headerSize.width;
  const headerEnd = offset + headerSize.value;
  if (headerEnd > header.length) return null;

  while (offset < headerEnd) {
    const idWidth = readEbmlElementIdWidth(header, offset);
    if (!idWidth) return null;
    const isDocType = idWidth === 2 && header[offset] === 0x42 && header[offset + 1] === 0x82;
    const size = readEbmlVint(header, offset + idWidth);
    if (!size) return null;
    const start = offset + idWidth + size.width;
    const end = start + size.value;
    if (end > headerEnd) return null;
    if (isDocType) {
      if (size.value <= 0 || size.value > 16) return null;
      return header.subarray(start, end).toString('ascii').toLowerCase();
    }
    offset = end;
  }
  return null;
};

const readEbmlDocType = async (filePath, { signal } = {}) => {
  const handle = await fs.promises.open(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const stat = await handle.stat();
    const length = Math.min(stat.size, EBML_HEADER_MAX_BYTES);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    assertNotAborted(signal);
    return parseEbmlDocType(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
};

const validateVideoProbe = (probe) => {
  const names = formatNames(probe);
  if (names.has('ogg')) return { skip: true, reason: 'ogg' };

  const duration = getActualDuration(probe);
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const videos = streams.filter((stream) => stream.codec_type === 'video');
  const audios = streams.filter((stream) => stream.codec_type === 'audio');
  const forbidden = streams.filter(
    (stream) => !['video', 'audio'].includes(stream.codec_type) || stream?.disposition?.attached_pic === 1
  );
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > VIDEO_MAX_DURATION_SECONDS ||
    videos.length !== 1 ||
    audios.length > 1 ||
    forbidden.length > 0
  ) {
    throw mediaError('AI_ANALYSIS_VIDEO_INVALID');
  }

  const videoCodec = videos[0]?.codec_name;
  const audioCodec = audios[0]?.codec_name;
  const isMp4 = isActualMp4OrQuickTime(probe, names);
  const isWebm = isActualWebm(probe, names);
  const validMp4 =
    isMp4 && videoCodec === 'h264' && (audios.length === 0 || ['aac', 'mp3'].includes(audioCodec));
  const validWebm =
    isWebm &&
    ['vp8', 'vp9'].includes(videoCodec) &&
    (audios.length === 0 || ['opus', 'vorbis'].includes(audioCodec));
  if (!validMp4 && !validWebm) throw mediaError('AI_ANALYSIS_VIDEO_INVALID');

  return { audioStreamCount: audios.length, duration, skip: false };
};

const prepareVideoSource = async ({ filePath, workspace, signal } = {}) => {
  const extension = path.extname(filePath).toLowerCase();
  if (OGG_EXTENSIONS.has(extension)) return null;
  const inputPath = path.join(workspace, `source-video${extension || '.bin'}`);
  await copySafeRegularFile({ filePath, destination: inputPath, maxBytes: VIDEO_MAX_BYTES, signal });
  const probe = await probeMediaFile(inputPath, { signal });
  if (formatNames(probe).has('webm')) probe.ebmlDocType = await readEbmlDocType(inputPath, { signal });
  if (formatNames(probe).has('mov') || formatNames(probe).has('mp4')) {
    probe.isoBmffBrands = await readIsoBmffBrands(inputPath, { signal });
  }
  const details = validateVideoProbe(probe);
  if (details.skip) return null;
  return { ...details, videoPath: inputPath };
};

const extractSingleFrame = async ({ videoPath, timestamp, outputPath, signal } = {}) => {
  const command = ffmpeg(videoPath)
    .seekInput(timestamp)
    .videoFilters('scale=512:512:force_original_aspect_ratio=decrease')
    .videoCodec('mjpeg')
    .outputOptions(['-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', '-an', '-sn', '-dn'])
    .format('image2')
    .output(outputPath);
  await runFfmpegCommand(command, { signal });
  const frame = await readSafeRegularFile({ filePath: outputPath, maxBytes: FRAME_INPUT_MAX_BYTES, signal });
  return (await convertImageBufferForAnalysis(frame, { signal })).toString('base64');
};

const extractVideoFramesForAnalysis = async ({ videoPath, duration, workspace, signal } = {}) => {
  const frames = [];
  for (let index = 0; index < FRAME_RATIOS.length; index += 1) {
    frames.push(
      await extractSingleFrame({
        videoPath,
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
  getActualDuration,
  isActualMp4OrQuickTime,
  isActualWebm,
  parseIsoBmffBrands,
  parseEbmlDocType,
  readEbmlDocType,
  readIsoBmffBrands,
  validateVideoProbe,
};
