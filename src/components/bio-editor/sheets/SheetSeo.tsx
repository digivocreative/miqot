import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import SheetBase from './SheetBase';
import type { BioConfig } from '../../bio/types';
import { getAuthHeaders } from '../../LoginPage';

interface Props {
  open: boolean;
  onClose: () => void;
  slug: string;
  config: BioConfig;
  onUpdate: (updater: (prev: BioConfig) => BioConfig) => void;
}

export default function SheetSeo({ open, onClose, slug, config, onUpdate }: Props) {
  const seo = config.seo || { title: null, description: null, og_image_url: null };
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateSeo = (patch: Partial<BioConfig['seo']>) => {
    onUpdate(prev => ({ ...prev, seo: { ...prev.seo, ...patch } }));
  };

  const handleFile = async (file: File) => {
    if (!/^image\/(png|jpe?g)$/.test(file.type)) {
      setError('Hanya PNG atau JPEG yang didukung.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Ukuran maksimal 5MB.');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const data = await fileToBase64(file);
      const res = await fetch(`/api/bio/${encodeURIComponent(slug)}/og-image`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ mime: file.type, data }),
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

  return (
    <SheetBase open={open} onClose={onClose} title="SEO & Share Preview">
      <div className="space-y-4">
        <section>
          <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Judul Share</label>
          <input
            type="text"
            value={seo.title ?? ''}
            onChange={(e) => updateSeo({ title: e.target.value || null })}
            placeholder="Bio Konsultan Umroh Alhijaz"
            maxLength={120}
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
          />
          <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">{(seo.title ?? '').length}/120 · Kosongkan untuk default</p>
        </section>

        <section>
          <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Deskripsi Share</label>
          <textarea
            value={seo.description ?? ''}
            onChange={(e) => updateSeo({ description: e.target.value || null })}
            placeholder="Lihat jadwal, paket unggulan, dan kontak WhatsApp."
            maxLength={200}
            rows={3}
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 resize-none"
          />
          <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">{(seo.description ?? '').length}/200</p>
        </section>

        <section>
          <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Gambar Share</label>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) handleFile(file);
              e.currentTarget.value = '';
            }}
          />
          {seo.og_image_url ? (
            <div>
              <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 aspect-[1.91/1]">
                <img src={seo.og_image_url} alt="Preview share" className="w-full h-full object-cover" />
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                >
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                  {uploading ? 'Mengunggah...' : 'Ganti Gambar'}
                </button>
                <button
                  type="button"
                  onClick={() => updateSeo({ og_image_url: null })}
                  className="px-3 py-2 rounded-xl text-sm font-semibold bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 active:scale-95 transition-all"
                  aria-label="Hapus gambar share"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="w-full py-8 rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 active:scale-[0.98] transition-all flex flex-col items-center gap-2 disabled:opacity-60"
            >
              {uploading ? <Loader2 size={22} className="animate-spin text-emerald-500" /> : <ImagePlus size={22} />}
              <span className="text-sm font-semibold">{uploading ? 'Mengunggah...' : 'Upload Gambar Share'}</span>
              <span className="text-[11px] text-gray-400 dark:text-slate-500">PNG/JPEG · rasio ideal 1200 x 630 · maks 5MB</span>
            </button>
          )}
          {error && <p className="text-[11px] text-red-600 dark:text-red-400 mt-1.5">{error}</p>}
        </section>
      </div>
    </SheetBase>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
