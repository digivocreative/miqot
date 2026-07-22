import type { PortalMenu, PortalMenuVariant } from '../lib/portalMenu';
import { Card, IconTile, cn } from '../ui';
import type { TileTint } from '../ui';

/** Variant → IconTile tint. `premium` (Al-Quran) is the one reserved gold treatment. */
const TILE_TINT: Record<PortalMenuVariant, TileTint> = {
  brand: 'brand',
  premium: 'gold',
};

/** Decorative corner glow, tinted per variant (blurred, low-opacity — never text). */
const GLOW: Record<PortalMenuVariant, string> = {
  brand: 'bg-gradient-burgundy',
  premium: 'bg-gradient-gold',
};

/** Premium card gets a faint gold hairline; brand keeps the Card default border. */
const SURFACE: Record<PortalMenuVariant, string> = {
  brand: '',
  premium: 'ring-1 ring-gold/40',
};

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
      className="group block w-full rounded-lega transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy-700 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    >
      <Card
        className={cn(
          'relative flex flex-col items-center overflow-hidden p-3.5 text-center transition-shadow duration-200 group-hover:shadow-card',
          SURFACE[menu.variant],
        )}
      >
        <div
          className={cn(
            'pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-15 blur-2xl transition-opacity duration-200 group-hover:opacity-25',
            GLOW[menu.variant],
          )}
        />
        <div className="relative flex flex-col items-center">
          <IconTile
            tint={TILE_TINT[menu.variant]}
            size="md"
            className="mb-2 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3"
          >
            <Icon size={22} strokeWidth={2} className={menu.iconAnim} />
          </IconTile>
          <p className="text-[13px] font-semibold leading-tight text-ink">{menu.label}</p>
        </div>
      </Card>
    </button>
  );
}
