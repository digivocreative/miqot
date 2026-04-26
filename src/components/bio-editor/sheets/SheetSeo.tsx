import { useRef, useState } from 'react';
import { Loader2, Upload, RotateCcw, Image as ImageIcon, Save } from 'lucide-react';
import SheetBase from './SheetBase';
import PhotoCropModal from '../../PhotoCropModal';
import type { BioAgentPublic, BioConfig } from '../../bio/types';
import { getAuthHeaders } from '../../LoginPage';

const TITLE_LIMIT = 60;
const DESC_LIMIT = 160;
const OG_IDEAL_W = 1200;
const OG_IDEAL_H = 630;
const OG_MAX_BYTES = 5 * 1024 * 1024;

const TITLE_PLACEHOLDER = 'Bio Konsultan Umroh Alhijaz';
const DESC_PLACEHOLDER = 'Lihat jadwal, paket unggulan, dan kontak WhatsApp.';

interface Props {
  open: boolean;
  onClose: () => void;
  agent: BioAgentPublic;
  config: BioConfig;
  onUpdate: (updater: (prev: BioConfig) => BioConfig) => void;
  onSave: () => void | Promise<void>;
}

function counterColor(len: number, max: number): string {
  if (len > max) return 'text-red-500';
  if (len >= max * 0.9) return 'text-amber-500 dark:text-amber-400';
  return 'text-gray-400 dark:text-slate-500';
}

