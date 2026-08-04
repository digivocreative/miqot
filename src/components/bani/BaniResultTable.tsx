// Hasil Bani yang berupa DAFTAR dirender di sini — sengaja di luar bubble chat.
//
// Sebelumnya tiap entitas jadi kartu bertumpuk (avatar 40px + tombol WA, ±86px
// per baris) DAN namanya diulang sebagai butir "- " di dalam bubble. Empat nama
// saja sudah menghabiskan layar dan tiap nama terbaca dua kali. Sekarang bubble
// hanya memuat rangkuman, daftarnya turun ke tabel compact ±34px per baris.
//
// Isi tabel TIDAK PERNAH ditulis model — server (lib/bani-orchestrator.js)
// meng-hydrate `cards` dari hasil tool, komponen ini hanya merendernya.
//
// Yang bisa diklik selalu <button>/<a> DI DALAM sel, bukan <tr> yang dipasangi
// onClick: baris tabel bukan kontrol, dan memaksanya jadi kontrol mematahkan
// navigasi keyboard serta pembacaan screen reader.
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, MessageCircle, Image as ImageIcon } from 'lucide-react';
import { normalizeWaNumber } from '../../utils/phone';
import { useBaniConfirmMotion } from './baniConfirmMotion';

export type BaniPackageCard = {
  type: 'package';
  jadwal_id: string | null;
  nama: string | null;
  berangkat_tgl: string | null;
  pulang_tgl: string | null;
  durasi_hari: number | null;
  maskapai: string | null;
  seat_sisa: number | null;
  sold_out: boolean | null;
  harga_mulai: number | null;
  /** URL publik brosur/itinerary — sudah disaring https-only di server. */
  brosur_url: string | null;
  itinerary_url: string | null;
};

export type BaniJamaahCard = {
  type: 'jamaah';
  jm_id: string | null;
  nama: string | null;
  jk: string | null;
  id_umroh: string | null;
  paket: string | null;
  /** Nama paket LENGKAP (umroh_schedules.jadwal_nama). `paket` hanya tier. */
  paket_nama: string | null;
  tgl_berangkat: string | null;
  /** Hanya terisi dari tool ulang tahun / detail jamaah — bahan kolom Ultah & Umur. */
  tgl_lahir: string | null;
  sisa: number | null;
  bayar: number | null;
  wa: string | null;
};

export type BaniCard = BaniPackageCard | BaniJamaahCard;

export const rupiah = (value: number | null | undefined) => (
  typeof value === 'number' && Number.isFinite(value) ? `Rp${value.toLocaleString('id-ID')}` : null
);

// Nominal untuk SEL KOLOM. "Rp24.400.000" perlu ±78px sedangkan kolomnya 74px,
// jadi angka penuh terpotong di tengah digit — pemotongan yang berbahaya karena
// "Rp24.400.0" masih terbaca seperti angka yang sah. Bentuk ringkasnya ±52px dan
// mengikuti gaya yang sudah dipakai di teks jawaban ("Rp31,9 juta").
// Nilai penuhnya tetap tersedia lewat atribut title.
export const rupiahRingkas = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  // Sisa bisa negatif (lebih bayar). Minusnya di DEPAN "Rp", bukan menyelip di
  // antaranya seperti "Rp-1,5 jt".
  const tanda = value < 0 ? '-' : '';
  const potong = (pembagi: number, satuan: string) => {
    const n = Math.abs(value) / pembagi;
    // Satu angka di belakang koma, tanpa ",0" yang tidak menambah informasi.
    const teks = (Math.round(n * 10) / 10).toLocaleString('id-ID', { maximumFractionDigits: 1 });
    return `${tanda}Rp${teks}${satuan}`;
  };
  if (abs >= 1_000_000_000) return potong(1_000_000_000, ' M');
  if (abs >= 1_000_000) return potong(1_000_000, ' jt');
  if (abs >= 1_000) return potong(1_000, ' rb');
  return `${tanda}Rp${Math.abs(value).toLocaleString('id-ID')}`;
};

