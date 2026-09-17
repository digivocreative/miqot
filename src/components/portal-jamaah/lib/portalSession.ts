const STORAGE_KEY = 'jamaah_portal_session';
// Salinan terakhir respons /me yang berhasil, supaya portal tetap bisa dibuka tanpa sinyal.
const ME_SNAPSHOT_KEY = 'jamaah_portal_me';
const COOKIE_NAME = 'jamaah_session';
const NINETY_DAYS_SECONDS = 90 * 24 * 60 * 60;

export interface PortalSession {
  session_token: string;
  id_umroh: string;
  slug: string;
  expires_at: string;
  access_code?: string;
}

type StorageName = 'localStorage' | 'sessionStorage';

// Akses storage bisa melempar (mode privat, situs diblokir, kuota penuh) — portal harus
// tetap jalan, paling buruk sesi tidak tersimpan.
function storageGet(name: StorageName, key: string): string | null {
  try {
    return window[name].getItem(key);
  } catch {
    return null;
  }
}

function storageSet(name: StorageName, key: string, value: string): boolean {
  try {
    window[name].setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function storageRemove(name: StorageName, key: string) {
  try {
    window[name].removeItem(key);
  } catch {
    // Storage tidak bisa diakses: tidak ada yang tersimpan untuk dihapus.
  }
}

function writeCookie(value: string) {
  try {
    document.cookie = value;
  } catch {
    // Cookie diblokir: header Authorization dari storage tetap dipakai.
  }
}

function hasExpired(expiresAt: string): boolean {
  const t = new Date(expiresAt).getTime();
  return !Number.isFinite(t) || t <= Date.now();
}

// localStorage supaya sesi bertahan saat app terpasang / tab ditutup lalu dibuka lagi
// (sessionStorage hilang, jamaah harus mengulang link WhatsApp). sessionStorage hanya
// cadangan bila localStorage menolak menulis.
function writeSession(raw: string) {
  if (storageSet('localStorage', STORAGE_KEY, raw)) {
    storageRemove('sessionStorage', STORAGE_KEY);
  } else {
    storageSet('sessionStorage', STORAGE_KEY, raw);
  }
}

function snapshotOwner(session: Pick<PortalSession, 'slug' | 'id_umroh'>) {
  return `${session.slug}:${session.id_umroh}`;
}

function readSnapshotRecord(): { owner?: unknown; saved_at?: unknown; data?: unknown } | null {
  const raw = storageGet('localStorage', ME_SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function savePortalSession(session: PortalSession) {
  // Data booking lain yang tersimpan tidak boleh ikut tampil untuk sesi baru.
  const snapshot = readSnapshotRecord();
  if (snapshot && snapshot.owner !== snapshotOwner(session)) storageRemove('localStorage', ME_SNAPSHOT_KEY);

  writeSession(JSON.stringify(session));
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  writeCookie(`${COOKIE_NAME}=${encodeURIComponent(session.session_token)}; path=/; max-age=${NINETY_DAYS_SECONDS}; SameSite=Lax${secure}`);
}

export function getPortalSession(): PortalSession | null {
  const persisted = storageGet('localStorage', STORAGE_KEY);
  // Sesi dari versi lama (sessionStorage) tetap dibaca, lalu dipindahkan.
  const raw = persisted ?? storageGet('sessionStorage', STORAGE_KEY);
  if (!raw) return null;

  let session: Partial<PortalSession> | null = null;
  try {
    session = JSON.parse(raw) as Partial<PortalSession> | null;
  } catch {
    session = null;
  }
  if (!session || !session.session_token || !session.id_umroh || !session.slug || !session.expires_at) {
    clearPortalSession();
    return null;
  }
  if (hasExpired(session.expires_at)) {
    clearPortalSession();
    return null;
  }
  if (persisted === null) writeSession(raw);
  return session as PortalSession;
}

export function clearPortalSession() {
  storageRemove('localStorage', STORAGE_KEY);
  storageRemove('sessionStorage', STORAGE_KEY);
  storageRemove('localStorage', ME_SNAPSHOT_KEY);
  writeCookie(`${COOKIE_NAME}=; path=/; max-age=0`);
}

export interface PortalSnapshot<T> {
  data: T;
  /** Waktu (ms) data diterima dari server. */
  savedAt: number;
}

/** Simpan respons terakhir yang berhasil untuk booking sesi ini. */
export function savePortalSnapshot<T>(session: PortalSession, data: T, savedAt = Date.now()): boolean {
  return storageSet(
    'localStorage',
    ME_SNAPSHOT_KEY,
    JSON.stringify({ owner: snapshotOwner(session), saved_at: savedAt, data })
  );
}

/** Data tersimpan hanya dikembalikan bila milik booking sesi yang sedang aktif. */
export function readPortalSnapshot<T>(session: PortalSession): PortalSnapshot<T> | null {
  const record = readSnapshotRecord();
  if (!record || record.owner !== snapshotOwner(session) || !record.data || typeof record.data !== 'object') {
    return null;
  }
  const savedAt = Number(record.saved_at);
  return { data: record.data as T, savedAt: Number.isFinite(savedAt) ? savedAt : 0 };
}
