import { useRef, useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';

interface Props {
  currentUrl: string;
  slug: string;
  uploadUrl: string;
  authHeaders: () => Record<string, string>;
  onUploaded: (url: string) => void;
  onRemove: () => void;
}

export default function PhotoUploadField({ currentUrl, uploadUrl, authHeaders, onUploaded, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setError('Hanya PNG / JPEG / WebP yang didukung.');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setError('Ukuran maksimal 6MB.');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const data = await fileToBase64(file);
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ mime: file.type, data }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j?.error || 'Upload gagal');
      onUploaded(j.url);
    } catch (e: any) {
      setError(e?.message || 'Upload gagal');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.currentTarget.value = '';
        }}
      />
      {currentUrl ? (
        <div className="relative">
          <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 aspect-[16/10]">
            <img src={currentUrl} alt="Preview" className="w-full h-full object-cover" />
          </div>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex-1 py-2 rounded-xl text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60 active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? 'Mengunggah…' : 'Ganti Foto'}
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="px-3 py-2 rounded-xl text-sm font-semibold bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 active:scale-95 transition-all"
              aria-label="Hapus foto"
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
          {uploading ? (
            <Loader2 size={22} className="animate-spin text-emerald-500" />
          ) : (
            <Upload size={22} />
          )}
          <span className="text-sm font-semibold">
            {uploading ? 'Mengunggah…' : 'Pilih Foto'}
          </span>
          <span className="text-[11px] text-gray-400 dark:text-slate-500">PNG, JPEG, WebP · maks 6MB</span>
        </button>
      )}
      {error && <p className="text-[11px] text-red-600 dark:text-red-400 mt-1.5">{error}</p>}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data:image/...;base64,
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