// Untuk SEL KOLOM yang lebarnya 74px: "22 Agu 2026" patah jadi dua baris.
// Tahun disembunyikan bila masih tahun berjalan, dan disingkat dua digit bila
// tidak — "22 Agu" / "22 Agu 27" sama-sama muat satu baris.
export const tanggalKolom = (iso: string | null | undefined) => {
  const full = tanggalPendek(iso);
  if (!full) return null;
  const [tgl, bulan, tahun] = full.split(' ');
  return Number(tahun) === new Date().getFullYear() ? `${tgl} ${bulan}` : `${tgl} ${bulan} ${tahun.slice(2)}`;
};

// Keputusan "pakai tahun atau tidak" diambil SEKALI untuk seluruh tabel, bukan
// per baris. Aturan per-baris membuat satu kolom berisi campuran "11 Feb",
// "12 Jul 25", "3 Okt" — lebarnya tidak rata (terbaca berantakan pada perataan
// kanan) dan pembaca tidak punya cara tahu bahwa yang tanpa tahun itu 2026.
// Satu tanggal di luar tahun berjalan sudah cukup untuk memunculkan tahun di
// SEMUA baris.
export function makeTanggalKolom(values: (string | null | undefined)[]) {
  const tahunIni = new Date().getFullYear();
  const tahunDari = (iso: string | null | undefined) => {
    const m = /^(\d{4})-\d{2}-\d{2}/.exec(String(iso || ''));
    return m ? Number(m[1]) : null;
  };
  const perluTahun = values.some((iso) => {
    const tahun = tahunDari(iso);
    return tahun !== null && tahun !== tahunIni;
  });
  return (iso: string | null | undefined) => {
    const full = tanggalPendek(iso);
    if (!full) return null;
    const [tgl, bulan, tahun] = full.split(' ');
    return perluTahun ? `${tgl} ${bulan} ${tahun.slice(2)}` : `${tgl} ${bulan}`;
  };
}

// Tanggal ultah: tahun lahirnya tidak berguna di sebelah kolom Umur, jadi cukup
// tanggal & bulan — sekaligus membuat kolomnya rata.
export const tanggalHariBulan = (iso: string | null | undefined) => {
  const full = tanggalPendek(iso);
  if (!full) return null;
  const [tgl, bulan] = full.split(' ');
  return `${tgl} ${bulan}`;
};

// Umur berjalan (tahun penuh) per hari ini. Ulang tahun yang belum lewat tahun
// ini belum menambah umur — jadi "63 th" di daftar ultah berarti dia akan
// berulang tahun ke-64.
export const umurTahun = (iso: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  const [lahirTahun, lahirBulan, lahirTgl] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const kini = new Date();
  let umur = kini.getFullYear() - lahirTahun;
  const bulanKini = kini.getMonth() + 1;
  if (bulanKini < lahirBulan || (bulanKini === lahirBulan && kini.getDate() < lahirTgl)) umur -= 1;
  return umur >= 0 && umur < 130 ? umur : null;
};

