import { getMnistWeights } from './mnistWeights';

export interface InkComponent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
  pixels: number[]; // packed (y * boxW + x) indices in cropped ink space
}

export async function initOcrWorker(): Promise<void> {
  // Warm cached Float32Array weights synchronously (<1ms, zero network fetch)
  getMnistWeights();
}

function conv2dSameRelu(
  input: Float32Array,
  inC: number,
  h: number,
  w: number,
  weights: Float32Array,
  bias: Float32Array,
  outC: number
): Float32Array {
  const kSize = 5;
  const pad = 2;
  const hw = h * w;
  const out = new Float32Array(outC * hw);

  for (let oc = 0; oc < outC; oc++) {
    const bVal = bias[oc];
    const outOffset = oc * hw;
    const ocWeightOffset = oc * inC * 25;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = bVal;
        for (let ic = 0; ic < inC; ic++) {
          const inOffset = ic * hw;
          const wOffset = ocWeightOffset + ic * 25;
          for (let ky = 0; ky < kSize; ky++) {
            const iy = y + ky - pad;
            if (iy < 0 || iy >= h) continue;
            const rowIn = inOffset + iy * w;
            const rowW = wOffset + ky * kSize;
            for (let kx = 0; kx < kSize; kx++) {
              const ix = x + kx - pad;
              if (ix < 0 || ix >= w) continue;
              sum += input[rowIn + ix] * weights[rowW + kx];
            }
          }
        }
        out[outOffset + y * w + x] = sum > 0 ? sum : 0;
      }
    }
  }
  return out;
}

function maxPool2d(
  input: Float32Array,
  c: number,
  h: number,
  w: number,
  kernel: number,
  stride: number
): { out: Float32Array; outH: number; outW: number } {
  const outH = Math.floor((h - kernel) / stride) + 1;
  const outW = Math.floor((w - kernel) / stride) + 1;
  const out = new Float32Array(c * outH * outW);
  const inHW = h * w;
  const outHW = outH * outW;

  for (let ch = 0; ch < c; ch++) {
    const inBase = ch * inHW;
    const outBase = ch * outHW;
    for (let oy = 0; oy < outH; oy++) {
      for (let ox = 0; ox < outW; ox++) {
        let maxVal = -Infinity;
        for (let ky = 0; ky < kernel; ky++) {
          const iy = oy * stride + ky;
          const rowBase = inBase + iy * w;
          for (let kx = 0; kx < kernel; kx++) {
            const val = input[rowBase + ox * stride + kx];
            if (val > maxVal) maxVal = val;
          }
        }
        out[outBase + oy * outW + ox] = maxVal;
      }
    }
  }

  return { out, outH, outW };
}

export function predictMnistDigit(input28: Float32Array): {
  digit: number;
  confidence: number;
} {
  const { conv1W, conv1B, conv2W, conv2B, fcW, fcB } = getMnistWeights();

  const c1 = conv2dSameRelu(input28, 1, 28, 28, conv1W, conv1B, 8);
  const p1 = maxPool2d(c1, 8, 28, 28, 2, 2);
  const c2 = conv2dSameRelu(p1.out, 8, p1.outH, p1.outW, conv2W, conv2B, 16);
  const p2 = maxPool2d(c2, 16, p1.outH, p1.outW, 3, 3);

  const flat = p2.out; // length 256
  const logits = new Float32Array(10);
  let maxLogit = -Infinity;
  let bestDigit = 0;

  for (let j = 0; j < 10; j++) {
    let sum = fcB[j];
    for (let i = 0; i < 256; i++) {
      sum += flat[i] * fcW[i * 10 + j];
    }
    logits[j] = sum;
    if (sum > maxLogit) {
      maxLogit = sum;
      bestDigit = j;
    }
  }

  let expSum = 0;
  for (let j = 0; j < 10; j++) {
    expSum += Math.exp(logits[j] - maxLogit);
  }
  const confidence = 1 / expSum;

  return { digit: bestDigit, confidence };
}

interface DigitGroup {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  mask: Float32Array; // cropW * cropH values in [0, 1] for this group only
  cropW: number;
  cropH: number;
}

/**
 * Extracts individual digit groups using 8-connected components,
 * merges vertically stacked / horizontally overlapping multi-stroke digits (4, 5, 7),
 * and splits weakly touching digits at vertical ink valleys.
 */
