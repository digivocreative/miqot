import { WATERMARK } from '../components/PhotoWatermark';

// Membakar watermark ke PIKSEL foto, bukan sekadar menumpuknya di DOM.
// Lapisan DOM di lightbox hanya selamat kalau agent men-screenshot; berkas
// yang diunduh atau dibagikan lewat tombol Download/Share diambil apa adanya
// dari CDN, jadi harus digambar ulang di sini dulu.
//
// Semua angka rupa datang dari WATERMARK di PhotoWatermark.tsx supaya berkas
// yang tersimpan sebanding dengan yang dilihat agent di layar.

async function decode(blob: Blob): Promise<{ bitmap: CanvasImageSource; width: number; height: number; close: () => void }> {
  // createImageBitmap jalur cepat (tanpa layout); <img> jadi jaring pengaman
  // untuk peramban lama yang tidak punya atau menolak format sumbernya.
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return { bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch { /* jatuh ke <img> di bawah */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Gambar tidak bisa dibaca'));
      el.src = url;
    });
    return {
      bitmap: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Kanvas gagal menghasilkan berkas'))),
      type,
      quality,
    );
  });
}

/**
 * Mengembalikan salinan foto dengan watermark tercetak di piksel.
 *
 * Ukurannya turunan LEBAR GAMBAR semata — bukan lebar layar, bukan skala
 * tampilan. Itu yang membuat berkas hasil unduhan sama persis entah agent
 * menekan tombolnya dari ponsel atau desktop; memakai ukuran tampilan membuat
 * foto 1000px keluar 30px dari desktop tapi 63px dari ponsel.
 *
 * Melempar kalau gambarnya tidak bisa dibaca atau kanvasnya ternoda (CORS) —
 * pemanggil yang memutuskan apa yang terjadi setelahnya.
 */
export async function stampWatermarkOnImage(blob: Blob, text: string): Promise<Blob> {
  if (!text) return blob;
  const { bitmap, width, height, close } = await decode(blob);
  try {
    if (!width || !height) throw new Error('Ukuran gambar tidak terbaca');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Kanvas 2d tidak tersedia');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const fontSize = Math.max(WATERMARK.minBurnedFontSize, Math.round(width * WATERMARK.fontSizeRatio));
    const baseline = height - fontSize * WATERMARK.bottomRatio;

    ctx.save();
    ctx.globalAlpha = WATERMARK.opacity;

    // Gradien setinggi lapisan DOM (padding atas 2.5em + teks + padding bawah).
    const bandHeight = Math.min(height, fontSize * 4.8);
    const gradient = ctx.createLinearGradient(0, height - bandHeight, 0, height);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, height - bandHeight, width, bandHeight);

    ctx.font = `700 ${fontSize}px ${WATERMARK.fontFamily}`;
    // Ditiru dari lapisan DOM: tanpa ini teksnya ~5% lebih rapat daripada yang
    // dilihat agent. Properti kanvas ini baru ada di peramban baru (Chrome 99+,
    // Safari 17.4+); yang lama mengabaikannya — selisih kecil, bukan cacat.
    const spacedCtx = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    if ('letterSpacing' in spacedCtx) {
      spacedCtx.letterSpacing = `${fontSize * WATERMARK.letterSpacingRatio}px`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = Math.max(2, fontSize * 0.18);
    ctx.shadowOffsetY = Math.max(1, fontSize * 0.05);
    ctx.fillText(text, width / 2, baseline);
    ctx.restore();

    // PNG dipertahankan supaya transparansi tidak berubah jadi hitam; sisanya
    // (jpg, webp, avif) keluar sebagai JPEG — paling aman dibuka di galeri
    // ponsel dan aplikasi chat mana pun.
    const png = blob.type === 'image/png';
    return await toBlob(canvas, png ? 'image/png' : 'image/jpeg', png ? 1 : 0.92);
  } finally {
    close();
  }
}
