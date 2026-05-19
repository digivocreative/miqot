import { LogOut } from 'lucide-react';
import PortalTopBar from '../components/PortalTopBar';
import ThemeToggle from '../components/ThemeToggle';
import HeroCountdown from '../components/HeroCountdown';
import PortalMenuGrid from '../components/PortalMenuGrid';
import SmartAlertsStrip from '../components/SmartAlertsStrip';
import TaskListWidget from '../components/TaskListWidget';
import RosterItem from '../components/RosterItem';
import type { PortalJamaah, PortalMeData } from '../hooks/usePortalMe';
import { usePortalPersiapan } from '../hooks/usePortalPersiapan';
import type { PortalRoute } from '../hooks/usePortalRoute';
import { toTitleCase } from '../utils/formatText';

function includesReadyDocument(dokumen: Record<string, unknown>, keyword: string) {
  const text = JSON.stringify(dokumen || {}).toLowerCase();
  return text.includes(keyword) && !text.includes('belum_siap');
}

function computeJamaahPreparation(jamaah: PortalJamaah): number {
  const paymentScore = Math.max(0, Math.min(100, Number(jamaah.bayar_pct || 0)));
  const passportScore = jamaah.no_paspor || includesReadyDocument(jamaah.dokumen, 'paspor') ? 100 : 0;
  const vaccineScore = includesReadyDocument(jamaah.dokumen, 'vaksin') || includesReadyDocument(jamaah.dokumen, 'meningitis') ? 100 : 0;
  const equipment = Object.values(jamaah.perlengkapan || {});
  const equipmentScore = equipment.length
    ? Math.round((equipment.filter((item) => item?.status === 'diambil').length / equipment.length) * 100)
    : 0;
  return Math.round((paymentScore + passportScore + vaccineScore + equipmentScore) / 4);
}

function getGreetingPrefix(jk?: string | null): string {
  if (jk === 'L') return 'Bapak';
  if (jk === 'P') return 'Ibu';
  return 'Sahabat';
}

function getCompactJamaahName(name?: string | null): string {
  const words = toTitleCase(name).split(/\s+/).filter(Boolean);
  if (words.length <= 2) return words.join(' ');
  return words.slice(0, 2).join(' ');
}

export default function BerandaPage({
  data,
  onNavigate,
  onLogout,
}: {
  data: PortalMeData;
  onNavigate: (route: PortalRoute) => void;
  onLogout: () => void;
}) {
  const { persiapan } = usePortalPersiapan();
  const initiator = data.jamaah.find((j) => j.is_initiator) || data.jamaah[0];
  const flightCode = data.schedule?.berangkat_kode_penerbangan || 'TBA';
  const greetingPrefix = getGreetingPrefix(initiator?.jk);
  const compactName = getCompactJamaahName(initiator?.nama) || 'Jamaah';

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <PortalTopBar
        agent={data.agent}
        rightSlot={
          <>
            <ThemeToggle />
            <button
              type="button"
              onClick={onLogout}
              aria-label="Keluar"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100/80 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-500 active:scale-95 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            >
              <LogOut className="h-4 w-4" strokeWidth={2} />
            </button>
          </>
        }
      />
      <main className="mx-auto w-full max-w-lg space-y-6 px-4 pb-24 pt-5">
        <HeroCountdown booking={data.booking} flightCode={flightCode} greetingName={`${greetingPrefix} ${compactName}`} />

        <SmartAlertsStrip data={data} onNavigate={onNavigate} />

        <PortalMenuGrid onNavigate={onNavigate} />

        <TaskListWidget persiapan={persiapan} onNavigate={onNavigate} />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">
              ANGGOTA BOOKING
            </h2>
            <span className="text-xs font-bold text-gray-500 dark:text-slate-400">{data.jamaah.length} jamaah</span>
          </div>
          <div className="space-y-2.5">
            {data.jamaah.map((j) => (
              <RosterItem key={j.id} jamaah={j} progressPct={computeJamaahPreparation(j)} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
