import { useState } from 'react';
import { ChevronDown, MessageCircle } from 'lucide-react';
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
      <PortalBackBar title="FAQ & Bantuan" onBack={onBack} />
      <main className="mx-auto w-full max-w-lg space-y-5 px-4 pb-24 pt-5">
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-800/40 dark:bg-rose-900/20">
          <p className="text-sm font-bold text-rose-800 dark:text-rose-200">Pertanyaan umum jamaah umroh</p>
          <p className="mt-1 text-xs leading-5 text-rose-700 dark:text-rose-300">
            Cari jawaban cepat di sini. Kalau belum ada, hubungi agent.
          </p>
        </section>

        <div className="space-y-2.5">
          {PORTAL_FAQ.map((entry) => {
            const open = openId === entry.id;
            return (
              <div
                key={entry.id}
                className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : entry.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                  aria-expanded={open}
                >
                  <span className="flex-1 text-sm font-bold text-gray-900 dark:text-white">{entry.question}</span>
                  <ChevronDown
                    className={`h-5 w-5 flex-none text-gray-400 transition-transform dark:text-slate-500 ${open ? 'rotate-180' : ''}`}
                    strokeWidth={2}
                  />
                </button>
                {open && (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-3 text-sm leading-6 text-gray-700 dark:border-slate-700 dark:text-slate-300">
                    {entry.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {escalationLink && (
          <a
            href={escalationLink}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3.5 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition active:scale-95"
          >
            <MessageCircle className="h-5 w-5" strokeWidth={2} />
            Tidak menemukan jawaban? Hubungi {data.agent?.name || 'Agent'}
          </a>
        )}
      </main>
    </div>
  );
}
