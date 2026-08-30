import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, X, Loader2, Trash2, Play, ImageOff } from 'lucide-react';
import { getAuthHeaders } from './LoginPage';
import MediaViewerModal from './MediaViewerModal';

// Galeri hotel VERSI AGENT SENDIRI (permintaan user 2026-08-30) — terpisah
// dari galeri resmi (HotelPage/HotelKelolaPage): satu baris per agent per
// hotel, dikelola agent itu sendiri lewat /api/hotels/:slug/agent-media,
// TANPA gate admin. Lihat lib/hotel-directory.js dan migrations/
// 20260830010000_hotel_agent_media.sql untuk kontrak servernya.

export interface HotelAgentMediaItem {
  type: 'image' | 'video';
  url: string;
}

export interface HotelAgentMediaEntry {
  id: string;
  media: HotelAgentMediaItem[];
  note: string | null;
  updated_at: string;
  agent: { slug: string; name: string; photo: string | null };
}

const NOTE_MAX = 300;
const MAX_ITEMS = 12;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
// WebM sengaja tidak didukung (cermin HOTEL_MEDIA_MIME_TYPES di server —
// dukungan iOS tak merata untuk galeri yang sering dibuka dari HP).
const SUPPORTED_VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime']);
const MEDIA_ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime';

async function fetchAgentMediaList(slug: string): Promise<HotelAgentMediaEntry[]> {
  const res = await fetch(`/api/hotels/${encodeURIComponent(slug)}/agent-media`, { headers: getAuthHeaders() });
  let json: { success?: boolean; data?: HotelAgentMediaEntry[]; error?: string } = {};
  try { json = await res.json(); } catch { /* pesan generik di bawah */ }
  if (!res.ok || !json.success) throw new Error(json.error || 'Gagal memuat galeri agent');
  return json.data || [];
}

// Salinan pendekatan resizeHotelPhoto (HotelKelolaPage) / resizeCommunityPhoto
// (Teras): maks 1600px, JPEG 0.85, latar putih untuk PNG transparan.
function resizeAgentPhoto(file: File): Promise<Blob> {
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
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Foto ini tidak bisa dibaca. Simpan/ekspor ulang sebagai JPG atau PNG, lalu unggah lagi.'));
    };
    img.src = objectUrl;
  });
}

async function uploadAgentMedia(blob: Blob): Promise<{ url: string; type: 'image' | 'video' }> {
  const res = await fetch('/api/hotels/agent-media/upload', {
    method: 'POST',
    headers: {
      'Content-Type': blob.type || 'application/octet-stream',
      'X-Upload-ID': crypto.randomUUID(),
      ...getAuthHeaders(),
    },
    body: blob,
  });
  let json: { success?: boolean; url?: string; type?: 'image' | 'video'; error?: string } = {};
  try { json = await res.json(); } catch { /* pesan generik di bawah */ }
  if (!res.ok || !json.success || !json.url || !json.type) {
    throw new Error(json.error || 'Gagal mengunggah media');
  }
  return { url: json.url, type: json.type };
}

// Buang file yang terunggah tapi tak jadi dipakai — best-effort, server tetap
// menolak menghapus file yang masih direferensikan galeri manapun.
function discardAgentMedia(type: 'image' | 'video', url: string): void {
  void fetch('/api/hotels/agent-media', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ type, url }),
    keepalive: true,
  }).catch(() => { /* sisa file akan tersapu saat galeri disimpan/dihapus */ });
}

async function saveAgentMedia(slug: string, media: HotelAgentMediaItem[], note: string): Promise<HotelAgentMediaEntry> {
  const res = await fetch(`/api/hotels/${encodeURIComponent(slug)}/agent-media`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ media, note: note || null }),
  });
  let json: { success?: boolean; data?: HotelAgentMediaEntry; error?: string } = {};
  try { json = await res.json(); } catch { /* pesan generik di bawah */ }
  if (!res.ok || !json.success || !json.data) throw new Error(json.error || 'Gagal menyimpan galeri');
  return json.data;
}