export const tanggalPendek = (iso: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${Number(m[3])} ${bulan[Number(m[2]) - 1]} ${m[1]}`;
};

// Kolom tabel TIDAK tetap — dipilih per pertanyaan oleh model, divalidasi server
// terhadap daftar tertutup (lihat BANI_JAMAAH_COLUMNS / BANI_PACKAGE_COLUMNS di
// lib/bani-orchestrator.js). Kunci yang tidak dikenal di sini diabaikan, jadi
// menambah kolom di server tanpa menambahnya di sini gagal ke arah aman: kolom
// itu sekadar tidak muncul.
export type BaniColumns = { paket: string[]; jamaah: string[] };

// Konteks render disiapkan per TABEL, bukan per baris: `tanggal` sudah tahu
// apakah seluruh kolom tanggal di tabel ini perlu memasang tahun.
type RenderCtx = { tanggal: (iso: string | null | undefined) => string | null };

type ColumnSpec<Row> = {
  label: string;
  render: (row: Row, ctx: RenderCtx) => ReactNode;
  /** Dipakai membangun baris keterangan di bawah nama untuk kolom yang TIDAK dipilih. */
  meta?: (row: Row) => string | null;
  /** Sumber tanggal kolom ini — dipakai memutuskan tampil-tidaknya tahun untuk SEMUA baris. */
  dateValue?: (row: Row) => string | null;
};

// whitespace-nowrap: "22 Agu 2026" di kolom 74px sempat patah jadi dua baris
// dan membuat tinggi baris tabel tidak rata.
const NUM = 'whitespace-nowrap text-[11px] font-bold';
const KOSONG = <span className="text-[11px] font-medium text-gray-300 dark:text-slate-600">—</span>;

const PAKET_COLUMNS: Record<string, ColumnSpec<BaniPackageCard>> = {
  berangkat: {
    label: 'Berangkat',
    render: (row, ctx) => ctx.tanggal(row.berangkat_tgl) || KOSONG,
    meta: (row) => tanggalPendek(row.berangkat_tgl),
    dateValue: (row) => row.berangkat_tgl,
  },
  harga: {
    label: 'Mulai',
    render: (row) => {
      const ringkas = rupiahRingkas(row.harga_mulai);
      return ringkas
        ? <span title={rupiah(row.harga_mulai) || undefined} className="text-emerald-700 dark:text-emerald-400">{ringkas}</span>
        : KOSONG;
    },
    meta: (row) => (rupiahRingkas(row.harga_mulai) ? `mulai ${rupiahRingkas(row.harga_mulai)}` : null),
  },
  seat: {
    label: 'Seat',
    render: (row) => (
      row.sold_out ? <span className="text-red-600 dark:text-red-400">Sold out</span>
        : typeof row.seat_sisa === 'number' ? <span className="text-emerald-700 dark:text-emerald-400">{row.seat_sisa}</span>
          : KOSONG
    ),
  },
  maskapai: { label: 'Maskapai', render: (row) => row.maskapai || KOSONG, meta: (row) => row.maskapai },
  durasi: {
    label: 'Durasi',
    render: (row) => (row.durasi_hari ? `${row.durasi_hari} hari` : KOSONG),
    meta: (row) => (row.durasi_hari ? `${row.durasi_hari} hari` : null),
  },
};

const JAMAAH_COLUMNS: Record<string, ColumnSpec<BaniJamaahCard>> = {
  berangkat: {
    label: 'Berangkat',
    render: (row, ctx) => ctx.tanggal(row.tgl_berangkat) || KOSONG,
    meta: (row) => (tanggalPendek(row.tgl_berangkat) ? `brgkt ${tanggalPendek(row.tgl_berangkat)}` : null),
    dateValue: (row) => row.tgl_berangkat,
  },
  // Pertanyaan ulang tahun butuh tanggal ultah + umurnya, bukan tanggal
  // berangkat. Tahun lahir sengaja tidak ditampilkan: sudah terwakili Umur.
  ultah: {
    label: 'Ultah',
    render: (row) => tanggalHariBulan(row.tgl_lahir) || KOSONG,
    meta: (row) => (tanggalHariBulan(row.tgl_lahir) ? `ultah ${tanggalHariBulan(row.tgl_lahir)}` : null),
  },
  umur: {
    label: 'Umur',
    render: (row) => {
      const umur = umurTahun(row.tgl_lahir);
      return typeof umur === 'number'
        ? <span title={tanggalPendek(row.tgl_lahir) || undefined}>{umur} th</span>
        : KOSONG;
    },
    meta: (row) => (typeof umurTahun(row.tgl_lahir) === 'number' ? `${umurTahun(row.tgl_lahir)} th` : null),
  },
  sisa: {
    label: 'Sisa',
    render: (row) => {
      const ada = typeof row.sisa === 'number' && row.sisa > 0;
      return ada
        ? <span title={rupiah(row.sisa) || undefined} className="text-amber-700 dark:text-amber-400">{rupiahRingkas(row.sisa)}</span>
        : KOSONG;
    },
  },
  bayar: {
    label: 'Dibayar',
    render: (row) => {
      const ada = typeof row.bayar === 'number' && row.bayar > 0;
      return ada
        ? <span title={rupiah(row.bayar) || undefined} className="text-emerald-700 dark:text-emerald-400">{rupiahRingkas(row.bayar)}</span>
        : KOSONG;
    },
  },
  paket: {
    label: 'Paket',
    render: (row) => row.paket_nama || row.paket || KOSONG,
    meta: (row) => row.paket_nama || row.paket,
  },
  kode: { label: 'Kode', render: (row) => row.id_umroh || KOSONG, meta: (row) => row.id_umroh },
};

// Kolom yang tidak naik jadi kolom tersendiri tetap terbaca di baris keterangan
// bawah nama — memilih kolom itu menyorot, bukan membuang.
function buildMeta<Row>(row: Row, specs: Record<string, ColumnSpec<Row>>, shown: string[], order: string[]) {
  return order
    .filter((key) => !shown.includes(key))
    .map((key) => specs[key]?.meta?.(row))
    .filter(Boolean)
    .join(' · ');
}

function resolveColumns<Row>(keys: string[], specs: Record<string, ColumnSpec<Row>>, fallback: string[]) {
  const picked = keys.filter((key) => specs[key]);
  return (picked.length ? picked : fallback).slice(0, 2);
}

// Semua tanggal yang benar-benar TAMPIL di tabel ini menentukan satu format
// bersama, sehingga tidak ada lagi kolom berisi campuran "11 Feb" & "12 Jul 25".
function buildRenderCtx<Row>(rows: Row[], specs: Record<string, ColumnSpec<Row>>, keys: string[]): RenderCtx {
  const values = keys.flatMap((key) => {
    const dateValue = specs[key]?.dateValue;
    return dateValue ? rows.map(dateValue) : [];
  });
  return { tanggal: makeTanggalKolom(values) };
}

// Kontras mode terang (4 Agt 2026): halaman Bani mewarisi gradien gray-50 →
// gray-100 dari DashboardLayout, jadi border-gray-100 sewarna latar dan tepi
// tabel hilang. Tepi dinaikkan ke gray-200 + shadow-sm — resep kartu yang sama
// dengan kartu statistik di DashboardLayout.
const TH = 'px-2.5 py-1.5 text-[9.5px] font-bold uppercase tracking-wider text-gray-600 dark:text-slate-400';
// `group` + sorotan di tingkat <tr>: sebelumnya hover hanya mewarnai sel nama
// (satu-satunya kontrol), dan hasilnya kotak abu setengah baris yang terlihat
// seperti salah render. Sorotan sebaris murni bantuan baca.
const ROW = 'group border-t border-gray-200 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-700/40';
// Sel nama: satu-satunya kontrol utama tiap baris. min-h 40px menjaga sasaran
// sentuh tetap layak walau tabelnya compact.
const NAME_CELL = 'flex min-h-[40px] w-full flex-col justify-center px-2.5 py-1 text-left';
// Umpan balik sentuh untuk sel yang memang kontrol. TANPA active:scale —
// menskalakan satu sel di dalam <table> menggeser garis kolom di sekitarnya.
const NAME_CELL_BUTTON = `${NAME_CELL} transition-colors active:bg-gray-100 dark:active:bg-slate-700`;
const NAME_TEXT = 'truncate text-[11.5px] font-bold leading-tight text-gray-800 dark:text-white';
const META_TEXT = 'truncate text-[9.5px] leading-tight text-gray-500 dark:text-slate-400';

function BaniTableShell({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:shadow-none">
      <table className="w-full table-fixed border-collapse text-left">
        <thead className="bg-gray-100 dark:bg-slate-800/60">{head}</thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function BaniPaketTable({
  rows,
  columns,
  onOpen,
  onOpenBrosur,
}: {
  rows: BaniPackageCard[];
  columns: string[];
  onOpen: (jadwalId: string | null) => void;
  /** Buka brosur baris ini di BrochureModal (fitur Brosur Paket di Jadwal).
      Tanpa handler, tombolnya jatuh ke tab baru berisi file CDN-nya. */
  onOpenBrosur?: (row: BaniPackageCard) => void;
}) {
  const keys = resolveColumns(columns, PAKET_COLUMNS, ['berangkat', 'harga']);
  const ctx = buildRenderCtx(rows, PAKET_COLUMNS, keys);
  const metaOrder = ['berangkat', 'durasi', 'maskapai', 'harga'];
  return (
    <BaniTableShell
      head={(
        <tr>
          <th scope="col" className={TH}>Paket</th>
          {keys.map((key) => (
            <th key={key} scope="col" className={`${TH} w-[74px] text-right`}>{PAKET_COLUMNS[key].label}</th>
          ))}
          <th scope="col" className="w-9"><span className="sr-only">Brosur</span></th>
        </tr>
      )}
    >
      {rows.map((row, idx) => {
        const meta = buildMeta(row, PAKET_COLUMNS, keys, metaOrder);
        return (
          <tr key={`pkg-${row.jadwal_id}-${idx}`} className={ROW}>
            <td className="p-0">
              <button type="button" onClick={() => onOpen(row.jadwal_id)} className={NAME_CELL_BUTTON}>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className={NAME_TEXT}>{row.nama || row.jadwal_id}</span>
                  {/* Sold out ikut nama, bukan kolom: ini peringatan yang harus
                      terbaca berapa pun kolom yang sedang dipilih. */}
                  {row.sold_out && !keys.includes('seat') && (
                    <span className="shrink-0 rounded-full bg-red-50 px-1.5 py-px text-[9px] font-bold text-red-600 dark:bg-red-900/20 dark:text-red-400">Sold out</span>
                  )}
                </span>
                {meta && <span className={META_TEXT}>{meta}</span>}
              </button>
            </td>
            {keys.map((key) => (
              <td key={key} className={`px-2.5 text-right align-middle ${NUM} text-gray-700 dark:text-slate-200`}>
                {PAKET_COLUMNS[key].render(row, ctx)}
              </td>
            ))}
            {/* Sel ekor menampilkan aksi paling berguna untuk baris ini. Ada
                brosur → tombol brosur (permintaan "minta brosur" jadi bisa
                dituntaskan di sini); tidak ada → chevron dekoratif penanda
                bahwa nama paket bisa dibuka. */}
            <td className="pr-1.5 align-middle">
              {row.brosur_url && onOpenBrosur ? (
                <button
                  type="button"
                  onClick={() => onOpenBrosur(row)}
                  aria-label={`Buka brosur ${row.nama || 'paket'}`}
                  title="Buka brosur"
                  className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100 active:scale-95 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                >
                  <ImageIcon size={14} strokeWidth={2.2} />
                </button>
              ) : row.brosur_url ? (
                <a
                  href={row.brosur_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Buka brosur ${row.nama || 'paket'}`}
                  title="Buka brosur"
                  className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100 active:scale-95 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                >
                  <ImageIcon size={14} strokeWidth={2.2} />
                </a>
              ) : (
                <ChevronRight size={14} className="mx-auto text-gray-300 dark:text-slate-600" />
              )}
            </td>
          </tr>
        );
      })}
    </BaniTableShell>
  );
}

