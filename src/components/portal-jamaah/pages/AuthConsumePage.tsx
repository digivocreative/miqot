import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import AuthErrorPage from './AuthErrorPage';
import { fetchAgentBySlug, type PortalAgent } from '../lib/fetchAgentBySlug';
import { portalApi, type ConsumeMagicLinkResult } from '../lib/portalApi';
import { savePortalSession } from '../lib/portalSession';

type ConsumeState = 'loading' | 'success' | 'error';
type ErrorKind = 'expired' | 'consumed' | 'invalid';

const consumePromises = new Map<string, Promise<ConsumeMagicLinkResult>>();

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
        });
        setResult(data);
        setState('success');
        window.setTimeout(() => {
          window.location.replace(`/${slug}/jamaah/dashboard`);
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
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 font-sans">
        <main className="w-full max-w-md">
          <section className="rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-emerald-700 bg-white text-emerald-700">
              <Check size={36} strokeWidth={2} />
            </div>
            <p className="mt-5 text-sm font-semibold text-slate-500">Assalamualaikum,</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">{result.jamaah_name}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Anda berhasil masuk sebagai jamaah booking {result.id_umroh}.
            </p>
            <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Kode Booking</p>
              <p className="mt-1 text-lg font-bold text-slate-950">{result.id_umroh}</p>
            </div>
            <button
              type="button"
              onClick={() => window.location.replace(`/${slug}/jamaah/dashboard`)}
              className="mt-5 w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
            >
              Masuk ke Portal
            </button>
            <p className="mt-3 text-xs text-slate-500">Sesi Anda berlaku selama 90 hari.</p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 font-sans">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <Loader2 size={30} strokeWidth={2} className="animate-spin" />
        </div>
        <p className="mt-4 text-sm font-semibold text-slate-700">Memverifikasi akses Anda...</p>
      </div>
    </div>
  );
}
