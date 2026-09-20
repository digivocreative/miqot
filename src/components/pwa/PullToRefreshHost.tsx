import { useSyncExternalStore } from 'react';
import PullToRefresh from './PullToRefresh';
import {
  getRefreshAvailability,
  runActiveRefresh,
  subscribeRefreshHandlers,
} from '../../lib/pwa/refresh-registry';

const serverSnapshot = () => false;

/**
 * Gestur tarik-untuk-segarkan untuk shell yang isinya berganti-ganti (dashboard).
 *
 * Bedanya dengan memasang <PullToRefresh> langsung: halaman yang sedang tampil
 * yang menentukan APA yang disegarkan, lewat `usePullRefreshHandler`. Tidak ada
 * yang mendaftar -> gesturnya mati total di halaman itu, dan PTR bawaan Android
 * tetap hidup di sana.
 */
export default function PullToRefreshHost() {
  const available = useSyncExternalStore(subscribeRefreshHandlers, getRefreshAvailability, serverSnapshot);
  return <PullToRefresh enabled={available} onRefresh={runActiveRefresh} />;
}
