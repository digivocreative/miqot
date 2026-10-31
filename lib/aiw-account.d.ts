export interface AiwGateUser {
  role?: string;
  has_aiw_account?: boolean | null;
}

export type AiwGateStatus = 'open' | 'locked' | 'unknown';

/** Baris agent menyimpan Akun AIW. */
export function hasAiwAccount(agent: { jamaah_username?: unknown; jamaah_password?: unknown } | null | undefined): boolean;
/** Status gerbang untuk pengguna yang sedang login. */
export function aiwGateStatus(user: AiwGateUser | null | undefined): AiwGateStatus;
/** Tab dashboard ini tertutup bagi agent yang belum punya Akun AIW. */
export function isAiwLockedTab(tab: string): boolean;
/** Halaman di luar dashboard ini tertutup bagi agent yang belum punya Akun AIW. */
export function isAiwLockedPath(pathname: string): boolean;
