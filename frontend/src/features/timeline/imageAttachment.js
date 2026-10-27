import loadImage from 'blueimp-load-image';
import { MAX_IMAGE_EDGE, MAX_IMAGE_SIZE_IN_BYTES } from '@/constants/mediaConstants';

const prepared = new WeakSet();
const checkAbort = signal => { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); };
const toBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
  canvas.toBlob(blob => blob?.size ? resolve(blob) : reject(new Error('IMAGE_ENCODING_FAILED')), type, quality);
});

// The same bounded policy serves photos, PNG documents, and PDF page images.
export async function encodeImageAttachment(source, {
  preferPng = false, name = 'image', signal, createCanvas = () => document.createElement('canvas'),
} = {}) {
  checkAbort(signal);
  if (!source.width || !source.height || !Number.isFinite(source.width + source.height)) throw new Error('IMAGE_INVALID');
  let work = source;
  let scratch;
  const resize = (edge, white = true) => {
    if (!scratch) scratch = createCanvas();
    const ratio = Math.min(1, edge / Math.max(source.width, source.height));
    scratch.width = Math.max(1, Math.round(source.width * ratio));
    scratch.height = Math.max(1, Math.round(source.height * ratio));
    const ctx = scratch.getContext('2d');
    if (!ctx) throw new Error('IMAGE_ENCODING_FAILED');
    if (white) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, scratch.width, scratch.height); }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, scratch.width, scratch.height);
    work = scratch;
  };
  const finish = blob => {
    checkAbort(signal);
    const base = name.replace(/\.[^.]+$/, '') || 'image';
    const result = new File([blob], `${base}.${blob.type === 'image/png' ? 'png' : 'jpg'}`, { type: blob.type });
    prepared.add(result);
    return result;
  };
  try {
    let edge = Math.min(MAX_IMAGE_EDGE, Math.max(source.width, source.height));
    if (Math.max(source.width, source.height) > edge) resize(edge, !preferPng);
    if (preferPng) {
      const png = await toBlob(work, 'image/png'); checkAbort(signal);
      if (png.size <= MAX_IMAGE_SIZE_IN_BYTES) return finish(png);
    }
    // White background also prevents transparent PNGs turning black in JPEG.
    if (preferPng) resize(edge);
    for (const quality of [0.85, 0.75, 0.65]) {
      const jpeg = await toBlob(work, 'image/jpeg', quality); checkAbort(signal);
      if (jpeg.size <= MAX_IMAGE_SIZE_IN_BYTES) return finish(jpeg);
    }
    for (let attempt = 0; attempt < 6; attempt++) {
      edge = Math.floor(edge * 0.8); resize(edge);
      const jpeg = await toBlob(work, 'image/jpeg', 0.75); checkAbort(signal);
      if (jpeg.size <= MAX_IMAGE_SIZE_IN_BYTES) return finish(jpeg);
    }
    throw new Error('IMAGE_TOO_LARGE');
  } finally {
    if (scratch) { scratch.width = 0; scratch.height = 0; }
  }
}

export async function prepareImageAttachment(file, { signal, decode = loadImage, createCanvas } = {}) {
  checkAbort(signal);
  // PDF images have already passed the encoder: avoid an extra lossy conversion.
  if (prepared.has(file)) return file;
  const canvas = await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { settled = true; reject(new Error('IMAGE_TIMEOUT')); }, 45000);
    try { decode(file, result => {
      clearTimeout(timer);
      if (settled) { if (result?.getContext) { result.width = 0; result.height = 0; } return; }
      settled = true;
      if (!result?.getContext) reject(new Error('IMAGE_INVALID'));
      else resolve(result);
    }, { canvas: true, maxWidth: MAX_IMAGE_EDGE, maxHeight: MAX_IMAGE_EDGE, orientation: true }); } catch (error) { clearTimeout(timer); settled = true; reject(error); }
  });
  try {
    checkAbort(signal);
    return await encodeImageAttachment(canvas, { preferPng: file.type === 'image/png', name: file.name || 'image', signal, createCanvas });
  } finally { canvas.width = 0; canvas.height = 0; }
}
