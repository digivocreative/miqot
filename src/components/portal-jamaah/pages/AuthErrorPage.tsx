import { AlertCircle, MessageCircle } from 'lucide-react';
import { normalizeWaNumber } from '@/utils/phone';
import type { PortalAgent } from '../lib/fetchAgentBySlug';

type ErrorKind = 'expired' | 'consumed' | 'invalid';

const COPY: Record<ErrorKind, string> = {
  expired: 'Link sudah kadaluarsa. Hubungi agent untuk minta link baru.',
  consumed: 'Link sudah digunakan. Jika ini bukan Anda, hubungi agent segera.',
  invalid: 'Link tidak valid. Pastikan URL benar.',
};

export default function AuthErrorPage({
  kind,
  agent,
}: {
  kind: ErrorKind;
  agent: PortalAgent | null;
}) {
  const wa = normalizeWaNumber(agent?.phone);
  const message = COPY[kind].replace('agent', agent?.name || 'agent');

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 px-4 py-8 font-sans dark:from-slate-900 dark:to-slate-950">
      <main className="w-full max-w-lg">
        <section className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-red-100 bg-red-50 text-red-600 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
            <AlertCircle size={28} strokeWidth={2} />
          </div>
          <h1 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">Akses belum berhasil</h1>
          <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-slate-300">{message}</p>
          {wa && (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noreferrer"
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-colors hover:bg-emerald-600 active:scale-95"
            >
              <MessageCircle size={16} strokeWidth={2} />
              Chat {agent?.name || 'Agent'} di WhatsApp
            </a>
          )}
        </section>
      </main>
    </div>
  );
}
