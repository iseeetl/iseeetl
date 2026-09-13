const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const AppError = require('../../utils/appError');
const { isMongoId, resolveMongoIdPath } = require('../../utils/safePath');
const { IMAGE_MAX_PIXELS } = require('../../constants/uploads');
const { createMediaBaseName } = require('./mediaFileName');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

const invalidImage = () => new AppError({ code: 'INVALID_PARAMS' });

const resolveSafeImageDir = (baseDir, segments) => {
  return resolveMongoIdPath(baseDir, segments, { createError: invalidImage });
};

const detectImageFormat = (buffer) => {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return 'png';
  }
  if (buffer.length >= JPEG_SIGNATURE.length && buffer.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) {
    return 'jpeg';
  }
  return null;
};

const buildSharp = (buffer) =>
  sharp(buffer, {
    failOn: 'error',
    limitInputPixels: IMAGE_MAX_PIXELS,
  });

const encodeImage = async (buffer, format) => {
  let pipeline = buildSharp(buffer).rotate();
  if (format === 'jpeg') {
    pipeline = pipeline.jpeg({ quality: 90 });
  } else {
    pipeline = pipeline.png({ compressionLevel: 9 });
  }
  return pipeline.toBuffer();
};

const sanitizeImage = async (file) => {
  const buffer = file && file.buffer;
  const signatureFormat = detectImageFormat(buffer);
  if (!signatureFormat) throw invalidImage();

  try {
    const metadata = await buildSharp(buffer).metadata();
    if (
      !metadata ||
      metadata.format !== signatureFormat ||
      !Number.isInteger(metadata.width) ||
      !Number.isInteger(metadata.height) ||
      metadata.width <= 0 ||
      metadata.height <= 0
    ) {
      throw invalidImage();
    }

    return {
      buffer: await encodeImage(buffer, signatureFormat),
      extension: signatureFormat === 'jpeg' ? '.jpg' : '.png',
      format: signatureFormat,
    };
  } catch (_error) {
    throw invalidImage();
  }
};

const createThumbnail = async (buffer, format) => {
  let pipeline = buildSharp(buffer).resize({
    width: 400,
    height: 400,
    fit: 'inside',
    withoutEnlargement: true,
  });
  if (format === 'jpeg') {
    pipeline = pipeline.jpeg({ quality: 85 });
  } else {
    pipeline = pipeline.png({ compressionLevel: 9 });
  }
  return pipeline.toBuffer();
};

const removeIfExists = async (filePath) => {
  if (!filePath) return;
  await fs.promises.unlink(filePath).catch(() => {});
};

const saveSanitizedImage = async ({ file, baseDir, segments, userId, createThumbnail: withThumbnail = false }) => {
  if (!isMongoId(userId)) throw invalidImage();

  const sanitized = await sanitizeImage(file);
  const destinationDir = resolveSafeImageDir(baseDir, segments);
  const baseName = createMediaBaseName(userId);
  const filename = `${baseName}${sanitized.extension}`;
  const filePath = path.join(destinationDir, filename);
  const thumbnailFilename = withThumbnail ? `${baseName}_thumbnail${sanitized.extension}` : null;
  const thumbnailPath = thumbnailFilename ? path.join(destinationDir, thumbnailFilename) : null;
  const thumbnailBuffer = withThumbnail
    ? await createThumbnail(sanitized.buffer, sanitized.format)
    : null;

  await fs.promises.mkdir(destinationDir, { recursive: true });
  try {
    await fs.promises.writeFile(filePath, sanitized.buffer, { flag: 'wx' });
    if (thumbnailPath) {
      await fs.promises.writeFile(thumbnailPath, thumbnailBuffer, { flag: 'wx' });
    }
  } catch (err) {
    await Promise.all([removeIfExists(filePath), removeIfExists(thumbnailPath)]);
    throw err;
  }

  return {
    filename,
    path: filePath,
    thumbnailFilename,
    thumbnailPath,
  };
};

module.exports = {
  detectImageFormat,
  resolveSafeImageDir,
  sanitizeImage,
  saveSanitizedImage,
};
