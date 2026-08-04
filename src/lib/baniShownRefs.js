// Referensi apa saja yang TAMPIL di satu giliran Bani.
//
// Dikirim balik bersama riwayat dan dirakit server jadi jangkar
// "[Kartu di layar: paket JBU1529 "RAHMAH PLUS REDSEA", ...]" di pesan
// assistant. Jangkar itulah yang membuat "paket ini", "itu", atau "itinerary-
// nya dong" di pertanyaan berikutnya punya rujukan — system prompt menyuruh
// model mengambil ulang datanya lewat tool memakai id tersebut.
//
// Hanya id & nama yang ikut; ISI kartunya tidak pernah dikirim balik, karena
// angka dan tanggal selalu diambil ulang dari hasil tool putaran ini.
//
// Murni fungsi supaya bisa diuji di tests/bani-orchestrator.test.js — pasangan
// sisi-klien dari sanitizeBaniHistory/sanitizeShownRef di lib/bani-orchestrator.js.

/** Server memangkas shown ke 6; baris tabel dibatasi sejak dari klien. */
export const BANI_SHOWN_CARDS_MAX = 6;

/**
 * @type {import('./baniShownRefs').buildShownRefs}
 */
export function buildShownRefs(turn) {
  const kalkulasi = Array.isArray(turn?.kalkulasi) ? turn.kalkulasi : [];
  const media = Array.isArray(turn?.media) ? turn.media : [];
  const cards = Array.isArray(turn?.cards) ? turn.cards : [];

  const refs = [
    // Parameter kalkulasi didahulukan: pada giliran hitung-hitungan, justru
    // itulah konteks yang paling dibutuhkan pertanyaan lanjutan ("kasih
    // diskon 1 juta", "kalau 3 orang?").
    ...kalkulasi.map((k) => ({
      type: 'kalkulasi',
      id: k?.jadwal_id ?? null,
      nama: k?.nama ?? null,
      tier: k?.tier,
      input: k?.input,
      total: k?.grand_total,
    })),
    // BROSUR & ITINERARY dihitung sebagai paket yang tampil.
    //
    // Ini yang dulu bocor: system prompt menyuruh model MENGOSONGKAN
    // package_ids di giliran yang cuma menampilkan brosur ("Cukup satu
    // kalimat, dan kosongkan package_ids"), jadi giliran itu tidak punya kartu
    // sama sekali — dan tanpa baris ini, ia terkirim TANPA jangkar. Akibatnya
    // "itinerary-nya dong" sesudah brosur kehilangan jadwal_id, dan Bani balik
    // bertanya paket mana yang dimaksud padahal brosurnya masih di layar.
    //
    // Didahulukan dari kartu karena media selalu diminta EKSPLISIT, sementara
    // baris tabel cuma kebetulan ikut terbit; kalau jatah 6 slot harus dipotong,
    // yang diminta eksplisit lebih layak bertahan.
    //
    // brosur_jadwal tidak ikut: yang dirujuknya bulan, bukan paket — ia memang
    // tidak punya jadwal_id.
    ...media
      .filter((m) => m && m.type !== 'brosur_jadwal' && m.jadwal_id)
      .map((m) => ({ type: 'package', id: m.jadwal_id, nama: m.nama ?? null })),
    ...cards.slice(0, BANI_SHOWN_CARDS_MAX).map((c) => (
      c?.type === 'package'
        ? { type: 'package', id: c.jadwal_id ?? null, nama: c.nama ?? null }
        : { type: 'jamaah', id: c?.jm_id ?? null, nama: c?.nama ?? null }
    )),
  ];

  // Paket yang tampil sebagai brosur DAN sebagai baris tabel cukup sekali —
  // jatah 6 slot terlalu sempit untuk diisi rujukan kembar.
  const seen = new Set();
  return refs.filter((ref) => {
    if (!ref.id) return false;
    const key = `${ref.type}:${ref.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
