import { FileText } from 'lucide-react';

/**
 * Kartu cuplikan lampiran teks di linimasa & halaman detail.
 *
 * Skin-nya sengaja identik dengan LinkPreviewCard (judul tebal → cuplikan
 * redup, dibungkus rounded-2xl bergaris tipis) supaya feed tidak kedatangan
 * bahasa visual baru hanya karena ada satu jenis lampiran lagi.
 *
 * Ikon dokumen muncul TEPAT SEKALI, dan tempatnya bergantung pada ada-tidaknya
 * judul: bersanding dengan judul kalau ada, atau memimpin baris eyebrow
 * "Lampiran teks" kalau tidak. Eyebrow itu memang hanya untuk kartu tanpa
 * judul — ia label darurat yang menjelaskan kartu ini benda apa; begitu ada
 * judul, judullah yang menjelaskan, dan eyebrow tinggal jadi baris ketiga yang
 * mengulang hal yang sudah ditandai ikon.
 *
 * Kartu ini SATU tombol utuh tanpa baris kaki: tidak ada aksi kedua yang perlu
 * dijauhkan dari aksi buka. Menyalin lampiran hidup di sheet, tempat body
 * penuhnya memang sudah termuat.
 */

interface SnippetCardProps {
  title: string | null;
  preview: string;
  onOpen: () => void;
}

export default function SnippetCard({ title, preview, onOpen }: SnippetCardProps) {
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
          {title ? (
            <div className="flex items-start gap-1.5 text-[14px] font-bold leading-[1.4] text-gray-900 dark:text-white">
              {/* items-start + offset kecil: pada judul dua baris, ikon duduk
                  di baris PERTAMA, bukan melayang di tengah blok. */}
              <FileText size={14} className="mt-[3px] shrink-0 text-gray-400 dark:text-slate-500" />
              <span className="line-clamp-2 min-w-0">{title}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-slate-500">
              <FileText size={12} /> Lampiran teks
            </div>
          )}
          <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-[13px] leading-[1.5] text-gray-500 dark:text-slate-400">
            {preview}
          </div>
        </div>
      </button>
    </div>
  );
}
