import { useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { PortalSession } from '../lib/portalSession';
import { usePortalMe } from '../hooks/usePortalMe';
import BerandaTab from '../tabs/BerandaTab';
import PerjalananTab from '../tabs/PerjalananTab';
import BayarTab from '../tabs/BayarTab';
import PersiapanTab from '../tabs/PersiapanTab';
import PortalBottomNav, { type PortalTabId } from '../components/PortalBottomNav';

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 font-sans">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <Loader2 className="h-8 w-8 animate-spin" strokeWidth={2} />
        </div>
        <p className="mt-4 text-sm font-semibold text-slate-700">Memuat portal jamaah...</p>
      </div>
    </div>
  );
}

function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 font-sans">
      <section className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-700">
          <AlertCircle className="h-7 w-7" strokeWidth={2} />
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-950">Data belum bisa dimuat</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Coba muat ulang. Jika masih gagal, hubungi agent untuk memastikan sesi Anda masih aktif.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white"
        >
          Muat Ulang
        </button>
      </section>
    </div>
  );
}

export default function PortalDashboard({ slug, session }: { slug: string; session: PortalSession }) {
  const [activeTab, setActiveTab] = useState<PortalTabId>('beranda');
  const { data, loading, error, refetch } = usePortalMe();

  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeTab]);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen onRetry={refetch} />;
  if (!data) return null;

  return (
    <div className="min-h-screen bg-slate-50 pb-20" data-agent-slug={slug} data-booking-id={session.id_umroh}>
      {activeTab === 'beranda' && <BerandaTab data={data} onNavigate={setActiveTab} />}
      {activeTab === 'perjalanan' && <PerjalananTab data={data} />}
      {activeTab === 'bayar' && <BayarTab data={data} />}
      {activeTab === 'persiapan' && <PersiapanTab data={data} onNavigateRoot={setActiveTab} />}
      <PortalBottomNav active={activeTab} onChange={setActiveTab} />
    </div>
  );
}
