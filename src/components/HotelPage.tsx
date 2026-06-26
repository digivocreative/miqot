import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BedDouble, Star, MapPin, Footprints, Eye, Accessibility, Users, Plane,
  ChevronLeft, Loader2, Search, Pencil, Plus, X, Trash2, Calendar, AlertCircle,
} from 'lucide-react';
import { formatPrice } from '../services/data-service';
import { getAuthHeaders } from './LoginPage';

// ── Types ──
interface HotelBase {
  slug: string;
  name: string;
  city: string;
  stars: number | null;
  distance_label: string | null;
  walk_minutes: number | null;
  view_haram: boolean;
  elderly_friendly: boolean;
  facilities: string[];
  description: string;
  aliases: string[];
  is_setaraf_class: boolean;
  photo_url: string | null;
  sort_order: number;
}

interface HotelListItem extends HotelBase {
  package_count: number;
  seat_available: number;
  lowest_price: number | null;
  next_departure: string | null;
}

interface HotelPackage {
  jadwal_id: string;
  year_code: string;
  jadwal_nama: string;
  berangkat_tgl: string | null;
  pulang_tgl: string | null;
  seat_sisa: number;
  maskapai: string;
  city: string;
  tiers: string[];
  lowest_price: number | null;
}

interface HotelDetail {
  hotel: HotelBase;
  packages: HotelPackage[];
  summary: {
    package_count: number;
    seat_available: number;
    lowest_price: number | null;
    next_departure: string | null;
  };
}

const CITY_LABEL: Record<string, string> = { mekkah: 'Mekkah', madinah: 'Madinah' };

function formatTgl(d: string | null): string {
  if (!d) return '-';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

function Stars({ n }: { n: number | null }) {
  if (!n) return null;
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: n }).map((_, i) => (
        <Star key={i} size={13} className="fill-amber-400 text-amber-400" />
      ))}
    </span>
  );
}

