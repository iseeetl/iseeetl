import { MAX_IMAGE_EDGE } from '@/constants/mediaConstants';
import { encodeImageAttachment } from './imageAttachment';

export const MAX_PDF_SIZE = 20 * 1024 * 1024;
export const isPdfFile = file => file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '');
const checkAbort = signal => { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); };
// Load only when a PDF is chosen. The library, worker, fonts and CMaps are local assets.
async function loadPdfLibrary() {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

export async function pdfFirstPage(file, {
  signal, pageNumber = 1, loadPdf = loadPdfLibrary, createCanvas = () => document.createElement('canvas'),
} = {}) {
  if (!isPdfFile(file) || !file.size) throw new Error('PDF_INVALID');
  if (file.size > MAX_PDF_SIZE) throw new Error('PDF_TOO_LARGE');
  checkAbort(signal);
  const pdfjs = await loadPdf();
  checkAbort(signal);
  const data = new Uint8Array(await file.arrayBuffer());
  checkAbort(signal);
  const root = `${import.meta.env.BASE_URL || '/'}pdfjs/`;
  const task = pdfjs.getDocument({ data, isEvalSupported: false, stopAtErrors: true,
    cMapUrl: `${root}cmaps/`, cMapPacked: true,
    standardFontDataUrl: `${root}standard_fonts/`, wasmUrl: `${root}wasm/`,
  });
  const abort = () => { void task.destroy().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  let canvas;
  try {
    const pdf = await task.promise;
    checkAbort(signal);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) throw new Error('PDF_PAGE_INVALID');
    const page = await pdf.getPage(pageNumber);
    checkAbort(signal);
    const original = page.getViewport({ scale: 1 });
    const longest = Math.max(original.width, original.height);
    if (!Number.isFinite(longest) || longest <= 0) throw new Error('PDF_INVALID');
    const viewport = page.getViewport({ scale: MAX_IMAGE_EDGE / longest });
    canvas = createCanvas();
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PDF_IMAGE_FAILED');
    await page.render({ canvasContext: context, viewport, background: 'rgb(255,255,255)' }).promise;
    checkAbort(signal);
    const image = await encodeImageAttachment(canvas, {
      preferPng: true, name: `${file.name.replace(/\.pdf$/i, '')}-page-${pageNumber}.png`, signal, createCanvas,
    });
    return { file: image, pageCount: pdf.numPages, pageNumber };
  } finally {
    signal?.removeEventListener('abort', abort);
    await task.destroy().catch(() => {});
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
