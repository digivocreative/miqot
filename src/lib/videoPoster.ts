/**
 * iOS Safari tidak melukis frame pertama video hanya dengan preload="metadata"
 * (beda dengan Chrome/Android) — elemennya tampil hitam sampai playback mulai.
 * Menambahkan media fragment memaksa Safari melakukan seek, dan seek itulah yang
 * memicu decode + paint satu frame sehingga terlihat seperti thumbnail.
 *
 * Butuh dukungan HTTP Range di server (Bunny CDN & Supabase Storage sudah).
 * Ikut diterapkan ke blob: (preview lokal di composer) — spesifikasi File API
 * mengabaikan fragment saat me-resolve blob URL, jadi seharusnya aman. Karena
 * "seharusnya" bukan "pasti", pemanggil wajib menyediakan jalur mundur ke URL
 * asli lewat onError; lihat videoPreviewFallbackSrc.
 */
const POSTER_FRAGMENT = '#t=0.001';

export function videoPreviewSrc(url: string): string {
  if (!/^(https?|blob):/i.test(url)) return url;
  if (url.includes('#')) return url;
  return `${url}${POSTER_FRAGMENT}`;
}

/**
 * URL asli tanpa fragment poster, untuk dipasang saat elemen video gagal memuat
 * versi ber-fragment. Mengembalikan null bila tidak ada yang perlu dimundurkan
 * (error-nya bukan soal fragment) supaya pemanggil tidak looping set src.
 */
export function videoPreviewFallbackSrc(url: string): string | null {
  return videoPreviewSrc(url) === url ? null : url;
}