function CityBadge({ city }: { city: string }) {
  const isMekkah = city === 'mekkah';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
      isMekkah
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
        : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
    }`}>
      <MapPin size={11} /> {CITY_LABEL[city] || city}
    </span>
  );
}

function HotelThumb({ hotel, className }: { hotel: HotelBase; className?: string }) {
  if (hotel.photo_url) {
    return <img src={hotel.photo_url} alt={hotel.name} className={`object-cover ${className || ''}`} loading="lazy" />;
  }
  return (
    <div className={`flex items-center justify-center bg-gradient-to-br from-indigo-100 to-blue-200 dark:from-indigo-900/40 dark:to-blue-900/30 ${className || ''}`}>
      <BedDouble className="text-indigo-400 dark:text-indigo-500" size={40} />
    </div>
  );
}

// ──────────────────────────────────────────────
// Directory
// ──────────────────────────────────────────────
function HotelCard({ hotel, onClick }: { hotel: HotelListItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-sm transition hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="relative h-32 w-full overflow-hidden">
        <HotelThumb hotel={hotel} className="h-full w-full transition group-hover:scale-105" />
        <div className="absolute left-2 top-2 flex gap-1">
          <CityBadge city={hotel.city} />
        </div>
        {hotel.view_haram && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
            <Eye size={10} /> View
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold leading-snug text-gray-800 dark:text-white">{hotel.name}</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Stars n={hotel.stars} />
          {hotel.walk_minutes != null && (
            <span className="inline-flex items-center gap-1"><Footprints size={12} /> {hotel.walk_minutes} mnt</span>
          )}
          {hotel.distance_label && <span>{hotel.distance_label}</span>}
        </div>
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
            hotel.package_count > 0
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
              : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
          }`}>
            {hotel.package_count} paket
          </span>
          {hotel.lowest_price != null && (
            <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
              dari {formatPrice(hotel.lowest_price)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ──────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────
export default function HotelPage() {
  const [hotels, setHotels] = useState<HotelListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // filters
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState<'all' | 'mekkah' | 'madinah'>('all');
  const [minStars, setMinStars] = useState(0);
  const [onlyViewHaram, setOnlyViewHaram] = useState(false);
  const [onlyElderly, setOnlyElderly] = useState(false);

  const [creating, setCreating] = useState(false);

  const fetchHotels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hotels', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHotels(data.hotels || []);
    } catch (e) {
      setError('Gagal memuat data hotel.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHotels(); }, [fetchHotels]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return hotels.filter(h => {
      if (cityFilter !== 'all' && h.city !== cityFilter) return false;
      if (minStars > 0 && (h.stars || 0) < minStars) return false;
      if (onlyViewHaram && !h.view_haram) return false;
      if (onlyElderly && !h.elderly_friendly) return false;
      if (q && !h.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [hotels, search, cityFilter, minStars, onlyViewHaram, onlyElderly]);

  if (selected) {
    return (
      <HotelDetailView
        slug={selected}
        onBack={() => setSelected(null)}
        onChanged={fetchHotels}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl pb-10">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-gray-800 dark:text-white">
            <BedDouble className="text-indigo-500" size={20} /> Direktori Hotel
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Hotel yang dipakai paket Alhijaz — klik untuk lihat paket yang menginap di sana.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          <Plus size={16} /> Hotel
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 space-y-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama hotel…"
            className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'mekkah', 'madinah'] as const).map(c => (
            <button
              key={c}
              onClick={() => setCityFilter(c)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                cityFilter === c
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
              }`}
            >
              {c === 'all' ? 'Semua kota' : CITY_LABEL[c]}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-gray-200 dark:bg-gray-600" />
          {[0, 4, 5].map(s => (
            <button
              key={s}
              onClick={() => setMinStars(s)}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition ${
                minStars === s
                  ? 'bg-amber-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
              }`}
            >
              {s === 0 ? 'Semua ★' : <>≥{s}<Star size={11} className="fill-current" /></>}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-gray-200 dark:bg-gray-600" />
          <button
            onClick={() => setOnlyViewHaram(v => !v)}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition ${
              onlyViewHaram ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
            }`}
          >
            <Eye size={12} /> View Haram
          </button>
          <button
            onClick={() => setOnlyElderly(v => !v)}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition ${
              onlyElderly ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
            }`}
          >
            <Accessibility size={12} /> Ramah Lansia
          </button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="animate-spin" size={28} />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 py-16 text-gray-500">
          <AlertCircle size={28} className="text-rose-400" />
          <p className="text-sm">{error}</p>
          <button onClick={fetchHotels} className="rounded-lg bg-gray-100 px-3 py-1 text-sm dark:bg-gray-700">Coba lagi</button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-400">Tidak ada hotel yang cocok dengan filter.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map(h => (
            <HotelCard key={h.slug} hotel={h} onClick={() => setSelected(h.slug)} />
          ))}
        </div>
      )}

      {creating && (
        <HotelEditModal
          hotel={null}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); fetchHotels(); }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Detail
