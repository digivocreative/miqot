import { updateStoredUser } from './authSession';

const CHANGE_EVENT = 'aiw-account-change';

/**
 * Akun AIW baru disimpan atau diputuskan. Form login-nya ada di beberapa halaman
 * (Jamaah, Haji, Settings), jadi perubahannya diumumkan ke DashboardLayout lewat
 * event: menu langsung terbuka atau terkunci tanpa muat ulang.
 */
export function setAiwAccount(connected: boolean) {
  updateStoredUser({ has_aiw_account: connected });
  window.dispatchEvent(new CustomEvent<boolean>(CHANGE_EVENT, { detail: connected }));
}

export function onAiwAccountChange(listener: (connected: boolean) => void): () => void {
  const handle = (event: Event) => listener((event as CustomEvent<boolean>).detail);
  window.addEventListener(CHANGE_EVENT, handle);
  return () => window.removeEventListener(CHANGE_EVENT, handle);
}
