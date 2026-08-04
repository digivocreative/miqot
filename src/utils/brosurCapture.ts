// Rasterisasi brosur jadwal: DOM template → canvas → blob.
//
// Dipindahkan UTUH dari BrochureSchedulePage (4 Agt 2026) supaya brosur jadwal
// yang dirender di dalam Bani menghasilkan gambar yang byte-nya sejenis dengan
// hasil tombol Simpan di halaman Brosur. Pipeline ini penuh detail yang mahal
// ditemukan ulang — pemanasan font per ukuran, jeda dua paint, deteksi hasil
// blank — jadi ia hidup di satu tempat, bukan disalin.
import { captureStableDom } from './stableDomCapture';
import {
  BROCHURE_W,
  BROCHURE_H,
  BROCHURE_BEBAS_FONT,
  BROCHURE_INTER_FONT,
  BROCHURE_LOCAL_FONTS,
  BROCHURE_MONTSERRAT_FONT,
  BROCHURE_OSWALD_FONT,
  BROCHURE_ROBOTO_CONDENSED_FONT,
  BROCHURE_PLAYFAIR_FONT,
} from '../components/BrochureScheduleTemplate';

export const BROSUR_EXPORT_MIME = 'image/jpeg';
export const BROSUR_EXPORT_EXT = 'jpg';
export const BROSUR_EXPORT_QUALITY = 0.9;
// The template is already authored at 1080px wide. Exporting at 2x makes the
// browser rasterize 6.9M pixels and produces multi-MB PNGs; 1x JPG is enough
// for WhatsApp/status sharing and keeps mobile clicks responsive.
export const BROSUR_EXPORT_SCALE = 1;

export function waitForNextPaint(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

export async function waitForFonts() {
  if (!document.fonts) return;
  try {
    // Probe at the actual sizes used in the brochure, not 16px. Some browsers cache
    // font metrics per size — probing at 16 doesn't guarantee 25/40/etc are decoded
    // by the time the export renderer serializes the SVG. Also: only probe weights that are
    // actually self-hosted — asking for weights that do not exist makes the
    // browser synthesize or fall back per character during capture.
    await Promise.all([
      ...[400, 600, 700, 800, 900].map(w => document.fonts.load(`${w} 32px "${BROCHURE_INTER_FONT}"`).catch(() => null)),
      ...[400, 600, 700, 800, 900].map(w => document.fonts.load(`${w} 88px "${BROCHURE_INTER_FONT}"`).catch(() => null)),
      document.fonts.load(`600 13px "${BROCHURE_INTER_FONT}"`).catch(() => null),
      document.fonts.load(`400 25px "${BROCHURE_BEBAS_FONT}"`).catch(() => null),
      document.fonts.load(`400 42px "${BROCHURE_BEBAS_FONT}"`).catch(() => null),
      document.fonts.load(`500 25px "${BROCHURE_OSWALD_FONT}"`).catch(() => null),
      document.fonts.load(`700 17px "${BROCHURE_OSWALD_FONT}"`).catch(() => null),
      document.fonts.load(`700 44px "${BROCHURE_OSWALD_FONT}"`).catch(() => null),
      document.fonts.load(`600 24px "${BROCHURE_ROBOTO_CONDENSED_FONT}"`).catch(() => null),
      document.fonts.load(`600 28px "${BROCHURE_ROBOTO_CONDENSED_FONT}"`).catch(() => null),
      document.fonts.load(`700 25px "${BROCHURE_ROBOTO_CONDENSED_FONT}"`).catch(() => null),
      document.fonts.load(`800 20px "${BROCHURE_MONTSERRAT_FONT}"`).catch(() => null),
      document.fonts.load(`900 40px "${BROCHURE_MONTSERRAT_FONT}"`).catch(() => null),
      document.fonts.load(`800 150px "${BROCHURE_PLAYFAIR_FONT}"`).catch(() => null),
      // Desain alternatif: Bebas (judul Boarding + angka toggle Serambi),
      // Playfair (judul/tanggal/harga Serambi, judul Tasbih), Oswald (tile
      // Tasbih), Montserrat (harga Tasbih).
      document.fonts.load(`400 114px "${BROCHURE_BEBAS_FONT}"`).catch(() => null),
      document.fonts.load(`400 36px "${BROCHURE_BEBAS_FONT}"`).catch(() => null),
      document.fonts.load(`800 108px "${BROCHURE_PLAYFAIR_FONT}"`).catch(() => null),
      document.fonts.load(`800 102px "${BROCHURE_PLAYFAIR_FONT}"`).catch(() => null),
      document.fonts.load(`800 48px "${BROCHURE_PLAYFAIR_FONT}"`).catch(() => null),
      document.fonts.load(`700 34px "${BROCHURE_OSWALD_FONT}"`).catch(() => null),
      document.fonts.load(`900 42px "${BROCHURE_MONTSERRAT_FONT}"`).catch(() => null),
    ]);
    await document.fonts.ready;
    // iOS Safari sometimes resolves `fonts.ready` while individual FontFace entries
    // are still in `loading`. Poll up to ~3 s to catch that race before the renderer
    // captures the DOM with half the glyphs swapped to fallback.
    for (let i = 0; i < 30; i++) {
      const stillLoading = Array.from(document.fonts).some(f => f.status === 'loading');
      if (!stillLoading) break;
      await new Promise(r => setTimeout(r, 100));
    }
    await waitForNextPaint();
    await waitForNextPaint();
  } catch {
    // Best effort: export should continue even if one font load probe fails.
  }
}

export async function waitForImages(target: HTMLElement) {
  const images = Array.from(target.querySelectorAll('img'));
  await Promise.all(images.map(async img => {
    if (img.complete) {
      try { await img.decode?.(); } catch { /* broken image is handled by the template fallback */ }
      return;
    }
    return new Promise<void>(resolve => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        img.removeEventListener('load', done);
        img.removeEventListener('error', done);
        resolve();
      };
      const timer = window.setTimeout(done, 10_000);
      img.addEventListener('load', done);
      img.addEventListener('error', done);
    });
  }));
}