function segmentInkIntoGroups(
  darkness: Float32Array,
  imgW: number,
  imgH: number
): DigitGroup[] {
  const visited = new Uint8Array(imgW * imgH);
  const queue = new Int32Array(imgW * imgH);

  interface RawBlob {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    indices: number[];
  }

  const rawBlobs: RawBlob[] = [];
  const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy = [-1, -1, -1, 0, 0, 1, 1, 1];

  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      const startIdx = y * imgW + x;
      if (visited[startIdx] || darkness[startIdx] <= 0.18) continue;

      let head = 0;
      let tail = 0;
      queue[tail++] = startIdx;
      visited[startIdx] = 1;

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      const indices: number[] = [];

      while (head < tail) {
        const cur = queue[head++];
        indices.push(cur);
        const cx = cur % imgW;
        const cy = (cur - cx) / imgW;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (let d = 0; d < 8; d++) {
          const nx = cx + dx[d];
          const ny = cy + dy[d];
          if (nx < 0 || nx >= imgW || ny < 0 || ny >= imgH) continue;
          const nIdx = ny * imgW + nx;
          if (!visited[nIdx] && darkness[nIdx] > 0.18) {
            visited[nIdx] = 1;
            queue[tail++] = nIdx;
          }
        }
      }

      rawBlobs.push({ minX, minY, maxX, maxY, indices });
    }
  }

  if (rawBlobs.length === 0) return [];

  // Filter out tiny accidental 1-3px dots unless all blobs are tiny
  const significant = rawBlobs.filter((b) => b.indices.length >= 12);
  const blobs = significant.length > 0 ? significant : rawBlobs;

  // Sort left-to-right and merge multi-stroke digits whose x-spans overlap significantly
  blobs.sort((a, b) => a.minX - b.minX);

  let merged = blobs.map((b) => ({
    minX: b.minX,
    minY: b.minY,
    maxX: b.maxX,
    maxY: b.maxY,
    indices: b.indices,
  }));

  let didMerge = true;
  while (didMerge) {
    didMerge = false;
    for (let i = 0; i < merged.length && !didMerge; i++) {
      for (let j = i + 1; j < merged.length && !didMerge; j++) {
        const A = merged[i];
        const B = merged[j];
        const wA = A.maxX - A.minX + 1;
        const wB = B.maxX - B.minX + 1;
        const overlapX = Math.min(A.maxX, B.maxX) - Math.max(A.minX, B.minX) + 1;
        const minW = Math.min(wA, wB);

        if (overlapX > 0 && overlapX / minW >= 0.3) {
          A.minX = Math.min(A.minX, B.minX);
          A.minY = Math.min(A.minY, B.minY);
          A.maxX = Math.max(A.maxX, B.maxX);
          A.maxY = Math.max(A.maxY, B.maxY);
          A.indices = A.indices.concat(B.indices);
          merged.splice(j, 1);
          didMerge = true;
        }
      }
    }
  }

  merged.sort((a, b) => a.minX - b.minX);

  // Convert each merged blob into an isolated local mask, splitting wide touching digits if needed
  const groups: DigitGroup[] = [];

  for (const blob of merged) {
    const cropW = blob.maxX - blob.minX + 1;
    const cropH = blob.maxY - blob.minY + 1;
    const mask = new Float32Array(cropW * cropH);

    for (const idx of blob.indices) {
      const x = idx % imgW;
      const y = (idx - x) / imgW;
      const lx = x - blob.minX;
      const ly = y - blob.minY;
      mask[ly * cropW + lx] = darkness[idx];
    }

    // Attempt valley split only when clearly wider than a single digit (and not a flat minus sign)
    const isMinusShape = cropW > cropH * 2.2 && cropH < 36;
    if (!isMinusShape && cropW > cropH * 1.35 && cropW >= 24) {
      const colCounts = new Float32Array(cropW);
      let maxCol = 0;
      for (let x = 0; x < cropW; x++) {
        let sum = 0;
        for (let y = 0; y < cropH; y++) {
          sum += mask[y * cropW + x];
        }
        colCounts[x] = sum;
        if (sum > maxCol) maxCol = sum;
      }

      const startScan = Math.floor(cropW * 0.25);
      const endScan = Math.ceil(cropW * 0.75);
      let bestX = -1;
      let minCol = Infinity;
      for (let x = startScan; x <= endScan; x++) {
        if (colCounts[x] < minCol) {
          minCol = colCounts[x];
          bestX = x;
        }
      }

      if (bestX > 0 && minCol <= maxCol * 0.16) {
        // Split into left and right sub-masks and trim vertical bounds
        const pushSubMask = (xStart: number, xEnd: number) => {
          let sMinX = xEnd;
          let sMaxX = xStart;
          let sMinY = cropH;
          let sMaxY = -1;
          for (let y = 0; y < cropH; y++) {
            for (let x = xStart; x < xEnd; x++) {
              if (mask[y * cropW + x] > 0.18) {
                if (x < sMinX) sMinX = x;
                if (x > sMaxX) sMaxX = x;
                if (y < sMinY) sMinY = y;
                if (y > sMaxY) sMaxY = y;
              }
            }
          }
          if (sMaxX < sMinX || sMaxY < sMinY) return;
          const sw = sMaxX - sMinX + 1;
          const sh = sMaxY - sMinY + 1;
          const sub = new Float32Array(sw * sh);
          for (let y = 0; y < sh; y++) {
            for (let x = 0; x < sw; x++) {
              sub[y * sw + x] = mask[(sMinY + y) * cropW + (sMinX + x)];
            }
          }
          groups.push({
            minX: blob.minX + sMinX,
            minY: blob.minY + sMinY,
            maxX: blob.minX + sMaxX,
            maxY: blob.minY + sMaxY,
            mask: sub,
            cropW: sw,
            cropH: sh,
          });
        };

        pushSubMask(0, bestX);
        pushSubMask(bestX, cropW);
        continue;
      }
    }

    groups.push({
      minX: blob.minX,
      minY: blob.minY,
      maxX: blob.maxX,
      maxY: blob.maxY,
      mask,
      cropW,
      cropH,
    });
  }

  groups.sort((a, b) => a.minX - b.minX);
  return groups;
}

