// Refresh cepat sesudah pendaftaran baru: alih-alih sync penuh (bh+dh per tahun,
// ~2.5 dtk per halaman 100 baris, agent besar 30–45 dtk), tarik daftar AWAPI
// `dm/{tahun}/{bulan}` — pendaftaran bulan ini saja, biasanya cukup 1 halaman.
// Pure, tanpa I/O.

// Bulan pendaftaran (WIB) yang perlu ditarik. Tanggal 1 ikut bulan lalu, untuk
// pendaftaran larut malam di hari terakhir bulan. `bulan` sengaja angka tanpa nol
// di depan: upstream mengabaikan filter `09` dan mengembalikan seluruh daftar.
export function recentRegistrationMonths(now = new Date()) {
  const [tahun, bulan, tanggal] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now).split('-').map(Number);
  const months = [{ tahun, bulan }];
  if (tanggal === 1) {
    months.push(bulan === 1 ? { tahun: tahun - 1, bulan: 12 } : { tahun, bulan: bulan - 1 });
  }
  return months;
}

// Tahun Hijriah untuk baris dari daftar pendaftaran — sama dengan sync penuh:
// dari tgl_berangkat, kalau kosong dari tahun pendaftaran (sync penuh memakai
// tahun list dh). Tahun di luar daftar aktif → null (baris dilewati), karena sync
// berkala tak pernah memperbarui atau membersihkan tahun itu.
export function recentRowHijriahYear(row, activeYears, toHijriahYear) {
  const year = toHijriahYear(row?.tgl_berangkat) || toHijriahYear(row?.tgl_daftar);
  return year && activeYears.includes(year) ? year : null;
}
