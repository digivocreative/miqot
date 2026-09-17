import { AlertCircle, Loader2, MessageCircle, RefreshCw, WifiOff } from 'lucide-react';
import { normalizeWaNumber } from '@/utils/phone';
import type { PortalAgent } from '../lib/fetchAgentBySlug';
import type { ConsumeLinkErrorKind } from '../lib/portalApi';
import { Button, Card, PortalPageShell } from '../ui';

const COPY: Record<ConsumeLinkErrorKind, string> = {
  expired: 'Link sudah kadaluarsa. Hubungi agent untuk minta link baru.',
  consumed: 'Link sudah digunakan. Jika ini bukan Anda, hubungi agent segera.',
  invalid: 'Link tidak valid. Pastikan URL benar.',
  belum_dp: 'Portal bisa dibuka setelah DP tercatat. Hubungi agent untuk memastikan pembayaran DP.',
};

type Props =
  | { kind: ConsumeLinkErrorKind; agent: PortalAgent | null }
  /** Link belum bisa diperiksa (jaringan/server) — bukan berarti link salah. */
  | { kind: 'retry'; agent: PortalAgent | null; message: string; retrying: boolean; onRetry: () => void };

export default function AuthErrorPage(props: Props) {
  const { agent } = props;
  const wa = normalizeWaNumber(agent?.phone);

  if (props.kind === 'retry') {
    return (
      <PortalPageShell className="flex items-center justify-center px-4 py-8 font-sans">
        <main className="w-full max-w-lg">
          <Card className="p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 text-amber-700">
              <WifiOff size={26} strokeWidth={2} />
            </div>
            <h1 className="mt-4 font-display text-2xl text-ink">Link belum bisa diperiksa</h1>
            <p className="mt-2 text-sm leading-6 text-ink/60" role="alert">{props.message}</p>
            <Button
              type="button"
              variant="primary"
              size="lg"
              fullWidth
              className="mt-5"
              onClick={props.onRetry}
              disabled={props.retrying}
            >
              {props.retrying ? (
                <Loader2 size={16} strokeWidth={2} className="animate-spin" />
              ) : (
                <RefreshCw size={16} strokeWidth={2} />
              )}
              {props.retrying ? 'Memeriksa...' : 'Coba lagi'}
            </Button>
          </Card>
        </main>
      </PortalPageShell>
    );
  }

  const message = COPY[props.kind].replace('agent', agent?.name || 'agent');

  return (
    <PortalPageShell className="flex items-center justify-center px-4 py-8 font-sans">
      <main className="w-full max-w-lg">
        <Card className="p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-red-100 bg-red-50 text-red-600">
            <AlertCircle size={28} strokeWidth={2} />
          </div>
          <h1 className="mt-4 font-display text-2xl text-ink">Akses belum berhasil</h1>
          <p className="mt-2 text-sm leading-6 text-ink/60">{message}</p>
          {wa && (
            <Button
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noreferrer"
              variant="wa"
              size="lg"
              fullWidth
              className="mt-5"
            >
              <MessageCircle size={16} strokeWidth={2} />
              Chat {agent?.name || 'Agent'} di WhatsApp
            </Button>
          )}
        </Card>
      </main>
    </PortalPageShell>
  );
}
