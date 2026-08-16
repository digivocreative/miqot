import { Copy, FileText, Loader2 } from 'lucide-react';

import { communitySnippetReadingMinutes } from '../../../lib/community-snippet.js';

/**
 * Kartu cuplikan lampiran teks di linimasa & halaman detail.
 *
 * Skin-nya sengaja identik dengan LinkPreviewCard (eyebrow uppercase → judul
 * tebal → cuplikan redup, dibungkus rounded-2xl bergaris tipis) supaya feed
 * tidak kedatangan bahasa visual baru hanya karena ada satu jenis lampiran
 * lagi. Yang membedakan cuma baris kaki: taksiran lama baca + aksi Salin.
 *
 * Baris kaki menyebut MENIT, bukan jumlah karakter: pembaca sedang memutuskan
 * "buka sekarang atau nanti?", dan "1.240 karakter" tidak menjawab itu — tak
 * ada yang bisa menaksir 1.240 karakter itu berapa lama. Jumlah karakter tetap
 * hidup di header SnippetSheet, tempat pembaca sudah terlanjur membuka.
 *
 * Baris kaki DIKELUARKAN dari elemen tombol utama — bukan disarangkan di
 * dalamnya. `<button>` di dalam `<button>` bukan HTML yang sah, dan versi
 * `<span role="button">` menuntut kita menambal sendiri Enter/Space, fokus,
 * serta hentikan-rambat; memisahkan dua area yang memang punya dua aksi
 * berbeda lebih jujur untuk pembaca layar sekaligus lebih sedikit kode.
 */

interface SnippetCardProps {
  title: string | null;
  preview: string;
  charCount: number;
  /** Salin sedang mengambil body penuh dari server (cuplikan tidak cukup). */
  copyBusy?: boolean;
  onOpen: () => void;
  onCopy: () => void;
}

export default function SnippetCard({
  title,
  preview,
  charCount,
  copyBusy = false,
  onOpen,
  onCopy,
}: SnippetCardProps) {
  return (
    <div
      data-teras-snippet-card
      className="mt-2 min-w-0 overflow-hidden rounded-2xl border border-gray-200/80 dark:border-slate-700/60 dark:bg-slate-900/60"
    >
      <button
        type="button"
        onClick={event => {
          // Seluruh badan kartu kiriman juga bisa diklik (membuka halaman
          // detail) — lampiran punya tujuannya sendiri.
          event.stopPropagation();
          onOpen();
        }}
        // Tanpa label eksplisit, nama tombol ini adalah seluruh isinya —
        // pembaca layar akan membacakan 280 karakter cuplikan sebagai "nama
        // tombol" sebelum sempat menyebut aksinya.
        aria-label={title ? `Buka lampiran teks: ${title}` : 'Buka lampiran teks'}
        className="block w-full min-w-0 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-900"
      >
        <div className="px-3.5 py-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-slate-500">
            <FileText size={12} /> Lampiran teks
          </div>
          {title && (
            <div className="mt-0.5 line-clamp-2 text-[14px] font-bold leading-[1.4] text-gray-900 dark:text-white">
              {title}
            </div>
          )}
          <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-[13px] leading-[1.5] text-gray-500 dark:text-slate-400">
            {preview}
          </div>
        </div>
      </button>
      <div className="flex items-center gap-2 border-t border-gray-100 px-3.5 py-2.5 dark:border-slate-700/60">
        <span className="text-[11px] font-medium tabular-nums text-gray-400 dark:text-slate-500">
          ± {communitySnippetReadingMinutes(charCount)} menit baca
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            onCopy();
          }}
          disabled={copyBusy}
          // Menyalin lampiran BUKAN menyalin cuplikan di kartu ini: induk
          // menarik body penuh lebih dulu, dan itu bisa makan waktu — makanya
          // ada keadaan sibuk di sini.
          title="Salin seluruh teks lampiran"
          className="-my-1.5 flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[11px] font-semibold text-teal-600 transition-colors hover:bg-teal-50 disabled:opacity-45 dark:text-teal-400 dark:hover:bg-teal-900/20"
        >
          {copyBusy ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
          Salin
        </button>
      </div>
    </div>
  );
}
