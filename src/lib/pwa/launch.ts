export interface LoginLaunchInput {
  /** display-mode standalone / navigator.standalone */
  standalone: boolean;
  referrer: string;
  hasSession: boolean;
}

/**
 * /login sengaja berarti "keluar" (LoginRouter menghapus sesi) — pintu darurat bagi agent
 * yang tokennya bermasalah. Pengecualian: aplikasi terpasang yang DILUNCURKAN langsung di
 * /login. Manifest blob lama memakai path saat dipasang sebagai start_url, jadi app yang
 * dipasang dari halaman login mengeluarkan agent setiap kali dibuka. Peluncuran app tidak
 * punya referrer; navigasi ke /login dari dalam app (logout, token ditolak) selalu punya
 * referrer atau sesinya sudah dihapus lebih dulu.
 */
export function shouldResumeSessionOnLogin(input: LoginLaunchInput): boolean {
  return input.standalone && input.hasSession && !input.referrer;
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true;
}
