import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Moon, ShieldCheck } from 'lucide-react';
import { normalizeWaNumber } from '@/utils/phone';
import AgentHeaderBar from '../components/AgentHeaderBar';
import KodeBookingForm from '../components/KodeBookingForm';
import MagicLinkSuccessCard from '../components/MagicLinkSuccessCard';
import { fetchAgentBySlug, type PortalAgent } from '../lib/fetchAgentBySlug';
import { portalApi } from '../lib/portalApi';

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
      setSent(true);
    } catch {
      setError('Kode booking tidak cocok dengan nomor WA yang terdaftar. Cek lagi atau hubungi agent.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!loadingAgent && !agent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 font-sans">
        <section className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-950">Agent tidak ditemukan</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Pastikan alamat portal yang Anda buka sudah benar.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 font-sans text-slate-900">
      <AgentHeaderBar agent={agent} />
      <main className="mx-auto w-full max-w-md px-4 pb-10 pt-8">
        <section className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-700 text-white shadow-sm">
            <Moon size={30} strokeWidth={2} />
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-normal text-slate-950">
            Selamat datang di Portal Jamaah
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
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
              <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                    <ShieldCheck size={22} strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Sudah dapat link dari Agent?
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Buka link yang dikirim agent Anda. Jika belum menerima, hubungi agent untuk kirim ulang.
                    </p>
                  </div>
                </div>
                {waLink && (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                  >
                    <MessageCircle size={16} strokeWidth={2} />
                    Chat {agent?.name || 'Agent'} di WhatsApp
                  </a>
                )}
              </section>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-semibold text-slate-400">atau</span>
                <div className="h-px flex-1 bg-slate-200" />
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
          className="mt-7 block text-center text-sm font-semibold text-emerald-700 hover:text-emerald-800"
        >
          Belum jadi jamaah? Lihat paket umroh →
        </a>
      </main>
    </div>
  );
}
