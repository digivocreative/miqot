import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Upload, X, CheckCircle2, AlertCircle, Camera, Sparkles, Search, ChevronDown, Check, Mars, Venus, Save, XCircle, Wand2, UserPlus } from 'lucide-react';
import { getAuthHeaders } from './LoginPage';

type ViewMode = 'form' | 'ocr-processing';

interface KtpData {
  nik?: string | null;
  nama?: string | null;
  tempat_lahir?: string | null;
  tgl_lahir?: string | null;
  jenis_kelamin?: string | null;
  alamat?: string | null;
  rt_rw?: string | null;
  kelurahan?: string | null;
  kecamatan?: string | null;
  agama?: string | null;
  status_perkawinan?: string | null;
  pekerjaan?: string | null;
  kewarganegaraan?: string | null;
}

interface SelectOption {
  value: string;
  label: string;
}

interface FormOptions {
  formAction: string;
  hiddenFields: Record<string, string>;
  selects: Record<string, SelectOption[]>;
  selectedValues?: Record<string, string>;
  inputs: Record<string, { type: string; placeholder: string; required: boolean }>;
  textareas: Record<string, { placeholder: string; required: boolean }>;
}

// ── Field config: maps legacy HTML field names to display labels + sections ──
// Fields not listed here are rendered in "Lainnya" with their raw name as label.
// `skip: true` hides the field entirely (buttons, file inputs handled separately, etc.)
interface FieldDef {
  label: string;
  section: 'pendaftaran' | 'jamaah' | 'alamat' | 'paket' | 'pendaftar' | 'auto' | 'lainnya';
  order: number;
  required?: boolean;
  placeholder?: string;
  skip?: boolean;
  searchable?: boolean; // For selects with many options (e.g. tgl berangkat)
  hidden?: boolean;     // Don't render in UI, but auto-fill with defaultValue on submit
  defaultValue?: string; // Auto-filled value (used with `hidden`)
}

const FIELD_CONFIG: Record<string, FieldDef> = {
  // ── Info Pendaftaran ──
  jdaftar:       { label: 'Jenis Daftar', section: 'pendaftaran', order: 1, required: true },
  tgldaftar:     { label: 'Tanggal Daftar', section: 'pendaftaran', order: 2 },
  berangkat:     { label: 'Tanggal Berangkat', section: 'pendaftaran', order: 3, required: true, searchable: true },
  jadwal:        { label: 'Tanggal Berangkat', section: 'pendaftaran', order: 3, required: true, searchable: true },
  vjadwal:       { label: 'Tanggal Berangkat', section: 'pendaftaran', order: 3, required: true, searchable: true },
  tgl_berangkat: { label: 'Tanggal Berangkat', section: 'pendaftaran', order: 3, required: true, searchable: true },

  // ── Data Jamaah ──
  firstname:     { label: 'Nama Depan', section: 'jamaah', order: 10, required: true, placeholder: 'Firstname' },
  first:         { label: 'Nama Depan', section: 'jamaah', order: 10, required: true, placeholder: 'Firstname' },
  middlename:    { label: 'Nama Tengah', section: 'jamaah', order: 11, placeholder: 'Middlename' },
  middle:        { label: 'Nama Tengah', section: 'jamaah', order: 11, placeholder: 'Middlename' },
  lastname:      { label: 'Nama Belakang', section: 'jamaah', order: 12, placeholder: 'Lastname' },
  last:          { label: 'Nama Belakang', section: 'jamaah', order: 12, placeholder: 'Lastname' },
  kelamin:       { label: 'Jenis Kelamin', section: 'jamaah', order: 13, required: true },
  jk:            { label: 'Jenis Kelamin', section: 'jamaah', order: 13, required: true },
  jns_kelamin:   { label: 'Jenis Kelamin', section: 'jamaah', order: 13, required: true },
  ktp:           { label: 'No. KTP', section: 'jamaah', order: 14, required: true, placeholder: 'Nomor KTP' },
  nik:           { label: 'No. KTP', section: 'jamaah', order: 14, required: true, placeholder: 'Nomor KTP' },
  telp:          { label: 'No. Telp/HP Jamaah', section: 'jamaah', order: 15, required: true, placeholder: 'Nomor HP jamaah' },
  hp:            { label: 'No. Telp/HP Jamaah', section: 'jamaah', order: 15, required: true, placeholder: 'Nomor HP jamaah' },
  no_telp:       { label: 'No. Telp/HP Jamaah', section: 'jamaah', order: 15, required: true, placeholder: 'Nomor HP jamaah' },
  tempat_lahir:  { label: 'Tempat Lahir', section: 'jamaah', order: 16, placeholder: 'Kota kelahiran' },
  tempatlahir:   { label: 'Tempat Lahir', section: 'jamaah', order: 16, placeholder: 'Kota kelahiran' },
  tgl_lahir:     { label: 'Tanggal Lahir', section: 'jamaah', order: 17, placeholder: 'DD/MM/YYYY' },
  tgllahir:      { label: 'Tanggal Lahir', section: 'jamaah', order: 17, placeholder: 'DD/MM/YYYY' },
  nikah:         { label: 'Status Nikah', section: 'jamaah', order: 18, required: true },
  status:        { label: 'Status Nikah', section: 'jamaah', order: 18, required: true },
  status_nikah:  { label: 'Status Nikah', section: 'jamaah', order: 18, required: true },
  pekerjaan:     { label: 'Pekerjaan', section: 'jamaah', order: 19, required: true },
  kerja:         { label: 'Pekerjaan', section: 'jamaah', order: 19, required: true },
  pendamping:    { label: 'Pendamping (Keberangkatan)', section: 'jamaah', order: 20, required: true },
  pengalaman:    { label: 'Pengalaman Umrah', section: 'jamaah', order: 21, required: true },
  remarks:       { label: 'Remarks', section: 'jamaah', order: 22, required: true },
  remark:        { label: 'Remarks', section: 'jamaah', order: 22, required: true },
  mahram:        { label: 'Mahram', section: 'jamaah', order: 23, required: true, hidden: true, defaultValue: 'X' },
  kondisi:       { label: 'Kondisi Jamaah', section: 'jamaah', order: 24, required: true, hidden: true, defaultValue: 'X' },
  kondisi_jamaah:{ label: 'Kondisi Jamaah', section: 'jamaah', order: 24, required: true, hidden: true, defaultValue: 'X' },

  // ── Alamat: moved into "Data Jamaah" section, below Pekerjaan (order 19) ──
  alamat:        { label: 'Alamat (Sesuai KTP)', section: 'jamaah', order: 19.5, required: true, placeholder: 'Masukkan keterangan tambahan...' },
  provinsi:      { label: 'Provinsi', section: 'alamat', order: 31 },
  kota:          { label: 'Kab/Kota', section: 'alamat', order: 32 },
  kabkota:       { label: 'Kab/Kota', section: 'alamat', order: 32 },
  kecamatan:     { label: 'Kecamatan', section: 'alamat', order: 33 },
  kelurahan:     { label: 'Desa/Kelurahan', section: 'alamat', order: 34 },
  desa:          { label: 'Desa/Kelurahan', section: 'alamat', order: 34 },

  // ── Paket & Marketing ──
  // paket is a required user-choice field — placed in pendaftaran section right after tgl_berangkat
  // (Marketing & Koordinator are locked → automatically routed to "auto" section at bottom)
  paket:         { label: 'Paket Umroh', section: 'pendaftaran', order: 5, required: true, searchable: true },
  paket_umroh:   { label: 'Paket Umroh', section: 'pendaftaran', order: 5, required: true, searchable: true },
  harga_paket:   { label: 'Harga Paket', section: 'paket', order: 41, placeholder: 'Harga paket' },
  perlengkapan:  { label: 'Perlengkapan & Handling', section: 'paket', order: 42, placeholder: 'Harga perlengkapan' },
  harga_perlengkapan: { label: 'Perlengkapan & Handling', section: 'paket', order: 42, placeholder: 'Harga perlengkapan' },
  lain:          { label: 'Lainnya', section: 'paket', order: 43, placeholder: 'Harga Lainnya' },
  lainnya:       { label: 'Lainnya', section: 'paket', order: 43, placeholder: 'Harga Lainnya' },
  diskon:        { label: 'Disc. Marketing', section: 'paket', order: 44, placeholder: 'Masukan diskon marketing' },
  diskon_marketing: { label: 'Disc. Marketing', section: 'paket', order: 44, placeholder: 'Masukan diskon marketing' },
  marketing:     { label: 'Marketing', section: 'paket', order: 45, required: true, searchable: true },
  vmarketing:    { label: 'Marketing', section: 'paket', order: 45, required: true, searchable: true },
  koordinator:   { label: 'Koordinator', section: 'paket', order: 46, required: true, searchable: true },
  perwakilan:    { label: 'Koordinator', section: 'paket', order: 46, required: true, searchable: true },
  vperwakilan:   { label: 'Koordinator', section: 'paket', order: 46, required: true, searchable: true },
  koord:         { label: 'Koordinator', section: 'paket', order: 46, required: true, searchable: true },

  // ── Nama Pendaftar & No. Telp Pendaftar: moved into "Data Jamaah" section,
  // appearing right before "No. KTP" (order 14) per user preference. ──
  pendaftar:     { label: 'Nama Pendaftar', section: 'jamaah', order: 13.5, required: true, placeholder: 'Nama pendaftar' },
  nama_pendaftar:{ label: 'Nama Pendaftar', section: 'jamaah', order: 13.5, required: true, placeholder: 'Nama pendaftar' },
  tpendaftar:    { label: 'No. Telp/HP Pendaftar', section: 'jamaah', order: 13.6, required: true, hidden: true, defaultValue: '1111111111' },
  tlp_pendaftar: { label: 'No. Telp/HP Pendaftar', section: 'jamaah', order: 13.6, required: true, hidden: true, defaultValue: '1111111111' },

  // ── Keterangan: hidden, submitted as "X" ──
  keterangan:    { label: 'Keterangan (Lain-lain)', section: 'jamaah', order: 22.5, required: true, hidden: true, defaultValue: 'X' },

  // ── Skip these (buttons, file handled separately) ──
  kembali:       { label: '', section: 'lainnya', order: 99, skip: true },
  file_ktp:      { label: '', section: 'lainnya', order: 99, skip: true },
  simpan:        { label: '', section: 'lainnya', order: 99, skip: true },
  submit:        { label: '', section: 'lainnya', order: 99, skip: true },
};

