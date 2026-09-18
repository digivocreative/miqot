// Gerbang callout perkenalan sticker: kapan ia boleh muncul lagi, dan kapan ia
// berhenti selamanya.
//
// Aturannya: muncul lagi tiap 4 jam, sampai agent menutupnya lewat tombol
// "Coba sekarang" atau "Nanti" sebanyak 10 kali. Sesudah itu diam selamanya.
// Membuka barisnya langsung (tanpa menyentuh tombol callout) menunda 4 jam
// berikutnya tapi TIDAK menambah hitungan — yang dihitung hanya jawaban
// eksplisit atas ajakannya.
//
// Murni dan tanpa I/O supaya bisa diuji tanpa browser: komponen yang membaca
// dan menulis localStorage, modul ini yang memutuskan.
export const PROMO_INTERVAL_MS = 4 * 60 * 60 * 1000;
export const PROMO_MAX_DISMISSALS = 10;

const KOSONG = { dismissals: 0, lastAt: 0 };

/**
 * @param {string|null|undefined} raw isi localStorage apa adanya.
 * @returns {{dismissals: number, lastAt: number}} selalu bentuk yang sah —
 *   data rusak diperlakukan sebagai belum pernah, bukan melempar.
 */
export function readPromoState(raw) {
  if (!raw) return { ...KOSONG };
  try {
    const parsed = JSON.parse(raw);
    return {
      dismissals: Number.isFinite(parsed?.dismissals) ? Math.max(0, Math.floor(parsed.dismissals)) : 0,
      lastAt: Number.isFinite(parsed?.lastAt) ? parsed.lastAt : 0,
    };
  } catch {
    return { ...KOSONG };
  }
}

export function shouldShowPromo(state, now) {
  if (state.dismissals >= PROMO_MAX_DISMISSALS) return false;
  const elapsed = now - state.lastAt;
  // Stempel waktu di masa depan (jam perangkat sempat maju lalu dibetulkan)
  // diperlakukan basi — kalau tidak, callout tersandera sampai jam itu lewat.
  return elapsed < 0 || elapsed >= PROMO_INTERVAL_MS;
}

/**
 * @param {boolean} counted true hanya untuk tombol "Coba sekarang"/"Nanti".
 */
export function promoStateAfterDismiss(state, now, counted) {
  return {
    dismissals: counted ? state.dismissals + 1 : state.dismissals,
    lastAt: now,
  };
}

export function serializePromoState(state) {
  return JSON.stringify(state);
}
