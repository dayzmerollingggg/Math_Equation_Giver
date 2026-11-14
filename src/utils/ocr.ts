import { createWorker, PSM, Worker } from 'tesseract.js';

let workerInstance: Worker | null = null;
let initPromise: Promise<Worker> | null = null;

export async function initOcrWorker(): Promise<Worker> {
  if (workerInstance) return workerInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const worker = await createWorker('eng');
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789-',
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
    });
    workerInstance = worker;
    return worker;
  })();

  try {
    return await initPromise;
  } catch (err) {
    initPromise = null;
    throw err;
  }
}

/**
 * Crops the non-white ink bounding box from the drawing canvas and places it
 * centered inside a clean padded white canvas scaled to an optimal OCR height.
 */
function preprocessCanvasForOcr(source: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = source.getContext('2d', { willReadFrequently: true });
  if (!ctx) return source;

  const { width, height } = source;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (r < 210 || g < 210 || b < 210) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return source;
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  // Normalize height to ~160px for crisp Tesseract recognition
  const targetInkHeight = 160;
  const scale = Math.min(2.5, Math.max(0.5, targetInkHeight / cropH));
  const scaledW = Math.max(16, Math.round(cropW * scale));
  const scaledH = Math.max(16, Math.round(cropH * scale));
  const padding = 40;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = scaledW + padding * 2;
  outCanvas.height = scaledH + padding * 2;

  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return source;

  outCtx.fillStyle = '#FFFFFF';
  outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.drawImage(
    source,
    minX,
    minY,
    cropW,
    cropH,
    padding,
    padding,
    scaledW,
    scaledH
  );

  return outCanvas;
}

export async function recognizeCanvasDigits(
  canvas: HTMLCanvasElement
): Promise<string> {
  const worker = await initOcrWorker();
  const processed = preprocessCanvasForOcr(canvas);
  const {
    data: { text },
  } = await worker.recognize(processed);

  const cleaned = text.replace(/[^0-9-]/g, '').trim();
  // Normalize stray minus signs not at start
  if (cleaned.startsWith('-')) {
    return '-' + cleaned.slice(1).replace(/-/g, '');
  }
  return cleaned.replace(/-/g, '');
}
