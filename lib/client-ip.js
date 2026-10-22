// IP pengunjung untuk rate limit, log analytics, dan CAPI.
//
// Hanya X-Real-IP yang dipercaya. Kedua jalur masuk selalu menimpanya dengan
// alamat peer: nginx (alhijaz.co) memakai $remote_addr setelah real_ip membaca
// CF-Connecting-IP dari rentang Cloudflare saja, dan Caddy (custom domain)
// memakai {remote_host}.
//
// X-Forwarded-For dan CF-Connecting-IP TIDAK dipakai. nginx meneruskan XFF
// dengan $proxy_add_x_forwarded_for, jadi entri pertamanya ditulis klien
// sendiri. Mengganti nilainya tiap request cukup untuk lolos semua rate limit
// berbasis IP (terbukti di audit 22 Okt 2026). CF-Connecting-IP juga bisa
// dipalsukan oleh siapa pun yang menembak origin langsung tanpa Cloudflare.
//
// Tanpa proxy (pengembangan lokal), jatuh ke alamat socket.
export function clientIp(req) {
  const real = req?.headers?.['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();
  return req?.socket?.remoteAddress || req?.ip || null;
}
