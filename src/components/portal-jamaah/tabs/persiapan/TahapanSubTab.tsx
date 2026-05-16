import ChecklistItem from './ChecklistItem';
import PhaseSection from './PhaseSection';
import type { PersiapanSubTab } from './PersiapanHeader';
import type { PortalTabId } from '../../components/PortalBottomNav';
import type { PortalPersiapanItem } from '../../hooks/usePortalPersiapan';
import { addDays, daysUntilDate, formatShortDate } from '../../utils/formatDate';

const PHASES = [
  { id: 'sekarang', label: 'Tahap Sekarang' },
  { id: 'h30', label: 'H-30' },
  { id: 'h7', label: 'H-7' },
  { id: 'h1', label: 'H-1' },
] as const;

function phaseDateLabel(phase: string, departureDate: string | null, apiDaysLeft: number | null) {
  if (phase === 'sekarang') {
    const days = Number.isFinite(Number(apiDaysLeft)) ? Number(apiDaysLeft) : daysUntilDate(departureDate);
    return days === null ? 'Mulai dari sekarang' : `H-${Math.max(0, days)}`;
  }
  const offsets: Record<string, number> = { h30: -30, h7: -7, h1: -1 };
  const label: Record<string, string> = { h30: 'H-30', h7: 'H-7', h1: 'H-1' };
  return `${label[phase]} · ${formatShortDate(addDays(departureDate, offsets[phase] || 0))}`;
}

export default function TahapanSubTab({
  items,
  departureDate,
  hariKeBerangkat,
  onToggle,
  onNavigate,
  onSubTabChange,
}: {
  items: PortalPersiapanItem[];
  departureDate: string | null;
  hariKeBerangkat: number | null;
  onToggle: (kind: 'tahapan', itemId: string, checked: boolean) => void;
  onNavigate: (tab: PortalTabId) => void;
  onSubTabChange: (tab: PersiapanSubTab) => void;
}) {
  const days = Number.isFinite(Number(hariKeBerangkat)) ? Number(hariKeBerangkat) : daysUntilDate(departureDate);
  const deadlineApproaching = days !== null && days <= 45;

  function handleCrossLink(target: string) {
    if (target === 'bayar') onNavigate('bayar');
    if (target === 'dokumen') onSubTabChange('dokumen');
    if (target === 'perlengkapan') onSubTabChange('perlengkapan');
  }

  return (
    <main className="mx-auto w-full max-w-md space-y-6 px-4 pb-28 pt-4">
      <p className="rounded-2xl border border-slate-100 bg-white p-4 text-sm leading-6 text-slate-600 shadow-sm">
        Checklist persiapan dari sekarang sampai hari keberangkatan. Item digabung untuk seluruh anggota booking.
      </p>

      {PHASES.map((phase) => {
        const phaseItems = items.filter((item) => item.phase === phase.id);
        if (!phaseItems.length) return null;
        const done = phaseItems.filter((item) => item.checked).length;
        return (
          <PhaseSection
            key={phase.id}
            label={phase.label}
            dateLabel={phaseDateLabel(phase.id, departureDate, hariKeBerangkat)}
            done={done}
            total={phaseItems.length}
            active={phase.id === 'sekarang'}
          >
            {phaseItems.map((item) => (
              <ChecklistItem
                key={item.id}
                item={item}
                kind="tahapan"
                pending={phase.id === 'sekarang' && !item.checked && deadlineApproaching}
                onToggle={(_, itemId, checked) => onToggle('tahapan', itemId, checked)}
                onCrossLink={handleCrossLink}
              />
            ))}
          </PhaseSection>
        );
      })}
    </main>
  );
}
