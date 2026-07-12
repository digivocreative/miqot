import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Moon, ShieldCheck } from 'lucide-react';
import { normalizeWaNumber } from '@/utils/phone';
import AgentHeaderBar from '../components/AgentHeaderBar';
import KodeBookingForm from '../components/KodeBookingForm';
import MagicLinkSuccessCard from '../components/MagicLinkSuccessCard';
import ThemeToggle from '../components/ThemeToggle';
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
      setSent(true);
    } catch {
      setError('Kode booking tidak cocok dengan nomor WA yang terdaftar. Cek lagi atau hubungi agent.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!loadingAgent && !agent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 px-4 py-8 font-sans dark:from-slate-900 dark:to-slate-950">
        <section className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Agent tidak ditemukan</h1>
          <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-slate-300">Pastikan alamat portal yang Anda buka sudah benar.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-b from-gray-50 to-gray-100 font-sans text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <AgentHeaderBar agent={agent} rightSlot={<ThemeToggle />} />
      <main className="mx-auto w-full max-w-lg px-4 pb-10 pt-8">
        <section className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-md shadow-emerald-500/20">
            <Moon size={30} strokeWidth={2} />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-normal text-gray-900 dark:text-white">
            Selamat datang di Portal Jamaah
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-slate-300">
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
              <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    <ShieldCheck size={22} strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                      Sudah dapat link dari Agent?
                    </p>
                    <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-slate-300">
                      Buka link yang dikirim agent Anda. Jika belum menerima, hubungi agent untuk kirim ulang.
                    </p>
                  </div>
                </div>
                {waLink && (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 active:scale-95 dark:border-emerald-800/50 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                  >
                    <MessageCircle size={16} strokeWidth={2} />
                    Chat {agent?.name || 'Agent'} di WhatsApp
                  </a>
                )}
              </section>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200 dark:bg-slate-700" />
                <span className="text-xs font-semibold text-gray-400 dark:text-slate-500">atau</span>
                <div className="h-px flex-1 bg-gray-200 dark:bg-slate-700" />
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
          className="mt-7 block text-center text-sm font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          Belum jadi jamaah? Lihat paket umroh →
        </a>
      </main>
    </div>
  );
}
