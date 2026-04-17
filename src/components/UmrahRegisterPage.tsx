import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Upload, X, CheckCircle2, AlertCircle, Camera, Sparkles, Search, ChevronDown, Check } from 'lucide-react';
import { getAuthHeaders } from './LoginPage';

type ViewMode = 'ocr-upload' | 'ocr-processing' | 'form';

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
  inputs: Record<string, { type: string; placeholder: string; required: boolean }>;
  textareas: Record<string, { placeholder: string; required: boolean }>;
}

// ── Field config: maps legacy HTML field names to display labels + sections ──
// Fields not listed here are rendered in "Lainnya" with their raw name as label.
// `skip: true` hides the field entirely (buttons, file inputs handled separately, etc.)
interface FieldDef {
  label: string;
  section: 'pendaftaran' | 'jamaah' | 'alamat' | 'paket' | 'pendaftar' | 'lainnya';
  order: number;
  required?: boolean;
  placeholder?: string;
  skip?: boolean;
  searchable?: boolean; // For selects with many options (e.g. tgl berangkat)
}

const FIELD_CONFIG: Record<string, FieldDef> = {
  // ── Info Pendaftaran ──
  jdaftar:       { label: 'Jenis Daftar', section: 'pendaftaran', order: 1, required: true },
  tgldaftar:     { label: 'Tanggal Daftar', section: 'pendaftaran', order: 2 },
  berangkat:     { label: 'Tanggal Berangkat', section: 'pendaftaran', order: 3, required: true, searchable: true },
  jadwal:        { label: 'Tanggal Berangkat', section: 'pendaftaran', order: 3, required: true, searchable: true },
  tgl_berangkat: { label: 'Tanggal Berangkat', section: 'pendaftaran', order: 3, required: true, searchable: true },

  // ── Data Jamaah ──
  firstname:     { label: 'Nama Depan', section: 'jamaah', order: 10, required: true, placeholder: 'Firstname' },
  first:         { label: 'Nama Depan', section: 'jamaah', order: 10, required: true, placeholder: 'Firstname' },
  middlename:    { label: 'Nama Tengah', section: 'jamaah', order: 11, placeholder: 'Middlename' },
  middle:        { label: 'Nama Tengah', section: 'jamaah', order: 11, placeholder: 'Middlename' },
  lastname:      { label: 'Nama Belakang', section: 'jamaah', order: 12, placeholder: 'Lastname' },
  last:          { label: 'Nama Belakang', section: 'jamaah', order: 12, placeholder: 'Lastname' },
  kelamin:       { label: 'Kelamin', section: 'jamaah', order: 13, required: true },
  jk:            { label: 'Kelamin', section: 'jamaah', order: 13, required: true },
  jns_kelamin:   { label: 'Kelamin', section: 'jamaah', order: 13, required: true },
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
  status_nikah:  { label: 'Status Nikah', section: 'jamaah', order: 18, required: true },
  pekerjaan:     { label: 'Pekerjaan', section: 'jamaah', order: 19, required: true },
  kerja:         { label: 'Pekerjaan', section: 'jamaah', order: 19, required: true },
  pendamping:    { label: 'Pendamping (Keberangkatan)', section: 'jamaah', order: 20, required: true },
  pengalaman:    { label: 'Pengalaman Umrah', section: 'jamaah', order: 21, required: true },
  remarks:       { label: 'Remarks', section: 'jamaah', order: 22, required: true },
  remark:        { label: 'Remarks', section: 'jamaah', order: 22, required: true },
  mahram:        { label: 'Mahram', section: 'jamaah', order: 23, required: true, placeholder: 'Nama mahram' },
  kondisi:       { label: 'Kondisi Jamaah', section: 'jamaah', order: 24, required: true, placeholder: 'Butuh kursi roda? Cuci darah?' },
  kondisi_jamaah:{ label: 'Kondisi Jamaah', section: 'jamaah', order: 24, required: true, placeholder: 'Butuh kursi roda? Cuci darah?' },

  // ── Alamat ──
  alamat:        { label: 'Alamat (Sesuai KTP)', section: 'alamat', order: 30, required: true, placeholder: 'Masukkan keterangan tambahan...' },
  provinsi:      { label: 'Provinsi', section: 'alamat', order: 31 },
  kota:          { label: 'Kab/Kota', section: 'alamat', order: 32 },
  kabkota:       { label: 'Kab/Kota', section: 'alamat', order: 32 },
  kecamatan:     { label: 'Kecamatan', section: 'alamat', order: 33 },
  kelurahan:     { label: 'Desa/Kelurahan', section: 'alamat', order: 34 },
  desa:          { label: 'Desa/Kelurahan', section: 'alamat', order: 34 },

  // ── Paket & Marketing ──
  paket:         { label: 'Paket Umroh', section: 'paket', order: 40, required: true, searchable: true },
  paket_umroh:   { label: 'Paket Umroh', section: 'paket', order: 40, required: true, searchable: true },
  harga_paket:   { label: 'Harga Paket', section: 'paket', order: 41, placeholder: 'Harga paket' },
  perlengkapan:  { label: 'Perlengkapan & Handling', section: 'paket', order: 42, placeholder: 'Harga perlengkapan' },
  harga_perlengkapan: { label: 'Perlengkapan & Handling', section: 'paket', order: 42, placeholder: 'Harga perlengkapan' },
  lain:          { label: 'Lainnya', section: 'paket', order: 43, placeholder: 'Harga Lainnya' },
  lainnya:       { label: 'Lainnya', section: 'paket', order: 43, placeholder: 'Harga Lainnya' },
  diskon:        { label: 'Disc. Marketing', section: 'paket', order: 44, placeholder: 'Masukan diskon marketing' },
  diskon_marketing: { label: 'Disc. Marketing', section: 'paket', order: 44, placeholder: 'Masukan diskon marketing' },
  marketing:     { label: 'Marketing', section: 'paket', order: 45, required: true, searchable: true },
  koordinator:   { label: 'Koordinator', section: 'paket', order: 46, required: true, searchable: true },
  perwakilan:    { label: 'Koordinator', section: 'paket', order: 46, required: true, searchable: true },
  koord:         { label: 'Koordinator', section: 'paket', order: 46, required: true, searchable: true },

  // ── Info Pendaftar ──
  pendaftar:     { label: 'Nama Pendaftar', section: 'pendaftar', order: 50, required: true, placeholder: 'Nama pendaftar' },
  nama_pendaftar:{ label: 'Nama Pendaftar', section: 'pendaftar', order: 50, required: true, placeholder: 'Nama pendaftar' },
  tpendaftar:    { label: 'No. Telp/HP Pendaftar', section: 'pendaftar', order: 51, required: true, placeholder: 'Nomor HP pendaftar' },
  tlp_pendaftar: { label: 'No. Telp/HP Pendaftar', section: 'pendaftar', order: 51, required: true, placeholder: 'Nomor HP pendaftar' },
  keterangan:    { label: 'Keterangan (Lain-lain)', section: 'pendaftar', order: 52, required: true, placeholder: 'Mengetahui Alhijaz dari mana/siapa? Butuh surat mahram?' },

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
  paket: 'Paket & Marketing',
  pendaftar: 'Info Pendaftar',
  lainnya: 'Lainnya',
};