const SECTION_TITLES: Record<string, string> = {
  pendaftaran: 'Info Pendaftaran',
  jamaah: 'Data Jamaah',
  alamat: 'Alamat',
  paket: 'Paket',
  pendaftar: 'Info Pendaftar',
  auto: 'Info Otomatis',
  lainnya: 'Lainnya',
};

// Order: user-actionable fields first, auto-filled info at the bottom
const SECTION_ORDER = ['pendaftaran', 'jamaah', 'alamat', 'paket', 'pendaftar', 'auto', 'lainnya'];

// Field labels that are locked (auto-filled, read-only). Grouped under "Info Otomatis".
const LOCKED_FIELD_LABELS = new Set(['Jenis Daftar', 'Marketing', 'Koordinator']);

function prettifyFieldName(name: string): string {
  // firstname → Firstname, no_ktp → No Ktp, tpendaftar → Tpendaftar, etc.
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function getFieldDef(name: string): FieldDef {
  const lower = name.toLowerCase();
  // Strict direct match only — avoids duplicate label issues from greedy partial matching
  if (FIELD_CONFIG[lower]) return FIELD_CONFIG[lower];
  // For unknown fields, render in Lainnya with prettified label
  return { label: prettifyFieldName(name), section: 'lainnya', order: 90 };
}

// ── Input class matching DESIGN-SYSTEM.md ──
const INPUT_CLASS = 'w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400 disabled:opacity-50';
const INPUT_ERROR_CLASS = 'w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-red-300 dark:border-red-600 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400';
const LABEL_CLASS_INLINE = 'flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 uppercase tracking-wide';
const DUMMY_BTN_CLASS = 'flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 uppercase tracking-wide px-2 py-0.5 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors';

// Labels that should NOT show the Insert (dummy-generate) button
const NO_INSERT_BTN_LABELS = new Set(['Jenis Kelamin', 'Tanggal Berangkat', 'Paket Umroh']);

type AutoFillGender = 'male' | 'female';

const AUTO_PENDAFTAR_NAMES: Record<AutoFillGender, string[]> = {
  male: [
    'AHMAD FAUZI RAMADHAN',
    'MUHAMMAD FARHAN HAKIM',
    'RIZKY ADITYA PRATAMA',
    'HAFIZH ARYA PUTRA',
    'FAJAR MAULANA FIRDAUS',
    'ZAKI ABDURRAHMAN AZIZ',
    'REZA KURNIAWAN SAPUTRA',
    'ILHAM RIZKI MAULANA',
    'DANI AHMAD SYAHPUTRA',
    'YUSUF AKBAR HIDAYAT',
  ],
  female: [
    'SITI AISYAH PUTRI',
    'NUR AULIA ZAHRA',
    'DINA AMELIA SAFITRI',
    'RANI FEBRIANI LESTARI',
    'INTAN NURAINI MAHARANI',
    'AYU LESTARI RAHMA',
    'DEWI ANGGRAINI PUTRI',
    'LAILA FITRIANI AZZAHRA',
    'NADIA SYIFA KAMILA',
    'SELVI APRILIA NINGSIH',
  ],
};

const autoPendaftarNameCursor: Record<AutoFillGender, number> = {
  male: -1,
  female: -1,
};

function detectAutoFillGender(text?: string): AutoFillGender | null {
  const normalized = (text || '').toLowerCase().trim();
  if (!normalized) return null;
  if (/\b(perempuan|wanita|female)\b/.test(normalized) || normalized === 'p' || normalized === 'f') return 'female';
  if (/\b(laki|laki-laki|pria|lelaki|male)\b/.test(normalized) || normalized === 'l' || normalized === 'm') return 'male';
  return null;
}

function detectGenderFromOption(option?: SelectOption): AutoFillGender | null {
  if (!option) return null;
  return detectAutoFillGender(option.label) || detectAutoFillGender(option.value);
}

function findGenderOption(options: SelectOption[], gender: AutoFillGender): SelectOption | undefined {
  return options.find(option => detectGenderFromOption(option) === gender);
}

function nextAutoPendaftarName(gender: AutoFillGender, currentValue = ''): string {
  const names = AUTO_PENDAFTAR_NAMES[gender];
  const current = currentValue.trim().toUpperCase();
  for (let i = 0; i < names.length; i++) {
    autoPendaftarNameCursor[gender] = (autoPendaftarNameCursor[gender] + 1) % names.length;
    const candidate = names[autoPendaftarNameCursor[gender]];
    if (candidate !== current) return candidate;
  }
  return names[0];
}

function dummyValueFor(label: string, gender: AutoFillGender = 'male', currentValue = ''): string {
  const l = label.toLowerCase();
  if (l.includes('no. ktp') || l.includes('nik')) return '111111111111';
  if (l.includes('telp') || l.includes('hp')) return '081234567890';
  if (l.includes('tanggal lahir') || l.includes('tgl lahir')) return '01/01/1990';
  if (l.includes('tempat lahir')) return 'Jakarta';
  if (l.includes('nama pendaftar')) return nextAutoPendaftarName(gender, currentValue);
  if (l.includes('nama depan')) return 'Ahmad';
  if (l.includes('nama tengah')) return 'Budi';
  if (l.includes('nama belakang')) return 'Santoso';
  if (l.includes('alamat')) return 'Jl. Contoh No. 123, Jakarta Selatan';
  if (l.includes('email')) return 'dummy@example.com';
  return 'Data Dummy';
}

// Wrap substrings of `text` matching `query` (case-insensitive) in <mark>.
// Returns plain text when query is empty.
function highlightMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let idx = lower.indexOf(ql, i);
  while (idx !== -1) {
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark key={idx} className="bg-yellow-200 dark:bg-yellow-500/40 text-inherit">
        {text.slice(idx, idx + q.length)}
      </mark>
    );
    i = idx + q.length;
    idx = lower.indexOf(ql, i);
  }
  if (i < text.length) parts.push(text.slice(i));
  return parts;
}

// ── Jadwal label parser ──
// Legacy form labels for "Tanggal Berangkat" arrive as a single string with
// "→" separators, e.g. `13 Juni 2026 → SAUDIA → 25 seat → REGULER PAKET RAHMAH 9HR (KERETA CEPAT)`.
// We split that into structured fields for a richer dropdown UI.
function parseJadwalLabel(label: string): {
  date: string;
  airline: string;
  seats: string;
  packageName: string;
} | null {
  const parts = label.split(/\s*→\s*/).map(p => p.trim()).filter(Boolean);
  if (parts.length < 4) return null;
  const [dateRaw, airlineRaw, seatsRaw, ...rest] = parts;
  // Strip leading zero from day (e.g. "01 Juli 2026" → "1 Juli 2026")
  const date = dateRaw.replace(/^0(\d)/, '$1');
  // Title-case airline name (SAUDIA → Saudia, GARUDA INDONESIA → Garuda Indonesia)
  const airline = airlineRaw.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const packageName = rest.join(' → ');
  const seats = (seatsRaw.match(/\d+/)?.[0] || seatsRaw) + ' seat';
  return { date, airline, seats, packageName };
}

// ── Searchable Select Component ──
interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: boolean;
  disabled?: boolean;
  renderOption?: (option: SelectOption, isSelected: boolean, query: string) => React.ReactNode;
}

