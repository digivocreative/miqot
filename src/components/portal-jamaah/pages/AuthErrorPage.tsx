import { AlertCircle, MessageCircle } from 'lucide-react';
import { normalizeWaNumber } from '@/utils/phone';
import type { PortalAgent } from '../lib/fetchAgentBySlug';
import { Button, Card, PortalPageShell } from '../ui';

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
