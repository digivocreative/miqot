import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import AuthErrorPage from './AuthErrorPage';
import { fetchAgentBySlug, type PortalAgent } from '../lib/fetchAgentBySlug';
import { portalApi, type ConsumeMagicLinkResult } from '../lib/portalApi';
import { savePortalSession } from '../lib/portalSession';
import { trackPublicEvent } from '@/utils/analytics';
import { Button, Card, PortalPageShell } from '../ui';

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
        trackPublicEvent(data.agent_slug || slug, 'portal_login_success');
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
      <PortalPageShell className="flex items-center justify-center px-4 py-8 font-sans">
        <main className="w-full max-w-lg">
          <Card className="p-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-burgundy text-gold shadow-accent ring-1 ring-inset ring-gold/30">
              <Check size={36} strokeWidth={2.5} />
            </div>
            <p className="mt-5 text-sm font-medium text-ink/50">Assalamualaikum,</p>
            <h1 className="mt-1 break-words font-display text-3xl leading-tight text-ink">{result.jamaah_name}</h1>
            <p className="mt-2 text-sm leading-6 text-ink/60">
              Anda berhasil masuk sebagai jamaah booking {result.id_umroh}.
            </p>
            <div className="mt-5 rounded-lega border border-black/5 bg-burgundy-50/60 p-4 text-left">
              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-burgundy-700">Kode Booking</p>
              <p className="mt-1 break-all font-mono text-lg font-semibold tabular-nums text-ink">{result.id_umroh}</p>
            </div>
            <Button
              type="button"
              variant="primary"
              size="lg"
              fullWidth
              className="mt-5"
              onClick={() => window.location.replace(getPortalDashboardPath(slug, token))}
            >
              Masuk ke Portal
            </Button>
            <p className="mt-3 text-xs text-ink/50">Sesi Anda berlaku selama 90 hari.</p>
          </Card>
        </main>
      </PortalPageShell>
    );
  }

  return (
    <PortalPageShell className="flex items-center justify-center px-4 py-8 font-sans">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-burgundy-700/8 text-burgundy-700">
          <Loader2 size={30} strokeWidth={2} className="animate-spin" />
        </div>
        <p className="mt-4 text-sm font-semibold text-ink/70">Memverifikasi akses Anda...</p>
      </div>
    </PortalPageShell>
  );
}
