import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Plus, Pencil, Trash2, ImageOff, ImagePlus, Star, X, AlertTriangle,
  Loader2, Play, ChevronDown, Search, Check,
} from 'lucide-react';
import { getAuthHeaders } from './LoginPage';
import SegmentedControl from './common/SegmentedControl';
import {
  HOTEL_CITIES, HOTEL_CITY_LABELS, HOTEL_CITY_LANDMARKS, HotelViewShell,
  type HotelListItem, type HotelDetail, type HotelMediaItem,
} from './HotelPage';

const INPUT_CLASS = 'w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400 disabled:opacity-50';
const LABEL_CLASS = 'flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 uppercase tracking-wide';

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
// WebM sengaja TIDAK didukung (dukungan iOS tak merata) — cerminan
// HOTEL_MEDIA_MIME_TYPES di server. Video wajib H.264, diperiksa server.
const SUPPORTED_VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime']);
const MEDIA_ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime';
const FACILITY_PRESETS = ['Wi-Fi', 'Restoran', 'AC', 'Lift', 'Laundry', 'Musholla', 'Kursi Roda'];

interface FormMedia {
  key: string;
  type: 'image' | 'video';
  url: string | null;
  previewUrl: string;
  status: 'uploading' | 'done' | 'error';
}

interface FormState {
  name: string;
  city: string;
  stars: number | null;
  distance_label: string;
  walk_label: string;
  area: string;
  address: string;
  gmaps_url: string;
  description: string;
  facilities: string[];
  agent_note: string;
  media: FormMedia[];
}

function emptyForm(): FormState {
  return {
    name: '', city: 'mekkah', stars: null,
    distance_label: '', walk_label: '', area: '', address: '', gmaps_url: '',
    description: '', facilities: [], agent_note: '', media: [],
  };
}

function formFromDetail(detail: HotelDetail): FormState {
  return {
    name: detail.name,
    city: detail.city,
    stars: detail.stars,
    distance_label: detail.distance_label || '',
    walk_label: detail.walk_label || '',
    area: detail.area || '',
    address: detail.address || '',
    gmaps_url: detail.gmaps_url || '',
    description: detail.description || '',
    facilities: detail.facilities || [],
    agent_note: detail.agent_note || '',
    media: (detail.media || []).map((item, index) => ({
      key: `existing-${index}-${item.url}`,
      type: item.type,
      url: item.url,
      previewUrl: item.url,
      status: 'done' as const,
    })),
  };
}

// Salinan pendekatan resizeCommunityPhoto (Teras): maks 1600px, JPEG 0.85,
// latar putih untuk PNG transparan.
function resizeHotelPhoto(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxWidth = 1600;
      const scale = Math.min(1, maxWidth / img.width);
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas tidak tersedia')); return; }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('Gagal memproses foto'))),
        'image/jpeg',
        0.85
      );
    };
    // Gagal decode paling sering = HEIC/HEIF iPhone di perangkat non-Apple.
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Foto ini tidak bisa dibaca. Simpan/ekspor ulang sebagai JPG atau PNG, lalu unggah lagi.'));
    };
    img.src = objectUrl;
  });
}

// Buang file yang terunggah tapi tak jadi dipakai. Server menolak menghapus
// file yang masih direferensikan hotel/banner, jadi aman dipanggil longgar.
function discardHotelMedia(type: 'image' | 'video', url: string): void {
  void fetch('/api/hotels/media', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ type, url }),
    keepalive: true,
  }).catch(() => { /* best-effort: sisa file akan tersapu saat hotel disimpan/dihapus */ });
}

async function uploadHotelMedia(blob: Blob): Promise<string> {
  const res = await fetch('/api/hotels/media', {
    method: 'POST',
    headers: {
      'Content-Type': blob.type || 'application/octet-stream',
      'X-Upload-ID': crypto.randomUUID(),
      ...getAuthHeaders(),
    },
    body: blob,
  });
  let json: { success?: boolean; url?: string; error?: string } = {};
  try { json = await res.json(); } catch { /* pesan generik di bawah */ }
  if (!res.ok || !json.success || !json.url) {
    throw new Error(json.error || 'Gagal mengunggah media');
  }
  return json.url;
}

type KelolaTab = 'detail' | 'media';
type KelolaView =
  | { kind: 'list' }
  | { kind: 'create'; tab: KelolaTab }
  | { kind: 'edit'; slug: string; tab: KelolaTab };

