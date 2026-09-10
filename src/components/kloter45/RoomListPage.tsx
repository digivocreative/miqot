import { BedDouble, ExternalLink, FileText } from 'lucide-react';
import WhatsAppIcon from '@/components/common/WhatsAppIcon';
import Kloter45SubPageShell from '@/components/kloter45/SubPageShell';
import { KLOTER45_CONTACTS, KLOTER45_ROOM_LIST, KLOTER45_TRIP } from '@/lib/kloter45Landing.js';

function isImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(url);
}

// Room list = berkas dari Tour Leader (PDF/gambar). Gambar ditampilkan langsung;
// PDF dibuka di tab baru karena penampil PDF di HP tidak bisa diandalkan di iframe.
export default function Kloter45RoomListPage({ onBack }: { onBack: () => void }) {
  const file = KLOTER45_ROOM_LIST;
  const tourLeader = KLOTER45_CONTACTS[0];
  const waText = encodeURIComponent(
    `Assalamualaikum, saya mau tanya room list ${KLOTER45_TRIP.kloterLabel} ${KLOTER45_TRIP.departureDate}.`
  );

  return (
    <Kloter45SubPageShell title="Room List" icon={BedDouble} onBack={onBack}>
      <div data-room-list-page>
        {file.url ? (
          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {isImageUrl(file.url) && (
              <img
                src={file.url}
                alt={file.label}
                className="block w-full"
                loading="lazy"
              />
            )}
            <div className="space-y-2 p-4">
              <p className="text-sm font-bold text-gray-900 dark:text-slate-100">{file.label}</p>
              {file.updatedAt && (
                <p className="text-[10px] font-medium text-gray-400 dark:text-slate-500">Diperbarui {file.updatedAt}</p>
              )}
              <a
                href={file.url}
                target="_blank"
                rel="noreferrer"
                data-room-list-open
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition active:scale-95 hover:bg-emerald-600"
              >
                {isImageUrl(file.url) ? <ExternalLink size={16} strokeWidth={2.4} /> : <FileText size={16} strokeWidth={2.4} />}
                {isImageUrl(file.url) ? 'Buka ukuran penuh' : 'Buka Room List (PDF)'}
              </a>
            </div>
          </section>
        ) : (
          <section
            data-room-list-empty
            className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300">
              <BedDouble size={22} strokeWidth={2.2} />
            </span>
            <p className="mt-3 text-sm font-bold text-gray-900 dark:text-slate-100">Room list belum dibagikan</p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-slate-400">
              Daftar kamar hotel akan dibagikan Tour Leader menjelang keberangkatan. Cek lagi halaman ini nanti.
            </p>
          </section>
        )}

        <a
          href={`${tourLeader.whatsappUrl}?text=${waText}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-3 text-sm font-bold text-emerald-700 transition active:scale-95 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300"
        >
          <WhatsAppIcon size={16} />
          Tanya Tour Leader
        </a>
      </div>
    </Kloter45SubPageShell>
  );
}