export function isMostlyBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const sampleW = Math.max(1, Math.floor(canvas.width / 8));
  const sampleH = Math.max(1, Math.floor(canvas.height / 8));
  const sample = document.createElement('canvas');
  sample.width = sampleW;
  sample.height = sampleH;
  const sampleCtx = sample.getContext('2d');
  if (!sampleCtx) return false;
  sampleCtx.drawImage(canvas, 0, 0, sampleW, sampleH);
  const data = sampleCtx.getImageData(0, 0, sampleW, sampleH).data;
  let nearWhite = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 248 && data[i + 1] > 248 && data[i + 2] > 248 && data[i + 3] > 248) {
      nearWhite++;
    }
  }
  return nearWhite / (sampleW * sampleH) > 0.97;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string = BROSUR_EXPORT_MIME,
  quality: number = BROSUR_EXPORT_QUALITY,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob && blob.size > 0) resolve(blob);
      else reject(new Error('canvas-to-blob-failed'));
    }, mime, quality);
  });
}

// Rasterize the same full-size DOM node used by the live preview. Fonts are
// embedded from deterministic local sources before the SVG is painted.
export async function captureCanvasFromElement(
  target: HTMLElement,
  scale: number = BROSUR_EXPORT_SCALE,
  signal?: AbortSignal,
): Promise<HTMLCanvasElement> {
  await waitForFonts();
  await waitForImages(target);
  await waitForNextPaint();
  await waitForNextPaint();

  const { canvas, attempts, converged } = await captureStableDom(target, {
    width: BROCHURE_W,
    height: BROCHURE_H,
    scale,
    backgroundColor: '#FFFFFF',
    localFonts: BROCHURE_LOCAL_FONTS,
    // Every brochure font has a TTF source for SVG rasterization, including
    // Playfair. A single prepared capture is therefore deterministic and
    // keeps export readiness responsive on Safari.
    maxAttempts: 1,
    minimumAttempts: 1,
    signal,
  });
  const expectedW = Math.round(BROCHURE_W * scale);
  const expectedH = Math.round(BROCHURE_H * scale);
  if (canvas.width !== expectedW || canvas.height !== expectedH) {
    throw new Error(`unexpected-canvas-size:${canvas.width}x${canvas.height}`);
  }
  if (isMostlyBlank(canvas)) throw new Error('blank-export');
  if (!converged) console.warn(`[brosur] renderer did not converge after ${attempts} attempts; canonical bitmap retained`);
  return canvas;
}
