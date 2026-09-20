/**
 * Konteks agent yang disuntikkan server ke `window.__AGENT_CONTEXT__`.
 *
 * SATU sumber untuk menjawab pertanyaan "halaman ini disajikan lewat custom
 * domain milik agent, atau lewat alhijaz.co?". Jawabannya menentukan cara path
 * dibaca: di custom domain segmen pertama adalah slug FILTER (agent tersirat
 * dari host), di alhijaz.co segmen pertama adalah slug AGENT.
 *
 * JEBAKAN YANG SUDAH MENGGIGIT (produksi, 2026-09-20): empat tempat di klien
 * menyimpulkannya dari ADA/TIDAKNYA field `customDomain`. Itu salah — server
 * mengisi field itu dengan domain milik agent walau request datang lewat
 * alhijaz.co, jadi ia truthy di kedua kasus. Akibatnya /nikita/landing-madinah
 * membaca "nikita" sebagai slug filter dan mendarat TANPA filter, dan tombol
 * Salin Link di kartu paket menjatuhkan slug agent dari URL yang disalin.
 *
 * Tidak pernah ketahuan karena service worker menyajikan shell precache yang
 * tidak memuat __AGENT_CONTEXT__ sama sekali; hanya kunjungan PERTAMA yang
 * melewati jalur rusak ini — persis audiens link yang di-share ke WhatsApp.
 *
 * Yang benar: HANYA server yang tahu request datang lewat host mana, jadi ia
 * mengirim `viaCustomDomain` secara eksplisit dan klien tidak menebak lagi.
 */

/** Konteks mentah dari server; `undefined` saat shell precache SW yang disajikan. */
export function readAgentContext() {
  return typeof window !== 'undefined' ? window.__AGENT_CONTEXT__ : undefined;
}

/**
 * Halaman ini BENAR-BENAR disajikan lewat custom domain agent.
 *
 * Sengaja `=== true`: konteks yang tidak ada (shell precache) dan HTML lama
 * dari sebelum flag ini ada sama-sama harus jatuh ke routing berbasis path —
 * itu perilaku yang aman di alhijaz.co.
 */
export function isViaCustomDomain(ctx) {
  return ctx?.viaCustomDomain === true;
}

/** Slug agent yang tersirat dari host, atau null kalau agent datang dari path. */
export function customDomainSlugFrom(ctx) {
  return isViaCustomDomain(ctx) ? (ctx?.slug || null) : null;
}
