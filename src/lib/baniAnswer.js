// Penentu "jawaban ini cukup kompleks untuk ditawarkan kirim ke Telegram".
//
// Deterministik, BUKAN keputusan model: tombol yang muncul-hilang mengikuti
// tebakan model akan terasa acak, dan menambah satu lagi field yang bisa gagal
// di JSON balasan. Murni fungsi supaya bisa diuji di tests/bani-telegram.test.js.
//
// Ambangnya dikalibrasi ke gaya jawaban Bani sekarang (maks ~70 kata, daftar
// maks 5 baris — lihat buildBaniSystemPrompt): pertanyaan berupa satu angka
// ("Total outstanding Anda Rp2,8 miliar.") tinggal ±90 karakter dan TIDAK layak
// dikirim, sedangkan rekap berdaftar atau jawaban yang menyeret kartu memang
// layak disimpan di Telegram.

/** Panjang teks jawaban yang sudah terhitung "bukan sekadar satu kalimat". */
export const BANI_COMPLEX_MIN_CHARS = 200;
/** Jumlah baris daftar yang menandakan jawaban berisi rincian, bukan satu fakta. */
export const BANI_COMPLEX_MIN_BULLETS = 3;
/** Kartu sebanyak ini ke atas = detail paket/jamaah yang sayang kalau hilang. */
export const BANI_COMPLEX_MIN_CARDS = 3;

function countBullets(answer) {
  return String(answer || '')
    .split('\n')
    .filter((line) => line.trim().startsWith('- '))
    .length;
}

/**
 * @type {import('./baniAnswer').isComplexBaniAnswer}
 */
export function isComplexBaniAnswer(answer, cards) {
  const text = String(answer || '').trim();
  if (!text) return false;

  // Kartu link cuma pintasan navigasi — tidak menambah isi apa pun.
  const detailCards = (Array.isArray(cards) ? cards : [])
    .filter((card) => card?.type === 'package' || card?.type === 'jamaah');

  return text.length >= BANI_COMPLEX_MIN_CHARS
    || countBullets(text) >= BANI_COMPLEX_MIN_BULLETS
    || detailCards.length >= BANI_COMPLEX_MIN_CARDS;
}
