import { useState, useEffect, useCallback } from 'react';
import { Loader2, Upload, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { getAuthHeaders } from './LoginPage';

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
}

const FIELD_CONFIG: Record<string, FieldDef> = {
  // ── Info Pendaftaran ──
  jdaftar:       { label: 'Jenis Daftar', section: 'pendaftaran', order: 1, required: true },
  tgldaftar:     { label: 'Tanggal Daftar', section: 'pendaftaran', order: 2 },
  berangkat:     { label: 'Tanggal Berangkat', section: 'pendaftaran', order: 3, required: true },
  jadwal:        { label: 'Tanggal Berangkat', section: 'pendaftaran', order: 3, required: true },
  tgl_berangkat: { label: 'Tanggal Berangkat', section: 'pendaftaran', order: 3, required: true },

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
  paket:         { label: 'Paket Umroh', section: 'paket', order: 40, required: true },
  paket_umroh:   { label: 'Paket Umroh', section: 'paket', order: 40, required: true },
  harga_paket:   { label: 'Harga Paket', section: 'paket', order: 41, placeholder: 'Harga paket' },
  perlengkapan:  { label: 'Perlengkapan & Handling', section: 'paket', order: 42, placeholder: 'Harga perlengkapan' },
  harga_perlengkapan: { label: 'Perlengkapan & Handling', section: 'paket', order: 42, placeholder: 'Harga perlengkapan' },
  lain:          { label: 'Lainnya', section: 'paket', order: 43, placeholder: 'Harga Lainnya' },
  lainnya:       { label: 'Lainnya', section: 'paket', order: 43, placeholder: 'Harga Lainnya' },
  diskon:        { label: 'Disc. Marketing', section: 'paket', order: 44, placeholder: 'Masukan diskon marketing' },
  diskon_marketing: { label: 'Disc. Marketing', section: 'paket', order: 44, placeholder: 'Masukan diskon marketing' },
  marketing:     { label: 'Marketing', section: 'paket', order: 45, required: true },
  koordinator:   { label: 'Koordinator', section: 'paket', order: 46, required: true },
  perwakilan:    { label: 'Koordinator', section: 'paket', order: 46, required: true },
  koord:         { label: 'Koordinator', section: 'paket', order: 46, required: true },

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

function getFieldDef(name: string): FieldDef {
  const lower = name.toLowerCase();
  if (FIELD_CONFIG[lower]) return FIELD_CONFIG[lower];
  // Partial match: check if any config key is contained in or contains the field name
  for (const [key, def] of Object.entries(FIELD_CONFIG)) {
    if (lower.includes(key) || key.includes(lower)) return def;
  }
  return { label: name.replace(/_/g, ' ').toUpperCase(), section: 'lainnya', order: 90 };
}

// ── Input class matching DESIGN-SYSTEM.md ──
const INPUT_CLASS = 'w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400 disabled:opacity-50';
const INPUT_ERROR_CLASS = 'w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-red-300 dark:border-red-600 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400';
const LABEL_CLASS = 'flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide';

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
  const renderSelect = (name: string, label: string, required: boolean) => {
    const opts = options.selects[name] || [];
    if (opts.length === 0) return null;
    return (
      <div key={name}>
        <label className={LABEL_CLASS}>
          {label} {required && <span className="text-red-500">*</span>}
        </label>
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

    if (type === 'select') return renderSelect(name, def.label, required);
    if (type === 'textarea') return renderTextarea(name, def.label, placeholder, required);
    return renderInput(name, def.label, placeholder, required, options.inputs[name]?.type || 'text');
  };

  return (
    <div className="px-4 pt-2 pb-8 space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">Pendaftaran Jamaah Umroh</h2>
        <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
          Data akan dikirim langsung ke sistem internal Alhijaz.
        </p>
      </div>

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
