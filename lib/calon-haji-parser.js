// Parser teks PDF "LAMPIRAN ESTIMASI" kantor (daftar calon jamaah Haji Khusus
// PIHK Alhijaz) → baris tabel calon_haji. Murni: teks masuk, baris keluar.
// Apa pun yang tidak dikenal (keterangan/JKN/provinsi baru, nomor urut bolong,
// jumlah ≠ header) MELEMPAR — impor lebih baik gagal keras daripada agent
// salah memberi tahu jamaah "berhak lunas".
import { PDFParse } from 'pdf-parse';

const BULAN = {
  JANUARI: 1, FEBRUARI: 2, MARET: 3, APRIL: 4, MEI: 5, JUNI: 6,
  JULI: 7, AGUSTUS: 8, SEPTEMBER: 9, OKTOBER: 10, NOVEMBER: 11, DESEMBER: 12,
};

// Terpanjang dulu supaya "KEPULAUAN RIAU" tidak terbaca "RIAU", dst.
const PROVINSI = [
  'ACEH', 'SUMATERA UTARA', 'SUMATERA BARAT', 'RIAU', 'KEPULAUAN RIAU', 'JAMBI',
  'SUMATERA SELATAN', 'KEPULAUAN BANGKA BELITUNG', 'BANGKA BELITUNG', // ejaan PDF kantor tanpa "KEPULAUAN"
  'BENGKULU', 'LAMPUNG',
  'DKI JAKARTA', 'JAWA BARAT', 'BANTEN', 'JAWA TENGAH', 'D.I. YOGYAKARTA', 'JAWA TIMUR',
  'BALI', 'NUSA TENGGARA BARAT', 'NUSA TENGGARA TIMUR',
  'KALIMANTAN BARAT', 'KALIMANTAN TENGAH', 'KALIMANTAN SELATAN', 'KALIMANTAN TIMUR', 'KALIMANTAN UTARA',
  'SULAWESI UTARA', 'GORONTALO', 'SULAWESI TENGAH', 'SULAWESI BARAT', 'SULAWESI SELATAN', 'SULAWESI TENGGARA',
  'MALUKU', 'MALUKU UTARA',
  'PAPUA', 'PAPUA BARAT', 'PAPUA BARAT DAYA', 'PAPUA TENGAH', 'PAPUA PEGUNUNGAN', 'PAPUA SELATAN',
].sort((a, b) => b.length - a.length);

const RECORD_START = /(?:^| )(\d{1,4}) (\d{1,2}) (\d{10}) (\d{10,20}) /g;
// Status jemaah = SATU kata (AKTIF/LUNAS/…): kalau bebas, nilai JKN baru seperti
// "AKTIF PBI" akan diam-diam terbaca JKN AKTIF + status "PBI AKTIF".
const RECORD_BODY = /^(.+?) (URUT PORSI|CADANGAN|LANSIA) (NON CADANGAN|CADANGAN) (AKTIF|TERDAFTAR, BELUM AKTIF|BELUM TERDAFTAR|-) ([A-Z]+) (\d{1,3}) 3245 PT\. ALHIJAZ INDOWISATA (.+)$/;

function parseHeader(text) {
  const tgl = text.match(/DATA JEMAAH — (\d{1,2}) ([A-Z]+) (\d{4})/);
  const jml = text.match(/Jumlah jemaah: (\d+)/);
  if (!tgl || !BULAN[tgl[2]] || !jml) throw new Error('header PDF tidak dikenali (tanggal data / Jumlah jemaah)');
  const pad = (n) => String(n).padStart(2, '0');
  return { tanggalData: `${tgl[3]}-${pad(BULAN[tgl[2]])}-${pad(tgl[1])}`, jumlah: Number(jml[1]) };
}

function stripChrome(text) {
  return text
    .replace(/-- \d+ of \d+ --/g, ' ')
    .replace(/Halaman \d+\t[^\n]*/g, ' ')
    .replace(/DATA JEMAAH — [^\n]*/g, ' ')
    .replace(/PIHK: [^\n]*Jumlah jemaah: \d+/g, ' ')
    .replace(/No TAHAP NO PORSI NIK NAMA KETERANGAN STATUS\s+CADANGAN KEPESERTAAN JKN STATUS\s+JEMAAH USIA PIN PIHK KAB\/KOTA PROVINSI/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitLokasi(tail, no) {
  // "B A N T E N" → "BANTEN" (huruf tunggal berspasi, ≥3 huruf).
  const lokasi = tail.replace(/\b(?:[A-Z] ){2,}[A-Z]\b/g, (m) => m.replace(/ /g, '')).trim();
  // Tanpa syarat spasi di depan: PDF kadang menempel "KAB. BANTULD.I. YOGYAKARTA".
  const provinsi = PROVINSI.find((p) => lokasi.endsWith(p));
  const kabKota = provinsi ? lokasi.slice(0, -provinsi.length).trim() : '';
  if (!provinsi || !kabKota) throw new Error(`baris ${no}: provinsi tidak dikenali di "${tail}"`);
  return { kab_kota: kabKota, provinsi };
}

/** @param {string} text keluaran pdf-parse getText() */
export function parseCalonHajiText(text) {
  const header = parseHeader(text);
  const flat = stripChrome(text);

  const starts = [];
  for (const m of flat.matchAll(RECORD_START)) {
    const no = Number(m[1]);
    if (no !== starts.length + 1) continue;
    starts.push({ m, no });
  }

  const rows = starts.map(({ m, no }, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].m.index : flat.length;
    const body = flat.slice(m.index + m[0].length, end).trim();
    const b = body.match(RECORD_BODY);
    if (!b) throw new Error(`baris ${no} tidak dikenali: "${body}"`);
    return {
      no_urut: no,
      tahap: Number(m[2]),
      no_porsi: m[3],
      nik: m[4],
      nama: b[1],
      keterangan: b[2],
      status_cadangan: b[3],
      kepesertaan_jkn: b[4] === '-' ? null : b[4],
      status_jemaah: b[5],
      usia: Number(b[6]),
      ...splitLokasi(b[7], no),
    };
  });

  if (rows.length !== header.jumlah) {
    throw new Error(`jumlah baris terbaca ${rows.length} ≠ Jumlah jemaah di header ${header.jumlah}`);
  }
  return { header, rows };
}

/** @param {Buffer} buffer */
export async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    await parser.load();
    const result = await parser.getText();
    return result?.text ?? '';
  } finally {
    await parser.destroy();
  }
}
