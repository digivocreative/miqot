import type { PortalMenu, PortalMenuVariant } from '../lib/portalMenu';
import { Card, IconTile, cn } from '../ui';
import type { TileTint } from '../ui';

/** Variant → IconTile tint. `premium` (Al-Quran) is the one reserved gold treatment. */
const TILE_TINT: Record<PortalMenuVariant, TileTint> = {
  brand: 'brand',
  premium: 'gold',
};

/**
 * Premium menandai dirinya dengan MENGGANTI warna border, bukan menumpuk ring
 * emas di atas border hitam bawaan Card — dua garis sejajar berjarak 1px itu
 * yang membuat kartu Al-Quran terlihat beda sendiri.
 */
const SURFACE: Record<PortalMenuVariant, string> = {
  brand: '',
  premium: 'border-gold/45',
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
      className="group block h-full w-full rounded-lega transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy-700 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    >
      <Card
        className={cn(
          // h-full: kartu mengisi penuh tinggi baris grid, jadi label satu baris
          // dan dua baris tetap berakhir di garis bawah yang sama.
          'relative flex h-full flex-col items-center justify-start gap-2 p-3 text-center transition-shadow duration-200 group-hover:shadow-card',
          SURFACE[menu.variant],
        )}
      >
        <IconTile
          tint={TILE_TINT[menu.variant]}
          size="md"
          // flat: satu-satunya sumber elevasi adalah bayangan kartu. Enam halo
          // berwarna dari IconTile membuat baris menu terlihat kotor.
          flat
          className="transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3"
        >
          <Icon size={20} strokeWidth={2} className={menu.iconAnim} />
        </IconTile>
        <p className="text-[12px] font-semibold leading-tight text-ink">{menu.label}</p>
      </Card>
    </button>
  );
}
