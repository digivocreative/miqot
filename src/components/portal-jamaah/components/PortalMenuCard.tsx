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
      className={`group relative aspect-square overflow-hidden rounded-2xl border p-3.5 shadow-sm transition-all duration-200 active:scale-[0.97] hover:-translate-y-0.5 hover:shadow-xl ${menu.cardBg} ${menu.cardBorder}`}
    >
      <div className={`pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl group-hover:opacity-30 ${menu.iconBg}`} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent dark:from-white/5" />
      <div className="relative flex h-full flex-col items-center justify-center text-center">
        <div className={`mb-2.5 flex w-12 h-12 items-center justify-center rounded-xl ring-1 ring-white/40 transition-transform duration-200 group-hover:scale-110 dark:ring-white/10 ${menu.iconBg} ${menu.iconShadow}`}>
          <Icon size={24} strokeWidth={2} className="text-white" />
        </div>
        <p className="text-[13px] font-bold leading-tight text-gray-800 dark:text-white">{menu.label}</p>
      </div>
    </button>
  );
}
