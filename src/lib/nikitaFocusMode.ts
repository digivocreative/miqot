// Mode khusus akun admin nikita, 17–21 Okt 2026 (WIB): menu Agents, Analytics,
// Hotels dan tab Statistik → Tren Daftar disembunyikan. Hanya tampilan — API
// tidak dikunci. Berakhir sendiri 22 Okt 00:00 WIB tanpa deploy ulang.
import { useEffect, useState } from 'react';

const FOCUS_SLUG = 'nikita';
const FOCUS_START = Date.parse('2026-10-17T00:00:00+07:00');
const FOCUS_END = Date.parse('2026-10-22T00:00:00+07:00');

/** Tab dashboard yang disembunyikan selama mode aktif. */
export const NIKITA_FOCUS_HIDDEN_TABS: ReadonlySet<string> = new Set(['agents', 'analytics', 'hotels']);

export function isNikitaFocusModeActive(slug: string | null | undefined, now: number = Date.now()): boolean {
  return String(slug || '').toLowerCase() === FOCUS_SLUG && now >= FOCUS_START && now < FOCUS_END;
}

/** Seperti isNikitaFocusModeActive, tapi ikut berganti saat jam mulai/berakhir lewat. */
export function useNikitaFocusMode(slug: string | null | undefined): boolean {
  const [now, setNow] = useState(() => Date.now());
  const isNikita = String(slug || '').toLowerCase() === FOCUS_SLUG;
  useEffect(() => {
    if (!isNikita) return;
    const next = now < FOCUS_START ? FOCUS_START : now < FOCUS_END ? FOCUS_END : null;
    if (next === null) return;
    // setTimeout dibatasi ~24,8 hari; sisa jeda yang lebih panjang dijadwal ulang.
    const t = setTimeout(() => setNow(Date.now()), Math.min(next - now, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [isNikita, now]);
  return isNikitaFocusModeActive(slug, now);
}