function SearchableSelect({ options, value, onChange, placeholder = '— Pilih —', error, disabled, renderOption }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);
  const displayLabel = selected?.label || placeholder;

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Focus search input on open
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    if (!open) setQuery('');
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const borderClass = error
    ? 'border-red-300 dark:border-red-600 focus-within:ring-red-500'
    : 'border-gray-200 dark:border-slate-700 focus-within:ring-emerald-500 focus-within:border-emerald-500';

  // Disabled state: show as readonly, no dropdown, muted appearance
  if (disabled) {
    return (
      <div className={`w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-500 dark:text-slate-400 cursor-not-allowed flex items-center justify-between gap-2`}>
        <span className="truncate">{displayLabel}</span>
        <ChevronDown size={16} className="text-gray-300 dark:text-slate-600 flex-shrink-0 opacity-50" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full ${selected && renderOption ? 'px-2.5 py-2' : 'px-3 py-2.5'} bg-white dark:bg-slate-900 border rounded-xl text-sm text-left outline-none transition-all flex items-center justify-between gap-2 focus:ring-2 ${borderClass}`}
      >
        {selected && renderOption ? (
          <div className="flex-1 min-w-0">{renderOption(selected, false, '')}</div>
        ) : (
          <span className={`truncate ${selected ? 'text-gray-800 dark:text-white' : 'text-gray-400'}`}>
            {displayLabel}
          </span>
        )}
        <ChevronDown size={16} className={`text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Always mounted so we can animate close — visibility controlled via classes. */}
      <div
        aria-hidden={!open}
        className={`absolute left-0 right-0 top-full mt-1 z-40 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-lg overflow-hidden origin-top transition-all duration-150 ease-out ${
          open
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'
        }`}
      >
        {/* Search input — shown only when there are enough options to warrant searching */}
        {options.length >= 8 && (
          <div className="p-2 border-b border-gray-100 dark:border-slate-700/50">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 dark:bg-slate-900 rounded-lg">
              <Search size={14} className="text-gray-400 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Cari..."
                className="flex-1 bg-transparent text-xs text-gray-800 dark:text-white placeholder:text-gray-400 outline-none min-w-0"
                tabIndex={open ? 0 : -1}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  tabIndex={open ? 0 : -1}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Options list */}
        <div className="max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] text-gray-400">
              Tidak ada hasil
            </div>
          ) : (
            filtered.map((opt, i) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={`${opt.value}-${i}`}
                  type="button"
                  tabIndex={open ? 0 : -1}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`w-full flex items-start gap-2 px-3 py-2 text-left text-xs transition-colors ${
                    isSelected
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                      : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <div className="flex-shrink-0 w-3.5 h-3.5 mt-0.5">
                    {isSelected && <Check size={14} className="text-emerald-500" strokeWidth={3} />}
                  </div>
                  <div className="flex-1 min-w-0 leading-snug">
                    {renderOption ? renderOption(opt, isSelected, query) : (
                      <span className={isSelected ? 'font-semibold' : ''}>{opt.label}</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

interface UmrahRegisterPageProps {
  agentSlug?: string;
  onBack: () => void;
  onNavigate?: (path: string) => void;
}

function summarizeSubmitErrorText(text: string) {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  if (/<!doctype html|<html\b|cloudflare|cf-error|attention required|bad gateway|gateway timeout|origin is unreachable/i.test(compact)) {
    return 'Server/proxy mengembalikan halaman error Cloudflare. Cek daftar jamaah dulu; kalau belum masuk, coba ulang beberapa saat lagi.';
  }
  return compact.slice(0, 180);
}

export default function UmrahRegisterPage({ onBack, onNavigate }: UmrahRegisterPageProps) {
  const [options, setOptions] = useState<FormOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [file, setFile] = useState<{ name: string; data: string } | null>(null);
  const [fileName, setFileName] = useState('');
  const [filePreview, setFilePreview] = useState<string | null>(null); // data URL for image preview
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [loadingPaket, setLoadingPaket] = useState(false);

  // ── OCR mode state ──
  // OCR is now integrated inline at the top of the form — no separate view modes
  const [viewMode, setViewMode] = useState<ViewMode>('form');
  const [ocrError, setOcrError] = useState('');
  const [ocrResult, setOcrResult] = useState<KtpData | null>(null);
  // Read `?idb=<id_umroh>` from URL — when present, this binds the new jamaah to an
  // existing ID Umroh (family/group registration). Legacy URL: &.idb=AIW0028715.JBU1539
  const searchParams = new URLSearchParams(window.location.search);
  const bindIdb = searchParams.get('idb') || '';
  const bindFromNama = searchParams.get('from') || '';
  const bindFromDate = searchParams.get('date') || ''; // parent's tgl_berangkat (YYYY-MM-DD)
  const bindFromPaket = searchParams.get('paket') || ''; // parent's paket label (for auto-select)
  if (bindIdb) {
    console.log('[UmrahRegister] bindIdb:', bindIdb, 'from:', bindFromNama, 'date:', bindFromDate, 'paket:', bindFromPaket);
  }

  const fetchOptions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = bindIdb ? `?idb=${encodeURIComponent(bindIdb)}` : '';
      const res = await fetch(`/api/umrah/form-options${qs}`, { headers: getAuthHeaders() });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        // Upstream proxy (Cloudflare/nginx) returned an HTML error page instead
        // of our JSON response — happens on 5xx from origin.
        setError('Sistem internal tidak dapat diakses dari server. Coba lagi atau hubungi admin.');
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setError(data.error || 'Gagal mengambil opsi form');
        setLoading(false);
        return;
      }
      setOptions(data.data);
      console.log('Form options:', data.data);

      // ── Pre-fill default values ──
      const defaults: Record<string, string> = {};

      // Default "Jamaah Baru" for Jenis Daftar select
      for (const selectName of Object.keys(data.data.selects || {})) {
        const def = getFieldDef(selectName);
        if (def.section === 'pendaftaran' && /jenis|jdaftar|jns/i.test(selectName)) {
          const opts: SelectOption[] = data.data.selects[selectName] || [];
          const jamaahBaru = opts.find(o => /jamaah\s*baru|baru/i.test(o.label));
          if (jamaahBaru) defaults[selectName] = jamaahBaru.value;
          break;
        }
      }

      // Auto-fill tgl_daftar with today's date (DD/MM/YYYY) — field is hidden but still submitted
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      const todayStr = `${dd}/${mm}/${yyyy}`;
      for (const inputName of Object.keys(data.data.inputs || {})) {
        if (/tgl_?daftar/i.test(inputName)) {
          defaults[inputName] = todayStr;
          break;
        }
      }

      // Default Jenis Kelamin to Laki-laki
      for (const selectName of Object.keys(data.data.selects || {})) {
        const def = getFieldDef(selectName);
        if (def.label === 'Jenis Kelamin') {
          const opts: SelectOption[] = data.data.selects[selectName] || [];
          const laki = opts.find(o => /^l|laki/i.test(o.label));
          if (laki) defaults[selectName] = laki.value;
          break;
        }
      }

      // Default select values by label → option label match
      const LABEL_DEFAULTS: { fieldLabel: string; optionRegex: RegExp }[] = [
        { fieldLabel: 'Pendamping (Keberangkatan)', optionRegex: /berangkat\s*sendiri/i },
        { fieldLabel: 'Pengalaman Umrah', optionRegex: /belum\s*pernah/i },
      ];
      for (const { fieldLabel, optionRegex } of LABEL_DEFAULTS) {
        for (const selectName of Object.keys(data.data.selects || {})) {
          if (getFieldDef(selectName).label === fieldLabel) {
            const opts: SelectOption[] = data.data.selects[selectName] || [];
            const match = opts.find(o => optionRegex.test(o.label));
            if (match) defaults[selectName] = match.value;
            break;
          }
        }
      }

      // Hidden fields: auto-fill with defaultValue (e.g. mahram="X", kondisi_jamaah="X")
      const allFieldNames = [
        ...Object.keys(data.data.inputs || {}),
        ...Object.keys(data.data.textareas || {}),
        ...Object.keys(data.data.selects || {}),
      ];
      for (const name of allFieldNames) {
        const def = getFieldDef(name);
        if (def.hidden && def.defaultValue !== undefined) {
          defaults[name] = def.defaultValue;
        }
      }

      // Pre-selected values from legacy form (e.g. vjadwal when .idb binds a parent jadwal)
      const preSelected = data.data.selectedValues || {};
      for (const [name, value] of Object.entries(preSelected as Record<string, string>)) {
        if (value) defaults[name] = value;
      }

      if (Object.keys(defaults).length > 0) {
        setFields(prev => ({ ...defaults, ...prev }));
      }
    } catch (err) {
      console.error('fetchOptions error:', err);
      setError('Gagal menghubungi server');
    }
    setLoading(false);
  }, [bindIdb]);

  useEffect(() => {
    document.title = 'Pendaftaran Jamaah Umroh - Alhijaz';
    fetchOptions();
  }, [fetchOptions]);

  // When the form loads in idb-bound mode, auto-select the parent's jadwal on the
  // vjadwal dropdown and trigger dependent options. Strategy:
  //   1. Collect candidate jadwal values — start with legacy's `<option selected>`,
  //      then append every jadwal whose value contains parent's tgl_berangkat.
  //   2. Try each candidate in order: set the field, fetch dependent options, and
  //      check whether the parent's paket label is found in the paket dropdown.
  //      First candidate whose paket list contains the target wins. If no target
  //      paket is provided (bindFromPaket empty), we just accept the first candidate.
  //
  //   This fixes a class of bugs where two jadwals share the same tgl_berangkat
  //   but belong to different pakets — the naive "first match by date" picker
  //   was picking the wrong jadwal, so the paket list shown to the user didn't
  //   include the parent's paket.
  const autoFetchedJadwalRef = useRef(false);
  useEffect(() => {
    if (!options || autoFetchedJadwalRef.current) return;
    autoFetchedJadwalRef.current = true;

    const candidates: { field: string; value: string }[] = [];
    const seen = new Set<string>();
    const push = (field: string, value: string) => {
      const key = `${field}|${value}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ field, value });
    };

    // Strategy 1: server-reported <option selected> values (legacy .idb binding)
    for (const [name, value] of Object.entries(options.selectedValues || {})) {
      if (value && isJadwalField(name)) push(name, value);
    }

    // Strategy 2: every jadwal option whose value contains the parent's date
    if (bindFromDate) {
      for (const name of Object.keys(options.selects)) {
        if (!isJadwalField(name)) continue;
        for (const o of options.selects[name]) {
          if (o.value && o.value.includes(bindFromDate)) push(name, o.value);
        }
      }
    }

    if (candidates.length === 0) return;

    (async () => {
      for (let i = 0; i < candidates.length; i++) {
        const { field, value } = candidates[i];
        console.log(`[UmrahRegister] Trying jadwal candidate ${i + 1}/${candidates.length}:`, field, '=', value);
        setFields(prev => ({ ...prev, [field]: value }));
        const { paketMatched } = await refreshDependentOptions(value, bindFromPaket || undefined);
        // Without a target paket, first candidate wins
        if (!bindFromPaket) break;
        if (paketMatched) {
          console.log('[UmrahRegister] Paket matched for jadwal', value);
          break;
        }
        if (i < candidates.length - 1) {
          console.log('[UmrahRegister] Paket NOT matched for jadwal', value, '— trying next candidate');
        } else {
          console.warn('[UmrahRegister] Exhausted all jadwal candidates — paket could not be auto-matched for', bindFromPaket);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  // Check if a field name represents "jadwal" / tgl berangkat (schedule field)
  const isJadwalField = (name: string) => {
    const def = getFieldDef(name);
    return def.section === 'pendaftaran' && def.label.toLowerCase().includes('berangkat');
  };

  // Refresh dependent options when jadwal is selected:
  // - paket/vmarketing/perwakilan (always populated by _otb.php)
  // - additional fields like kelamin, ktp, status_nikah, pekerjaan, etc. (injected into #otb div)
  //
  // When `targetPaketLabel` is provided (idb-bound flow), this also attempts to
  // auto-select the paket option whose label matches the parent's paket. Returns
  // `{ paketMatched }` so callers can try alternate jadwals if no match is found —
  // multiple jadwals can share the same tgl_berangkat but belong to different pakets.
  const refreshDependentOptions = async (
    jadwal: string,
    targetPaketLabel?: string,
  ): Promise<{ paketMatched: boolean }> => {
    if (!options || !jadwal) return { paketMatched: false };

    console.log('[UmrahDeps] Fetching dependent options for jadwal:', jadwal, targetPaketLabel ? `(target paket: ${targetPaketLabel})` : '');
    setLoadingPaket(true);
    let paketMatched = false;
    try {
      const res = await fetch(`/api/umrah/dependent-options?jadwal=${encodeURIComponent(jadwal)}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      console.log('[UmrahDeps] Response:', { status: res.status, data });
      if (res.ok && data.data && Object.keys(data.data).length > 0) {
        setOptions(prev => {
          if (!prev) return prev;
          const newSelects = { ...prev.selects };
          const newInputs = { ...prev.inputs };
          const newTextareas = { ...prev.textareas };

          // Merge dependent dropdown options (paket, vmarketing, perwakilan)
          for (const [name, opts] of Object.entries(data.data as Record<string, SelectOption[]>)) {
            if (opts && opts.length > 0) {
              newSelects[name] = opts;
            }
          }

          // Merge extra fields discovered from AJAX response (kelamin, ktp, status_nikah, etc.)
          if (data.extraFields) {
            const ex = data.extraFields;
            for (const [name, opts] of Object.entries(ex.selects || {})) {
              if (!newSelects[name] || (newSelects[name].length === 0 && (opts as SelectOption[]).length > 0)) {
                newSelects[name] = opts as SelectOption[];
              }
            }
            for (const [name, info] of Object.entries(ex.inputs || {})) {
              if (!newInputs[name]) newInputs[name] = info as { type: string; placeholder: string; required: boolean };
            }
            for (const [name, info] of Object.entries(ex.textareas || {})) {
              if (!newTextareas[name]) newTextareas[name] = info as { placeholder: string; required: boolean };
            }
          }

          return { ...prev, selects: newSelects, inputs: newInputs, textareas: newTextareas };
        });
        // For each dependent field:
        // - Marketing (vmarketing) & Koordinator (perwakilan): auto-select the first option
        // - Paket: auto-select parent's paket in idb-bound mode, otherwise clear
        const fieldUpdates: Record<string, string> = {};
        const normalizeLabel = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
        const targetNorm = targetPaketLabel ? normalizeLabel(targetPaketLabel) : '';
        for (const [name, opts] of Object.entries(data.data as Record<string, SelectOption[]>)) {
          const def = getFieldDef(name);
          const isPaket = def.label === 'Paket Umroh' || /^paket$/i.test(name);
          const isLocked = def.label === 'Marketing' || def.label === 'Koordinator';
          if (isLocked && opts && opts.length > 0) {
            fieldUpdates[name] = opts[0].value;
          } else if (isPaket && targetNorm && opts && opts.length > 0) {
            // Try exact label match first, then looser contains match both ways
            const match = opts.find(o => normalizeLabel(o.label) === targetNorm)
              || opts.find(o => normalizeLabel(o.label).includes(targetNorm))
              || opts.find(o => targetNorm.includes(normalizeLabel(o.label)));
            if (match) {
              fieldUpdates[name] = match.value;
              paketMatched = true;
              console.log('[UmrahDeps] Auto-matched paket:', targetPaketLabel, '→', match.label, `(${match.value})`);
            } else {
              fieldUpdates[name] = '';
              console.log('[UmrahDeps] No paket match for target', targetPaketLabel, 'in', opts.map(o => o.label));
            }
          } else {
            fieldUpdates[name] = ''; // clear for paket (non-idb flow)
          }
        }

        // Also auto-fill default values for hidden fields that arrived in extraFields
        if (data.extraFields) {
          const allNew = [
            ...Object.keys(data.extraFields.inputs || {}),
            ...Object.keys(data.extraFields.textareas || {}),
            ...Object.keys(data.extraFields.selects || {}),
          ];
          for (const name of allNew) {
            const def = getFieldDef(name);
            if (def.hidden && def.defaultValue !== undefined) {
              fieldUpdates[name] = def.defaultValue;
            }
          }
        }

        setFields(prev => ({ ...prev, ...fieldUpdates }));
        console.log('Dependent options refreshed:', data.data, 'extraFields:', data.extraFields, 'from', data.sourceUrl);
      } else {
        console.warn('Failed to refresh dependent options:', data);
      }
    } catch (err) {
      console.error('refreshDependentOptions error:', err);
    }
    setLoadingPaket(false);
    return { paketMatched };
  };

  const updateField = (name: string, value: string) => {
    // Single source of truth for Nama Pendaftar uppercase — normalizes every code path
    // (typing, Auto button, OCR, OCR retry, hidden-field defaults).
    const normalized = getFieldDef(name).label === 'Nama Pendaftar' ? value.toUpperCase() : value;
    setFields(prev => ({ ...prev, [name]: normalized }));
    if (fieldErrors[name]) setFieldErrors(prev => ({ ...prev, [name]: '' }));

    // When jadwal changes, refresh all dependent dropdowns (paket, marketing, koordinator)
    if (normalized && isJadwalField(name)) {
      refreshDependentOptions(normalized);
    }
  };

  // ── KTP Upload: save file for submit + auto-trigger OCR to auto-fill fields ──
  const handleKtpUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    // Validate size
    if (f.size > 10 * 1024 * 1024) {
      setOcrError('Ukuran file maksimal 10MB');
      return;
    }
    setOcrError('');
    setFieldErrors(prev => ({ ...prev, file_ktp: '' }));

    try {
      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });

      // Save file so it can be submitted as FILE KTP
      setFile({ name: f.name, data: base64 });
      setFileName(f.name);

      // Store data URL for image preview (null for non-image files like PDF)
      if (f.type.startsWith('image/')) {
        setFilePreview(`data:${f.type};base64,${base64}`);
      } else {
        setFilePreview(null);
        return; // Skip OCR for non-image files (e.g. PDF)
      }

      // Auto-trigger OCR to fill form fields
      setViewMode('ocr-processing');
      const res = await fetch('/api/umrah/ocr-ktp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ imageBase64: base64, imageMimeType: f.type }),
      });

      const data = await res.json();
      setViewMode('form');

      if (!res.ok) {
        setOcrError(data.error || 'OCR gagal memproses KTP');
        return;
      }

      setOcrResult(data.data);
      applyOcrToFields(data.data);
    } catch (err) {
      console.error('OCR error:', err);
      setOcrError('Gagal memproses KTP: ' + (err as Error).message);
      setViewMode('form');
    }
  };

  // Apply OCR data to form fields using label-based matching via FIELD_CONFIG
  // (more reliable than keyword matching on legacy field names)
  const applyOcrToFields = (ktp: KtpData, retries = 10) => {
    if (!options) {
      if (retries <= 0) return;
      setTimeout(() => applyOcrToFields(ktp, retries - 1), 500);
      return;
    }

    const updates: Record<string, string> = {};

    // Helpers: find legacy field name by FIELD_CONFIG label
    const findInputByLabel = (label: string): string | undefined => {
      for (const name of Object.keys(options.inputs)) {
        if (getFieldDef(name).label === label) return name;
      }
      return undefined;
    };
    const findTextareaByLabel = (label: string): string | undefined => {
      for (const name of Object.keys(options.textareas)) {
        if (getFieldDef(name).label === label) return name;
      }
      return undefined;
    };
    const findSelectByLabel = (label: string): string | undefined => {
      for (const name of Object.keys(options.selects)) {
        if (getFieldDef(name).label === label) return name;
      }
      return undefined;
    };

    // ── Nama: split into first/middle/last ──
    if (ktp.nama) {
      const parts = ktp.nama.trim().split(/\s+/);
      const first = findInputByLabel('Nama Depan');
      const middle = findInputByLabel('Nama Tengah');
      const last = findInputByLabel('Nama Belakang');
      if (first && parts[0]) updates[first] = parts[0];
      if (parts.length > 2) {
        if (middle) updates[middle] = parts.slice(1, -1).join(' ');
        if (last) updates[last] = parts[parts.length - 1];
      } else if (parts.length === 2) {
        if (last) updates[last] = parts[1];
      }
      // Fallback: if only one "nama" field exists, fill with full name
      if (!first && !last) {
        for (const name of Object.keys(options.inputs)) {
          if (/^nama$|^name$/i.test(name)) {
            updates[name] = ktp.nama;
            break;
          }
        }
      }

      // Nama Pendaftar: default = same as jamaah name (user can edit if different).
      // Legacy requires UPPERCASE — KTP text may already be upper, but normalize to be safe.
      const namaPendaftar = findInputByLabel('Nama Pendaftar');
      if (namaPendaftar) updates[namaPendaftar] = ktp.nama.toUpperCase();
    }

    // ── NIK / No. KTP ──
    if (ktp.nik) {
      const ktpField = findInputByLabel('No. KTP');
      if (ktpField) updates[ktpField] = ktp.nik;
    }

    // ── Tempat Lahir ──
    if (ktp.tempat_lahir) {
      const tl = findInputByLabel('Tempat Lahir');
      if (tl) updates[tl] = ktp.tempat_lahir;
    }

    // ── Tanggal Lahir: convert DD-MM-YYYY → DD/MM/YYYY ──
    if (ktp.tgl_lahir) {
      const tgl = findInputByLabel('Tanggal Lahir');
      if (tgl) updates[tgl] = ktp.tgl_lahir.replace(/-/g, '/');
    }

    // ── Alamat: combine alamat + rt/rw + kelurahan + kecamatan ──
    if (ktp.alamat) {
      const alamatField = findTextareaByLabel('Alamat (Sesuai KTP)');
      if (alamatField) {
        const parts = [
          ktp.alamat,
          ktp.rt_rw ? `RT/RW ${ktp.rt_rw}` : '',
          ktp.kelurahan ? `Kel. ${ktp.kelurahan}` : '',
          ktp.kecamatan ? `Kec. ${ktp.kecamatan}` : '',
        ].filter(Boolean);
        updates[alamatField] = parts.join(', ');
      }
    }

    // ── Jenis Kelamin: match by option label ──
    if (ktp.jenis_kelamin) {
      const klm = findSelectByLabel('Jenis Kelamin');
      if (klm) {
        const isLaki = /^l|laki/i.test(ktp.jenis_kelamin);
        const opts = options.selects[klm] || [];
        const match = opts.find(o => {
          const lbl = o.label.toUpperCase();
          return isLaki ? (lbl === 'L' || lbl.startsWith('LAKI')) : (lbl === 'P' || lbl.startsWith('PEREMPUAN'));
        });
        if (match) updates[klm] = match.value;
      }
    }

    // ── Status Nikah: match by option label ──
    if (ktp.status_perkawinan) {
      const sn = findSelectByLabel('Status Nikah');
      if (sn) {
        const ktpStatus = ktp.status_perkawinan.toUpperCase().trim();
        const isLaki = /^l|laki/i.test(ktp.jenis_kelamin || '');
        const legacyTargets = new Set([ktpStatus]);
        if (/BELUM\s*KAWIN|BELUM\s*MENIKAH/.test(ktpStatus)) legacyTargets.add('BELUM MENIKAH');
        if (/^KAWIN|^MENIKAH/.test(ktpStatus)) legacyTargets.add('MENIKAH');
        if (/CERAI/.test(ktpStatus)) legacyTargets.add(isLaki ? 'DUDA' : 'JANDA');
        const opts = options.selects[sn] || [];
        const match = opts.find(o => {
          const lbl = o.label.toUpperCase().trim();
          return [...legacyTargets].some(target => (
            lbl === target || lbl.includes(target) || target.includes(lbl)
          ));
        });
        if (match) updates[sn] = match.value;
      }
    }

    // ── Pekerjaan: match by option label (fuzzy) ──
    if (ktp.pekerjaan) {
      const pk = findSelectByLabel('Pekerjaan');
      if (pk) {
        const ktpPkr = ktp.pekerjaan.toUpperCase().trim();
        const opts = options.selects[pk] || [];
        // Try exact/startsWith/includes match
        const match =
          opts.find(o => o.label.toUpperCase().trim() === ktpPkr) ||
          opts.find(o => o.label.toUpperCase().startsWith(ktpPkr.slice(0, 5))) ||
          opts.find(o => ktpPkr.includes(o.label.toUpperCase())) ||
          opts.find(o => o.label.toUpperCase().includes(ktpPkr.split(/\s+/)[0]));
        if (match) updates[pk] = match.value;
      }
    }

    // ── Remarks: derive from gender + marital status ──
    // Laki-laki + Kawin → HUSBAND
    // Perempuan + Kawin → WIFE
    // Any + Belum Kawin → SINGLE
    if (ktp.jenis_kelamin && ktp.status_perkawinan) {
      const rm = findSelectByLabel('Remarks');
      if (rm) {
        const isLaki = /^l|laki/i.test(ktp.jenis_kelamin);
        const isKawin = /^kawin|^menikah/i.test(ktp.status_perkawinan.trim());
        const targetLabel = !isKawin ? 'SINGLE' : (isLaki ? 'HUSBAND' : 'WIFE');
        const opts = options.selects[rm] || [];
        const match = opts.find(o => o.label.toUpperCase().trim() === targetLabel);
        if (match) updates[rm] = match.value;
      }
    }

    console.log('[OCR] Applied fields:', updates, '(from KTP:', ktp, ')');
    setFields(prev => ({ ...prev, ...updates }));
  };

  // Find all required visible fields that are empty
  const getEmptyRequiredFields = (): string[] => {
    if (!options) return [];
    const empty: string[] = [];
    const check = (name: string) => {
      const def = getFieldDef(name);
      if (def.skip || def.hidden || !def.required) return;
      const value = fields[name];
      if (value === undefined || value === null || String(value).trim() === '') {
        empty.push(name);
      }
    };
    for (const name of Object.keys(options.selects)) check(name);
    for (const name of Object.keys(options.inputs)) check(name);
    for (const name of Object.keys(options.textareas)) check(name);
    return empty;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!options) return;
    setError('');

    // ── Client-side validation: required fields must be filled ──
    const emptyFields = getEmptyRequiredFields();
    if (emptyFields.length > 0) {
      const errorMap: Record<string, string> = {};
      for (const name of emptyFields) {
        errorMap[name] = 'Wajib diisi';
      }
      setFieldErrors(errorMap);
      setError(`Lengkapi ${emptyFields.length} field yang wajib diisi sebelum submit.`);
      // Scroll to first empty field
      const firstEmpty = emptyFields[0];
      setTimeout(() => {
        const el = document.querySelector(`[name="${firstEmpty}"]`) ||
                   document.querySelector(`[data-field="${firstEmpty}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }

    setSubmitting(true);
    try {
      // ── Pre-submit transforms ──
      const submitFields: Record<string, string> = { ...fields };

      // 1. Default No. HP Jamaah ← No. HP Pendaftar (if jamaah HP empty)
      let hpJamaahName: string | undefined;
      let hpPendaftarName: string | undefined;
      for (const name of Object.keys(options.inputs)) {
        const lbl = getFieldDef(name).label;
        if (lbl === 'No. Telp/HP Jamaah' && !hpJamaahName) hpJamaahName = name;
        if (lbl === 'No. Telp/HP Pendaftar' && !hpPendaftarName) hpPendaftarName = name;
      }
      if (hpJamaahName && hpPendaftarName && !submitFields[hpJamaahName] && submitFields[hpPendaftarName]) {
        submitFields[hpJamaahName] = submitFields[hpPendaftarName];
      }

      // 2. Discover the actual file field name from the legacy form
      let fileFieldName: string | undefined;
      for (const name of Object.keys(options.inputs)) {
        if (options.inputs[name].type === 'file') { fileFieldName = name; break; }
      }

      const res = await fetch('/api/umrah/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          formAction: options.formAction,
          fields: submitFields,
          hiddenFields: options.hiddenFields,
          file: file || undefined,
          fileFieldName,
          idb: bindIdb || undefined,
        }),
      });
      const responseText = await res.text();
      let data: { error?: string; success?: boolean } = {};
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = { error: summarizeSubmitErrorText(responseText) };
      }
      if (!res.ok) {
        setError(data.error || 'Gagal mengirim pendaftaran');
        setSubmitting(false);
        return;
      }
      setSuccess(true);
      setSubmitting(false);
      setTimeout(() => {
        // For idb-bound (group) registration we know the id_umroh — refresh just
        // that booking via API resmi instead of running a full sync. Falls back
        // to full sync for fresh registrations where the new id_umroh is unknown.
        const refreshIdUmroh = bindIdb ? bindIdb.split('.')[0] : '';
        const target = refreshIdUmroh
          ? `/dashboard/jamaah?refresh_id_umroh=${encodeURIComponent(refreshIdUmroh)}`
          : '/dashboard/jamaah?sync=1';
        if (onNavigate) {
          onNavigate(target);
        } else {
          // Fallback: avoid full reload (SW would serve stale shell)
          window.history.pushState({}, '', target);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      }, 1500);
    } catch {
      setError('Gagal menghubungi server');
      setSubmitting(false);
    }
  };

  // ── Loading — skeleton that mirrors the actual form layout ──
  if (loading) {
    const SkeletonBar = ({ className = '', style }: { className?: string; style?: React.CSSProperties }) => (
      <div
        style={style}
        className={`bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded-lg animate-pulse bg-[length:200%_100%] ${className}`}
      />
    );
    return (
      <div className="px-4 pt-4 pb-8 space-y-3">
        {/* Status pill — live indicator while the form scrape runs */}
        <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-900/15 border border-emerald-100 dark:border-emerald-800/30">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Menyiapkan form pendaftaran...</span>
        </div>

        {/* Info Pendaftaran skeleton */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-50 dark:border-slate-700/50">
            <SkeletonBar className="h-3 w-28" />
          </div>
          <div className="p-4 space-y-4">
            <div>
              <SkeletonBar className="h-2.5 w-20 mb-2" />
              <SkeletonBar className="h-10 w-full" />
            </div>
            <div>
              <SkeletonBar className="h-2.5 w-24 mb-2" />
              <SkeletonBar className="h-10 w-full" />
            </div>
          </div>
        </div>

        {/* KTP OCR skeleton */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-50 dark:border-slate-700/50 flex items-center gap-2">
            <Sparkles size={14} className="text-gray-300 dark:text-slate-600 animate-pulse" />
            <SkeletonBar className="h-3 w-32" />
          </div>
          <div className="p-4">
            <div className="h-36 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center gap-2 bg-gray-50/50 dark:bg-slate-900/30">
              <Camera size={28} className="text-gray-300 dark:text-slate-600 animate-pulse" />
              <SkeletonBar className="h-2.5 w-24" />
            </div>
          </div>
        </div>

        {/* Data Jamaah skeleton */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-50 dark:border-slate-700/50">
            <SkeletonBar className="h-3 w-24" />
          </div>
          <div className="p-4 space-y-4">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i}>
                <SkeletonBar className="h-2.5 w-20 mb-2" style={{ animationDelay: `${i * 80}ms` }} />
                <SkeletonBar className="h-10 w-full" style={{ animationDelay: `${i * 80}ms` }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Error (no form loaded) ──
  if (error && !options) {
    return (
      <div className="px-4 py-12 text-center">
        <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
        <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">{error}</p>
        <p className="text-xs text-gray-500 dark:text-slate-400 mb-6">
          Pastikan Anda sudah terhubung ke sistem internal di halaman Jamaah.
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={onBack} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-all text-sm font-medium">
            Kembali
          </button>
          <button onClick={fetchOptions} className="px-4 py-2 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-all text-sm font-medium">
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  // ── Success ──
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <CheckCircle2 size={48} className="text-emerald-500" />
        <p className="text-sm font-bold text-gray-900 dark:text-white">Pendaftaran Berhasil!</p>
        <p className="text-xs text-gray-500 dark:text-slate-400">Mengalihkan ke halaman jamaah...</p>
      </div>
    );
  }

  if (!options) return null;

  // ── Build ordered field list ──
  // Only render required fields. Optional fields are still tracked in state
  // (e.g., from OCR auto-fill) and submitted silently.
  type FieldEntry = { name: string; type: 'select' | 'input' | 'textarea'; def: FieldDef };
  const allFields: FieldEntry[] = [];

  const includeField = (def: FieldDef) => !def.skip && !def.hidden && def.required === true;

  for (const name of Object.keys(options.selects)) {
    const def = getFieldDef(name);
    if (includeField(def)) allFields.push({ name, type: 'select', def });
  }
  for (const name of Object.keys(options.inputs)) {
    const def = getFieldDef(name);
    if (includeField(def)) allFields.push({ name, type: 'input', def });
  }
  for (const name of Object.keys(options.textareas)) {
    const def = getFieldDef(name);
    if (includeField(def)) allFields.push({ name, type: 'textarea', def });
  }

  // Group by section. Locked (auto-filled, disabled) fields are redirected
  // to the "auto" section so they appear at the bottom of the form.
  const sections: Record<string, FieldEntry[]> = {};
  for (const entry of allFields) {
    const sec = LOCKED_FIELD_LABELS.has(entry.def.label) ? 'auto' : entry.def.section;
    if (!sections[sec]) sections[sec] = [];
    sections[sec].push(entry);
  }

  // Sort each section's entries by order
  for (const sec of Object.keys(sections)) {
    sections[sec].sort((a, b) => a.def.order - b.def.order);
  }

  const getSelectedAutoFillGender = (): AutoFillGender => {
    for (const [selectName, opts] of Object.entries(options.selects)) {
      if (getFieldDef(selectName).label !== 'Jenis Kelamin') continue;
      const selectedValue = fields[selectName] || '';
      const selectedOption = opts.find(option => option.value === selectedValue);
      const detected = detectGenderFromOption(selectedOption) || detectAutoFillGender(selectedValue);
      if (detected) return detected;
    }
    return 'male';
  };

  // ── Auto-fill all fields in "Data Jamaah" section in one click ──
  const handleAutoFillJamaah = () => {
    const entries = sections['jamaah'];
    if (!entries || entries.length === 0) return;
    const updates: Record<string, string> = {};
    let autoFillGender = getSelectedAutoFillGender();
    for (const { name, type, def } of entries) {
      const label = def.label;
      if (type === 'select') {
        const opts = options.selects[name] || [];
        if (opts.length === 0) continue;
        if (label === 'Jenis Kelamin') {
          const genderChoice = findGenderOption(opts, autoFillGender) || findGenderOption(opts, 'male') || opts[0];
          if (genderChoice) {
            updates[name] = genderChoice.value;
            autoFillGender = detectGenderFromOption(genderChoice) || autoFillGender;
          }
          continue;
        }
        const preferred = label === 'Pekerjaan'
          ? opts.find(o => o.value && /karyawan\s*swasta/i.test(o.label))
          : undefined;
        const firstUsable = opts.find(o => o.value && o.value.trim() !== '');
        const choice = preferred || firstUsable;
        if (choice) updates[name] = choice.value;
      } else {
        const val = dummyValueFor(label, autoFillGender, fields[name]);
        updates[name] = label === 'Nama Pendaftar' ? val.toUpperCase() : val;
      }
    }
    if (Object.keys(updates).length === 0) return;
    setFields(prev => ({ ...prev, ...updates }));
    setFieldErrors(prev => {
      const cleared = { ...prev };
      for (const name of Object.keys(updates)) cleared[name] = '';
      return cleared;
    });
  };

  // ── Render helpers ──
  const renderLabelRow = (label: string, required: boolean, onDummy: (() => void) | null, extra?: React.ReactNode) => {
    const showBtn = onDummy && !NO_INSERT_BTN_LABELS.has(label);
    return (
      <div className="flex items-center justify-between mb-1.5">
        <label className={LABEL_CLASS_INLINE}>
          {label} {required && <span className="text-red-500">*</span>}
          {extra}
        </label>
        {showBtn && (
          <button type="button" onClick={onDummy} className={DUMMY_BTN_CLASS} title="Isi dengan data dummy">
            <Wand2 size={10} strokeWidth={2.5} />
            Auto
          </button>
        )}
      </div>
    );
  };

  const renderSelect = (name: string, label: string, required: boolean, _searchable = false, hideAuto = false) => {
    const opts = options.selects[name] || [];
    const fieldLabel = getFieldDef(name).label;
    // paket, marketing, koordinator are all dependent on jadwal selection
    const isDependentField = ['Paket Umroh', 'Marketing', 'Koordinator'].includes(fieldLabel);
    const showLoading = isDependentField && loadingPaket;
    // Fields locked to auto-assigned defaults — rendered as disabled (read-only).
    // In idb-bound mode, Tanggal Berangkat also locks because the parent's jadwal is inherited.
    const isLocked =
      fieldLabel === 'Jenis Daftar' ||
      fieldLabel === 'Marketing' ||
      fieldLabel === 'Koordinator' ||
      (!!bindIdb && fieldLabel === 'Tanggal Berangkat');
    const isGenderField = fieldLabel === 'Jenis Kelamin';

    // Dependent fields always shown (even if empty) so user sees the placeholder message
    if (opts.length === 0 && !isDependentField) return null;

    // Pekerjaan has a preferred dummy option
    const preferredOption = fieldLabel === 'Pekerjaan'
      ? opts.find(o => o.value && /karyawan\s*swasta/i.test(o.label))
      : undefined;
    const firstUsableOption = opts.find(o => o.value && o.value.trim() !== '');
    const dummyOption = preferredOption || firstUsableOption;
    const handleDummy = !isLocked && dummyOption && !hideAuto
      ? () => updateField(name, dummyOption.value)
      : null;

    // Gender field: render as 2-button radio-style toggle (Laki / Perempuan side-by-side)
    if (isGenderField && opts.length > 0) {
      // Identify Laki vs Perempuan options by label
      const laki = findGenderOption(opts, 'male') || opts[0];
      const perempuan = findGenderOption(opts, 'female') || opts[opts.length - 1];
      const selected = fields[name] || '';

      // Secondary outlined style. Border always 1px to prevent layout shift on toggle.
      const toggleClass = (isSelected: boolean) =>
        `flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-colors ` +
        (isSelected
          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
          : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800');

      return (
        <div key={name}>
          {renderLabelRow(label, required, hideAuto ? null : () => updateField(name, laki.value))}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => updateField(name, laki.value)}
              className={toggleClass(selected === laki.value)}
            >
              <Mars size={16} strokeWidth={2.5} />
              Laki-laki
            </button>
            <button
              type="button"
              onClick={() => updateField(name, perempuan.value)}
              className={toggleClass(selected === perempuan.value)}
            >
              <Venus size={16} strokeWidth={2.5} />
              Perempuan
            </button>
          </div>
          {fieldErrors[name] && <p className="mt-1 text-xs text-red-500">{fieldErrors[name]}</p>}
        </div>
      );
    }

    return (
      <div key={name}>
        {renderLabelRow(
          label,
          required,
          handleDummy,
          showLoading ? <Loader2 size={12} className="animate-spin text-emerald-500 ml-1" /> : undefined,
        )}
        {isDependentField && opts.length === 0 ? (
          <div className={`${INPUT_CLASS} relative overflow-hidden flex items-center text-gray-400`}>
            {showLoading && (
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-emerald-200/30 dark:via-emerald-400/10 to-transparent animate-shimmer" />
            )}
            <span className="relative">{showLoading ? 'Mengambil opsi…' : 'Pilih tanggal berangkat dulu'}</span>
          </div>
        ) : (
          // Always use SearchableSelect for visual consistency across all dropdowns
          <SearchableSelect
            options={opts}
            value={fields[name] || ''}
            onChange={isLocked ? () => {} : (v => updateField(name, v))}
            error={!!fieldErrors[name]}
            disabled={isLocked}
            renderOption={fieldLabel === 'Tanggal Berangkat' ? (opt, isSelected, query) => {
              const parsed = parseJadwalLabel(opt.label);
              if (!parsed) {
                return <span className={isSelected ? 'font-semibold' : ''}>{highlightMatch(opt.label, query)}</span>;
              }
              const { date, airline, seats, packageName } = parsed;
              return (
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className={`text-[13px] truncate ${isSelected ? 'font-bold' : 'font-semibold'} text-gray-900 dark:text-white`}>
                      {highlightMatch(date, query)}
                    </span>
                    <div className="flex items-center gap-1.5 flex-shrink-0 text-[11px] font-semibold">
                      <span className="text-emerald-600 dark:text-emerald-400">{highlightMatch(seats, query)}</span>
                      <span className="text-gray-400 dark:text-slate-500" aria-hidden>•</span>
                      <span className="text-sky-600 dark:text-sky-400">{highlightMatch(airline, query)}</span>
                    </div>
                  </div>
                  <span className="text-[10.5px] text-gray-500 dark:text-slate-400 truncate">
                    {highlightMatch(packageName, query)}
                  </span>
                </div>
              );
            } : undefined}
          />
        )}
        {fieldErrors[name] && <p className="mt-1 text-xs text-red-500">{fieldErrors[name]}</p>}
      </div>
    );
  };

  const renderInput = (name: string, label: string, placeholder: string, required: boolean, type = 'text', hideAuto = false) => {
    // Legacy registrations store Nama Pendaftar in uppercase, so force-match here.
    const forceUpper = label === 'Nama Pendaftar';
    return (
      <div key={name}>
        {renderLabelRow(label, required, hideAuto ? null : () => updateField(name, dummyValueFor(label, getSelectedAutoFillGender(), fields[name])))}
        <input
          type={type}
          value={fields[name] || ''}
          onChange={e => updateField(name, forceUpper ? e.target.value.toUpperCase() : e.target.value)}
          placeholder={placeholder}
          className={`${fieldErrors[name] ? INPUT_ERROR_CLASS : INPUT_CLASS}${forceUpper ? ' uppercase' : ''}`}
        />
        {fieldErrors[name] && <p className="mt-1 text-xs text-red-500">{fieldErrors[name]}</p>}
      </div>
    );
  };

  const renderTextarea = (name: string, label: string, placeholder: string, required: boolean, hideAuto = false) => (
    <div key={name}>
      {renderLabelRow(label, required, hideAuto ? null : () => updateField(name, dummyValueFor(label, getSelectedAutoFillGender(), fields[name])))}
      <textarea
        value={fields[name] || ''}
        onChange={e => updateField(name, e.target.value)}
        placeholder={placeholder}
        rows={3}
        className={`${fieldErrors[name] ? INPUT_ERROR_CLASS : INPUT_CLASS} resize-none`}
      />
      {fieldErrors[name] && <p className="mt-1 text-xs text-red-500">{fieldErrors[name]}</p>}
    </div>
  );

  const renderField = (entry: FieldEntry, hideAuto = false) => {
    const { name, type, def } = entry;
    const placeholder = def.placeholder || options.inputs[name]?.placeholder || options.textareas[name]?.placeholder || '';
    const required = def.required ?? false;
    const inputType = options.inputs[name]?.type || 'text';

    if (type === 'select') return renderSelect(name, def.label, required, def.searchable, hideAuto);
    if (type === 'textarea') return renderTextarea(name, def.label, placeholder, required, hideAuto);
    // File inputs from legacy form → skip, handled in separate Dokumen section
    if (inputType === 'file') return null;
    return renderInput(name, def.label, placeholder, required, inputType, hideAuto);
  };

  return (
    <div className="px-4 pt-4 pb-8 space-y-3">
      {bindIdb && (
        <div className="flex items-start gap-2.5 p-3 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-700/50 rounded-xl shadow-sm">
          <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center">
            <UserPlus size={14} className="text-white" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Mode Tambah Jamaah ke Grup
            </p>
            {bindFromNama && (
              <p className="text-xs font-semibold text-blue-900 dark:text-blue-200 mt-0.5 truncate">
                Grup {bindFromNama}
              </p>
            )}
            <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-0.5">
              ID Umroh: <span className="font-bold font-mono">{bindIdb}</span>
            </p>
          </div>
        </div>
      )}
      {ocrResult && (
        <div className="flex items-start gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-100 dark:border-emerald-800/30 rounded-xl">
          <Sparkles size={14} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-emerald-700 dark:text-emerald-300 leading-snug">
            Data KTP berhasil diekstrak. Silakan periksa dan lengkapi field yang masih kosong sebelum menyimpan.
          </p>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium text-center">
          {error}
        </div>
      )}

      {(() => {
        // ── Determine if KTP OCR is ready (both jadwal + paket selected) ──
        const jadwalFieldName = Object.keys(options.selects).find(
          n => getFieldDef(n).label === 'Tanggal Berangkat'
        );
        const paketFieldName = Object.keys(options.selects).find(
          n => getFieldDef(n).label === 'Paket Umroh'
        );
        const ktpReady = Boolean(
          jadwalFieldName && paketFieldName &&
          fields[jadwalFieldName] && fields[paketFieldName]
        );

        const ktpCard = (
          <div className={`bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden transition-opacity ${ktpReady ? '' : 'opacity-60'}`}>
            <div className="px-4 py-2.5 border-b border-gray-50 dark:border-slate-700/50 flex items-center gap-2">
              <Sparkles size={14} className={ktpReady ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-500'} />
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-slate-300">
                Isi Otomatis dari KTP
              </h3>
            </div>
            <div className="p-4 space-y-3">
              {/* Description/warning */}
              {!fileName && (
                !ktpReady ? (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/40">
                    <AlertCircle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
                      Pilih <strong>Tanggal Berangkat</strong> dan <strong>Paket Umroh</strong> terlebih dahulu untuk menggunakan fitur ini.
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 leading-snug">
                    Upload foto KTP untuk mengisi nama, NIK, alamat, tgl lahir, dan data lainnya otomatis.
                  </p>
                )
              )}

              {viewMode === 'ocr-processing' ? (
                <div className="flex flex-col items-center justify-center gap-3 py-6 rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/15">
                  {/* Stylized KTP card with a laser-like scan beam sweeping vertically */}
                  <div className="relative w-20 h-12 rounded-md border-2 border-emerald-500 bg-white dark:bg-slate-800 overflow-hidden shadow-sm animate-ktpGlow">
                    {/* Photo placeholder */}
                    <div className="absolute top-1.5 right-1.5 w-3.5 h-6 rounded-sm bg-emerald-200/80 dark:bg-emerald-700/50" />
                    {/* Text line mocks */}
                    <div className="absolute top-1.5 left-1.5 h-1.5 w-6 rounded-sm bg-emerald-300/90 dark:bg-emerald-600/60" />
                    <div className="absolute top-5 left-1.5 h-1 w-10 rounded-sm bg-emerald-200 dark:bg-emerald-700/40" />
                    <div className="absolute top-7 left-1.5 h-1 w-8 rounded-sm bg-emerald-200 dark:bg-emerald-700/40" />
                    <div className="absolute top-9 left-1.5 h-1 w-9 rounded-sm bg-emerald-200 dark:bg-emerald-700/40" />
                    {/* Scanning beam */}
                    <div
                      className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-500 to-transparent animate-ktpScan"
                      style={{ boxShadow: '0 0 8px rgba(16,185,129,0.9), 0 0 14px rgba(16,185,129,0.5)' }}
                    />
                  </div>
                  <div className="flex items-baseline gap-0.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    <span>Membaca KTP</span>
                    <span className="inline-flex gap-0.5 ml-0.5">
                      <span className="w-1 h-1 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1 h-1 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1 h-1 rounded-full bg-emerald-500 animate-bounce" />
                    </span>
                  </div>
                </div>
              ) : fileName ? (
                /* Preview card: image + filename/status — stacked, balanced spacing */
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-900/10 overflow-hidden">
                  {filePreview && (
                    <button
                      type="button"
                      onClick={() => setShowPreviewModal(true)}
                      className="relative w-full h-40 bg-white dark:bg-slate-900 cursor-zoom-in group border-b border-emerald-200 dark:border-emerald-800/40"
                      title="Klik untuk memperbesar"
                    >
                      <img src={filePreview} alt="KTP" className="w-full h-full object-contain" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-slate-800/90 rounded-full px-3 py-1 text-[10px] font-semibold text-gray-700 dark:text-slate-200 shadow-md">
                          Klik untuk memperbesar
                        </div>
                      </div>
                    </button>
                  )}
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 truncate">{fileName}</div>
                      {ocrResult && (
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                          <Sparkles size={10} /> Alhamdulillah, KTP berhasil diekstrak :)
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setFileName('');
                        setFilePreview(null);
                        setOcrResult(null);
                        setOcrError('');
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
                      title="Hapus file"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : ktpReady ? (
                <label className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 cursor-pointer hover:border-emerald-400 dark:hover:border-emerald-500 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                    <Camera size={18} className="text-emerald-500" strokeWidth={2} />
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-gray-900 dark:text-white">Upload Foto KTP</div>
                    <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
                      JPG, PNG, PDF · maks 10MB
                    </div>
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,.pdf"
                    onChange={handleKtpUpload}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/50 cursor-not-allowed">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-slate-700/50 flex items-center justify-center">
                    <Camera size={18} className="text-gray-400 dark:text-slate-500" strokeWidth={2} />
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-semibold text-gray-400 dark:text-slate-500">Upload Foto KTP</div>
                    <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">Belum tersedia</div>
                  </div>
                </div>
              )}

              {ocrError && (
                <p className="text-[11px] text-red-500 flex items-center gap-1">
                  <AlertCircle size={11} /> {ocrError}
                </p>
              )}
              {fieldErrors.file_ktp && (
                <p className="text-[11px] text-red-500">{fieldErrors.file_ktp}</p>
              )}
            </div>
          </div>
        );

        // Other cards (Data Jamaah, Alamat, Info Pendaftar, Info Otomatis) are locked
        // until pendaftaran (Tanggal Berangkat + Paket Umroh) is filled.
        const formLocked = !ktpReady;

        // Check if any required field is empty (used to disable submit button)
        const emptyCount = getEmptyRequiredFields().length;
        const hasEmptyFields = emptyCount > 0;

        return (
          <form onSubmit={handleSubmit} className="space-y-4">
            {SECTION_ORDER.map(sec => {
              const entries = sections[sec];
              if (!entries || entries.length === 0) return null;

              // Only INFO PENDAFTARAN is always interactive; other sections lock
              // until jadwal + paket are selected.
              const isLockedSection = sec !== 'pendaftaran' && formLocked;

              return (
                <div key={sec}>
                  <div
                    className={`bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm transition-opacity ${
                      isLockedSection ? 'opacity-60 pointer-events-none select-none' : ''
                    }`}
                    aria-disabled={isLockedSection || undefined}
                  >
                    <div className="px-4 py-2.5 border-b border-gray-50 dark:border-slate-700/50 flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-slate-300">
                        {SECTION_TITLES[sec]}
                      </h3>
                      {sec === 'jamaah' && (
                        <button
                          type="button"
                          onClick={handleAutoFillJamaah}
                          className={DUMMY_BTN_CLASS}
                          title="Isi semua field dengan data dummy"
                        >
                          <Wand2 size={10} strokeWidth={2.5} />
                          Auto
                        </button>
                      )}
                    </div>
                    <div className="p-4 space-y-4">
                      {sec === 'pendaftaran' && bindIdb && (
                        <div>
                          <label className={LABEL_CLASS_INLINE.replace('gap-1.5', 'gap-1.5 mb-1.5')}>
                            ID Umroh (Grup)
                          </label>
                          <div className="flex items-center gap-2 px-3 py-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-xl">
                            <UserPlus size={14} className="text-blue-500 flex-shrink-0" strokeWidth={2.5} />
                            <span className="font-mono text-sm font-bold text-blue-900 dark:text-blue-200 flex-1 truncate">{bindIdb}</span>
                            {bindFromNama && (
                              <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 truncate">{bindFromNama}</span>
                            )}
                          </div>
                        </div>
                      )}
                      {entries.map(entry => renderField(entry, sec === 'jamaah'))}
                    </div>
                  </div>
                  {/* KTP OCR card placed right after "INFO PENDAFTARAN" */}
                  {sec === 'pendaftaran' && <div className="mt-4">{ktpCard}</div>}
                </div>
              );
            })}

            {/* ── Submit — follows DESIGN-SYSTEM.md Primary CTA spec ── */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onBack}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-all duration-200 active:scale-95 text-sm font-bold"
              >
                <XCircle size={16} />
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting || formLocked || hasEmptyFields}
                title={hasEmptyFields ? `${emptyCount} field belum diisi` : undefined}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <><Loader2 size={16} className="animate-spin" /> Mengirim...</>
                ) : (
                  <><Save size={16} /> Simpan</>
                )}
              </button>
            </div>
          </form>
        );
      })()}

      {/* KTP Image Preview — Fullscreen Modal */}
      {showPreviewModal && filePreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setShowPreviewModal(false)}
          style={{ animation: 'fadeIn 150ms ease-out' }}
        >
          <button
            type="button"
            onClick={() => setShowPreviewModal(false)}
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-sm"
            title="Tutup"
          >
            <X size={20} />
          </button>
          <img
            src={filePreview}
            alt="Preview KTP"
            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
