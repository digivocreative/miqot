import { LogOut } from 'lucide-react';
import { PortalPageShell, SectionLabel } from '../ui';
import PortalTopBar from '../components/PortalTopBar';
import HeroCountdown from '../components/HeroCountdown';
import PortalMenuGrid from '../components/PortalMenuGrid';
import PrayerTimesCard from '../components/PrayerTimesCard';
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
    <PortalPageShell>
      <PortalTopBar
        agent={data.agent}
        rightSlot={
          <>
            <button
              type="button"
              onClick={onLogout}
              aria-label="Keluar"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/5 text-ink/60 transition-colors hover:bg-red-50 hover:text-red-500 active:scale-95"
            >
              <LogOut className="h-4 w-4" strokeWidth={2} />
            </button>
          </>
        }
      />
      <main className="mx-auto w-full max-w-lg space-y-4 px-4 pb-24 pt-4">
        <HeroCountdown booking={data.booking} flightCode={flightCode} greetingName={`${greetingPrefix} ${compactName}`} />

        <SmartAlertsStrip data={data} onNavigate={onNavigate} />

        <PrayerTimesCard schedule={data.schedule} booking={data.booking} />

        <PortalMenuGrid onNavigate={onNavigate} />

        <TaskListWidget persiapan={persiapan} onNavigate={onNavigate} />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Anggota Booking</SectionLabel>
            <span className="flex-none font-mono text-[11px] font-medium tabular-nums text-ink/60">
              {data.jamaah.length} jamaah
            </span>
          </div>
          <div className="space-y-1.5">
            {data.jamaah.map((j) => (
              <RosterItem key={j.id} jamaah={j} progressPct={computeJamaahPreparation(j)} />
            ))}
          </div>
        </section>
      </main>
    </PortalPageShell>
  );
}
