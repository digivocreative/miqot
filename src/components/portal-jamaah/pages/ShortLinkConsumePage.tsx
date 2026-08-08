import AuthConsumePage from './AuthConsumePage';
import { usePortalTheme } from '../hooks/usePortalTheme';

/**
 * Halaman untuk link pendek portal /j/{kode}. Di rute kanonik
 * /:slug/jamaah/:kode tema portal dipasang oleh PortalJamaahRouter; rute ini
 * tidak lewat router itu, jadi pasang sendiri sebelum merender halaman consume.
 */
export default function ShortLinkConsumePage({ token }: { token: string }) {
  usePortalTheme();
  return <AuthConsumePage token={token} />;
}
