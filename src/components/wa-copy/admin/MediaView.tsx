import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import type { MediaAttachment } from '../lib/types';
import { formatBytes } from '../lib/media';

interface MediaViewProps {
  media: MediaAttachment;
  download?: boolean;
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.includes('spreadsheet')) {
    return <FileSpreadsheet size={18} className="text-emerald-600 dark:text-emerald-400" />;
  }
  return <FileText size={18} className="text-blue-600 dark:text-blue-400" />;
}

export default function MediaView({ media, download = true }: MediaViewProps) {
  const isImage = media.kind === 'image';
  return (
    <div className="space-y-1.5">
      {isImage ? (
        // Images render edge-to-edge (they're often already designed graphics) — no
        // extra frame, just rounded corners. Tap to open full size on the CDN.
        <a href={media.url} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden">
          <img
            src={media.url}
            alt={media.name}
            className="w-full max-h-72 object-contain bg-gray-50 dark:bg-slate-900/40 cursor-zoom-in"
          />
        </a>
      ) : (
        // Documents keep the bordered chip — icon + filename + size.
        <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 px-3 py-2.5">
          <FileIcon mime={media.mime} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-gray-800 dark:text-slate-100">
              {media.name}
            </span>
            <span className="block text-[11px] text-gray-400 dark:text-slate-500">
              {formatBytes(media.size)}
            </span>
          </span>
        </div>
      )}
      {download && (
        <>
          <a
            href={media.url}
            download={media.name}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors active:scale-[0.98]"
          >
            <Download size={13} />
            Unduh
          </a>
          {/* WhatsApp web-share can't attach files — guide the agent's manual flow. */}
          <p className="text-center text-[11px] text-gray-400 dark:text-slate-500">
            Unduh dulu, lalu lampirkan di WhatsApp.
          </p>
        </>
      )}
    </div>
  );
}