async function deleteAgentMedia(slug: string): Promise<void> {
  const res = await fetch(`/api/hotels/${encodeURIComponent(slug)}/agent-media`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  let json: { success?: boolean; error?: string } = {};
  try { json = await res.json(); } catch { /* pesan generik di bawah */ }
  if (!res.ok || !json.success) throw new Error(json.error || 'Gagal menghapus galeri');
}

interface FormMedia {
  key: string;
  type: 'image' | 'video';
  url: string | null;
  previewUrl: string;
  status: 'uploading' | 'done' | 'error';
}

function EditSheet({
  hotelSlug, hotelName, existing, onClose, onSaved, onDeleted,
}: {
  hotelSlug: string;
  hotelName: string;
  existing: HotelAgentMediaEntry | null;
  onClose: () => void;
  onSaved: (entry: HotelAgentMediaEntry) => void;
  onDeleted: () => void;
}) {
  const [items, setItems] = useState<FormMedia[]>(() => (existing?.media || []).map((m, i) => ({
    key: `existing-${i}-${m.url}`, type: m.type, url: m.url, previewUrl: m.url, status: 'done' as const,
  })));
  const [note, setNote] = useState(existing?.note || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Unggahan sesi ini yang dicabut sebelum simpan langsung dibuang dari
  // storage — pola identik pendingUploadsRef di HotelKelolaPage.
  const pendingUploadsRef = useRef<Map<string, 'image' | 'video'>>(new Map());

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    const remainingSlots = MAX_ITEMS - items.length;
    const list = Array.from(files).slice(0, Math.max(0, remainingSlots));
    if (files.length > list.length) setError(`Maksimal ${MAX_ITEMS} foto/video per galeri.`);
    for (const file of list) {
      const isImage = file.type.startsWith('image/');
      const isVideo = SUPPORTED_VIDEO_TYPES.has(file.type);
      if (!isImage && !isVideo) {
        setError('Format tidak didukung. Gunakan foto JPG/PNG/WebP atau video MP4 (H.264).');
        continue;
      }
      if (isImage && file.size > MAX_IMAGE_BYTES) { setError('Ukuran foto maksimal 3MB.'); continue; }
      if (isVideo && file.size > MAX_VIDEO_BYTES) { setError('Ukuran video maksimal 20MB.'); continue; }
      const key = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      setItems(prev => [...prev, { key, type: isImage ? 'image' : 'video', url: null, previewUrl, status: 'uploading' }]);
      try {
        const blob = isImage ? await resizeAgentPhoto(file) : file;
        const uploaded = await uploadAgentMedia(blob);
        pendingUploadsRef.current.set(uploaded.url, uploaded.type);
        setItems(prev => prev.map(it => (it.key === key ? { ...it, url: uploaded.url, status: 'done' as const } : it)));
      } catch (err) {
        setItems(prev => prev.map(it => (it.key === key ? { ...it, status: 'error' as const } : it)));
        setError(err instanceof Error ? err.message : 'Gagal mengunggah media');
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeItem = (key: string) => {
    setItems(prev => {
      const target = prev.find(it => it.key === key);
      if (target && target.previewUrl.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
      if (target?.url && pendingUploadsRef.current.has(target.url)) {
        discardAgentMedia(pendingUploadsRef.current.get(target.url)!, target.url);
        pendingUploadsRef.current.delete(target.url);
      }
      return prev.filter(it => it.key !== key);
    });
  };

  const handleSave = async () => {
    if (items.some(it => it.status === 'uploading')) { setError('Tunggu unggahan selesai dulu.'); return; }
    const media = items.filter(it => it.status === 'done' && it.url).map(it => ({ type: it.type, url: it.url as string }));
    if (media.length === 0) { setError('Tambahkan minimal satu foto atau video.'); return; }
    setSaving(true);
    setError(null);
    try {
      const entry = await saveAgentMedia(hotelSlug, media, note);
      onSaved(entry);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan galeri');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!existing) { onClose(); return; }
    if (!window.confirm('Hapus semua foto/video versi kamu di hotel ini?')) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAgentMedia(hotelSlug);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus galeri');
      setDeleting(false);
    }
  };

  return createPortal(
    <>
      <motion.div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl border-x border-t border-gray-100 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label="Kelola foto saya"
      >
        <div className="sticky top-0 z-10 flex justify-center bg-white pb-1 pt-2 dark:bg-slate-800">
          <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-slate-600" />
        </div>
        <div className="flex items-center justify-between border-b border-gray-100 px-4 pb-3 pt-2 dark:border-slate-700/50">
          <div className="min-w-0">
            <div className="text-[14px] font-bold text-gray-900 dark:text-white">Foto Saya</div>
            <div className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-slate-400">{hotelName}</div>
          </div>
          <button onClick={onClose} aria-label="Tutup" className="shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-4 gap-2">
            {items.map(item => (
              <div key={item.key} className="relative aspect-square overflow-hidden rounded-xl border border-gray-100 bg-gray-100 dark:border-slate-700 dark:bg-slate-700">
                {item.type === 'video' ? (
                  <div className="flex h-full w-full items-center justify-center bg-slate-800">
                    <Play size={16} className="text-white" />
                  </div>
                ) : (
                  <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                )}
                {item.status === 'uploading' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Loader2 size={16} className="animate-spin text-white" />
                  </div>
                )}
                {item.status === 'error' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-red-900/60">
                    <ImageOff size={16} className="text-white" />
                  </div>
                )}
                <button
                  onClick={() => removeItem(item.key)}
                  aria-label="Hapus dari galeri"
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
            {items.length < MAX_ITEMS && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 transition-colors hover:border-emerald-400 hover:text-emerald-500 dark:border-slate-600 dark:text-slate-500"
              >
                <Plus size={18} />
                <span className="text-[9px] font-semibold">Tambah</span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={MEDIA_ACCEPT}
            multiple
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
          <p className="mt-1.5 text-[10px] text-gray-400 dark:text-slate-500">
            {items.length}/{MAX_ITEMS} — foto maks 3MB, video maks 20MB (MP4/MOV H.264)
          </p>

          <div className="mt-4">
            <label htmlFor="hotel-agent-media-note" className="text-xs font-semibold text-gray-600 dark:text-slate-300">
              Catatan (opsional)
            </label>
            <textarea
              id="hotel-agent-media-note"
              value={note}
              onChange={e => setNote(e.target.value.slice(0, NOTE_MAX))}
              placeholder="Mis. Nginap di sini Juli 2026 bareng rombongan saya"
              rows={2}
              className="mt-1 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <p className="mt-0.5 text-right text-[10px] text-gray-400 dark:text-slate-500">{note.length}/{NOTE_MAX}</p>
          </div>

          {error && (
            <p className="mt-3 rounded-xl bg-red-50 p-2.5 text-xs font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            {existing && (
              <button
                onClick={handleDeleteAll}
                disabled={deleting || saving}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-2.5 text-[13px] font-semibold text-red-600 transition-colors disabled:opacity-50 dark:border-red-800/50 dark:text-red-400"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Hapus Semua
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || deleting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Simpan
            </button>
          </div>
        </div>
      </motion.div>
    </>,
    document.body
  );
}

export default function HotelAgentGallerySection({
  hotelSlug, hotelName, currentAgentSlug,
}: {
  hotelSlug: string;
  hotelName: string;
  currentAgentSlug?: string | null;
}) {
  const [entries, setEntries] = useState<HotelAgentMediaEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewerEntry, setViewerEntry] = useState<HotelAgentMediaEntry | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setLoadError(null);
    fetchAgentMediaList(hotelSlug)
      .then(data => { if (!cancelled) setEntries(data); })
      .catch(err => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Gagal memuat'); });
    return () => { cancelled = true; };
  }, [hotelSlug]);

  const myEntry = (entries || []).find(e => e.agent.slug === currentAgentSlug) || null;

  // Fitur tambahan opsional — kalau gagal muat (mis. prod belum dimigrasi),
  // seksi ini diam saja daripada mengganggu halaman detail hotel utama.
  if (loadError) return null;

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Foto dari Agent</h3>
        {currentAgentSlug && (
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
          >
            {myEntry ? 'Kelola Punya Saya' : '+ Tambah Punya Saya'}
          </button>
        )}
      </div>

      {entries === null ? (
        <div className="mt-2 flex gap-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-16 w-16 shrink-0 animate-pulse rounded-2xl bg-gray-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="mt-2 text-xs text-gray-400 dark:text-slate-500">
          Belum ada agent yang menambahkan foto sendiri di hotel ini. Jadi yang pertama?
        </p>
      ) : (
        <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
          {entries.map(entry => {
            const cover = entry.media[0];
            const isMine = entry.agent.slug === currentAgentSlug;
            return (
              <button
                key={entry.id}
                onClick={() => setViewerEntry(entry)}
                aria-label={`Lihat foto dari ${entry.agent.name}`}
                aria-haspopup="dialog"
                className="flex w-16 shrink-0 flex-col items-center gap-1.5"
              >
                <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-gray-100 bg-gray-100 transition-transform active:scale-95 dark:border-slate-700 dark:bg-slate-700">
                  {cover?.type === 'video' ? (
                    <div className="flex h-full w-full items-center justify-center bg-slate-800">
                      <Play size={16} className="text-white" />
                    </div>
                  ) : (
                    <img src={cover?.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                  {entry.media.length > 1 && (
                    <span className="absolute bottom-0.5 right-0.5 rounded-full bg-black/70 px-1 text-[9px] font-bold text-white">
                      +{entry.media.length - 1}
                    </span>
                  )}
                </div>
                <span className="w-full truncate text-center text-[10px] font-medium text-gray-500 dark:text-slate-400">
                  {isMine ? 'Saya' : entry.agent.name}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {viewerEntry && (
          <MediaViewerModal
            media={viewerEntry.media}
            initialIndex={0}
            label={`Foto oleh ${viewerEntry.agent.name}`}
            onClose={() => setViewerEntry(null)}
          />
        )}
      </AnimatePresence>

      {editing && (
        <EditSheet
          hotelSlug={hotelSlug}
          hotelName={hotelName}
          existing={myEntry}
          onClose={() => setEditing(false)}
          onSaved={entry => {
            setEntries(prev => [entry, ...(prev || []).filter(e => e.agent.slug !== entry.agent.slug)]);
            setEditing(false);
          }}
          onDeleted={() => {
            setEntries(prev => (prev || []).filter(e => e.agent.slug !== currentAgentSlug));
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