export default function SheetSeo({ open, onClose, agent, config, onUpdate, onSave }: Props) {
  const seo = config.seo || { title: null, description: null, og_image_url: null };
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropDataUrl, setCropDataUrl] = useState<string | null>(null);

  const updateSeo = (patch: Partial<BioConfig['seo']>) => {
    onUpdate(prev => ({ ...prev, seo: { ...prev.seo, ...patch } }));
  };

  // Step 1: validate the picked file and surface it in the crop modal — no
  // server upload yet so the user can re-frame freely.
  const handleFile = async (file: File) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setError('Hanya PNG, JPEG, atau WebP yang didukung.');
      return;
    }
    if (file.size > OG_MAX_BYTES) {
      setError('Ukuran maksimal 5MB.');
      return;
    }
    setError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      setCropDataUrl(dataUrl);
    } catch {
      setError('Gagal membaca file');
    }
  };

  // Step 2: user confirmed crop → upload the cropped JPEG to the server.
  const handleCropConfirm = async (croppedBase64: string) => {
    setCropDataUrl(null);
    setUploading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bio/${encodeURIComponent(agent.slug)}/og-image`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        // PhotoCropModal returns a JPEG data URL; the server strips the prefix.
        body: JSON.stringify({ mime: 'image/jpeg', data: croppedBase64 }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j?.error || 'Upload gagal');
      updateSeo({ og_image_url: j.url });
    } catch (e: any) {
      setError(e?.message || 'Upload gagal');
    } finally {
      setUploading(false);
    }
  };

  const titleVal = seo.title ?? '';
  const descVal = seo.description ?? '';
  const titleLen = titleVal.length;
  const descLen = descVal.length;
  const titleOver = titleLen > TITLE_LIMIT;
  const descOver = descLen > DESC_LIMIT;
  const showDefaultOgBtn = !!seo.og_image_url;

  // Effective values shown in the WhatsApp preview — fall back to placeholders
  // so the preview is never empty.
  const effectiveTitle = titleVal.trim() || TITLE_PLACEHOLDER;
  const effectiveDesc = descVal.trim() || DESC_PLACEHOLDER;

  const footer = (
    <button
      type="button"
      onClick={() => { void onSave(); }}
      disabled={uploading}
      className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
    >
      <Save size={15} strokeWidth={2.4} /> Simpan
    </button>
  );

  return (
    <SheetBase open={open} onClose={onClose} title="SEO & Share Preview" footer={footer}>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) handleFile(file);
          e.currentTarget.value = '';
        }}
      />

      {/* Crop modal — rendered inside SheetBase so it stacks on top of the
          sheet panel within the same z-[9000] context. */}
      <PhotoCropModal
        isOpen={!!cropDataUrl}
        imageUrl={cropDataUrl || ''}
        onClose={() => setCropDataUrl(null)}
        onCropComplete={handleCropConfirm}
        aspect={OG_IDEAL_W / OG_IDEAL_H}
        cropShape="rect"
        outputWidth={OG_IDEAL_W}
        outputHeight={OG_IDEAL_H}
        title="Crop Gambar Pratinjau"
        hint={`Disarankan ${OG_IDEAL_W} × ${OG_IDEAL_H} px`}
        confirmLabel="Gunakan Gambar"
        quality={0.9}
      />

      {/* Gambar Pratinjau — primary visual at top, matches LandingCard */}
      <section className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Gambar Pratinjau
          </label>
          <span className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">1200 × 630 px</span>
        </div>
        <div className="relative group">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={`relative w-full aspect-[1200/630] rounded-xl overflow-hidden border-2 border-dashed transition-all ${
              uploading
                ? 'border-gray-200 dark:border-slate-700 cursor-wait'
                : seo.og_image_url
                  ? 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600 cursor-pointer'
                  : 'border-gray-300 dark:border-slate-600 hover:border-gray-400 dark:hover:border-slate-500 cursor-pointer'
            }`}
          >
            {seo.og_image_url ? (
              <img src={seo.og_image_url} alt="Preview share" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-800 flex items-center justify-center">
                {agent.photo ? (
                  <img src={agent.photo} alt="" className="w-16 h-16 rounded-full object-cover border-4 border-white/60" />
                ) : (
                  <ImageIcon size={32} className="text-white/70" />
                )}
              </div>
            )}
            <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${
              uploading ? 'bg-black/50 opacity-100' : 'bg-black/0 opacity-0 group-hover:bg-black/35 group-hover:opacity-100'
            }`}>
              {uploading ? (
                <div className="flex items-center gap-2 text-white">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-xs font-semibold">Mengunggah…</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 text-white">
                  <Upload size={18} />
                  <span className="text-xs font-semibold">{seo.og_image_url ? 'Ganti Gambar' : 'Upload Gambar'}</span>
                </div>
              )}
            </div>
          </button>
          {showDefaultOgBtn && !uploading && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); updateSeo({ og_image_url: null }); }}
              className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-white/95 dark:bg-slate-900/95 text-gray-700 dark:text-slate-200 shadow-sm hover:bg-white dark:hover:bg-slate-900 active:scale-95 transition-all"
              title="Kembali ke default"
            >
              <RotateCcw size={11} />
              Default
            </button>
          )}
        </div>
        <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1.5">PNG/JPEG · maks 5MB</p>
        {error && <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{error}</p>}
      </section>

      {/* Judul */}
      <section className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Judul
          </label>
          <span className={`text-[10px] font-mono font-medium ${counterColor(titleLen, TITLE_LIMIT)}`}>
            {titleLen}/{TITLE_LIMIT}
          </span>
        </div>
        <input
          type="text"
          value={titleVal}
          onChange={(e) => updateSeo({ title: e.target.value || null })}
          placeholder={TITLE_PLACEHOLDER}
          maxLength={TITLE_LIMIT}
          className={`w-full px-3 py-2.5 text-sm rounded-xl bg-white dark:bg-slate-900 border text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 outline-none transition-all focus:ring-2 ${
            titleOver
              ? 'border-red-400 dark:border-red-500 focus:ring-red-500/20 focus:border-red-500'
              : 'border-gray-200 dark:border-slate-700 focus:border-emerald-500 focus:ring-emerald-500/20'
          }`}
        />
        {!titleVal && (
          <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1 pl-0.5">
            Kosong → pakai default
          </p>
        )}
      </section>

      {/* Deskripsi */}
      <section className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Deskripsi
          </label>
          <span className={`text-[10px] font-mono font-medium ${counterColor(descLen, DESC_LIMIT)}`}>
            {descLen}/{DESC_LIMIT}
          </span>
        </div>
        <textarea
          value={descVal}
          onChange={(e) => updateSeo({ description: e.target.value || null })}
          placeholder={DESC_PLACEHOLDER}
          rows={3}
          maxLength={DESC_LIMIT}
          className={`w-full px-3 py-2.5 text-sm rounded-xl bg-white dark:bg-slate-900 border resize-none min-h-[72px] text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 outline-none transition-all focus:ring-2 ${
            descOver
              ? 'border-red-400 dark:border-red-500 focus:ring-red-500/20 focus:border-red-500'
              : 'border-gray-200 dark:border-slate-700 focus:border-emerald-500 focus:ring-emerald-500/20'
          }`}
        />
        {!descVal && (
          <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1 pl-0.5">
            Kosong → pakai deskripsi default
          </p>
        )}
      </section>

      {/* Pratinjau WhatsApp — same chip as Umroh/Haji landing tabs */}
      <section className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">
            Pratinjau WhatsApp
          </span>
        </div>
        <div className="rounded-xl bg-gray-50 dark:bg-slate-900/40 border border-gray-100 dark:border-slate-700/50 p-2 flex gap-2.5">
          <div className="w-[72px] h-[72px] rounded-lg overflow-hidden bg-gray-200 dark:bg-slate-700 shrink-0">
            {seo.og_image_url ? (
              <img src={seo.og_image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-800 flex items-center justify-center">
                {agent.photo ? (
                  <img src={agent.photo} alt="" className="w-8 h-8 rounded-full object-cover border-2 border-white/60" />
                ) : (
                  <ImageIcon size={20} className="text-white/70" />
                )}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 py-0.5 flex flex-col justify-center">
            <div className="text-[9px] text-gray-400 dark:text-slate-500 uppercase tracking-wide">alhijaz.co</div>
            <div className="text-[13px] font-semibold text-gray-800 dark:text-white leading-tight mt-0.5 line-clamp-2">
              {effectiveTitle}
            </div>
            <div className="text-[11px] text-gray-500 dark:text-slate-400 leading-snug mt-0.5 line-clamp-2">
              {effectiveDesc}
            </div>
          </div>
        </div>
      </section>
    </SheetBase>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
