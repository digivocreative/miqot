import { useState } from 'react';
import { ChevronDown, HelpCircle, LifeBuoy, MessageCircle } from 'lucide-react';
import { normalizeWaNumber } from '@/utils/phone';
import PortalBackBar from '../components/PortalBackBar';
import { PORTAL_FAQ } from '../lib/faq';
import type { PortalMeData } from '../hooks/usePortalMe';

export default function FaqPage({
  data,
  onBack,
}: {
  data: PortalMeData;
  onBack: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const agentPhone = normalizeWaNumber(data.agent?.phone);
  const escalationLink = agentPhone
    ? `https://wa.me/${agentPhone}?text=${encodeURIComponent(`Assalamualaikum ${data.agent?.name || 'Agent'}, saya ada pertanyaan dari portal jamaah.`)}`
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <PortalBackBar
        title="FAQ & Bantuan"
        onBack={onBack}
        icon={LifeBuoy}
        iconClassName="bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400"
      />
      <main className="mx-auto w-full max-w-lg space-y-4 px-4 pb-24 pt-4">
        <section className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-800/40 dark:bg-rose-900/20">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-white/80 text-rose-600 shadow-sm dark:bg-rose-950/40 dark:text-rose-300">
            <HelpCircle className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-rose-800 dark:text-rose-200">Pertanyaan umum jamaah umroh</p>
            <p className="mt-1 text-xs leading-5 text-rose-700 dark:text-rose-300">
              Temukan jawaban singkat atau hubungi agent jika masih membutuhkan bantuan.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex min-h-7 items-center justify-between gap-3">
            <h1 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Topik Bantuan</h1>
            <span className="flex-none rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold text-gray-500 dark:bg-slate-800 dark:text-slate-400">
              {PORTAL_FAQ.length} topik
            </span>
          </div>

          {PORTAL_FAQ.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white px-5 py-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400">
                <LifeBuoy className="h-5 w-5" strokeWidth={2} />
              </div>
              <p className="mt-3 text-sm font-bold text-gray-800 dark:text-slate-100">Bantuan belum tersedia</p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-gray-500 dark:text-slate-400">
                Hubungi agent untuk mendapatkan jawaban terkait perjalanan Anda.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {PORTAL_FAQ.map((entry) => {
                const open = openId === entry.id;
                const answerId = `faq-answer-${entry.id}`;
                return (
                  <div
                    key={entry.id}
                    className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : entry.id)}
                      className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3.5 text-left outline-none transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 dark:hover:bg-slate-700/40"
                      aria-expanded={open}
                      aria-controls={answerId}
                    >
                      <span className="min-w-0 flex-1 break-words text-sm font-bold leading-5 text-gray-900 dark:text-white">{entry.question}</span>
                      <ChevronDown
                        className={`h-4 w-4 flex-none text-gray-400 transition-transform duration-200 dark:text-slate-500 ${open ? 'rotate-180' : ''}`}
                        strokeWidth={2.2}
                        aria-hidden="true"
                      />
                    </button>
                    {open && (
                      <div
                        id={answerId}
                        className="break-words border-t border-gray-100 px-4 pb-4 pt-3 text-sm leading-6 text-gray-700 dark:border-slate-700 dark:text-slate-300"
                      >
                        {entry.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {escalationLink ? (
          <a
            href={escalationLink}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-center text-sm font-bold leading-5 text-white shadow-md shadow-emerald-500/20 transition-colors hover:bg-emerald-600 active:scale-95"
          >
            <MessageCircle className="h-5 w-5 flex-none" strokeWidth={2} />
            <span className="min-w-0 break-words">Hubungi {data.agent?.name || 'Agent'} via WhatsApp</span>
          </a>
        ) : (
          <section className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-300">
              <MessageCircle className="h-4 w-4" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-800 dark:text-slate-100">Kontak agent belum tersedia</p>
              <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-slate-400">Gunakan kontak resmi yang diberikan saat pendaftaran.</p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
