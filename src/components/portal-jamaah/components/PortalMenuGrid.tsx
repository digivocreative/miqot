import type { PortalRoute } from '../hooks/usePortalRoute';
import { PORTAL_MENUS } from '../lib/portalMenu';
import PortalMenuCard from './PortalMenuCard';

export default function PortalMenuGrid({
  onNavigate,
}: {
  onNavigate: (route: PortalRoute) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {PORTAL_MENUS.map((menu) => (
        <PortalMenuCard key={menu.id} menu={menu} onClick={() => onNavigate(menu.id)} />
      ))}
    </div>
  );
}
