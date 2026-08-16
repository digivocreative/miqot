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

export interface CapturedVideoPoster {
  blob: Blob;
  width: number;
  height: number;
}

// Poster tak butuh resolusi penuh; 1280 menjaga JPEG jauh di bawah batas
// unggah gambar 3MB tanpa terlihat pecah di feed.
const POSTER_MAX_DIMENSION = 1280;

/**
 * Frame-grab poster dari file video LOKAL (blob picker) via canvas — dilakukan
 * saat memilih file, bukan saat menonton, supaya thumbnail tidak lagi
 * bergantung pada trik seek `#t=` yang gagal diam-diam di perangkat hemat
 * data/baterai. Blob lokal itu same-origin, jadi canvas tidak pernah tainted.
 *
 * Seek ke ~0.1 dtk (bukan 0) supaya lead-in hitam khas rekaman ponsel tidak
 * ikut terpotret. Gagal dalam bentuk apa pun (codec tak terdecode, timeout,
 * toBlob null) mengembalikan null — poster adalah peningkatan progresif,
 * TIDAK boleh menggagalkan unggahan videonya sendiri.
 */
export function captureVideoPoster(source: Blob, timeoutMs = 8000): Promise<CapturedVideoPoster | null> {
  return new Promise(resolve => {
    const objectUrl = URL.createObjectURL(source);
    const video = document.createElement('video');
    let settled = false;

    const finish = (result: CapturedVideoPoster | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };
    const timeoutId = window.setTimeout(() => finish(null), timeoutMs);

    const draw = () => {
      // rAF setelah `seeked`: WebKit kadang belum melukis frame hasil seek
      // pada saat event-nya sendiri diproses.
      requestAnimationFrame(() => {
        try {
          const { videoWidth, videoHeight } = video;
          if (!videoWidth || !videoHeight) return finish(null);
          const scale = Math.min(1, POSTER_MAX_DIMENSION / Math.max(videoWidth, videoHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(videoWidth * scale);
          canvas.height = Math.round(videoHeight * scale);
          const context = canvas.getContext('2d');
          if (!context) return finish(null);
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            blob => finish(blob ? { blob, width: videoWidth, height: videoHeight } : null),
            'image/jpeg',
            0.82,
          );
        } catch {
          finish(null);
        }
      });
    };

    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.addEventListener('error', () => finish(null), { once: true });
    video.addEventListener('loadedmetadata', () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const target = Math.min(0.1, duration > 0 ? duration / 2 : 0.1);
      video.addEventListener('seeked', draw, { once: true });
      try {
        video.currentTime = target;
      } catch {
        finish(null);
      }
    }, { once: true });
    video.src = objectUrl;
    video.load();
  });
}
