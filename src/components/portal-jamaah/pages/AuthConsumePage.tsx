import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import AuthErrorPage from './AuthErrorPage';
import { fetchAgentBySlug, type PortalAgent } from '../lib/fetchAgentBySlug';
import { portalApi, type ConsumeMagicLinkResult } from '../lib/portalApi';
import { savePortalSession } from '../lib/portalSession';

type ConsumeState = 'loading' | 'success' | 'error';
type ErrorKind = 'expired' | 'consumed' | 'invalid';

const consumePromises = new Map<string, Promise<ConsumeMagicLinkResult>>();
const PORTAL_MAGIC_CODE_REGEX = /^(?=.*[a-z])(?=.*[2-9])[a-z2-9]{5}$/i;

function getPortalDashboardPath(slug: string, token: string) {
  return PORTAL_MAGIC_CODE_REGEX.test(token) ? `/${slug}/jamaah/${token}/dashboard` : `/${slug}/jamaah/dashboard`;
}

export default function AuthConsumePage({ slug, token }: { slug: string; token: string }) {
  const [state, setState] = useState<ConsumeState>('loading');
  const [result, setResult] = useState<ConsumeMagicLinkResult | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind>('invalid');
  const [agent, setAgent] = useState<PortalAgent | null>(null);

  useEffect(() => {
    fetchAgentBySlug(slug).then(setAgent).catch(() => setAgent(null));
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    const consumeKey = `${slug}:${token}`;
    const promise = consumePromises.get(consumeKey) || portalApi.consumeMagicLink(slug, token);
    consumePromises.set(consumeKey, promise);

    promise
      .then((data) => {
        if (cancelled) return;
        savePortalSession({
          session_token: data.session_token,
          id_umroh: data.id_umroh,
          slug: data.agent_slug || slug,
          expires_at: data.expires_at,
          access_code: PORTAL_MAGIC_CODE_REGEX.test(token) ? token : undefined,
        });
        setResult(data);
        setState('success');
        window.setTimeout(() => {
          window.location.replace(getPortalDashboardPath(slug, token));
        }, 900);
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorKind((err?.code || 'invalid') as ErrorKind);
        setState('error');
        consumePromises.delete(consumeKey);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, token]);

  if (state === 'error') return <AuthErrorPage kind={errorKind} agent={agent} />;

  if (state === 'success' && result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 px-4 py-8 font-sans dark:from-slate-900 dark:to-slate-950">
        <main className="w-full max-w-lg">
          <section className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-500 bg-white text-emerald-600 dark:bg-slate-900 dark:text-emerald-400">
              <Check size={36} strokeWidth={2} />
            </div>
            <p className="mt-5 text-sm font-semibold text-gray-500 dark:text-slate-400">Assalamualaikum,</p>
            <h1 className="mt-1 break-words text-2xl font-bold text-gray-900 dark:text-white">{result.jamaah_name}</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-slate-300">
              Anda berhasil masuk sebagai jamaah booking {result.id_umroh}.
            </p>
            <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-left dark:border-slate-700 dark:bg-slate-900">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Kode Booking</p>
              <p className="mt-1 break-all text-lg font-bold text-gray-900 dark:text-white">{result.id_umroh}</p>
            </div>
            <button
              type="button"
              onClick={() => window.location.replace(getPortalDashboardPath(slug, token))}
              className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-colors hover:bg-emerald-600 active:scale-95"
            >
              Masuk ke Portal
            </button>
            <p className="mt-3 text-xs text-gray-500 dark:text-slate-400">Sesi Anda berlaku selama 90 hari.</p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 px-4 py-8 font-sans dark:from-slate-900 dark:to-slate-950">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
          <Loader2 size={30} strokeWidth={2} className="animate-spin" />
        </div>
        <p className="mt-4 text-sm font-semibold text-gray-700 dark:text-slate-200">Memverifikasi akses Anda...</p>
      </div>
    </div>
  );
}
