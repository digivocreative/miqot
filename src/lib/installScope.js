// Identitas aplikasi terpasang (manifest `id` + `start_url`) per konteks halaman.
// Dipakai klien (src/main.tsx menukar <link rel="manifest">) dan server
// (GET /app.webmanifest?start=… memvalidasi ulang). Satu sumber aturan.
//
// - Aplikasi agent & rute umum → manifest generik (id "/").
// - Halaman publik agent/paket → "/:slug" (pengunjung yang memasang dari link agent
//   tetap mendarat di halaman agent itu, lengkap dengan tombol WhatsApp-nya).
// - Landing kloter → "/:kloter" (doa/dzikir/itinerary jamaah).
// - Portal jamaah → "/:slug/jamaah" (sesi portal menentukan dashboard-nya).

const RESERVED_FIRST_SEGMENTS = new Set([
  'login',
  'register',
  'reset-password',
  'dashboard',
  'teras',
  'compare',
  'top-partner',
  'f',
  'j',
  'admin',
  'api',
  'assets',
  'fonts',
  'agents',
  'og',
]);

const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

export function resolveInstallStart(pathname) {
  const segments = String(pathname || '').split('/').filter(Boolean);
  const first = segments[0];
  if (!first || !SEGMENT_RE.test(first)) return null;
  if (RESERVED_FIRST_SEGMENTS.has(first.toLowerCase())) return null;
  if (segments[1] && segments[1].toLowerCase() === 'jamaah') return `/${first}/jamaah`;
  return `/${first}`;
}

export function isValidInstallStart(start) {
  const match = /^\/([A-Za-z0-9][A-Za-z0-9-]{0,63})(\/jamaah)?$/.exec(String(start || ''));
  return !!match && !RESERVED_FIRST_SEGMENTS.has(match[1].toLowerCase());
}
