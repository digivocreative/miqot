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
  /** Membatalkan capture yang sudah tidak relevan (mis. user berganti desain).
   *  Item antrean yang basi langsung dilepas saat gilirannya tiba, sehingga
   *  antrean serial tidak menumpuk capture lama di depan capture aktif. */
  signal?: AbortSignal;
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

// Blink me-raster SVG foreignObject secara sinkron pada drawImage pertama.
// WebKit/Gecko bisa menyelesaikan image.load sebelum font/gambar embedded di
// dalam SVG selesai decode, jadi butuh redraw settle (lihat renderCanvasOnce).
const NEEDS_REDRAW_SETTLE =
  typeof navigator !== 'undefined' && !navigator.userAgent.includes('Chrome');

// Font yang di-embed ke SVG capture dulu SELALU ditarik sebagai .ttf, karena
// WebKit rawan balapan decode WOFF2 di dalam foreignObject dan diam-diam
// memakai font fallback. Tapi .woff2 milik font yang sama SUDAH ada di HTTP
// cache — preview di layar memuatnya lebih dulu — jadi di Blink .ttf berarti
// mengunduh huruf yang sama untuk KEDUA kalinya.
//
// Terukur 1 Agt 2026 (Fast 3G, halaman Brosur Jadwal, cache kosong):
//   .woff2 preview  1,6 → 7,4 dtk   (~1,38 MB)
//   .ttf   capture  7,4 → 12,4 dtk  (~1,29 MB)  ← redundan di Blink
//   render capture  12,4 → 16,2 dtk
//
// Blink merasterisasi WOFF2 di dalam foreignObject dengan andal, jadi di sana
// pakai sumber yang sudah ter-cache. WebKit/Gecko TETAP .ttf — perbaikan
// fallback-font itu sengaja dipertahankan.
const EMBED_PREFERS_TTF = NEEDS_REDRAW_SETTLE;

// Satu rasterisasi DOM → kanvas. Sengaja TIDAK memakai domToCanvas() lib:
// loop fixSvgXmlDecode-nya menggambar ulang kanvas sekali per elemen
// ber-gambar/gradien (drawImageCount) — brosur penuh gradien → puluhan redraw
// × raster ulang SVG penuh = belasan detik per capture di WebKit. Di sini SVG
// dirakit lewat primitive publik lib, lalu redraw settle dibatasi (maks 8) dan
// berhenti dini begitu dua frame berurutan identik — konvergensi terverifikasi,
// bukan sekadar N redraw buta.
async function renderCanvasOnce(
  target: HTMLElement,
  captureOptions: ModernScreenshotOptions,
  signatureWidth: number,
  signatureHeight: number,
  throwIfAborted: () => void,
): Promise<HTMLCanvasElement> {
  const { createContext, destroyContext, domToForeignObjectSvg, loadMedia } = await import('modern-screenshot');
  const context = await createContext(target, captureOptions);
  try {
    const svg = await domToForeignObjectSvg(context);
    throwIfAborted();
    // Setara svgToDataUrl(svg, removeControlCharacter) internal lib.
    const xml = new XMLSerializer()
      .serializeToString(svg)
      .replace(/[\u0000-\u0008\v\f\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/gu, '');
    const image = new Image();
    image.decoding = 'sync';
    image.loading = 'eager';
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    await loadMedia(image, { timeout: context.timeout });
    throwIfAborted();

    // Setara createCanvas() internal lib (maximumCanvasSize tidak dipakai).
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(context.width * context.scale);
    canvas.height = Math.floor(context.height * context.scale);
    canvas.style.width = `${context.width}px`;
    canvas.style.height = `${context.height}px`;
    const context2d = canvas.getContext('2d');
    if (context2d && context.backgroundColor) {
      context2d.fillStyle = context.backgroundColor;
      context2d.fillRect(0, 0, canvas.width, canvas.height);
    }
    context2d?.drawImage(image, 0, 0, canvas.width, canvas.height);

    if (NEEDS_REDRAW_SETTLE && context2d) {
      let previous = canvasSignature(canvas, signatureWidth, signatureHeight);
      for (let i = 0; i < 8; i++) {
        await new Promise(resolve => setTimeout(resolve, 60));
        // Sama seperti loop lib: clearRect tanpa refill background — semua
        // template brosur menggambar latar full-bleed sendiri.
        context2d.clearRect(0, 0, canvas.width, canvas.height);
        context2d.drawImage(image, 0, 0, canvas.width, canvas.height);
        const signature = canvasSignature(canvas, signatureWidth, signatureHeight);
        if (signaturesEqual(previous, signature)) break;
        previous = signature;
      }
    }
    return canvas;
  } finally {
    destroyContext(context);
  }
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
    // Di Blink race itu tidak ada dan .woff2-nya sudah ter-cache oleh preview,
    // jadi .ttf dilewati sama sekali (lihat EMBED_PREFERS_TTF).
    const sources = font.src.endsWith('.woff2') && EMBED_PREFERS_TTF
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
      signal,
    } = options;
    const throwIfAborted = () => {
      if (signal?.aborted) throw new DOMException('stable-capture-aborted', 'AbortError');
    };
    throwIfAborted();
    const attemptsLimit = Math.max(1, Math.min(6, Math.floor(maxAttempts)));
    const attemptsBeforeAccepting = Math.max(1, Math.min(attemptsLimit, Math.floor(minimumAttempts)));
    const fonts = [...localFonts];
    const fontCss = await embeddedFontCss(fonts);
    throwIfAborted();

    let previousSignature: Uint8ClampedArray | null = null;
    let latestCanvas: HTMLCanvasElement | null = null;

    for (let attempt = 1; attempt <= attemptsLimit; attempt++) {
      throwIfAborted();
      const captureOptions: ModernScreenshotOptions = {
        width,
        height,
        scale,
        backgroundColor,
        style: { transform: 'none' },
        timeout: 20_000,
        font: { cssText: fontCss },
        fetch: { requestInit: { cache: 'force-cache' } },
        features: {
          copyScrollbar: false,
          removeAbnormalAttributes: true,
          removeControlCharacter: true,
        },
      };
      latestCanvas = await renderCanvasOnce(target, captureOptions, signatureWidth, signatureHeight, throwIfAborted);
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
