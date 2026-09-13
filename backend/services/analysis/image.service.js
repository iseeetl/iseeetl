const sharp = require('sharp');

const { analyzeWithProvider } = require('./provider.service');
const { assertNotAborted, mediaError, readSafeRegularFile } = require('./mediaPath');

const IMAGE_INPUT_MAX_BYTES = 3 * 1024 * 1024;
const IMAGE_OUTPUT_MAX_BYTES = 1024 * 1024;
const IMAGE_MAX_EDGE = 512;
const IMAGE_MAX_PIXELS = 40_000_000;
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_QUALITY_STEPS = Object.freeze([85, 70, 55, 40]);

const detectImageFormat = (buffer) => {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= JPEG_SIGNATURE.length && buffer.subarray(0, 3).equals(JPEG_SIGNATURE)) return 'jpeg';
  if (buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  return null;
};

const createPipeline = (buffer) =>
  sharp(buffer, {
    animated: true,
    failOn: 'error',
    limitInputPixels: IMAGE_MAX_PIXELS,
  });

const encodeJpeg = async (buffer, quality, signal) => {
  assertNotAborted(signal);
  const pipeline = createPipeline(buffer)
    .rotate()
    .resize({
      width: IMAGE_MAX_EDGE,
      height: IMAGE_MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality, progressive: false });

  const abort = () => pipeline.destroy();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const output = await pipeline.toBuffer();
    assertNotAborted(signal);
    return output;
  } catch (error) {
    assertNotAborted(signal);
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
};

const convertImageBufferForAnalysis = async (buffer, { signal } = {}) => {
  assertNotAborted(signal);
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > IMAGE_INPUT_MAX_BYTES) {
    throw mediaError('AI_ANALYSIS_IMAGE_INVALID');
  }
  const signatureFormat = detectImageFormat(buffer);
  if (!signatureFormat) throw mediaError('AI_ANALYSIS_IMAGE_INVALID');

  let metadata;
  const metadataPipeline = createPipeline(buffer);
  const abortMetadata = () => metadataPipeline.destroy();
  signal?.addEventListener('abort', abortMetadata, { once: true });
  try {
    metadata = await metadataPipeline.metadata();
    assertNotAborted(signal);
  } catch (_error) {
    assertNotAborted(signal);
    throw mediaError('AI_ANALYSIS_IMAGE_INVALID');
  } finally {
    signal?.removeEventListener('abort', abortMetadata);
  }
  const pages = metadata?.pages ?? 1;
  if (
    metadata?.format !== signatureFormat ||
    pages !== 1 ||
    !Number.isInteger(metadata?.width) ||
    !Number.isInteger(metadata?.height) ||
    metadata.width <= 0 ||
    metadata.height <= 0
  ) {
    throw mediaError('AI_ANALYSIS_IMAGE_INVALID');
  }

  for (const quality of JPEG_QUALITY_STEPS) {
    const jpeg = await encodeJpeg(buffer, quality, signal);
    if (jpeg.length > 0 && jpeg.length <= IMAGE_OUTPUT_MAX_BYTES) return jpeg;
  }
  throw mediaError('AI_ANALYSIS_IMAGE_OUTPUT_TOO_LARGE');
};

const prepareImageForAnalysis = async ({ filePath, signal } = {}) => {
  const buffer = await readSafeRegularFile({
    filePath,
    maxBytes: IMAGE_INPUT_MAX_BYTES,
    signal,
  });
  const jpeg = await convertImageBufferForAnalysis(buffer, { signal });
  return { imageBase64: jpeg.toString('base64') };
};

const resizeToMax512AndB64 = async (input, { signal } = {}) => {
  const buffer = Buffer.isBuffer(input)
    ? input
    : await readSafeRegularFile({ filePath: input, maxBytes: IMAGE_INPUT_MAX_BYTES, signal });
  return (await convertImageBufferForAnalysis(buffer, { signal })).toString('base64');
};

const describeImageWithChat = (imageBase64, { additionalPrompt = '', signal } = {}) =>
  analyzeWithProvider({
    kind: 'vision',
    additionalPrompt,
    media: { imageBase64 },
    signal,
  });

module.exports = {
  IMAGE_INPUT_MAX_BYTES,
  IMAGE_MAX_EDGE,
  IMAGE_OUTPUT_MAX_BYTES,
  convertImageBufferForAnalysis,
  describeImageWithChat,
  detectImageFormat,
  prepareImageForAnalysis,
  resizeToMax512AndB64,
};
