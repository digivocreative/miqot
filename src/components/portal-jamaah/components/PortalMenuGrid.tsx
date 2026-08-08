import type { PortalRoute } from '../hooks/usePortalRoute';
import { PORTAL_MENUS } from '../lib/portalMenu';
import PortalMenuCard from './PortalMenuCard';

export default function PortalMenuGrid({
  onNavigate,
}: {
  onNavigate: (route: PortalRoute) => void;
}) {
  // items-stretch + h-full di kartu (lihat PortalMenuCard) menjaga tinggi keenam
  // kartu identik, sehingga garis border & bayangannya sejajar dalam satu baris.
  return (
    <div className="grid grid-cols-3 items-stretch gap-2.5">
      {PORTAL_MENUS.map((menu) => (
        <PortalMenuCard key={menu.id} menu={menu} onClick={() => onNavigate(menu.id)} />
      ))}
    </div>
  );
}
