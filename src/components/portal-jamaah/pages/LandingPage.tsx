import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Moon, ShieldCheck } from 'lucide-react';
import { normalizeWaNumber } from '@/utils/phone';
import { trackPublicEvent } from '@/utils/analytics';
import AgentHeaderBar from '../components/AgentHeaderBar';
import KodeBookingForm from '../components/KodeBookingForm';
import MagicLinkSuccessCard from '../components/MagicLinkSuccessCard';
import { fetchAgentBySlug, type PortalAgent } from '../lib/fetchAgentBySlug';
import { portalApi } from '../lib/portalApi';
import { Card, GradientText, IconTile, PortalPageShell, SectionLabel } from '../ui';

function displayWa(raw: string) {
  const cleaned = raw.replace(/\D/g, '').replace(/^0+/, '');
  return cleaned.startsWith('62') ? `+${cleaned}` : `+62${cleaned}`;
}

export default function LandingPage({ slug }: { slug: string }) {
  const [agent, setAgent] = useState<PortalAgent | null>(null);
  const [loadingAgent, setLoadingAgent] = useState(true);
  const [kodeBooking, setKodeBooking] = useState('');
  const [waNumber, setWaNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingAgent(true);
    fetchAgentBySlug(slug)
      .then((data) => {
        if (!cancelled) setAgent(data);
      })
      .finally(() => {
        if (!cancelled) setLoadingAgent(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (agent?.name) document.title = `Portal Jamaah | ${agent.name}`;
  }, [agent?.name]);

  const waLink = useMemo(() => {
    const phone = normalizeWaNumber(agent?.phone);
    return phone ? `https://wa.me/${phone}` : null;
  }, [agent?.phone]);

  async function handleSubmit() {
    setError('');
    const idUmroh = kodeBooking.trim();
    const wa = normalizeWaNumber(waNumber) || normalizeWaNumber(`62${waNumber}`);
    if (!idUmroh || !wa) {
      setError('Kode booking dan nomor WhatsApp wajib diisi');
      return;
    }

    setSubmitting(true);
    try {
      await portalApi.requestMagicLinkByBooking(slug, idUmroh, wa);
      trackPublicEvent(slug, 'portal_login_request');
      setSent(true);
    } catch {
      setError('Kode booking tidak cocok dengan nomor WA yang terdaftar. Cek lagi atau hubungi agent.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!loadingAgent && !agent) {
    return (
      <PortalPageShell className="flex items-center justify-center px-4 py-8 font-sans">
        <Card className="w-full max-w-lg p-6 text-center">
          <h1 className="font-display text-xl text-ink">Agent tidak ditemukan</h1>
          <p className="mt-2 text-sm leading-6 text-ink/60">Pastikan alamat portal yang Anda buka sudah benar.</p>
        </Card>
      </PortalPageShell>
    );
  }

  return (
    <PortalPageShell className="overflow-x-hidden font-sans">
      <AgentHeaderBar agent={agent} />
      <main className="mx-auto w-full max-w-lg px-4 pb-10 pt-8">
        <section className="text-center">
          <div className="flex justify-center">
            <IconTile tint="brand" size="lg">
              <Moon size={28} strokeWidth={2} />
            </IconTile>
          </div>
          <h1 className="mt-4 font-display text-3xl leading-tight text-ink">
            Selamat datang di <GradientText>Portal Jamaah</GradientText>
          </h1>
          <p className="mt-2 text-sm leading-6 text-ink/60">
            Pantau persiapan, pembayaran, dan info perjalanan Umroh Anda di satu tempat.
          </p>
        </section>

        <div className="mt-7 space-y-5">
          {sent ? (
            <MagicLinkSuccessCard
              title="Link sudah dikirim!"
              message={`Cek WhatsApp Anda (${displayWa(waNumber)}). Buka link untuk masuk ke portal.`}
            />
          ) : (
            <>
              <Card className="p-5">
                <div className="flex items-start gap-4">
                  <IconTile tint="neutral" size="md">
                    <ShieldCheck size={22} strokeWidth={2} />
                  </IconTile>
                  <div className="min-w-0 flex-1">
                    <SectionLabel>Sudah dapat link dari Agent?</SectionLabel>
                    <p className="mt-2 text-sm leading-6 text-ink/60">
                      Buka link yang dikirim agent Anda. Jika belum menerima, hubungi agent untuk kirim ulang.
                    </p>
                  </div>
                </div>
                {waLink && (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#25D366]/30 bg-[#25D366]/10 px-4 py-3 text-sm font-semibold text-[#0E7C4A] transition-colors hover:bg-[#25D366]/15 active:scale-95"
                  >
                    <MessageCircle size={16} strokeWidth={2} />
                    Chat {agent?.name || 'Agent'} di WhatsApp
                  </a>
                )}
              </Card>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-black/10" />
                <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink/40">atau</span>
                <div className="h-px flex-1 bg-black/10" />
              </div>

              <KodeBookingForm
                kodeBooking={kodeBooking}
                waNumber={waNumber}
                submitting={submitting}
                error={error}
                onKodeBookingChange={setKodeBooking}
                onWaNumberChange={setWaNumber}
                onSubmit={handleSubmit}
              />
            </>
          )}
        </div>

        <a
          href={`/${slug}`}
          className="mt-7 block text-center text-sm font-semibold text-burgundy-700 hover:text-burgundy-800"
        >
          Belum jadi jamaah? Lihat paket umroh →
        </a>
      </main>
    </PortalPageShell>
  );
}
