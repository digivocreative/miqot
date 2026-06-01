import { useCallback, useEffect, useState } from 'react';
import type { ElementType, KeyboardEvent, SyntheticEvent } from 'react';
import { Flag, HelpCircle, Lock, Megaphone } from 'lucide-react';
import SegmentedControl from '../common/SegmentedControl';
import { useWaCopyContent } from './hooks/useWaCopyContent';
import { useToast, ToastPill } from './hooks/useToast';
import type { WaTab } from './lib/types';
import CaptionTab from './tabs/caption/CaptionTab';
import FaqTab from './tabs/faq/FaqTab';
import TourLeaderTab from './tabs/tourleader/TourLeaderTab';

interface WaCopyPageProps {
  isAdmin?: boolean;
}

interface TabDef {
  value: WaTab;
  label: string;
  icon: ElementType;
}

const LOCKED_MESSAGE = '🔒 Caption segera tersedia';

const TAB_OPTIONS: TabDef[] = [
  { value: 'faq', label: 'FAQ', icon: HelpCircle },
  { value: 'caption', label: 'Caption', icon: Megaphone },
  { value: 'tourleader', label: 'Tour Leader', icon: Flag },
];

/**
 * WA Copy agent tool (FAQ / Caption / Tour Leader). Content-only page —
 * header/back/max-w come from DashboardLayout. Editing the global content is
 * a separate admin-only "Konten" menu (WaCopyAdminPage). Non-admins see this
 * surface in a locked state until the agent workflow is enabled.
 */
export default function WaCopyPage({ isAdmin = false }: WaCopyPageProps) {
  const { loading } = useWaCopyContent();
  const { toast, showToast } = useToast();
  const [tab, setTab] = useState<WaTab>('faq');
  const locked = !isAdmin;
  const showLockedNotice = useCallback(() => {
    showToast(LOCKED_MESSAGE);
  }, [showToast]);

  // Stick the tab bar right below the dashboard's own sticky header.
  const [headerOffset, setHeaderOffset] = useState(60);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('header.sticky');
    if (!header) return;
    const measure = () => setHeaderOffset(header.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Non-admins can preview the surface, but every action is locked for now.
  const segmentedOptions = TAB_OPTIONS.map(o => ({
    value: o.value,
    label: o.label,
    icon: !isAdmin ? Lock : o.icon,
  }));

  const handleLockedInteraction = (event: SyntheticEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    showLockedNotice();
  };

  const handleLockedKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    showLockedNotice();
  };

  const handleTabChange = (next: WaTab) => {
    if (!isAdmin) {
      showToast(LOCKED_MESSAGE);
      return;
    }
    setTab(next);
  };

  return (
    <div
      className={`pb-8 ${locked ? 'cursor-not-allowed' : ''}`}
      aria-disabled={locked}
      onClickCapture={locked ? handleLockedInteraction : undefined}
      onKeyDownCapture={locked ? handleLockedKeyDown : undefined}
    >
      <div className={locked ? 'pointer-events-none select-none opacity-50 grayscale-[0.15]' : undefined}>
        <div
          className="sticky z-20 backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-b border-gray-100 dark:border-slate-700/50"
          style={{ top: headerOffset }}
        >
          <div className="px-4 py-3">
            <SegmentedControl options={segmentedOptions} value={tab} onChange={handleTabChange} accent="emerald" />
          </div>
        </div>

        {loading ? (
          <WaCopySkeleton />
        ) : tab === 'caption' ? (
          <CaptionTab showToast={showToast} />
        ) : tab === 'faq' ? (
          <FaqTab showToast={showToast} />
        ) : (
          <TourLeaderTab showToast={showToast} />
        )}
      </div>

      <ToastPill toast={toast} />
    </div>
  );
}

function WaCopySkeleton() {
  return (
    <div className="px-4 pt-4 pb-8 space-y-3">
      <div className="h-12 rounded-xl bg-gray-100 dark:bg-slate-800 animate-pulse" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-24 rounded-full bg-gray-100 dark:bg-slate-800 animate-pulse" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-40 rounded-2xl bg-gray-100 dark:bg-slate-800 animate-pulse" />
      ))}
    </div>
  );
}
