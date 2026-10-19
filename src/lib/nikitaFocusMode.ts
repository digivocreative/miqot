// Mode khusus akun admin nikita, 17–21 Okt 2026 (WIB): menu Analytics,
// Hotels dan tab Statistik → Tren Daftar disembunyikan (Agents dimunculkan lagi
// 19 Okt atas permintaan user). Hanya tampilan — API
// tidak dikunci. Berakhir sendiri 22 Okt 00:00 WIB tanpa deploy ulang.
// Jendela waktunya di lib/nikita-focus-mode.js (dipakai server juga).
import { useEffect, useState } from 'react';
import {
  NIKITA_FOCUS_END as FOCUS_END,
  NIKITA_FOCUS_START as FOCUS_START,
  isNikitaFocusModeActive,
  isNikitaSlug,
} from '../../lib/nikita-focus-mode.js';

export { isNikitaFocusModeActive };

/** Tab dashboard yang disembunyikan selama mode aktif. */
export const NIKITA_FOCUS_HIDDEN_TABS: ReadonlySet<string> = new Set(['analytics', 'hotels']);

/** Seperti isNikitaFocusModeActive, tapi ikut berganti saat jam mulai/berakhir lewat. */
export function useNikitaFocusMode(slug: string | null | undefined): boolean {
  const [now, setNow] = useState(() => Date.now());
  const isNikita = isNikitaSlug(slug);
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
