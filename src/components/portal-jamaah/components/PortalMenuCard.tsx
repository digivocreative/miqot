import type { PortalMenu } from '../lib/portalMenu';

export default function PortalMenuCard({
  menu,
  onClick,
}: {
  menu: PortalMenu;
  onClick: () => void;
}) {
  const Icon = menu.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={menu.label}
      title={menu.desc}
      className={`group relative aspect-square overflow-hidden rounded-2xl border p-3.5 shadow-sm transition-all duration-200 active:scale-[0.97] hover:-translate-y-0.5 hover:shadow-xl ${menu.cardBg} ${menu.cardBorder}`}
    >
      <div className={`pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-20 blur-xl transition-opacity group-hover:opacity-30 ${menu.blob}`} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent dark:from-white/5" />
      <div className="relative flex h-full flex-col items-center justify-center text-center">
        <div className={`mb-2.5 flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset transition-transform duration-200 group-hover:scale-105 ${menu.iconBg} ${menu.iconRing}`}>
          <Icon size={18} strokeWidth={2.2} className={menu.iconText} />
        </div>
        <p className="text-[11px] font-semibold leading-tight text-slate-700 dark:text-slate-100">{menu.label}</p>
      </div>
    </button>
  );
}