const SECTION_ORDER = ['pendaftaran', 'jamaah', 'alamat', 'paket', 'pendaftar', 'lainnya'];

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
const LABEL_CLASS = 'flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide';

// ── Searchable Select Component ──
interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: boolean;
}

function SearchableSelect({ options, value, onChange, placeholder = '— Pilih —', error }: SearchableSelectProps) {
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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full px-3 py-2.5 bg-white dark:bg-slate-900 border rounded-xl text-sm text-left outline-none transition-all flex items-center justify-between gap-2 focus:ring-2 ${borderClass}`}
      >
        <span className={`truncate ${selected ? 'text-gray-800 dark:text-white' : 'text-gray-400'}`}>
          {displayLabel}
        </span>
        <ChevronDown size={16} className={`text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-lg overflow-hidden">
          {/* Search input */}
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
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

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
                    <span className={`flex-1 leading-snug ${isSelected ? 'font-semibold' : ''}`}>
                      {opt.label}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function UmrahRegisterPage({ onBack }: { onBack: () => void }) {
  const [options, setOptions] = useState<FormOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [file, setFile] = useState<{ name: string; data: string } | null>(null);
  const [fileName, setFileName] = useState('');

  // ── OCR mode state ──
  const isOcrMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'ocr';
  const [viewMode, setViewMode] = useState<ViewMode>(isOcrMode ? 'ocr-upload' : 'form');
  const [ocrError, setOcrError] = useState('');
  const [ocrResult, setOcrResult] = useState<KtpData | null>(null);

  const fetchOptions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/umrah/form-options', { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) {
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

      if (Object.keys(defaults).length > 0) {
        setFields(prev => ({ ...defaults, ...prev }));
      }
    } catch (err) {
      console.error('fetchOptions error:', err);
      setError('Gagal menghubungi server');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOptions();
    document.title = 'Pendaftaran Jamaah Umroh - Alhijaz';
  }, [fetchOptions]);

  const updateField = (name: string, value: string) => {
    setFields(prev => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) setFieldErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setFieldErrors(prev => ({ ...prev, file_ktp: 'Ukuran file maksimal 5MB' }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setFile({ name: f.name, data: base64 });
      setFileName(f.name);
      setFieldErrors(prev => ({ ...prev, file_ktp: '' }));
    };
    reader.readAsDataURL(f);
  };

  // ── OCR: Upload KTP image and extract data via OpenAI Vision ──
  const handleKtpUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      setOcrError('Ukuran file maksimal 10MB');
      return;
    }

    setOcrError('');
    setViewMode('ocr-processing');

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

      // Call OCR endpoint
      const res = await fetch('/api/umrah/ocr-ktp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ imageBase64: base64, imageMimeType: f.type }),
      });

      const data = await res.json();
      if (!res.ok) {
        setOcrError(data.error || 'OCR gagal memproses KTP');
        setViewMode('ocr-upload');
        return;
      }

      setOcrResult(data.data);
      // Apply OCR data to form fields after form options load
      applyOcrToFields(data.data);
      setViewMode('form');
    } catch (err) {
      console.error('OCR error:', err);
      setOcrError('Gagal memproses KTP: ' + (err as Error).message);
      setViewMode('ocr-upload');
    }
  };

  // Apply OCR data to form fields using heuristic matching
  const applyOcrToFields = (ktp: KtpData, retries = 10) => {
    if (!options) {
      if (retries <= 0) return; // Give up after max retries
      setTimeout(() => applyOcrToFields(ktp, retries - 1), 500);
      return;
    }

    const updates: Record<string, string> = {};
    const inputNames = Object.keys(options.inputs);
    const textareaNames = Object.keys(options.textareas);
    const selectNames = Object.keys(options.selects);

    const findName = (pool: string[], ...keywords: string[]) =>
      pool.find(n => keywords.some(k => n.toLowerCase().includes(k.toLowerCase())));

    // Split full name into first/middle/last
    if (ktp.nama) {
      const parts = ktp.nama.trim().split(/\s+/);
      const first = findName(inputNames, 'firstname', 'first', 'nama_depan');
      const middle = findName(inputNames, 'middlename', 'middle', 'nama_tengah');
      const last = findName(inputNames, 'lastname', 'last', 'nama_belakang');
      if (first && parts[0]) updates[first] = parts[0];
      if (parts.length > 2) {
        if (middle) updates[middle] = parts.slice(1, -1).join(' ');
        if (last) updates[last] = parts[parts.length - 1];
      } else if (parts.length === 2) {
        if (last) updates[last] = parts[1];
      }
    }

    // NIK / KTP
    if (ktp.nik) {
      const ktpField = findName(inputNames, 'ktp', 'nik');
      if (ktpField) updates[ktpField] = ktp.nik;
    }

    // Tempat lahir
    if (ktp.tempat_lahir) {
      const tl = findName(inputNames, 'tempat_lahir', 'tempatlahir', 'birthplace');
      if (tl) updates[tl] = ktp.tempat_lahir;
    }

    // Tanggal lahir — legacy likely uses DD/MM/YYYY
    if (ktp.tgl_lahir) {
      const tgl = findName(inputNames, 'tgl_lahir', 'tgllahir');
      if (tgl) {
        // Convert DD-MM-YYYY → DD/MM/YYYY
        updates[tgl] = ktp.tgl_lahir.replace(/-/g, '/');
      }
    }

    // Alamat — combine alamat + rt/rw + kelurahan + kecamatan
    if (ktp.alamat) {
      const alamatField = findName(textareaNames, 'alamat', 'address');
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

    // Kelamin (select)
    if (ktp.jenis_kelamin) {
      const klm = findName(selectNames, 'kelamin', 'jk', 'gender');
      if (klm) {
        const val = ktp.jenis_kelamin.toUpperCase().startsWith('L') ? 'L' : 'P';
        // Try to find matching option value
        const opt = options.selects[klm]?.find(o =>
          o.value === val || o.label.toUpperCase().startsWith(val)
        );
        if (opt) updates[klm] = opt.value;
      }
    }

    // Status nikah (select)
    if (ktp.status_perkawinan) {
      const sn = findName(selectNames, 'nikah', 'status_nikah', 'marital');
      if (sn) {
        const ktpStatus = ktp.status_perkawinan.toUpperCase();
        const opt = options.selects[sn]?.find(o =>
          o.label.toUpperCase().includes(ktpStatus) || ktpStatus.includes(o.label.toUpperCase())
        );
        if (opt) updates[sn] = opt.value;
      }
    }

    setFields(prev => ({ ...prev, ...updates }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!options) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/umrah/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          formAction: options.formAction,
          fields,
          hiddenFields: options.hiddenFields,
          file: file || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal mengirim pendaftaran');
        setSubmitting(false);
        return;
      }
      setSuccess(true);
      setSubmitting(false);
      setTimeout(() => {
        window.history.pushState({}, '', '/dashboard/jamaah');
        onBack();
      }, 2000);
    } catch {
      setError('Gagal menghubungi server');
      setSubmitting(false);
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-emerald-500" />
        <span className="ml-2 text-sm text-gray-500 dark:text-slate-400">Mengambil form pendaftaran...</span>
      </div>
    );
  }

  // ── OCR Upload Screen ──
  if (viewMode === 'ocr-upload') {
    const notConnected = error && !options;

    return (
      <div className="px-4 pt-4 pb-8 space-y-3">
        {notConnected ? (
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/40 rounded-xl">
            <AlertCircle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
              Anda belum terhubung ke sistem internal. OCR tetap bisa digunakan, tapi data tidak bisa disimpan sebelum login di halaman Jamaah.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-100 dark:border-emerald-800/30 rounded-xl">
            <Sparkles size={14} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300 leading-snug">
              Upload foto KTP jamaah untuk otomatis mengisi nama, NIK, alamat, tanggal lahir, dan data lainnya.
            </p>
          </div>
        )}

        {ocrError && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium text-center">
            {ocrError}
          </div>
        )}

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-5">
          <label className="flex flex-col items-center justify-center gap-3 py-10 rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 cursor-pointer hover:border-emerald-400 dark:hover:border-emerald-500 transition-colors">
            <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
              <Camera size={24} className="text-emerald-500" strokeWidth={2} />
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-gray-900 dark:text-white">Pilih Foto KTP</div>
              <div className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
                JPG, PNG, maks 10MB
              </div>
            </div>
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png"
              onChange={handleKtpUpload}
              className="hidden"
            />
          </label>

          <div className="mt-4 space-y-2">
            <div className="flex items-start gap-2">
              <div className="w-4 h-4 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[9px] text-emerald-600 font-bold">1</span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-slate-400 leading-snug">
                Pastikan foto KTP jelas, tidak blur, dan semua teks terbaca
              </p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-4 h-4 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[9px] text-emerald-600 font-bold">2</span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-slate-400 leading-snug">
                Data akan diekstrak otomatis, tetap bisa diedit sebelum disimpan
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onBack}
            className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-all text-sm font-bold active:scale-95"
          >
            Batal
          </button>
          <button
            onClick={() => setViewMode('form')}
            className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all text-sm font-bold active:scale-95"
          >
            Isi Manual
          </button>
        </div>
      </div>
    );
  }

  // ── OCR Processing Screen ──
  if (viewMode === 'ocr-processing') {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 gap-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
            <Sparkles size={28} className="text-emerald-500 animate-pulse" />
          </div>
          <div className="absolute inset-0 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Membaca KTP...</p>
          <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">Biasanya butuh 5-10 detik</p>
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
  type FieldEntry = { name: string; type: 'select' | 'input' | 'textarea'; def: FieldDef };
  const allFields: FieldEntry[] = [];

  for (const name of Object.keys(options.selects)) {
    const def = getFieldDef(name);
    if (!def.skip) allFields.push({ name, type: 'select', def });
  }
  for (const name of Object.keys(options.inputs)) {
    const def = getFieldDef(name);
    if (!def.skip) allFields.push({ name, type: 'input', def });
  }
  for (const name of Object.keys(options.textareas)) {
    const def = getFieldDef(name);
    if (!def.skip) allFields.push({ name, type: 'textarea', def });
  }

  // Sort by section order then field order
  allFields.sort((a, b) => {
    const sa = SECTION_ORDER.indexOf(a.def.section);
    const sb = SECTION_ORDER.indexOf(b.def.section);
    if (sa !== sb) return sa - sb;
    return a.def.order - b.def.order;
  });

  // Group by section
  const sections: Record<string, FieldEntry[]> = {};
  for (const entry of allFields) {
    const sec = entry.def.section;
    if (!sections[sec]) sections[sec] = [];
    sections[sec].push(entry);
  }

  // ── Render helpers ──
  const renderSelect = (name: string, label: string, required: boolean, searchable = false) => {
    const opts = options.selects[name] || [];
    if (opts.length === 0) return null;

    // Auto-enable search for dropdowns with many options
    const useSearch = searchable || opts.length >= 10;

    return (
      <div key={name}>
        <label className={LABEL_CLASS}>
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        {useSearch ? (
          <SearchableSelect
            options={opts}
            value={fields[name] || ''}
            onChange={v => updateField(name, v)}
            error={!!fieldErrors[name]}
          />
        ) : (
          <select
            value={fields[name] || ''}
            onChange={e => updateField(name, e.target.value)}
            className={fieldErrors[name] ? INPUT_ERROR_CLASS : INPUT_CLASS}
          >
            <option value="">— Pilih —</option>
            {opts.map((opt, i) => (
              <option key={`${name}-${i}`} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
        {fieldErrors[name] && <p className="mt-1 text-xs text-red-500">{fieldErrors[name]}</p>}
      </div>
    );
  };

  const renderInput = (name: string, label: string, placeholder: string, required: boolean, type = 'text') => (
    <div key={name}>
      <label className={LABEL_CLASS}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        value={fields[name] || ''}
        onChange={e => updateField(name, e.target.value)}
        placeholder={placeholder}
        className={fieldErrors[name] ? INPUT_ERROR_CLASS : INPUT_CLASS}
      />
      {fieldErrors[name] && <p className="mt-1 text-xs text-red-500">{fieldErrors[name]}</p>}
    </div>
  );

  const renderTextarea = (name: string, label: string, placeholder: string, required: boolean) => (
    <div key={name}>
      <label className={LABEL_CLASS}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
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

  const renderField = (entry: FieldEntry) => {
    const { name, type, def } = entry;
    const placeholder = def.placeholder || options.inputs[name]?.placeholder || options.textareas[name]?.placeholder || '';
    const required = def.required ?? false;
    const inputType = options.inputs[name]?.type || 'text';

    if (type === 'select') return renderSelect(name, def.label, required, def.searchable);
    if (type === 'textarea') return renderTextarea(name, def.label, placeholder, required);
    // File inputs from legacy form → skip, handled in separate Dokumen section
    if (inputType === 'file') return null;
    return renderInput(name, def.label, placeholder, required, inputType);
  };

  return (
    <div className="px-4 pt-4 pb-8 space-y-3">
      {/* Info badge — explains data flow or OCR success */}
      {ocrResult ? (
        <div className="flex items-start gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-100 dark:border-emerald-800/30 rounded-xl">
          <Sparkles size={14} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-emerald-700 dark:text-emerald-300 leading-snug">
            Data KTP berhasil diekstrak. Silakan periksa dan lengkapi field yang masih kosong sebelum menyimpan.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/15 border border-blue-100 dark:border-blue-800/30 rounded-xl">
          <div className="w-4 h-4 rounded-full bg-blue-500/15 dark:bg-blue-400/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">i</span>
          </div>
          <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-snug">
            Data akan dikirim langsung ke sistem internal Alhijaz.
          </p>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium text-center">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {SECTION_ORDER.map(sec => {
          const entries = sections[sec];
          if (!entries || entries.length === 0) return null;
          return (
            <div key={sec} className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-50 dark:border-slate-700/50">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-slate-300">
                  {SECTION_TITLES[sec]}
                </h3>
              </div>
              <div className="p-4 space-y-4">
                {entries.map(renderField)}
              </div>
            </div>
          );
        })}

        {/* ── File KTP ── */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-50 dark:border-slate-700/50">
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-slate-300">Dokumen</h3>
          </div>
          <div className="p-4">
            <label className={LABEL_CLASS}>File KTP</label>
            {fileName ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                <Upload size={16} className="text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-700 dark:text-slate-300 truncate flex-1">{fileName}</span>
                <button type="button" onClick={() => { setFile(null); setFileName(''); }} className="text-gray-400 hover:text-red-500 transition-colors">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 cursor-pointer hover:border-emerald-400 transition-colors">
                <Upload size={16} className="text-gray-400" />
                <span className="text-sm text-gray-500 dark:text-slate-400">Pilih file (JPG, PNG, PDF, maks 5MB)</span>
                <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={handleFileChange} className="hidden" />
              </label>
            )}
            {fieldErrors.file_ktp && <p className="mt-1 text-xs text-red-500">{fieldErrors.file_ktp}</p>}
          </div>
        </div>

        {/* ── Submit ── */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-all text-sm font-bold active:scale-95"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95 disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><Loader2 size={16} className="animate-spin" /> Mengirim...</>
            ) : (
              'Simpan Pendaftaran'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
