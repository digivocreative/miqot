import type { Options as ModernScreenshotOptions } from 'modern-screenshot';

interface LocalFont {
  family: string;
  src: string;
  weight?: string | number;
  style?: string;
}

export interface StableDomCaptureOptions {
  width?: number;
  height?: number;
  scale?: number;
  backgroundColor?: string;
  localFonts?: ReadonlyArray<LocalFont>;
  maxAttempts?: number;
  minimumAttempts?: number;
  signatureWidth?: number;
  signatureHeight?: number;
}

export interface StableDomCaptureResult {
  canvas: HTMLCanvasElement;
  attempts: number;
  converged: boolean;
}

// Serialize captures so an abandoned render and a new design selection cannot
// compete for SVG/font decoding on memory-constrained mobile browsers.
let captureQueue: Promise<void> = Promise.resolve();
const fontCssCache = new Map<string, Promise<string>>();

function enqueueCapture<T>(work: () => Promise<T>): Promise<T> {
  const result = captureQueue.then(work, work);
  captureQueue = result.then(() => undefined, () => undefined);
  return result;
}

function canvasSignature(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): Uint8ClampedArray {
  const sample = document.createElement('canvas');
  sample.width = width;
  sample.height = height;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  if (!ctx) return new Uint8ClampedArray();
  ctx.drawImage(canvas, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

function signaturesEqual(left: Uint8ClampedArray | null, right: Uint8ClampedArray): boolean {
  if (!left || left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function embeddedFontCss(fonts: LocalFont[]): Promise<string> {
  const key = JSON.stringify(fonts);
  const cached = fontCssCache.get(key);
  if (cached) return cached;

  const pending = Promise.all(fonts.map(async font => {
    // TTF is slower to download but much less prone to the WebKit SVG/WOFF2
    // decode race. Fall back to the declared source when no TTF is bundled.
    const sources = font.src.endsWith('.woff2')
      ? [font.src.replace(/\.woff2$/i, '.ttf'), font.src]
      : [font.src];
    let response: Response | null = null;
    let source = font.src;
    for (const candidate of sources) {
      const fetched = await fetch(candidate, { cache: 'force-cache' });
      if (!fetched.ok) continue;
      response = fetched;
      source = candidate;
      break;
    }
    if (!response) throw new Error(`font-load-failed:${font.src}`);
    const format = source.endsWith('.ttf') ? 'truetype' : 'woff2';
    const mime = source.endsWith('.ttf') ? 'font/ttf' : 'font/woff2';
    const dataUrl = `data:${mime};base64,${arrayBufferToBase64(await response.arrayBuffer())}`;
    return `@font-face{font-family:'${font.family}';font-style:${font.style || 'normal'};font-weight:${font.weight || 400};font-display:block;src:url('${dataUrl}') format('${format}');}`;
  })).then(lines => lines.join('\n'));
  fontCssCache.set(key, pending);
  pending.catch(() => {
    if (fontCssCache.get(key) === pending) fontCssCache.delete(key);
  });
  return pending;
}

/**
 * Capture a DOM node with deterministic, embedded local fonts.
 *
 * A single SVG foreignObject rasterization can resolve before its embedded
 * fonts have painted. The first frame may therefore contain fallback or
 * missing glyphs even though `document.fonts.ready` has resolved. We warm the
 * deterministic local font sources, and can optionally compare repeated
 * raster signatures. The default TTF path only needs one capture; callers can
 * request multiple attempts for other DOM content.
 */
export function captureStableDom(
  target: HTMLElement,
  options: StableDomCaptureOptions = {},
): Promise<StableDomCaptureResult> {
  return enqueueCapture(async () => {
    const {
      scale = 1,
      width,
      height,
      backgroundColor = '#FFFFFF',
      localFonts = [],
      maxAttempts = 1,
      minimumAttempts = 1,
      signatureWidth = 135,
      signatureHeight = 203,
    } = options;
    const attemptsLimit = Math.max(1, Math.min(6, Math.floor(maxAttempts)));
    const attemptsBeforeAccepting = Math.max(1, Math.min(attemptsLimit, Math.floor(minimumAttempts)));
    const fonts = [...localFonts];
    const fontCss = await embeddedFontCss(fonts);
    const { domToCanvas } = await import('modern-screenshot');

    let previousSignature: Uint8ClampedArray | null = null;
    let latestCanvas: HTMLCanvasElement | null = null;

    for (let attempt = 1; attempt <= attemptsLimit; attempt++) {
      const captureOptions: ModernScreenshotOptions = {
        width,
        height,
        scale,
        backgroundColor,
        style: { transform: 'none' },
        timeout: 20_000,
        drawImageInterval: 100,
        font: { cssText: fontCss },
        fetch: { requestInit: { cache: 'force-cache' } },
        features: {
          copyScrollbar: false,
          removeAbnormalAttributes: true,
          removeControlCharacter: true,
          fixSvgXmlDecode: true,
        },
      };
      latestCanvas = await domToCanvas(target, captureOptions);
      if (attemptsLimit === 1) {
        return { canvas: latestCanvas, attempts: 1, converged: true };
      }

      const signature = canvasSignature(latestCanvas, signatureWidth, signatureHeight);
      if (attempt >= attemptsBeforeAccepting && signaturesEqual(previousSignature, signature)) {
        return { canvas: latestCanvas, attempts: attempt, converged: true };
      }
      previousSignature = signature;
      // SVG foreignObject can report image.decode() before an embedded font has
      // reached its next paint. Give that font paint a frame before making
      // another snapshot; otherwise two fallback-font frames can look stable.
      if (attempt < attemptsLimit) {
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      }
    }

    if (!latestCanvas) throw new Error('stable-capture-empty');
    return { canvas: latestCanvas, attempts: attemptsLimit, converged: false };
  });
}
