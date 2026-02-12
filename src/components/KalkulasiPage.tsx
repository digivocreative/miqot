import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  User,
  Search,
  ChevronDown,
  Baby,
  Users,
  BedDouble,
  Minus,
  Plus,
  Tag,
  FileText,
  Calendar,
  Save,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { getPackages } from '@/services';
import type { UmrohPackage } from '@/types';

// ============================================
// Types
// ============================================
interface JamaahCounts {
  dewasa: number;
  balitaKasur: number;
  balitaTanpaKasur: number;
  infant: number;
}

interface RoomCounts {
  single: number;
  double: number;
  triple: number;
  quad: number;
}

interface SelectOption {
  id: string;
  label: string;
}

const ROOM_PRICES = {
  single: 52_500_000,
  double: 44_000_000,
  triple: 39_500_000,
  quad: 36_500_000,
};

const BALITA_KASUR_PRICE = 32_000_000;
const BALITA_TANPA_KASUR_PRICE = 28_000_000;
const INFANT_PRICE = 8_500_000;

// ============================================
// Helper: Format Rupiah
// ============================================
function formatRupiah(value: number): string {
  return 'Rp ' + value.toLocaleString('id-ID');
}

// ============================================
// Counter Component
// ============================================
function Counter({
  value,
  onChange,
  min = 0,
  max = 99,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
      >
        <Minus size={16} />
      </button>
      <span className="w-10 text-center font-semibold text-slate-800 text-base tabular-nums">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

// ============================================
// Searchable Select Component
// ============================================
function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  loading,
}: {
  options: SelectOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  loading?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  const selectedLabel = options.find((o) => o.id === value)?.label || '';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className="w-full flex items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-left text-sm transition-all hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:opacity-60"
      >
        {loading ? (
          <span className="flex items-center gap-2 text-slate-400">
            <Loader2 size={16} className="animate-spin" />
            Memuat paket...
          </span>
        ) : (
          <span className={selectedLabel ? 'text-slate-800' : 'text-slate-400'}>
            {selectedLabel || placeholder}
          </span>
        )}
        <ChevronDown
          size={18}
          className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && !loading && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          {/* Dropdown */}
          <div className="absolute left-0 right-0 z-50 mt-2 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
            {/* Search */}
            <div className="p-2 border-b border-slate-100">
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari tanggal atau paket..."
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  autoFocus
                />
              </div>
            </div>
            {/* Option list */}
            <div className="max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-slate-400">
                  Tidak ditemukan
                </div>
              ) : (
                filtered.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onChange(opt.id);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`w-full text-left px-4 py-3 text-sm hover:bg-emerald-50 transition-colors ${
                      value === opt.id
                        ? 'bg-emerald-50 text-emerald-700 font-medium'
                        : 'text-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// Main Page Component
// ============================================
export default function KalkulasiPage() {
  // --- API Data ---
  const [packages, setPackages] = useState<UmrohPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(true);

  // Fetch packages from API (year 1448 only)
  const fetchPackages = useCallback(async () => {
    setLoadingPackages(true);
    const result = await getPackages({ yearCode: '1448' });
    if (result.success) {
      setPackages(result.packages);
    }
    setLoadingPackages(false);
  }, []);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  // Build dropdown options from API data
  const packageOptions: SelectOption[] = useMemo(() => {
    return packages.map((pkg) => {
      const depDate = new Date(pkg.keberangkatan.tgl);
      const dateStr = depDate.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      return {
        id: pkg.jadwalId,
        label: `${dateStr} — ${pkg.nama}`,
      };
    });
  }, [packages]);

  // --- Form State ---
  const [namaLengkap, setNamaLengkap] = useState('');
  const [selectedPackage, setSelectedPackage] = useState('');
  const [jamaah, setJamaah] = useState<JamaahCounts>({
    dewasa: 1,
    balitaKasur: 0,
    balitaTanpaKasur: 0,
    infant: 0,
  });
  const [rooms, setRooms] = useState<RoomCounts>({
    single: 0,
    double: 0,
    triple: 0,
    quad: 0,
  });
  const [isDiscountActive, setIsDiscountActive] = useState(false);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [catatan, setCatatan] = useState('');

  // --- Summary Calculation ---
  const summary = useMemo(() => {
    const items: { label: string; qty: number; unitPrice: number; total: number }[] = [];

    // Dewasa rooms
    if (rooms.quad > 0) {
      items.push({
        label: 'Dewasa Quad Room',
        qty: rooms.quad,
        unitPrice: ROOM_PRICES.quad,
        total: rooms.quad * ROOM_PRICES.quad,
      });
    }
    if (rooms.triple > 0) {
      items.push({
        label: 'Dewasa Triple Room',
        qty: rooms.triple,
        unitPrice: ROOM_PRICES.triple,
        total: rooms.triple * ROOM_PRICES.triple,
      });
    }
    if (rooms.double > 0) {
      items.push({
        label: 'Dewasa Double Room',
        qty: rooms.double,
        unitPrice: ROOM_PRICES.double,
        total: rooms.double * ROOM_PRICES.double,
      });
    }
    if (rooms.single > 0) {
      items.push({
        label: 'Dewasa Single Room',
        qty: rooms.single,
        unitPrice: ROOM_PRICES.single,
        total: rooms.single * ROOM_PRICES.single,
      });
    }

    // Balita + kasur
    if (jamaah.balitaKasur > 0) {
      items.push({
        label: 'Balita (dengan Kasur)',
        qty: jamaah.balitaKasur,
        unitPrice: BALITA_KASUR_PRICE,
        total: jamaah.balitaKasur * BALITA_KASUR_PRICE,
      });
    }

    // Balita tanpa kasur
    if (jamaah.balitaTanpaKasur > 0) {
      items.push({
        label: 'Balita (tanpa Kasur)',
        qty: jamaah.balitaTanpaKasur,
        unitPrice: BALITA_TANPA_KASUR_PRICE,
        total: jamaah.balitaTanpaKasur * BALITA_TANPA_KASUR_PRICE,
      });
    }

    // Infant
    if (jamaah.infant > 0) {
      items.push({
        label: 'Infant (0-23 bln)',
        qty: jamaah.infant,
        unitPrice: INFANT_PRICE,
        total: jamaah.infant * INFANT_PRICE,
      });
    }

    const subtotal = items.reduce((sum, i) => sum + i.total, 0);
    const discount = isDiscountActive ? discountAmount : 0;
    const grandTotal = Math.max(0, subtotal - discount);

    return { items, subtotal, discount, grandTotal };
  }, [rooms, jamaah, isDiscountActive, discountAmount]);

  // ============================================
  // Render
  // ============================================
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* ============================================ */}
      {/* HEADER */}
      {/* ============================================ */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <button
            type="button"
            onClick={() => (window.location.href = '/')}
            className="p-2 -ml-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-500"
            title="Kembali"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Kalkulasi Paket
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Hitung estimasi harga paket untuk calon jamaah.
            </p>
          </div>
        </div>
      </header>

      {/* ============================================ */}
      {/* MAIN CONTENT: Single Column */}
      {/* ============================================ */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <div className="space-y-6">
            {/* ────────────── Section 1: Data Calon Jamaah ────────────── */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 sm:p-6">
              <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <User size={16} className="text-emerald-600" />
                </div>
                Data Calon Jamaah
              </h2>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">
                  Nama Lengkap
                </label>
                <div className="relative">
                  <User
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={namaLengkap}
                    onChange={(e) => setNamaLengkap(e.target.value)}
                    placeholder="Masukkan nama lengkap"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-800 placeholder:text-slate-400 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 hover:border-slate-400"
                  />
                </div>
              </div>
            </section>

            {/* ────────────── Section 2: Pilih Paket ────────────── */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 sm:p-6">
              <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <Tag size={16} className="text-indigo-600" />
                </div>
                Pilih Paket
              </h2>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">
                  Pilih Tanggal & Paket
                </label>
                <SearchableSelect
                  options={packageOptions}
                  value={selectedPackage}
                  onChange={setSelectedPackage}
                  placeholder="Cari dan pilih paket..."
                  loading={loadingPackages}
                />
              </div>
            </section>

            {/* ────────────── Section 3: Komposisi Jamaah ────────────── */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 sm:p-6">
              <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Users size={16} className="text-amber-600" />
                </div>
                Komposisi Jamaah
              </h2>
              <div className="space-y-1">
                {/* Dewasa */}
                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                      <User size={16} className="text-slate-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">Dewasa</p>
                      <p className="text-xs text-slate-400">12 tahun ke atas</p>
                    </div>
                  </div>
                  <Counter
                    value={jamaah.dewasa}
                    onChange={(v) => setJamaah((s) => ({ ...s, dewasa: v }))}
                    min={1}
                  />
                </div>
                {/* Balita + Kasur */}
                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-pink-50 flex items-center justify-center">
                      <Baby size={16} className="text-pink-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">Balita + Kasur</p>
                      <p className="text-xs text-slate-400">2 – 11 tahun, dengan kasur</p>
                    </div>
                  </div>
                  <Counter
                    value={jamaah.balitaKasur}
                    onChange={(v) => setJamaah((s) => ({ ...s, balitaKasur: v }))}
                  />
                </div>
                {/* Balita tanpa Kasur */}
                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-violet-50 flex items-center justify-center">
                      <Baby size={16} className="text-violet-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">Balita tanpa Kasur</p>
                      <p className="text-xs text-slate-400">2 – 11 tahun, tanpa kasur</p>
                    </div>
                  </div>
                  <Counter
                    value={jamaah.balitaTanpaKasur}
                    onChange={(v) => setJamaah((s) => ({ ...s, balitaTanpaKasur: v }))}
                  />
                </div>
                {/* Infant */}
                <div className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-sky-50 flex items-center justify-center">
                      <Baby size={16} className="text-sky-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">Infant</p>
                      <p className="text-xs text-slate-400">0 – 23 bulan</p>
                    </div>
                  </div>
                  <Counter
                    value={jamaah.infant}
                    onChange={(v) => setJamaah((s) => ({ ...s, infant: v }))}
                  />
                </div>
              </div>
            </section>

            {/* ────────────── Section 4: Pilihan Kamar ────────────── */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 sm:p-6">
              <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
                  <BedDouble size={16} className="text-teal-600" />
                </div>
                Pilihan Kamar
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  { key: 'quad' as const, label: 'Quad Room', desc: 'Sekamar 4 orang', price: ROOM_PRICES.quad },
                  { key: 'triple' as const, label: 'Triple Room', desc: 'Sekamar 3 orang', price: ROOM_PRICES.triple },
                  { key: 'double' as const, label: 'Double Room', desc: 'Sekamar 2 orang', price: ROOM_PRICES.double },
                  { key: 'single' as const, label: 'Single Room', desc: 'Sekamar 1 orang', price: ROOM_PRICES.single },
                ]).map((room) => (
                  <div
                    key={room.key}
                    className={`rounded-xl border-2 p-4 transition-all ${
                      rooms[room.key] > 0
                        ? 'border-emerald-400 bg-emerald-50/40 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col items-center text-center">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                          rooms[room.key] > 0 ? 'bg-emerald-100' : 'bg-slate-100'
                        }`}
                      >
                        <BedDouble
                          size={18}
                          className={rooms[room.key] > 0 ? 'text-emerald-600' : 'text-slate-500'}
                        />
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{room.label}</p>
                      <p className="text-[11px] text-slate-400 mb-1">{room.desc}</p>
                      <p className="text-xs font-medium text-slate-500 mb-3">
                        {formatRupiah(room.price)}
                      </p>
                      <Counter
                        value={rooms[room.key]}
                        onChange={(v) =>
                          setRooms((s) => ({ ...s, [room.key]: v }))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ────────────── Section 5: Diskon & Tambahan ────────────── */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 sm:p-6">
              <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
                  <Tag size={16} className="text-rose-500" />
                </div>
                Diskon & Tambahan
              </h2>
              <div className="space-y-4">
                {/* Toggle Diskon */}
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">
                    Aktifkan Diskon
                  </label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isDiscountActive}
                    onClick={() => setIsDiscountActive(!isDiscountActive)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                      isDiscountActive ? 'bg-emerald-500' : 'bg-slate-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isDiscountActive ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Nominal Diskon */}
                {isDiscountActive && (
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1.5">
                      Nominal Diskon (Rp)
                    </label>
                    <input
                      type="number"
                      value={discountAmount || ''}
                      onChange={(e) =>
                        setDiscountAmount(parseInt(e.target.value) || 0)
                      }
                      placeholder="0"
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-800 placeholder:text-slate-400 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 hover:border-slate-400"
                    />
                  </div>
                )}

                {/* Catatan */}
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">
                    Keterangan / Catatan
                    <span className="text-slate-400 font-normal"> (opsional)</span>
                  </label>
                  <textarea
                    value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                    rows={3}
                    placeholder="Tambahkan catatan khusus..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-800 placeholder:text-slate-400 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 hover:border-slate-400 resize-none"
                  />
                </div>
              </div>
            </section>

            {/* ────────────── Section 6: Ringkasan Estimasi ────────────── */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 sm:p-6">
              <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <FileText size={16} className="text-emerald-600" />
                </div>
                Ringkasan Estimasi
              </h2>

              {/* Line items */}
              {summary.items.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-14 h-14 mx-auto rounded-full bg-slate-50 flex items-center justify-center mb-3">
                    <FileText size={22} className="text-slate-300" />
                  </div>
                  <p className="text-sm text-slate-400">
                    Pilih kamar atau tambah jamaah
                  </p>
                  <p className="text-xs text-slate-300 mt-1">
                    untuk melihat ringkasan harga.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 mb-4">
                  {summary.items.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-slate-600">
                        {item.qty}x {item.label}
                      </span>
                      <span className="text-slate-800 font-medium tabular-nums">
                        {formatRupiah(item.total)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Divider + Totals */}
              {summary.items.length > 0 && (
                <>
                  <div className="border-t border-dashed border-slate-200 my-4" />
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Subtotal</span>
                      <span className="text-slate-700 font-medium tabular-nums">
                        {formatRupiah(summary.subtotal)}
                      </span>
                    </div>
                    {summary.discount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-rose-500">Diskon</span>
                        <span className="text-rose-500 font-medium tabular-nums">
                          - {formatRupiah(summary.discount)}
                        </span>
                      </div>
                    )}
                    <div className="border-t border-slate-200 pt-3 mt-2">
                      <div className="flex justify-between items-baseline">
                        <span className="text-sm font-semibold text-slate-700">
                          Grand Total
                        </span>
                        <span className="text-xl font-bold text-emerald-600 tabular-nums">
                          {formatRupiah(summary.grandTotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Action Buttons */}
              <div className="mt-6 space-y-2.5">
                <button
                  type="button"
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors active:scale-[0.98]"
                >
                  <Calendar size={16} />
                  Pilih Tanggal Followup
                </button>
                <button
                  type="button"
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors active:scale-[0.98]"
                >
                  <Save size={16} />
                  Simpan Draft
                </button>
                <button
                  type="button"
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98]"
                >
                  <CheckCircle2 size={18} />
                  Proses Kalkulasi
                </button>
              </div>
            </section>
        </div>
      </div>
    </div>
  );
}
