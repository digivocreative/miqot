import { useEffect, useMemo, useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { AlertCircle, Loader2, Save, XCircle } from 'lucide-react';
import { getAuthHeaders } from './LoginPage';
import { normalizeWaNumber } from '../utils/phone';
import FilterDropdown from './FilterDropdown';

type EditOption = { value: string; label: string };

type EditForm = {
  firstname: string;
  middlename: string;
  lastname: string;
  jk: string;
  ktp: string;
  pendaftar: string;
  wa: string;
  tempat_lahir: string;
  tgl_lahir: string;
  status: string;
  pekerjaan: string;
  alamat: string;
  pendamping: string;
  pengalaman: string;
  remarks: string;
};

type HiddenLegacyFields = {
  tpendaftar: string;
  mahram: string;
  kondisi: string;
  keterangan: string;
  no_paspor: string;
  paspor_expired: string;
  prov: string;
  kab: string;
  kec: string;
  kel: string;
  idu: string;
};

type EditMeta = {
  values: Record<string, string>;
  selects: Record<string, EditOption[]>;
};

const EMPTY_FORM: EditForm = {
  firstname: '',
  middlename: '',
  lastname: '',
  jk: '',
  ktp: '',
  pendaftar: '',
  wa: '',
  tempat_lahir: '',
  tgl_lahir: '',
  status: '',
  pekerjaan: '',
  alamat: '',
  pendamping: '',
  pengalaman: '',
  remarks: '',
};

const EMPTY_HIDDEN: HiddenLegacyFields = {
  tpendaftar: '',
  mahram: 'X',
  kondisi: 'X',
  keterangan: 'X',
  no_paspor: '',
  paspor_expired: '',
  prov: '',
  kab: '',
  kec: '',
  kel: '',
  idu: '',
};

const inputClass = 'w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white';
const dateInputClass = `${inputClass} h-[42px] appearance-none leading-tight pr-2 [color-scheme:light] dark:[color-scheme:dark]`;
const labelClass = 'mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300';

function getRowIdFromPath() {
  const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  const editIdx = segments.findIndex(segment => segment === 'edit');
  const raw = editIdx >= 0 ? segments[editIdx + 1] : '';
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function formatPhoneForInput(value: string | null | undefined) {
  if (!value) return '';
  const normalized = normalizeWaNumber(value);
  if (normalized) return normalized.startsWith('62') ? `0${normalized.slice(2)}` : normalized;
  return String(value).replace(/\s+/g, '');
}

function legacyDateToInput(value: string | null | undefined) {
  if (!value) return '';
  const iso = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dmy = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : '';
}

function splitFullName(value: string | null | undefined) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstname: parts[0] || '', middlename: '', lastname: '' };
  }
  if (parts.length === 2) {
    return { firstname: parts[0], middlename: '', lastname: parts[1] };
  }
  return {
    firstname: parts[0],
    middlename: parts.slice(1, -1).join(' '),
    lastname: parts[parts.length - 1],
  };
}

function combineFullName(form: Pick<EditForm, 'firstname' | 'middlename' | 'lastname'>) {
  return [form.firstname, form.middlename, form.lastname]
    .map(part => part.trim())
    .filter(Boolean)
    .join(' ');
}

function buildForm(values: Record<string, string>): EditForm {
  const name = splitFullName(values.nlengkap);
  return {
    firstname: name.firstname,
    middlename: name.middlename,
    lastname: name.lastname,
    jk: values.kelamin || '',
    ktp: values.ktp || '',
    pendaftar: values.pendaftar || values.nlengkap || '',
    wa: formatPhoneForInput(values.tjamaah),
    tempat_lahir: values.plahir || '',
    tgl_lahir: legacyDateToInput(values.tgl_lahir || values.tlahir),
    status: values.status || '',
    pekerjaan: values.pekerjaan || '',
    alamat: values.alamat || '',
    pendamping: values.pendamping || '',
    pengalaman: values.pengalaman || '',
    remarks: values.remarks || '',
  };
}

