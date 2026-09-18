// Membakar sticker ke PIKSEL gambar brosur.
//
// Kontraknya blob masuk → blob keluar, tanpa pengetahuan apa pun soal paket,
// jadwal, tier, atau desain brosur. Itu yang membuat ketiga permukaan brosur —
// kartu Jadwal, Brosur Paket, Brosur Jadwal — dilayani satu implementasi, dan
// permukaan keempat nanti tinggal memanggil.
//
// Sikapnya sengaja BERBEDA dari stampAgentOnBrochure, yang fail-silent: di sana
// semua jalur gagal mengembalikan blob asli tanpa suara, karena brosur tanpa
// identitas agent masih berguna. Di sini sticker JUSTRU yang diminta — sticker
// yang hilang diam-diam berarti agent mengirim brosur yang dikira ada
// tempelannya. Jadi setiap kegagalan di modul ini MELEMPAR.
import { stickerById, stickerFullUrl } from '../lib/stickerCatalog.js';
import { placementToRect } from '../lib/stickerLayout.js';
import type { StickerPlacement } from '../lib/stickerLayout';
import { canvasToBlob, decodeImageBlob, type DecodedImage } from './canvasImage';

export const STICKER_OUTPUT_MIME = 'image/jpeg';
export const STICKER_OUTPUT_QUALITY = 0.9;
export const STICKER_OUTPUT_EXT = 'jpg';

// Sticker yang sudah terdekode dipakai ulang: agent kerap menempel sticker yang
// sama di beberapa brosur berturut-turut, dan PNG-nya ±440 KB per keping.
const cache = new Map<string, Promise<DecodedImage>>();

export function loadStickerImage(id: string): Promise<DecodedImage> {
  const cached = cache.get(id);
  if (cached) return cached;

  // JANGAN pakai <img crossOrigin> di sini. Gambar lintas-origin yang
  // di-drawImage lewat elemen <img> bisa menodai kanvas, dan toBlob baru
  // melempar SETELAH semuanya tergambar — jebakan yang sudah menggigit di jalur
  // stamp agent. Bunny mengirim access-control-allow-origin: * (diverifikasi
  // 2026-09-18), jadi fetch → blob → decode berjalan tanpa proxy.
  const pending = (async () => {
    const response = await fetch(stickerFullUrl(id));
    if (!response.ok) throw new Error(`Sticker ${id} gagal diambil (HTTP ${response.status})`);
    return decodeImageBlob(await response.blob());
  })();

  // Kegagalan tidak boleh mengendap di cache — agent yang sinyalnya putus lalu
  // tersambung lagi harus bisa mencoba ulang tanpa memuat ulang halaman.
  pending.catch(() => cache.delete(id));
  cache.set(id, pending);
  return pending;
}

export async function compositeStickers(
  base: Blob,
  placements: StickerPlacement[],
): Promise<Blob> {
  const decodedBase = await decodeImageBlob(base);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = decodedBase.width;
    canvas.height = decodedBase.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Kanvas tidak tersedia');

    ctx.drawImage(decodedBase.bitmap, 0, 0, decodedBase.width, decodedBase.height);

    for (const placement of placements) {
      const def = stickerById(placement.stickerId);
      if (!def) throw new Error(`Sticker ${placement.stickerId} tidak ada di katalog`);
      const image = await loadStickerImage(def.id);
      // Rect dihitung terhadap ukuran NATURAL gambar dasar, dengan fungsi dan
      // rasio yang persis sama dengan yang dipakai panggung editor. Itulah yang
      // menjamin hasilnya sama dengan yang barusan digeser agent.
      const rect = placementToRect(placement, def.aspect, decodedBase.width, decodedBase.height);
      ctx.drawImage(image.bitmap, rect.x, rect.y, rect.w, rect.h);
    }

    if (canvas.width !== decodedBase.width || canvas.height !== decodedBase.height) {
      throw new Error('Dimensi keluaran berubah');
    }
    return await canvasToBlob(canvas, STICKER_OUTPUT_MIME, STICKER_OUTPUT_QUALITY);
  } finally {
    decodedBase.close();
  }
}