const KELOLA_TABS: { id: KelolaTab; label: string }[] = [
  { id: 'detail', label: 'Detail' },
  { id: 'media', label: 'Media' },
];

// Segmen tab yang tak dikenal (salah ketik, URL lama) jatuh ke Detail tanpa
// menulis ulang URL — fail-soft, tanpa efek samping saat render.
function readKelolaTab(segment: string | undefined): KelolaTab {
  return segment === 'media' ? 'media' : 'detail';
}

// View diturunkan dari URL (/dashboard/hotels[/tambah|/edit/:slug][/media])
// supaya tombol back header DashboardLayout jadi satu-satunya navigasi mundur —
// pola sama dengan readHotelView di HotelPage (keluhan "navigasi double").
// Tab Detail sengaja tanpa segmen sendiri agar URL form yang sudah beredar
// tetap sah. Indeks segmen tab beda antara tambah (3) dan edit (4) — hanya
// edit yang membawa slug.
function readKelolaView(): KelolaView {
  const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  if (segments[2] === 'tambah') return { kind: 'create', tab: readKelolaTab(segments[3]) };
  const slug = decodeURIComponent(segments[3] || '');
  if (segments[2] === 'edit' && slug) return { kind: 'edit', slug, tab: readKelolaTab(segments[4]) };
  return { kind: 'list' };
}

