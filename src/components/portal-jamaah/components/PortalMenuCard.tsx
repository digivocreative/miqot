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
      className={`group relative overflow-hidden ${menu.cardBg} rounded-2xl p-3.5 border ${menu.cardBorder} shadow-sm ${menu.hoverShadow} hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.97]`}
    >
      <div className={`pointer-events-none absolute -top-6 -right-6 w-20 h-20 rounded-full ${menu.iconBg} opacity-20 blur-2xl group-hover:opacity-30 transition-opacity`} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent dark:from-white/5" />
      <div className="relative flex flex-col items-center text-center">
        <div className={`w-11 h-11 rounded-xl ${menu.iconBg} ${menu.iconShadow} flex items-center justify-center mb-2 ring-1 ring-white/40 dark:ring-white/10 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-200`}>
          <Icon size={22} strokeWidth={2} className={`text-white ${menu.iconAnim}`} />
        </div>
        <p className="text-[12px] font-bold text-gray-800 dark:text-white leading-tight">{menu.label}</p>
      </div>
    </button>
  );
}
