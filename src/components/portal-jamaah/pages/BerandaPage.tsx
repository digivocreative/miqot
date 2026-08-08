import { LogOut } from 'lucide-react';
import { PortalPageShell } from '../ui';
import PortalTopBar from '../components/PortalTopBar';
import HeroCountdown from '../components/HeroCountdown';
import PortalMenuGrid from '../components/PortalMenuGrid';
import PrayerTimesCard from '../components/PrayerTimesCard';
import ActionListWidget from '../components/ActionListWidget';
import type { PortalMeData } from '../hooks/usePortalMe';
import { usePortalPersiapan } from '../hooks/usePortalPersiapan';
import type { PortalRoute } from '../hooks/usePortalRoute';
import { deriveTripPhase } from '../utils/tripPhase';
import { toTitleCase } from '../utils/formatText';

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
  slug,
  data,
  onNavigate,
  onLogout,
}: {
  slug: string;
  data: PortalMeData;
  onNavigate: (route: PortalRoute) => void;
  onLogout: () => void;
}) {
  const { persiapan } = usePortalPersiapan();
  const initiator = data.jamaah.find((j) => j.is_initiator) || data.jamaah[0];
  const greetingPrefix = getGreetingPrefix(initiator?.jk);
  const compactName = getCompactJamaahName(initiator?.nama) || 'Jamaah';

  const trip = deriveTripPhase(data.booking);
  // Hari ke-2+ perjalanan: info penerbangan yang relevan adalah kepulangan.
  const showReturnFlight = trip.phase === 'perjalanan' && (trip.tripDayNumber ?? 1) >= 2;
  const heroFlightCode = showReturnFlight
    ? data.schedule?.pulang_kode_penerbangan || 'TBA'
    : data.schedule?.berangkat_kode_penerbangan || 'TBA';

  // Checklist persiapan hanya relevan sebelum berangkat; Waktu Solat naik ke atas
  // menu saat mendekati keberangkatan (H-7) dan selama di Tanah Suci, turun ke
  // bawah menu selama fase jauh, dan hilang setelah pulang.
  const showActions = trip.phase === 'pra';
  const prayerFull = trip.phase === 'perjalanan' || (trip.phase === 'pra' && (trip.daysToBerangkat ?? 999) <= 7);
  const showPrayer = trip.phase !== 'pasca';

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
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-black/5 text-ink/60 transition-colors hover:bg-red-50 hover:text-red-500 active:scale-95"
            >
              <LogOut className="h-4 w-4" strokeWidth={2} />
            </button>
          </>
        }
      />
      <main className="mx-auto w-full max-w-lg space-y-4 px-4 pb-24 pt-4">
        <HeroCountdown
          booking={data.booking}
          trip={trip}
          flightCode={heroFlightCode}
          flightLabel={showReturnFlight ? 'Penerbangan Pulang' : 'Penerbangan'}
          greetingName={`${greetingPrefix} ${compactName}`}
        />

        {showActions && (
          <ActionListWidget slug={slug} data={data} persiapan={persiapan} onNavigate={onNavigate} />
        )}

        {showPrayer && prayerFull && (
          <PrayerTimesCard schedule={data.schedule} booking={data.booking} />
        )}

        <PortalMenuGrid onNavigate={onNavigate} />

        {showPrayer && !prayerFull && (
          <PrayerTimesCard schedule={data.schedule} booking={data.booking} secondary />
        )}
      </main>
    </PortalPageShell>
  );
}
