import { CreditCard, Home, ListChecks, Plane } from 'lucide-react';

export type PortalTabId = 'beranda' | 'perjalanan' | 'bayar' | 'persiapan';

const tabs = [
  { id: 'beranda', label: 'Beranda', icon: Home },
  { id: 'perjalanan', label: 'Perjalanan', icon: Plane },
  { id: 'bayar', label: 'Bayar', icon: CreditCard },
  { id: 'persiapan', label: 'Persiapan', icon: ListChecks },
] as const;

export default function PortalBottomNav({
  active,
  onChange,
}: {
  active: PortalTabId;
  onChange: (tab: PortalTabId) => void;
}) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-100 bg-white px-5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] pt-2.5">
      <div className="mx-auto flex w-full max-w-md justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`flex min-h-[44px] w-16 flex-col items-center justify-center gap-0.5 rounded-xl ${
                isActive ? 'text-emerald-700' : 'text-slate-400'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.2 : 2} />
              <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
