'use client';

/**
 * Turunan kecil brosur (~30 KB, lebar 400px) yang mengisi kerangka selagi
 * brosur aslinya (rata-rata ~650 KB, terbesar 2,4 MB) diunduh dan identitas
 * agent dibakar ke pikselnya. Tujuannya satu: ruang brosur tidak lagi terbaca
 * "kosong" selama beberapa detik pertama.
 *
 * WAJIB kabur. Thumb ini brosur POLOS — belum ada nama dan nomor agent di
 * dalamnya — dan aturan yang sama sejak fitur stempel lahir berlaku di sini:
 * brosur tanpa identitas tidak boleh sempat terbaca, apalagi ter-screenshot.
 * Blur + skala membuatnya jelas sebagai bayangan pemuatan, bukan gambar yang
 * bisa dipakai. `aria-hidden` karena ia tidak menambah informasi apa pun.
 *
 * Gagal memuat = tidak ada yang terjadi: kerangka berkilau di belakangnya tetap
 * jalan, persis seperti saat thumb-nya memang tidak tersedia.
 */
export function BrosurBlurPlaceholder({ thumbUrl }: { thumbUrl?: string | null }) {
  if (!thumbUrl) return null;
  return (
    <img
      src={thumbUrl}
      alt=""
      aria-hidden="true"
      draggable={false}
      // eager: kotaknya bisa saja masih 0px saat ini mount (gambar utama belum
      // mendarat), dan lazy-load pada kotak 0px tidak pernah dievaluasi ulang —
      // jebakan yang sama sudah pernah membuat pratinjau kartu tinggal kerangka.
      loading="eager"
      decoding="async"
      className="absolute inset-0 h-full w-full scale-110 object-cover opacity-80 blur-xl"
    />
  );
}

export default BrosurBlurPlaceholder;
