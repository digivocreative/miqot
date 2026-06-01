import { useRef, useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { getAuthHeaders } from '../../LoginPage';
import type { MediaAttachment } from '../lib/types';
import { ACCEPT_ATTR, MEDIA_UPLOAD_URL, fileToBase64, validateMediaFile } from '../lib/media';
import MediaView from './MediaView';

interface MediaUploadFieldProps {
  value: MediaAttachment | null;
  onChange: (media: MediaAttachment | null) => void;
}

export default function MediaUploadField({ value, onChange }: MediaUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    const validationError = validateMediaFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const data = await fileToBase64(file);
      const res = await fetch(MEDIA_UPLOAD_URL, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ mime: file.type, name: file.name, data }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j?.error || 'Upload gagal');
      onChange({ url: j.url, kind: j.kind, mime: j.mime, name: j.name, size: j.size });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload gagal');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.currentTarget.value = '';
        }}
      />
      {value ? (
        <div className="space-y-2">
          <MediaView media={value} download={false} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex-1 py-2 rounded-xl text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60 active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? 'Mengunggah…' : 'Ganti'}
            </button>
            <button
              type="button"
              onClick={() => { setError(null); onChange(null); }}
              className="px-3 py-2 rounded-xl text-sm font-semibold bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 active:scale-95 transition-all"
              aria-label="Hapus media"
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
          {uploading ? <Loader2 size={22} className="animate-spin text-emerald-500" /> : <Upload size={22} />}
          <span className="text-sm font-semibold">{uploading ? 'Mengunggah…' : 'Pilih Media'}</span>
          <span className="text-[11px] text-gray-400 dark:text-slate-500">Gambar (JPG/PNG/WebP) atau dokumen (PDF/Word/Excel)</span>
        </button>
      )}
      {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