// ──────────────────────────────────────────────
function HotelDetailView({ slug, onBack, onChanged }: {
  slug: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<HotelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/hotels/${slug}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="animate-spin" size={28} /></div>;
  }
  if (!data) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-gray-500">Hotel tidak ditemukan.</p>
        <button onClick={onBack} className="mt-3 rounded-lg bg-gray-100 px-3 py-1 text-sm dark:bg-gray-700">Kembali</button>
      </div>
    );
  }

  const h = data.hotel;
  return (
    <div className="mx-auto max-w-4xl pb-10">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-indigo-600 dark:text-gray-300">
          <ChevronLeft size={18} /> Direktori
        </button>
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
        >
          <Pencil size={14} /> Edit
        </button>
      </div>

      {/* Hero */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="relative h-48 w-full sm:h-60">
          <HotelThumb hotel={h} className="h-full w-full" />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
            <div className="flex items-center gap-2">
              <CityBadge city={h.city} />
              {h.is_setaraf_class && (
                <span className="rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">Kelas setaraf</span>
              )}
            </div>
            <h1 className="mt-1 text-xl font-bold text-white">{h.name}</h1>
            <div className="mt-0.5 flex items-center gap-2 text-sm text-white/90"><Stars n={h.stars} /></div>
          </div>
        </div>

        {/* Quick facts */}
        <div className="grid grid-cols-2 gap-px bg-gray-100 dark:bg-gray-700 sm:grid-cols-4">
          <Fact icon={<Footprints size={16} />} label="Jalan kaki" value={h.walk_minutes != null ? `${h.walk_minutes} menit` : '-'} />
          <Fact icon={<MapPin size={16} />} label="Jarak" value={h.distance_label || '-'} />
          <Fact icon={<Eye size={16} />} label="View masjid" value={h.view_haram ? 'Ya' : 'Tidak'} highlight={h.view_haram} />
          <Fact icon={<Accessibility size={16} />} label="Ramah lansia" value={h.elderly_friendly ? 'Ya' : 'Tidak'} highlight={h.elderly_friendly} />
        </div>
      </div>

      {/* Description + facilities */}
      {(h.description || h.facilities.length > 0) && (
        <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          {h.description && <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">{h.description}</p>}
          {h.facilities.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {h.facilities.map((f, i) => (
                <span key={i} className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">{f}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Packages */}
      <div className="mt-4">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold text-gray-800 dark:text-white">
          <Plane size={16} className="text-indigo-500" />
          Paket yang menginap di sini
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">{data.packages.length}</span>
        </h2>
        {data.packages.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400 dark:border-gray-700">
            Belum ada paket aktif yang memakai hotel ini.
          </p>
        ) : (
          <div className="space-y-2">
            {data.packages.map(p => (
              <a
                key={`${p.year_code}-${p.jadwal_id}`}
                href={`/dashboard/home`}
                onClick={(e) => e.preventDefault()}
                className="block rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-800 dark:text-white">{p.jadwal_nama}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center gap-1"><Calendar size={12} /> {formatTgl(p.berangkat_tgl)}</span>
                      {p.maskapai && <span className="inline-flex items-center gap-1"><Plane size={12} /> {p.maskapai}</span>}
                      <span className="inline-flex items-center gap-1"><Users size={12} /> sisa {p.seat_sisa}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.tiers.map(t => (
                        <span key={t} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">{t}</span>
                      ))}
                    </div>
                  </div>
                  {p.lowest_price != null && (
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] text-gray-400">mulai</p>
                      <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{formatPrice(p.lowest_price)}</p>
                    </div>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <HotelEditModal
          hotel={h}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); fetchDetail(); onChanged(); }}
        />
      )}
    </div>
  );
}

function Fact({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-white p-3 dark:bg-gray-800">
      <div className="flex items-center gap-1.5 text-gray-400">{icon}<span className="text-[11px]">{label}</span></div>
      <p className={`mt-0.5 text-sm font-bold ${highlight ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-800 dark:text-white'}`}>{value}</p>
    </div>
  );
}

// ──────────────────────────────────────────────
// Edit / Create modal
// ──────────────────────────────────────────────
function HotelEditModal({ hotel, onClose, onSaved }: {
  hotel: HotelBase | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !hotel;
  const [form, setForm] = useState({
    slug: hotel?.slug || '',
    name: hotel?.name || '',
    city: hotel?.city || 'mekkah',
    stars: String(hotel?.stars ?? 5),
    distance_label: hotel?.distance_label || '',
    walk_minutes: hotel?.walk_minutes ?? '',
    view_haram: hotel?.view_haram || false,
    elderly_friendly: hotel?.elderly_friendly || false,
    facilities: (hotel?.facilities || []).join(', '),
    description: hotel?.description || '',
    aliases: (hotel?.aliases || []).join(', '),
    is_setaraf_class: hotel?.is_setaraf_class || false,
    sort_order: hotel?.sort_order ?? 0,
  });
  const [photoPreview, setPhotoPreview] = useState<string | null>(hotel?.photo_url || null);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPhotoPreview(result);
      setPhotoData(result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.slug.trim()) { setErr('Slug dan nama wajib diisi.'); return; }
    setSaving(true);
    setErr(null);
    const payload = {
      slug: form.slug.trim().toLowerCase(),
      name: form.name.trim(),
      city: form.city,
      stars: form.stars === '' ? null : Number(form.stars),
      distance_label: form.distance_label.trim(),
      walk_minutes: form.walk_minutes === '' ? null : Number(form.walk_minutes),
      view_haram: form.view_haram,
      elderly_friendly: form.elderly_friendly,
      facilities: form.facilities.split(',').map(s => s.trim()).filter(Boolean),
      description: form.description.trim(),
      aliases: form.aliases.split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
      is_setaraf_class: form.is_setaraf_class,
      sort_order: Number(form.sort_order) || 0,
    };
    try {
      const url = isNew ? '/api/hotels' : `/api/hotels/${payload.slug}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      if (photoData) {
        await fetch(`/api/hotels/${payload.slug}/photo`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: photoData }),
        });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal menyimpan.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!hotel || !window.confirm(`Hapus hotel "${hotel.name}"?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/hotels/${hotel.slug}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal menghapus.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl dark:bg-gray-800 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-800 dark:text-white">{isNew ? 'Tambah Hotel' : 'Edit Hotel'}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
        </div>

        {/* Photo */}
        <div className="mb-4 flex items-center gap-3">
          <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-600">
            {photoPreview
              ? <img src={photoPreview} alt="" className="h-full w-full object-cover" />
              : <div className="flex h-full w-full items-center justify-center bg-gray-100 dark:bg-gray-700"><BedDouble size={24} className="text-gray-400" /></div>}
          </div>
          <label className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300">
            Pilih foto
            <input type="file" accept="image/*" className="hidden" onChange={onPickPhoto} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Slug" full={isNew}>
            <input disabled={!isNew} value={form.slug} onChange={(e) => set('slug', e.target.value)} className={inputCls} placeholder="pullman-zamzam" />
          </Field>
          <Field label="Nama" full>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Kota">
            <select value={form.city} onChange={(e) => set('city', e.target.value)} className={inputCls}>
              <option value="mekkah">Mekkah</option>
              <option value="madinah">Madinah</option>
            </select>
          </Field>
          <Field label="Bintang">
            <input type="number" min={1} max={5} value={form.stars} onChange={(e) => set('stars', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Jarak (label)">
            <input value={form.distance_label} onChange={(e) => set('distance_label', e.target.value)} className={inputCls} placeholder="±50m" />
          </Field>
          <Field label="Jalan kaki (menit)">
            <input type="number" min={0} value={form.walk_minutes} onChange={(e) => set('walk_minutes', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Fasilitas (pisah koma)" full>
            <input value={form.facilities} onChange={(e) => set('facilities', e.target.value)} className={inputCls} placeholder="View Haram, Lift, Resto Indonesia" />
          </Field>
          <Field label="Deskripsi" full>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} className={inputCls} />
          </Field>
          <Field label="Alias nama mentah (pisah koma)" full>
            <input value={form.aliases} onChange={(e) => set('aliases', e.target.value)} className={inputCls} placeholder="PULLMAN ZAMZAM" />
          </Field>
          <Field label="Urutan">
            <input type="number" value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} className={inputCls} />
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap gap-4">
          <Toggle label="View masjid" checked={form.view_haram} onChange={(v) => set('view_haram', v)} />
          <Toggle label="Ramah lansia" checked={form.elderly_friendly} onChange={(v) => set('elderly_friendly', v)} />
          <Toggle label="Kelas setaraf" checked={form.is_setaraf_class} onChange={(v) => set('is_setaraf_class', v)} />
        </div>

        {err && <p className="mt-3 text-sm text-rose-500">{err}</p>}

        <div className="mt-5 flex items-center justify-between gap-2">
          {!isNew ? (
            <button onClick={handleDelete} disabled={saving} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20">
              <Trash2 size={15} /> Hapus
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">Batal</button>
            <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
              {saving && <Loader2 size={15} className="animate-spin" />} Simpan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-600 dark:bg-gray-700 dark:text-white';

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded text-indigo-600" />
      {label}
    </label>
  );
}
