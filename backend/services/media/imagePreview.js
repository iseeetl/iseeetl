const fs = require('fs');
const sharp = require('sharp');
const { IMAGE_MAX_PIXELS } = require('../../constants/uploads');

// Derived images live only in a bounded process cache; originals and DB are untouched.
const cache = new Map();
const pending = new Map();
const queue = [];
const MAX_BYTES = 32 * 1024 * 1024;
let cacheBytes = 0;
let active = 0;

const run = async (work) => {
  if (active >= 2) await new Promise((resolve) => queue.push(resolve));
  active += 1;
  try { return await work(); }
  finally { active -= 1; queue.shift()?.(); }
};

const getImagePreview = async (filePath) => {
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile()) throw Object.assign(new Error('Not a file'), { code: 'ENOENT' });
  const key = `${filePath}:${stat.mtimeMs}:${stat.size}`;
  if (cache.has(key)) {
    const result = cache.get(key);
    cache.delete(key); cache.set(key, result);
    return result;
  }
  if (pending.has(key)) return pending.get(key);
  if (pending.size >= 10) throw Object.assign(new Error('Preview busy'), { status: 503 });
  const promise = run(async () => {
    const pipeline = sharp(filePath, { failOn: 'error', limitInputPixels: IMAGE_MAX_PIXELS }).rotate();
    const metadata = await pipeline.metadata();
    if (!['jpeg', 'png'].includes(metadata.format)) throw Object.assign(new Error('Invalid image'), { status: 400 });
    pipeline.resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true });
    const buffer = await (metadata.format === 'jpeg' ? pipeline.jpeg({ quality: 85 }) : pipeline.png({ compressionLevel: 9 })).toBuffer();
    const result = { buffer, type: metadata.format === 'jpeg' ? 'image/jpeg' : 'image/png' };
    while (cache.size && (cacheBytes + buffer.length > MAX_BYTES || cache.size >= 128)) {
      const oldest = cache.keys().next().value;
      cacheBytes -= cache.get(oldest).buffer.length;
      cache.delete(oldest);
    }
    if (buffer.length <= MAX_BYTES) { cache.set(key, result); cacheBytes += buffer.length; }
    return result;
  }).finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
};

module.exports = { getImagePreview };