export default function HotelKelolaPage({ onNavigate }: { onNavigate: (path: string, opts?: { replace?: boolean }) => void }) {
  // Re-render tiap navigasi datang dari pathTick DashboardLayout.
  const view = readKelolaView();
  const reduceMotion = useReducedMotion();
  const [hotels, setHotels] = useState<HotelListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cityFilter, setCityFilter] = useState<string>('semua');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formLoading, setFormLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Simpan TIDAK memulangkan ke daftar (permintaan user) — konfirmasi muncul
  // sebagai pita hijau sekilas di bar aksi, lalu hilang sendiri.
  const [saveOk, setSaveOk] = useState(false);
  const saveOkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Setelah Tambah sukses kita pindah ke URL edit hotel baru. Datanya sudah di
  // tangan, jadi efek editSlug tak perlu memuat ulang — tanpa ini form berkedip
  // skeleton dan terlihat seperti berpindah halaman.
  const skipEditFetchRef = useRef<string | null>(null);
  const [facilityDraft, setFacilityDraft] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<HotelListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // URL yang diunggah di sesi form ini dan BELUM tersimpan ke DB. Dibuang saat
  // item dicabut atau form ditinggalkan tanpa simpan, supaya storage bersih.
  const pendingUploadsRef = useRef<Map<string, 'image' | 'video'>>(new Map());
  // Banner kartu kategori di Direktori Hotel (agent-facing).
  // Jarang diubah → default terlipat agar daftar hotel tidak terdorong ke bawah.
  const [showBanners, setShowBanners] = useState(false);
  const [banners, setBanners] = useState<Record<string, string | null>>({});
  const [bannerBusy, setBannerBusy] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const bannerCityRef = useRef<string | null>(null);

  const refetch = () => {
    fetch('/api/hotels', { headers: getAuthHeaders() })
      .then(async res => {
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Gagal memuat daftar hotel');
        setHotels(json.data);
        setLoadError(null);
      })
      .catch(err => setLoadError(err.message));
  };

  useEffect(() => { refetch(); }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/hotels/banners', { headers: getAuthHeaders() })
      .then(async res => {
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Gagal memuat banner');
        if (!cancelled) setBanners(json.data);
      })
      .catch(err => { if (!cancelled) setBannerError(err instanceof Error ? err.message : 'Gagal memuat banner'); });
    return () => { cancelled = true; };
  }, []);

  const saveBanner = async (city: string, imageUrl: string | null) => {
    const res = await fetch(`/api/hotels/banners/${encodeURIComponent(city)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ image_url: imageUrl }),
    });
    let json: { success?: boolean; error?: string } = {};
    try { json = await res.json(); } catch { /* pesan generik di bawah */ }
    if (!res.ok || !json.success) throw new Error(json.error || 'Gagal menyimpan banner');
    setBanners(prev => ({ ...prev, [city]: imageUrl }));
  };

  const pickBanner = (city: string) => {
    bannerCityRef.current = city;
    bannerInputRef.current?.click();
  };

  const handleBannerFile = async (files: FileList | null) => {
    const city = bannerCityRef.current;
    bannerCityRef.current = null;
    const file = files?.[0];
    if (!city || !file) return;
    setBannerError(null);
    if (!file.type.startsWith('image/')) {
      setBannerError('Banner harus berupa foto.');
      return;
    }
    setBannerBusy(city);
    try {
      const blob = await resizeHotelPhoto(file);
      if (blob.size > MAX_IMAGE_BYTES) throw new Error('Foto banner terlalu besar (maks 3MB).');
      const url = await uploadHotelMedia(blob);
      await saveBanner(city, url);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Gagal menyimpan banner');
    } finally {
      setBannerBusy(null);
    }
  };

  const removeBanner = async (city: string) => {
    setBannerError(null);
    setBannerBusy(city);
    try {
      await saveBanner(city, null);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Gagal menghapus banner');
    } finally {
      setBannerBusy(null);
    }
  };

  // Kunci primitif, bukan objek view — readKelolaView membuat objek baru tiap render.
  // JANGAN masukkan tab ke kunci mana pun di bawah: efek-efek berikut me-reset
  // form dan memuat ulang detail hotel, jadi kalau ikut berubah tiap ganti tab,
  // isian yang sedang diketik hilang dan unggahan yang belum tersimpan dibuang.
  const editSlug = view.kind === 'edit' ? view.slug : null;
  const isCreate = view.kind === 'create';
  const inForm = view.kind !== 'list';

  // Tab form ikut URL (/edit/:slug[/media], /tambah[/media]) supaya refresh
  // bertahan di tab yang sama. Pindah tab memakai replace: riwayat tidak
  // menumpuk, jadi back (header / browser / gestur iOS) tetap keluar ke daftar.
  const activeTab: KelolaTab = view.kind === 'list' ? 'detail' : view.tab;
  const formBasePath = editSlug
    ? `/dashboard/hotels/edit/${encodeURIComponent(editSlug)}`
    : '/dashboard/hotels/tambah';
  const goTab = (tab: KelolaTab) => {
    if (tab === activeTab) return;
    onNavigate(tab === 'detail' ? formBasePath : `${formBasePath}/${tab}`, { replace: true });
  };

  // Meninggalkan form (Batal, back header, pindah tab dashboard) membuang
  // unggahan yang belum tersimpan. Setelah Simpan sukses daftarnya sudah
  // dikosongkan, jadi yang tersisa di sini memang benar-benar yatim. Pindah
  // Detail↔Media tidak memicu ini: inForm tetap true di kedua tab.
  useEffect(() => {
    if (!inForm) return;
    const pending = pendingUploadsRef.current;
    return () => {
      for (const [url, type] of pending) discardHotelMedia(type, url);
      pending.clear();
    };
  }, [inForm]);

  useEffect(() => {
    if (!isCreate) return;
    setForm(emptyForm());
    setEditingId(null);
    setSaveError(null);
  }, [isCreate]);

  useEffect(() => () => {
    if (saveOkTimerRef.current) clearTimeout(saveOkTimerRef.current);
  }, []);

  useEffect(() => {
    if (!editSlug) return;
    // Baru saja dibuat lewat form ini — form sudah memegang baris tersimpan.
    if (skipEditFetchRef.current === editSlug) {
      skipEditFetchRef.current = null;
      return;
    }
    let cancelled = false;
    setForm(emptyForm());
    setEditingId(null);
    setSaveError(null);
    setFormLoading(true);
    fetch(`/api/hotels/${encodeURIComponent(editSlug)}`, { headers: getAuthHeaders() })
      .then(async res => {
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Gagal memuat data hotel');
        if (cancelled) return;
        setForm(formFromDetail(json.data));
        setEditingId(json.data.id);
      })
      .catch(err => { if (!cancelled) setSaveError(err instanceof Error ? err.message : 'Gagal memuat data hotel'); })
      .finally(() => { if (!cancelled) setFormLoading(false); });
    return () => { cancelled = true; };
  }, [editSlug]);

  const handleMediaSelection = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setSaveError(null);
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith('image/');
      const isVideo = SUPPORTED_VIDEO_TYPES.has(file.type);
      if (!isImage && !isVideo) {
        setSaveError('Format tidak didukung. Gunakan foto JPG/PNG/WebP atau video MP4 (H.264).');
        continue;
      }
      if (isImage && file.size > MAX_IMAGE_BYTES) {
        setSaveError('Ukuran foto maksimal 3MB.');
        continue;
      }
      if (isVideo && file.size > MAX_VIDEO_BYTES) {
        setSaveError('Ukuran video maksimal 20MB.');
        continue;
      }
      const key = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      const item: FormMedia = {
        key,
        type: isImage ? 'image' : 'video',
        url: null,
        previewUrl,
        status: 'uploading',
      };
      setForm(prev => ({ ...prev, media: [...prev.media, item] }));
      try {
        const blob = isImage ? await resizeHotelPhoto(file) : file;
        const url = await uploadHotelMedia(blob);
        pendingUploadsRef.current.set(url, isImage ? 'image' : 'video');
        setForm(prev => ({
          ...prev,
          media: prev.media.map(m => (m.key === key ? { ...m, url, status: 'done' as const } : m)),
        }));
      } catch (err) {
        setForm(prev => ({
          ...prev,
          media: prev.media.map(m => (m.key === key ? { ...m, status: 'error' as const } : m)),
        }));
        setSaveError(err instanceof Error ? err.message : 'Gagal mengunggah media');
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeMedia = (key: string) => {
    setForm(prev => {
      const target = prev.media.find(m => m.key === key);
      if (target && target.previewUrl.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
      // Unggahan sesi ini yang dicabut sebelum simpan langsung dibuang dari
      // storage. Media lama (sudah tersimpan) menunggu Simpan — server yang
      // membersihkan setelah baris DB benar-benar berubah.
      if (target?.url && pendingUploadsRef.current.has(target.url)) {
        discardHotelMedia(pendingUploadsRef.current.get(target.url)!, target.url);
        pendingUploadsRef.current.delete(target.url);
      }
      return { ...prev, media: prev.media.filter(m => m.key !== key) };
    });
  };

  const makeCover = (key: string) => {
    setForm(prev => {
      const target = prev.media.find(m => m.key === key);
      if (!target || target.type !== 'image') return prev;
      return { ...prev, media: [target, ...prev.media.filter(m => m.key !== key)] };
    });
  };

  const addFacility = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setForm(prev => (prev.facilities.includes(trimmed)
      ? prev
      : { ...prev, facilities: [...prev.facilities, trimmed] }));
    setFacilityDraft('');
  };

  const handleSave = async () => {
    // Mode edit tapi detail belum/gagal termuat → tanpa editingId permintaan
    // akan jatuh ke POST dan MENDUPLIKASI hotel. Tahan di sini (fail-closed).
    if (editSlug && !editingId) { setSaveError('Data hotel belum termuat. Muat ulang halaman ini.'); return; }
    // Simpan bisa ditekan dari tab mana pun, jadi lompat ke tab yang bermasalah
    // dulu — tanpa itu pesan error menunjuk isian yang sedang tersembunyi.
    if (!form.name.trim()) { goTab('detail'); setSaveError('Nama hotel wajib diisi.'); return; }
    if (form.media.some(m => m.status === 'uploading')) {
      goTab('media');
      setSaveError('Tunggu unggahan media selesai dulu.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    const cityHasDistance = Boolean(HOTEL_CITY_LANDMARKS[form.city]);
    const body = {
      name: form.name,
      city: form.city,
      stars: form.stars,
      distance_label: cityHasDistance ? form.distance_label : null,
      walk_label: cityHasDistance ? form.walk_label : null,
      area: form.area,
      address: form.address,
      gmaps_url: form.gmaps_url,
      description: form.description,
      facilities: form.facilities,
      agent_note: form.agent_note,
      media: form.media
        .filter((m): m is FormMedia & { url: string } => m.status === 'done' && !!m.url)
        .map<HotelMediaItem>(m => ({ type: m.type, url: m.url })),
    };
    try {
      const res = await fetch(editingId ? `/api/hotels/${editingId}` : '/api/hotels', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Gagal menyimpan hotel');
      // Tersimpan → bukan lagi unggahan yatim; jangan dibuang saat form ditutup.
      pendingUploadsRef.current.clear();
      // Form disegarkan dari baris hasil simpan, bukan dibiarkan apa adanya:
      // server menormalkan isian (trim, jarak dipaksa null untuk Turki/Dubai),
      // jadi yang tampil = yang benar-benar tersimpan.
      setForm(formFromDetail(json.data));
      setEditingId(json.data.id);
      // Tambah → pindah ke URL edit hotel baru (replace, tanpa muat ulang):
      // tetap di halaman yang sama, dan klik Simpan berikutnya jadi PUT
      // sehingga tidak melahirkan hotel kembar.
      if (!editSlug) {
        skipEditFetchRef.current = json.data.slug;
        const base = `/dashboard/hotels/edit/${encodeURIComponent(json.data.slug)}`;
        onNavigate(activeTab === 'detail' ? base : `${base}/${activeTab}`, { replace: true });
      }
      setSaveOk(true);
      if (saveOkTimerRef.current) clearTimeout(saveOkTimerRef.current);
      saveOkTimerRef.current = setTimeout(() => setSaveOk(false), 2500);
      refetch();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Gagal menyimpan hotel');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/hotels/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Gagal menghapus hotel');
      setDeleteTarget(null);
      refetch();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Gagal menghapus hotel');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  // ── View: Form Tambah/Edit ──
  // Judul & tombol back form ada di header DashboardLayout ("Tambah/Edit Hotel").
  if (view.kind !== 'list') {
    const cityHasDistance = Boolean(HOTEL_CITY_LANDMARKS[form.city]);
    const landmark = HOTEL_CITY_LANDMARKS[form.city];
    return (
      <HotelViewShell viewKey="kelola-form">
        {/* Tab menempel tepat di bawah header DashboardLayout dan memakai
            material yang sama supaya terbaca sebagai satu chrome. Offset 61px =
            tinggi header sub-halaman (py-3 + chip 36px + border), diukur di
            browser — BUKAN 53px yang dipakai SettingsPage/StatistikPage: angka
            itu peninggalan header lama dan kini kependekan 8px. */}
        <div
          role="tablist"
          aria-label="Bagian form hotel"
          className="sticky top-[61px] z-20 -mx-4 -mt-4 mb-4 flex gap-5 border-b border-gray-100 bg-white/90 px-4 backdrop-blur-md dark:border-slate-700/50 dark:bg-slate-900/90"
        >
          {KELOLA_TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`hotel-form-tab-${tab.id}`}
                aria-selected={active}
                aria-controls={`hotel-form-panel-${tab.id}`}
                onClick={() => goTab(tab.id)}
                className={`-mb-px shrink-0 border-b-2 px-0.5 py-3 text-[13px] font-bold transition-colors ${
                  active
                    ? 'border-emerald-500 text-gray-900 dark:border-emerald-400 dark:text-white'
                    : 'border-transparent text-gray-400 dark:text-slate-500'
                }`}
              >
                {tab.label}
                {/* Isi tab lain tak terlihat — hitungan media jadi penandanya. */}
                {tab.id === 'media' && form.media.length > 0 && (
                  <span className={`ml-1.5 text-[11px] font-semibold ${active ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-300 dark:text-slate-600'}`}>
                    · {form.media.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {formLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-20 rounded-2xl bg-gray-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
          <motion.div
            key={activeTab}
            role="tabpanel"
            id={`hotel-form-panel-${activeTab}`}
            aria-labelledby={`hotel-form-tab-${activeTab}`}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-6"
          >
            {activeTab === 'detail' ? (
            <>
            {/* INFO DASAR */}
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Info Dasar</h3>
              <div>
                <label className={LABEL_CLASS}>Nama Hotel <span className="text-red-500">*</span></label>
                <input
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="mis. Makkah Towers"
                  className={`${INPUT_CLASS} mt-1.5`}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Kategori <span className="text-red-500">*</span></label>
                <div className="mt-1.5">
                  <SegmentedControl
                    options={HOTEL_CITIES.map(city => ({ value: city as string, label: HOTEL_CITY_LABELS[city] }))}
                    value={form.city}
                    onChange={city => setForm(prev => ({ ...prev, city }))}
                    accent="teal"
                  />
                </div>
              </div>
              <div>
                <label className={LABEL_CLASS}>Bintang</label>
                <div className="mt-1.5 flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map(i => (
                    <button
                      key={i}
                      onClick={() => setForm(prev => ({ ...prev, stars: prev.stars === i ? null : i }))}
                      aria-label={`${i} bintang`}
                      className="p-0.5 active:scale-90 transition-transform"
                    >
                      <Star
                        size={24}
                        // fill lewat atribut (bukan kelas fill-*) — lihat catatan StarRow.
                        fill={form.stars && i <= form.stars ? 'currentColor' : 'none'}
                        className={form.stars && i <= form.stars ? 'text-amber-400' : 'text-gray-200 dark:text-slate-700'}
                      />
                    </button>
                  ))}
                  <span className="ml-1 text-xs text-gray-500 dark:text-slate-400">
                    {form.stars ? `${form.stars} bintang` : 'Belum diatur'}
                  </span>
                </div>
              </div>
            </section>

            {/* LOKASI */}
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Lokasi</h3>
              {cityHasDistance && (
                <>
                  <div>
                    <label className={LABEL_CLASS}>Jarak ke {landmark}</label>
                    <input
                      value={form.distance_label}
                      onChange={e => setForm(prev => ({ ...prev, distance_label: e.target.value }))}
                      placeholder="mis. ±250 m"
                      className={`${INPUT_CLASS} mt-1.5`}
                    />
                    <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-500">
                      Hanya untuk kategori Mekkah & Madinah — label "dari {landmark}" otomatis.
                    </p>
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Keterangan Jalan Kaki</label>
                    <input
                      value={form.walk_label}
                      onChange={e => setForm(prev => ({ ...prev, walk_label: e.target.value }))}
                      placeholder="mis. ±4 menit jalan kaki"
                      className={`${INPUT_CLASS} mt-1.5`}
                    />
                  </div>
                </>
              )}
              <div>
                <label className={LABEL_CLASS}>Area / Distrik</label>
                <input
                  value={form.area}
                  onChange={e => setForm(prev => ({ ...prev, area: e.target.value }))}
                  placeholder={cityHasDistance ? 'mis. Ajyad' : 'mis. Sultanahmet, Istanbul'}
                  className={`${INPUT_CLASS} mt-1.5`}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Alamat Lengkap</label>
                <textarea
                  value={form.address}
                  onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))}
                  rows={2}
                  placeholder="Jalan, distrik, kota, negara"
                  className={`${INPUT_CLASS} mt-1.5 resize-none`}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Link Google Maps</label>
                <input
                  value={form.gmaps_url}
                  onChange={e => setForm(prev => ({ ...prev, gmaps_url: e.target.value }))}
                  placeholder="https://maps.app.goo.gl/…"
                  className={`${INPUT_CLASS} mt-1.5`}
                />
              </div>
            </section>

            {/* KONTEN */}
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Konten</h3>
              <div>
                <label className={LABEL_CLASS}>Deskripsi</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={4}
                  placeholder="Gambaran hotel untuk agent…"
                  className={`${INPUT_CLASS} mt-1.5 resize-none`}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Fasilitas</label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {form.facilities.map(facility => (
                    <span key={facility} className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-slate-300">
                      {facility}
                      <button
                        onClick={() => setForm(prev => ({ ...prev, facilities: prev.facilities.filter(f => f !== facility) }))}
                        aria-label={`Hapus ${facility}`}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                  {FACILITY_PRESETS.filter(p => !form.facilities.includes(p)).map(preset => (
                    <button
                      key={preset}
                      onClick={() => addFacility(preset)}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 dark:border-slate-600 px-2.5 py-1 text-xs font-medium text-gray-400 dark:text-slate-500 hover:border-teal-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                    >
                      <Plus size={11} />
                      {preset}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={facilityDraft}
                    onChange={e => setFacilityDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFacility(facilityDraft); } }}
                    placeholder="Fasilitas lain…"
                    className={INPUT_CLASS}
                  />
                  <button
                    onClick={() => addFacility(facilityDraft)}
                    disabled={!facilityDraft.trim()}
                    className="shrink-0 rounded-xl bg-gray-100 dark:bg-slate-800 px-3 text-xs font-semibold text-gray-600 dark:text-slate-300 disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    Tambah
                  </button>
                </div>
              </div>
              <div>
                <label className={LABEL_CLASS}>Catatan Agent</label>
                <textarea
                  value={form.agent_note}
                  onChange={e => setForm(prev => ({ ...prev, agent_note: e.target.value }))}
                  rows={3}
                  placeholder="Tips internal: lantai terbaik, waktu booking, dll."
                  className={`${INPUT_CLASS} mt-1.5 resize-none`}
                />
                <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-500">
                  Internal — hanya terlihat oleh sesama agent, bukan jamaah.
                </p>
              </div>
            </section>
            </>
            ) : (
            /* MEDIA — tanpa judul seksi: label tab sudah menyebutkannya. */
            <section className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept={MEDIA_ACCEPT}
                multiple
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
                onChange={e => handleMediaSelection(e.target.files)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-1 rounded-xl border border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800/60 py-5 transition-colors hover:border-teal-400"
              >
                <ImagePlus size={20} className="text-gray-400 dark:text-slate-500" />
                <span className="text-[13px] font-semibold text-gray-700 dark:text-slate-200">Tambah foto / video</span>
                <span className="text-[11px] text-gray-400 dark:text-slate-500">Foto maks 3MB · Video MP4 (H.264) maks 20MB</span>
              </button>
              {form.media.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.media.map((item, index) => (
                    <div key={item.key} className="relative h-[84px] w-[84px] overflow-hidden rounded-xl bg-gray-100 dark:bg-slate-700">
                      {item.type === 'video' ? (
                        <div className="flex h-full w-full items-center justify-center bg-slate-800">
                          <Play size={18} className="text-white" />
                        </div>
                      ) : (
                        <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                      )}
                      {item.status === 'uploading' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50">
                          <Loader2 size={18} className="animate-spin text-white" />
                        </div>
                      )}
                      {item.status === 'error' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-red-900/60">
                          <AlertTriangle size={16} className="text-white" />
                        </div>
                      )}
                      <button
                        onClick={() => removeMedia(item.key)}
                        aria-label="Hapus media"
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/70 text-white"
                      >
                        <X size={11} />
                      </button>
                      {index === 0 && item.type === 'image' ? (
                        <span className="absolute bottom-1 left-1 rounded-full bg-teal-600 px-1.5 py-px text-[9px] font-bold text-white">Cover</span>
                      ) : item.type === 'image' && item.status === 'done' ? (
                        <button
                          onClick={() => makeCover(item.key)}
                          className="absolute bottom-1 left-1 rounded-full bg-slate-900/70 px-1.5 py-px text-[9px] font-semibold text-white"
                        >
                          Jadikan Cover
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>

            )}
          </motion.div>

          {/* Action bar menempel di dasar layar (pola JamaahEditPage) supaya
              Simpan terjangkau dari tab mana pun tanpa scroll ke dasar halaman.
              Error ikut pindah ke sini agar tak pernah muncul di luar layar. */}
          <div className="sticky bottom-0 -mx-4 mt-6 border-t border-gray-100 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
            {saveError && (
              <div className="mb-2.5 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs font-medium text-red-600 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
                {saveError}
              </div>
            )}
            {saveOk && !saveError && (
              <div className="mb-2.5 flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-semibold text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-400">
                <Check size={13} strokeWidth={2.5} />
                Perubahan tersimpan.
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => onNavigate('/dashboard/hotels')}
                disabled={saving}
                className="shrink-0 rounded-xl bg-gray-100 px-5 py-3 text-[13px] font-semibold text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Batal
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-all duration-200 hover:bg-emerald-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                {editSlug ? 'Simpan Perubahan' : 'Simpan Hotel'}
              </button>
            </div>
          </div>
          </>
        )}
      </HotelViewShell>
    );
  }

  // ── View: Daftar Kelola ──
  const q = query.trim().toLowerCase();
  const filteredHotels = (hotels || [])
    .filter(h => cityFilter === 'semua' || h.city === cityFilter)
    .filter(h => !q || h.name.toLowerCase().includes(q));

  // Modal hapus di luar shell: ancestor ber-transform (animasi masuk) membuat
  // position:fixed overlay terkurung di dalamnya.
  return (
    <>
    <HotelViewShell viewKey="kelola-list">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Kelola Hotel</h2>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            Tambah, edit, dan hapus data hotel direktori.
          </p>
        </div>
        <button
          onClick={() => onNavigate('/dashboard/hotels/tambah')}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-emerald-500/20 transition-all hover:bg-emerald-600 active:scale-95"
        >
          <Plus size={14} strokeWidth={2.5} />
          Tambah
        </button>
      </div>

      {/* ── Banner kartu kategori (tampil di Direktori Hotel agent) ── */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowBanners(v => !v)}
          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
            showBanners
              ? 'bg-emerald-50 dark:bg-emerald-900/15 border-emerald-100 dark:border-emerald-800/40 text-emerald-600 dark:text-emerald-400'
              : 'bg-gray-50 dark:bg-slate-900/40 border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700/50'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <ImagePlus size={12} strokeWidth={2.2} />
            Banner Kategori
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500">
              {HOTEL_CITIES.filter(city => banners[city]).length}/{HOTEL_CITIES.length} terpasang
            </span>
            <ChevronDown
              size={12}
              className="transition-transform duration-200"
              style={{ transform: showBanners ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </span>
        </button>
        {showBanners && (
        <>
        {bannerError && (
          <div className="mt-2 p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-[11px] text-red-600 dark:text-red-400 font-medium">
            {bannerError}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5 mt-2">
          {HOTEL_CITIES.map(city => {
            const src = banners[city];
            const busy = bannerBusy === city;
            return (
              <div key={city} className="relative h-24 overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
                {src ? (
                  <img src={src} alt={`Banner ${HOTEL_CITY_LABELS[city]}`} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-teal-400 to-teal-600 dark:from-teal-600 dark:to-teal-800">
                    <ImagePlus size={20} className="text-white/70" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-slate-900/60 px-2.5 py-1.5">
                  <span className="text-xs font-bold text-white">{HOTEL_CITY_LABELS[city]}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => pickBanner(city)}
                      disabled={busy}
                      aria-label={`Ganti banner ${HOTEL_CITY_LABELS[city]}`}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-white transition-colors hover:bg-white/30 active:scale-95 disabled:opacity-50"
                    >
                      {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                    </button>
                    {src && !busy && (
                      <button
                        onClick={() => removeBanner(city)}
                        aria-label={`Hapus banner ${HOTEL_CITY_LABELS[city]}`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-white transition-colors hover:bg-red-500/70 active:scale-95"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </>
        )}
        <input
          ref={bannerInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={e => { handleBannerFile(e.target.files); e.currentTarget.value = ''; }}
        />
      </div>

      <div className="relative mt-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Cari hotel..."
          className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400"
        />
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {['semua', ...HOTEL_CITIES].map(city => {
          const active = cityFilter === city;
          return (
            <button
              key={city}
              onClick={() => setCityFilter(city)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                active
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                  : 'bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-700'
              }`}
            >
              {city === 'semua' ? 'Semua' : HOTEL_CITY_LABELS[city]}
            </button>
          );
        })}
      </div>

      {loadError && (
        <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium">
          {loadError}
        </div>
      )}

      {!hotels && !loadError && (
        <div className="mt-3 space-y-2.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-[76px] rounded-2xl bg-gray-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      )}

      <div className="mt-3 space-y-2.5">
        {hotels && filteredHotels.length === 0 && !loadError && (
          <div className="py-10 text-center">
            <ImageOff size={32} className="mx-auto text-gray-300 dark:text-slate-600" />
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">
              {q ? 'Tidak ada hotel yang cocok dengan pencarian.' : 'Belum ada hotel. Tambah hotel pertama lewat tombol di atas.'}
            </p>
          </div>
        )}
        {filteredHotels.map(hotel => (
          <div
            key={hotel.id}
            className="flex items-center gap-3 p-2.5 bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm"
          >
            <div className="h-[52px] w-[52px] shrink-0 overflow-hidden rounded-xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
              {hotel.cover ? (
                <img src={hotel.cover} alt={hotel.name} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <ImageOff size={16} className="text-gray-300 dark:text-slate-500" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-gray-900 dark:text-white truncate">{hotel.name}</p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="text-[11px] text-gray-500 dark:text-slate-400">{HOTEL_CITY_LABELS[hotel.city]}</span>
                {hotel.photo_count > 0 ? (
                  <span className="rounded-full bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-px text-[9px] font-bold text-emerald-600 dark:text-emerald-400">✓ Lengkap</span>
                ) : (
                  <span className="rounded-full bg-amber-50 dark:bg-amber-900/20 px-1.5 py-px text-[9px] font-bold text-amber-600 dark:text-amber-400">Belum ada foto</span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => onNavigate(`/dashboard/hotels/edit/${encodeURIComponent(hotel.slug)}`)}
                aria-label={`Edit ${hotel.name}`}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100/80 text-gray-500 transition-colors hover:bg-gray-200 active:scale-95 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => setDeleteTarget(hotel)}
                aria-label={`Hapus ${hotel.name}`}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-500 transition-colors hover:bg-red-100 active:scale-95 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </HotelViewShell>

    {deleteTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          onClick={() => !deleting && setDeleteTarget(null)}
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' } as React.CSSProperties}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-2xl p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <h3 className="mt-3 text-center text-sm font-bold text-gray-900 dark:text-white">
              Hapus {deleteTarget.name}?
            </h3>
            <p className="mt-1.5 text-center text-xs leading-relaxed text-gray-500 dark:text-slate-400">
              Semua data, foto, dan video hotel ini akan terhapus permanen dari direktori. Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 rounded-xl bg-gray-100 dark:bg-slate-700 py-2.5 text-[13px] font-semibold text-gray-700 dark:text-slate-200 transition-colors hover:bg-gray-200 dark:hover:bg-slate-600 disabled:opacity-60"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
