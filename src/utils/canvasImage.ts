// Perkakas bersama untuk membaca gambar ke kanvas dan menuliskannya kembali.
//
// Diangkat UTUH dari stampWatermark.ts saat stampAgentOnBrochure.ts lahir dan
// membutuhkan hal yang persis sama. Dua salinan logika decode itu jebakan:
// perbaikan format atau CORS akan mendarat di satu tempat saja, dan yang satu
// lagi diam-diam tertinggal.

/** Gambar terdekode beserta ukurannya; `close()` melepas sumber dayanya. */
export interface DecodedImage {
  bitmap: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

export async function decodeImageBlob(blob: Blob): Promise<DecodedImage> {
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

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Kanvas gagal menghasilkan berkas'))),
      type,
      quality,
    );
  });
}