export function BaniJamaahTable({
  rows,
  columns,
}: {
  rows: BaniJamaahCard[];
  columns: string[];
}) {
  const keys = resolveColumns(columns, JAMAAH_COLUMNS, ['berangkat']);
  const ctx = buildRenderCtx(rows, JAMAAH_COLUMNS, keys);
  // Baris di bawah nama memuat NAMA PAKET saja. Sebelumnya kode booking dan
  // tanggal berangkat ikut, dan hasilnya "AIW0029471 · HEMAT" — kode panjang
  // yang tak berarti bagi agent mendahului satu-satunya keterangan yang berarti.
  const metaOrder = ['paket'];
  const [confirmRow, setConfirmRow] = useState<BaniJamaahCard | null>(null);

  return (
    <>
      <BaniTableShell
        head={(
          <tr>
            <th scope="col" className={TH}>Jamaah</th>
            {keys.map((key) => (
              <th key={key} scope="col" className={`${TH} w-[74px] text-right`}>{JAMAAH_COLUMNS[key].label}</th>
            ))}
          </tr>
        )}
      >
        {rows.map((row, idx) => {
          const meta = buildMeta(row, JAMAAH_COLUMNS, keys, metaOrder);
          const waNumber = normalizeWaNumber(row.wa);
          const isi = (
            <>
              <span className={NAME_TEXT}>{row.nama || row.jm_id}</span>
              {meta && <span className={META_TEXT}>{meta}</span>}
            </>
          );
          return (
            <tr key={`jm-${row.jm_id}-${idx}`} className={ROW}>
              <td className="p-0">
                {/* Nomor ada → seluruh area nama jadi jalan ke WhatsApp, tapi
                    lewat konfirmasi dulu: membuka aplikasi lain (apalagi ke
                    nomor jamaah) terlalu berat untuk terjadi karena salah
                    sentuh. Tanpa nomor, sel ini teks biasa — bukan tombol mati
                    yang menipu. */}
                {waNumber ? (
                  <button
                    type="button"
                    onClick={() => setConfirmRow(row)}
                    aria-label={`Chat WhatsApp ${row.nama || 'jamaah'}`}
                    className={NAME_CELL_BUTTON}
                  >
                    {isi}
                  </button>
                ) : (
                  <div className={NAME_CELL}>{isi}</div>
                )}
              </td>
              {keys.map((key) => (
                <td key={key} className={`px-2.5 text-right align-middle ${NUM} text-gray-700 dark:text-slate-200`}>
                  {JAMAAH_COLUMNS[key].render(row, ctx)}
                </td>
              ))}
            </tr>
          );
        })}
      </BaniTableShell>

      {/* AnimatePresence menahan dialog tetap terpasang selama animasi tutup —
          tanpa ini `confirmRow` jadi null dan dialognya hilang seketika. */}
      <AnimatePresence>
        {confirmRow && (
          <BaniWaConfirm key="wa-confirm" row={confirmRow} onClose={() => setConfirmRow(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

// Konfirmasi sebelum keluar ke WhatsApp. window.open dipanggil langsung di
// dalam handler klik supaya tetap terhitung gestur pengguna — dipindah ke
// dalam promise/timeout, pemblokir popup akan menelannya.
function BaniWaConfirm({ row, onClose }: { row: BaniJamaahCard; onClose: () => void }) {
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const waNumber = normalizeWaNumber(row.wa);
  const { backdrop, panel } = useBaniConfirmMotion();

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const buka = () => {
    if (waNumber) window.open(`https://wa.me/${waNumber}`, '_blank', 'noopener,noreferrer');
    onClose();
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
      onClick={onClose}
      role="presentation"
      {...backdrop}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs rounded-2xl border border-gray-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-800"
        {...panel}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white">
            <MessageCircle size={15} strokeWidth={2.3} />
          </span>
          <span id={titleId} className="text-[13px] font-bold text-gray-800 dark:text-white">Buka WhatsApp?</span>
        </div>
        <p className="mt-2.5 text-[12px] leading-relaxed text-gray-600 dark:text-slate-300">
          Memulai chat dengan <span className="font-semibold text-gray-800 dark:text-white">{row.nama || 'jamaah ini'}</span>
          {waNumber ? <> di nomor <span className="font-semibold text-gray-800 dark:text-white">+{waNumber}</span></> : null}.
        </p>
        <div className="mt-3.5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-2 text-[11.5px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 active:scale-95 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Batal
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={buka}
            className="flex-1 rounded-xl bg-emerald-700 py-2 text-[11.5px] font-semibold text-white transition-colors hover:bg-emerald-800 active:scale-95"
          >
            Buka WhatsApp
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