/**
 * Normalizes a segmented digit mask into an MNIST-aligned 28x28 Float32Array:
 * - Scales preserving aspect ratio to fit inside 20x20
 * - Uses hybrid area-average + max pooling so thick or thin strokes map cleanly to ~2.5px MNIST stroke width
 * - Centers by ink center-of-mass at (14, 14)
 */
function normalizeGroupToMnist28(group: DigitGroup): Float32Array {
  const { mask, cropW, cropH } = group;
  const maxDim = Math.max(cropW, cropH);
  const scale = 20 / maxDim;
  const targetW = Math.max(1, Math.min(20, Math.round(cropW * scale)));
  const targetH = Math.max(1, Math.min(20, Math.round(cropH * scale)));

  const scaled = new Float32Array(targetW * targetH);
  const cellW = cropW / targetW;
  const cellH = cropH / targetH;

  for (let ty = 0; ty < targetH; ty++) {
    const sy0 = Math.floor(ty * cellH);
    const sy1 = Math.min(cropH, Math.ceil((ty + 1) * cellH));
    for (let tx = 0; tx < targetW; tx++) {
      const sx0 = Math.floor(tx * cellW);
      const sx1 = Math.min(cropW, Math.ceil((tx + 1) * cellW));

      let sum = 0;
      let maxV = 0;
      let count = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const row = sy * cropW;
        for (let sx = sx0; sx < sx1; sx++) {
          const v = mask[row + sx];
          sum += v;
          if (v > maxV) maxV = v;
          count++;
        }
      }
      const avg = count > 0 ? sum / count : 0;
      // Blend avg + max when downsampling heavily so finger strokes never wash out
      const val = cellW > 2.5 ? avg * 0.45 + maxV * 0.55 : avg;
      scaled[ty * targetW + tx] = Math.min(1, val);
    }
  }

  // Compute center of mass of the 20x20 scaled digit
  let massSum = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const v = scaled[y * targetW + x];
      massSum += v;
      sumX += x * v;
      sumY += y * v;
    }
  }

  const comX = massSum > 0 ? sumX / massSum : targetW / 2;
  const comY = massSum > 0 ? sumY / massSum : targetH / 2;

  const shiftX = Math.round(13.5 - comX);
  const shiftY = Math.round(13.5 - comY);

  const out28 = new Float32Array(28 * 28);
  for (let y = 0; y < targetH; y++) {
    const dy = y + shiftY;
    if (dy < 0 || dy >= 28) continue;
    for (let x = 0; x < targetW; x++) {
      const dx = x + shiftX;
      if (dx < 0 || dx >= 28) continue;
      out28[dy * 28 + dx] = scaled[y * targetW + x];
    }
  }

  return out28;
}

export async function recognizeCanvasDigits(
  canvas: HTMLCanvasElement
): Promise<string> {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '';

  const { width, height } = canvas;
  if (width <= 0 || height <= 0) return '';

  const imgData = ctx.getImageData(0, 0, width, height);
  const rgba = imgData.data;

  // Quick scan for overall ink bounding box so connected-component segmentation only scans active area
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOff = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = rowOff + x * 4;
      if (rgba[i] < 215 || rgba[i + 1] < 215 || rgba[i + 2] < 215) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return '';

  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  const darkness = new Float32Array(boxW * boxH);

  for (let y = 0; y < boxH; y++) {
    const srcRow = (minY + y) * width * 4;
    const dstRow = y * boxW;
    for (let x = 0; x < boxW; x++) {
      const i = srcRow + (minX + x) * 4;
      const lum = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / (3 * 255);
      const d = 1 - lum;
      darkness[dstRow + x] = d > 0.08 ? Math.min(1, d * 1.15) : 0;
    }
  }

  const groups = segmentInkIntoGroups(darkness, boxW, boxH);
  if (groups.length === 0) return '';

  // Compute median height to detect optional leading minus sign
  const heights = groups.map((g) => g.cropH).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)];

  let result = '';
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (
      i === 0 &&
      groups.length > 1 &&
      g.cropW > g.cropH * 2.2 &&
      g.cropH < medianH * 0.45
    ) {
      result += '-';
      continue;
    }

    const input28 = normalizeGroupToMnist28(g);
    const { digit } = predictMnistDigit(input28);
    result += String(digit);
  }

  return result;
}