function buildHidden(values: Record<string, string>): HiddenLegacyFields {
  return {
    tpendaftar: values.tpendaftar || '',
    mahram: values.mahram || 'X',
    kondisi: values.kondisi || 'X',
    keterangan: values.keterangan || 'X',
    no_paspor: values.no_paspor || '',
    paspor_expired: legacyDateToInput(values.paspor_expired),
    prov: values.prov || '',
    kab: values.kab || '',
    kec: values.kec || '',
    kel: values.kel || '',
    idu: values.idu || '',
  };
}

type JamaahEditHeader = { label: string; title: string };

export default function JamaahEditPage({
  onBack,
  onNavigate,
  onHeaderTitle,
}: {
  onBack: () => void;
  onNavigate?: (path: string) => void;
  onHeaderTitle?: (header: JamaahEditHeader | null) => void;
}) {
  const rowId = useMemo(getRowIdFromPath, []);
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);
  const [hidden, setHidden] = useState<HiddenLegacyFields>(EMPTY_HIDDEN);
  const [meta, setMeta] = useState<EditMeta>({ values: {}, selects: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const disabled = loading || saving;
  const fullName = combineFullName(form);

  useEffect(() => {
    onHeaderTitle?.({
      label: 'Edit Data Jamaah',
      title: fullName || 'Memuat jamaah...',
    });
    return () => onHeaderTitle?.(null);
  }, [fullName, onHeaderTitle]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!rowId) {
        setError('ID jamaah tidak valid');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/laporan/jamaah/${encodeURIComponent(rowId)}/edit-form`, {
          headers: { ...getAuthHeaders() },
          cache: 'no-store',
        });
        const result = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !result.success) {
          setError(result.error || 'Gagal memuat data jamaah');
          return;
        }
        const values = (result.data?.values || {}) as Record<string, string>;
        setMeta({
          values,
          selects: (result.data?.selects || {}) as Record<string, EditOption[]>,
        });
        setForm(buildForm(values));
        setHidden(buildHidden(values));
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load jamaah edit page:', err);
          setError('Gagal menghubungi server');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [rowId]);

  const setField = (key: keyof EditForm, value: string, uppercase = false) => {
    setError('');
    setForm(prev => ({ ...prev, [key]: uppercase ? value.toUpperCase() : value }));
  };

  const selectOptions = (name: string) => meta.selects[name] || [];

  const renderInput = (
    key: keyof EditForm,
    label: string,
    props: InputHTMLAttributes<HTMLInputElement> = {},
    opts: { uppercase?: boolean } = {},
  ) => {
    const { type, ...inputProps } = props;
    const isDate = type === 'date';
    return (
      <label className="block min-w-0">
        <span className={labelClass}>{label}</span>
        <input
          {...inputProps}
          type={type}
          value={form[key]}
          disabled={disabled}
          onChange={e => {
            const nextValue = key === 'wa' ? e.target.value.replace(/\s+/g, '') : e.target.value;
            setField(key, nextValue, opts.uppercase);
          }}
          className={isDate ? dateInputClass : inputClass}
        />
      </label>
    );
  };

  const renderSelect = (key: keyof EditForm, legacyName: string, label: string) => {
    const options = selectOptions(legacyName);
    const dropdownOptions = [
      { value: '', label: '-' },
      ...options.filter(option => option.value || option.label).map(option => ({
        value: option.value,
        label: option.label || option.value,
      })),
    ];
    return (
      <label className="block min-w-0">
        <span className={labelClass}>{label}</span>
        <FilterDropdown
          value={form[key]}
          disabled={disabled || options.length === 0}
          onChange={value => setField(key, value)}
          options={dropdownOptions}
          ariaLabel={label}
          variant="default"
          portal
          inputSkin
          showAllOptions={dropdownOptions.length <= 8}
        />
      </label>
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!rowId || saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/laporan/jamaah/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          id: rowId,
          nama: fullName,
          jk: form.jk,
          ktp: form.ktp,
          pendaftar: form.pendaftar,
          wa: form.wa,
          tpendaftar: hidden.tpendaftar || form.wa || '1111111111',
          tempat_lahir: form.tempat_lahir,
          tgl_lahir: form.tgl_lahir || null,
          status: form.status,
          pekerjaan: form.pekerjaan,
          alamat: form.alamat,
          pendamping: form.pendamping,
          pengalaman: form.pengalaman,
          remarks: form.remarks,
          mahram: hidden.mahram,
          kondisi: hidden.kondisi,
          keterangan: hidden.keterangan,
          no_paspor: hidden.no_paspor,
          paspor_expired: hidden.paspor_expired || null,
          prov: hidden.prov,
          kab: hidden.kab,
          kec: hidden.kec,
          kel: hidden.kel,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) {
        setError(result.error || 'Gagal menyimpan data jamaah');
        return;
      }
      const refreshPath = hidden.idu
        ? `/dashboard/jamaah?refresh_id_umroh=${encodeURIComponent(hidden.idu)}`
        : '/dashboard/jamaah?sync=1';
      if (onNavigate) onNavigate(refreshPath);
      else onBack();
    } catch (err) {
      console.error('Failed to save jamaah edit page:', err);
      setError('Gagal menghubungi server');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 pt-4 pb-8">
      <form onSubmit={handleSubmit} className="space-y-3">
        {(loading || saving) && (
          <div className="relative overflow-hidden rounded-xl border border-emerald-100 bg-emerald-50/80 p-3 text-xs font-medium text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-300">
            {saving && <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent dark:via-emerald-500/10" />}
            <span className="relative inline-flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              {saving ? 'Menyimpan ke sistem internal...' : 'Memuat data jamaah...'}
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-gray-50 px-4 py-2.5 dark:border-slate-700/50">
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-slate-300">Data Jamaah</h3>
          </div>
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
            {renderInput('firstname', 'Nama Depan', { type: 'text', maxLength: 80, autoFocus: true }, { uppercase: true })}
            {renderInput('middlename', 'Nama Tengah', { type: 'text', maxLength: 80 }, { uppercase: true })}
            <div className="sm:col-span-2">
              {renderInput('lastname', 'Nama Belakang', { type: 'text', maxLength: 80 }, { uppercase: true })}
            </div>
            {renderSelect('jk', 'kelamin', 'Jenis Kelamin')}
            {renderInput('ktp', 'No. KTP', { type: 'text', inputMode: 'numeric', maxLength: 32 })}
            {renderInput('pendaftar', 'Nama Pendaftar', { type: 'text', maxLength: 120 }, { uppercase: true })}
            {renderInput('wa', 'No. Telp/HP Jamaah', { type: 'tel', inputMode: 'tel', maxLength: 24 })}
            {renderInput('tempat_lahir', 'Tempat Lahir', { type: 'text', maxLength: 80 }, { uppercase: true })}
            {renderInput('tgl_lahir', 'Tanggal Lahir', { type: 'date' })}
            {renderSelect('status', 'status', 'Status Nikah')}
            {renderSelect('pekerjaan', 'pekerjaan', 'Pekerjaan')}
            <label className="block min-w-0 sm:col-span-2">
              <span className={labelClass}>Alamat (Sesuai KTP)</span>
              <textarea
                value={form.alamat}
                disabled={disabled}
                rows={2}
                onChange={e => setField('alamat', e.target.value, true)}
                className={`${inputClass} min-h-[84px] resize-none`}
              />
            </label>
            {renderSelect('pendamping', 'pendamping', 'Pendamping (Keberangkatan)')}
            {renderSelect('pengalaman', 'pengalaman', 'Pengalaman Umrah')}
            <div className="sm:col-span-2">
              {renderSelect('remarks', 'remarks', 'Remarks')}
            </div>
          </div>
        </section>

        <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-gray-100 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
          <button
            type="button"
            onClick={onBack}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-700 transition-all duration-200 hover:bg-gray-200 active:scale-95 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <XCircle size={16} />
            Batal
          </button>
          <button
            type="submit"
            disabled={disabled || !rowId || !fullName}
            className="relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-all duration-200 hover:bg-emerald-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving && <span className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent" />}
            <span className="relative inline-flex items-center gap-1.5">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? 'Menyimpan...' : 'Simpan'}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
