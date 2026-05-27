# Security Audit Report - Miqot

Tanggal audit: 2026-05-26  
Mode audit: read-only, tanpa migrasi, tanpa query tulis database, tanpa restart service, tanpa commit/push.  
Scope utama: `server.js`, frontend React/TS, konfigurasi, migrasi SQL, dependency audit (`npm audit --json`), dan file data yang tracked oleh git.

## Ringkasan Eksekutif

Audit menemukan 25 temuan:

| Severity | Jumlah |
| --- | ---: |
| CRITICAL | 4 |
| HIGH | 9 |
| MEDIUM | 8 |
| LOW | 2 |
| INFO | 2 |

Risiko tertinggi ada pada broken access control/IDOR di integrasi AWAPI, SSRF pada document proxy dan itinerary parser, secret/token yang masuk repository, serta XSS stored pada HTML SSR/meta injection. Karena server memakai Supabase service role key, seluruh kontrol akses efektif berada di layer aplikasi. Beberapa endpoint sudah melakukan filter `agent_id`, tetapi ada endpoint yang menerima ID/kode dari user lalu mengambil data lintas agent atau remote tanpa pembatasan kepemilikan yang kuat.

Catatan khusus:
- `GET /api/capi/:slug/config` sudah diverifikasi memakai Bearer auth dan owner/admin check. Tidak ditemukan kondisi endpoint ini mengembalikan Meta access token ke user anonim.
- File `.env` tidak dicetak atau disalin. Temuan secret hanya mencantumkan lokasi, baris, dan nama variabel.
- File Playwright legacy `jamaah-api.js` tidak diaudit mendalam sesuai instruksi.

## Temuan

### [CRITICAL] AWAPI refresh memungkinkan IDOR dan import data jamaah/booking lintas agent
- **Kategori:** Access Control
- **Lokasi:** `server.js:6794`, `server.js:6858`, `server.js:6812-6834`, `server.js:6881-6910`, `awapi-client.js:13-15`, `awapi-client.js:125-136`
- **Deskripsi:** Endpoint refresh menerima `idJamaah` dan `idUmrah` dari path, lalu memanggil AWAPI remote dan menyimpan hasilnya sebagai data milik `req.user.id`. Tidak ada verifikasi bahwa ID tersebut sudah dimiliki agent yang sedang login sebelum fetch remote dilakukan. Komentar di `awapi-client.js` juga mencatat bahwa upstream belum benar-benar membatasi data berdasarkan key, sehingga segment `code` menjadi pembeda utama.
- **Dampak:** Agent terautentikasi dapat menebak atau memperoleh ID jamaah/booking agent lain, memanggil endpoint refresh, lalu sistem akan mengambil PII/data booking dari AWAPI dan meng-upsert data itu ke agent penyerang. Ini dapat menyebabkan kebocoran nama jamaah, paket, keberangkatan, status, dan data operasional lain.
- **Bukti:** Pola berisiko:
  ```js
  app.get('/api/laporan/jamaah/:idJamaah/refresh', authMiddleware, async (req, res) => {
    const { idJamaah } = req.params;
    const remote = await awapiFetchJamaahById(agent.awapi_key, code, idJamaah);
    const row = normalizeAwapiJamaahRow(remote, agentId);
    await upsertAwapiJamaahRows(agentId, [row]);
  });
  ```
  Pola yang sama ada pada `GET /api/laporan/umrah/:idUmrah/refresh`.
- **Rekomendasi:** Jangan fetch remote berdasarkan ID bebas dari user. Refresh hanya boleh dilakukan untuk ID yang sudah terbukti milik `req.user.id` di database lokal, atau gunakan daftar ID resmi yang diambil dari akun agent tersebut. Jika AWAPI upstream tidak enforce key, tambahkan mapping agent-code yang tidak bisa dipilih user dan tolak ID yang belum pernah terlihat dalam sinkronisasi agent tersebut. Tambahkan test IDOR untuk dua agent berbeda.

### [CRITICAL] Document proxy rentan SSRF karena validasi host memakai string prefix
- **Kategori:** SSRF
- **Lokasi:** `server.js:10945-11015`, endpoint `GET /api/haji/doc-proxy`, `GET /api/laporan/jamaah/doc-proxy`
- **Deskripsi:** `proxyInternalDocument` menerima URL dari query, lalu memvalidasi dengan `targetUrl.startsWith(BASE_INTERNAL)`. Validasi string prefix dapat dibypass dengan userinfo/host confusion atau domain yang diawali string yang sama. Setelah itu server melakukan `fetch(targetUrl, { redirect: 'follow' })` dan dapat ikut mengirim cookie legacy.
- **Dampak:** User terautentikasi dapat memaksa server melakukan request ke host internal, metadata cloud, atau host penyerang yang menyamar sebagai prefix. Jika cookie legacy tersedia, cookie tersebut berisiko ikut terkirim ke tujuan yang salah. Ini membuka risiko SSRF, internal port scanning, dan kebocoran kredensial sesi upstream.
- **Bukti:** Pola berisiko:
  ```js
  if (!targetUrl.startsWith(BASE_INTERNAL)) return res.status(400).json({ error: '...' });
  const upstream = await fetch(targetUrl, { headers, redirect: 'follow' });
  ```
  Contoh kelas bypass: URL dengan bentuk `http://allowed-host@attacker-host/path` dapat lolos prefix string tetapi host efektifnya berbeda saat diparse URL.
- **Rekomendasi:** Parse URL dengan `new URL()`, bandingkan `protocol`, `hostname`, dan `port` secara eksak terhadap allowlist. Jangan follow redirect ke origin berbeda. Jangan kirim cookie kecuali origin hasil parse benar-benar sama dengan origin internal yang diizinkan. Pertimbangkan denylist IP privat/link-local dan pembatasan response size/content-type.

### [CRITICAL] Meta CAPI access token tersimpan di file JSON yang tracked
- **Kategori:** Secret
- **Lokasi:** `data/capi/nikita.json:2-3`, `data/capi/nila.json:2-3`
- **Deskripsi:** Dua file JSON legacy di `data/capi/` tracked oleh git dan berisi field `pixelId` serta `accessToken`. Nilai token tidak disalin di laporan ini, tetapi keberadaan field credential di file tracked sudah cukup menjadi kebocoran.
- **Dampak:** Siapa pun yang memiliki akses ke repository/history dapat memakai Meta access token tersebut untuk mengirim event atau mengakses konfigurasi sesuai scope token. Jika token masih aktif, ini berdampak langsung pada akun/pixel agent terkait.
- **Bukti:** Lokasi berisi field:
  ```json
  {
    "pixelId": "<redacted>",
    "accessToken": "<redacted>"
  }
  ```
- **Rekomendasi:** Anggap token kompromi, revoke/rotate di Meta, hapus file dari repository dan history jika perlu, lalu migrasikan semua credential ke storage terenkripsi atau secret manager. Tambahkan secret scanning di CI dan pre-commit. Pastikan `.gitignore` mencakup path aktual, bukan hanya pola yang tidak match.

### [CRITICAL] Fallback secret dan kredensial default hardcoded
- **Kategori:** Secret / Config
- **Lokasi:** `server.js:81`, `calendar-api.js:20-21`
- **Deskripsi:** `JWT_SECRET` memiliki fallback literal jika env tidak tersedia. `calendar-api.js` juga memiliki default literal untuk `CALENDAR_USERNAME` dan `CALENDAR_PASSWORD`. Nilai tidak dicantumkan di laporan ini.
- **Dampak:** Jika production/staging berjalan tanpa env yang benar, JWT dapat ditandatangani dengan secret yang diketahui dari source code, sehingga token palsu bisa dibuat. Kredensial kalender default juga dapat dipakai untuk akses tidak sah jika masih valid.
- **Bukti:** Pola berisiko:
  ```js
  const JWT_SECRET = process.env.JWT_SECRET || '<literal fallback>';
  const CALENDAR_PASSWORD = process.env.CALENDAR_PASSWORD || '<literal default>';
  ```
- **Rekomendasi:** Fail fast saat secret wajib tidak tersedia. Hapus fallback credential dari source, rotate kredensial terkait, dan tambahkan validasi startup yang menolak boot tanpa `JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `CAPI_ENCRYPTION_KEY`, dan secret wajib lain.

### [HIGH] Endpoint itinerary publik memungkinkan SSRF, cache poisoning, dan cost abuse OpenAI
- **Kategori:** SSRF / Rate Limit
- **Lokasi:** `server.js:1626-1638`, `server.js:1683-1698`, `server.js:1714-1744`
- **Deskripsi:** `GET /api/itinerary/:jadwalId` publik menerima `pdfUrl` dari query ketika cache belum ada. URL tersebut langsung di-fetch oleh `parseItineraryFromPdf`, lalu hasil parsing dapat memanggil OpenAI dan diinsert ke tabel `itineraries` untuk `jadwalId` yang diberikan user.
- **Dampak:** Penyerang anonim dapat membuat server fetch URL arbitrer, termasuk host internal jika jaringan mengizinkan, memicu biaya OpenAI, dan meracuni cache itinerary untuk ID paket tertentu dengan data dari PDF yang dikontrol penyerang.
- **Bukti:** Pola berisiko:
  ```js
  const pdfUrl = req.query.pdfUrl;
  const parsed = await parseItineraryFromPdf(pdfUrl);
  await supabase.from('itineraries').insert({ jadwal_id: jadwalId, ...parsed });
  ```
- **Rekomendasi:** Jangan menerima `pdfUrl` bebas dari client. Resolve PDF hanya dari sumber jadwal resmi yang sudah tersimpan dan dimiliki agent/paket yang valid. Tambahkan allowlist host, validasi content-type/size, timeout, rate limit publik, dan proteksi cache poisoning.

### [HIGH] Stored XSS pada SSR fallback dan flight share karena data agent/jadwal di-inject tanpa HTML escaping
- **Kategori:** Injection
- **Lokasi:** `server.js:14404-14444`, `server.js:14517-14582`, endpoint `/f/:code`, fallback `/:slug`/custom domain
- **Deskripsi:** Beberapa path SSR membangun `<title>`, meta tag, canonical, dan JSON-LD dari nama agent, data flight, data paket, atau portal meta lalu menyuntikkannya ke HTML string. Path bio/umroh/haji sudah memiliki escaping, tetapi fallback dan flight share belum konsisten.
- **Dampak:** Agent atau data upstream yang dapat mengontrol nama, paket, kota, maskapai, atau field lain dapat menyimpan payload XSS yang dieksekusi pada halaman publik jamaah-facing. Karena frontend menyimpan beberapa token di browser storage, XSS dapat mengambil token agent/portal, mengubah konten publik, atau melakukan aksi atas nama user yang sedang login.
- **Bukti:** Pola berisiko:
  ```js
  const newTitle = `${agent.name} - ...`;
  html = html.replace(/<title>.*<\/title>/, `<title>${newTitle}</title>`);
  html = html.replace(/<meta property="og:description"[^>]*>/, `<meta ... content="${newDescription}">`);
  ```
- **Rekomendasi:** Gunakan helper escape HTML/attribute tunggal untuk semua path SSR dan JSON-LD. Escape `title`, `description`, URL, image, dan semua nilai yang masuk ke attribute. Tambahkan regression test dengan payload `"><script>...` pada nama agent/paket.

### [HIGH] Magic-link Portal Jamaah tidak benar-benar single-use
- **Kategori:** JWT & Session / Access Control
- **Lokasi:** `server.js:12285`, `server.js:12424-12429`, `server.js:13150-13220`
- **Deskripsi:** Token magic link 5 karakter dibuat dan endpoint consume mengecek token serta expiry, tetapi tidak menolak token yang `consumed_at` sudah terisi. Endpoint tetap membuat sesi baru setiap kali token yang sama dikonsumsi selama belum expired.
- **Dampak:** Jika link WhatsApp diteruskan, tersimpan di history, atau bocor, siapa pun yang memiliki link dapat berulang kali membuat session Portal Jamaah sampai masa berlaku token habis. Ini melemahkan asumsi single-use dan memperpanjang risiko kebocoran akses booking jamaah.
- **Bukti:** Pola berisiko:
  ```js
  const { data: tokenRow } = await supabase.from('jamaah_portal_tokens').select('*').eq('token', token).single();
  await supabase.from('jamaah_portal_tokens').update({ consumed_at: new Date().toISOString() }).eq('id', tokenRow.id);
  // session baru tetap dibuat tanpa check consumed_at
  ```
- **Rekomendasi:** Tambahkan check `consumed_at IS NULL` dan lakukan consume secara atomik, misalnya `UPDATE ... WHERE token = ? AND consumed_at IS NULL AND expires_at > now() RETURNING *`. Jika link memang didesain reusable, ubah terminologi, pendekkan TTL, dan tambahkan binding perangkat/OTP tambahan.

### [HIGH] Token session Portal Jamaah dikirim ke JavaScript dan disimpan di localStorage
- **Kategori:** JWT & Session
- **Lokasi:** `server.js:13206-13214`, `src/components/portal-jamaah/lib/portalSession.ts:19-26`, `src/components/portal-jamaah/lib/portalApi.ts:24-31`
- **Deskripsi:** Backend sudah mengatur cookie `jamaah_session` dengan `HttpOnly`, tetapi response consume juga mengembalikan `session_token`. Frontend menyimpan token ini di `localStorage`, membuat cookie via JavaScript, dan mengirimnya sebagai Bearer token.
- **Dampak:** XSS di halaman publik atau extension browser dapat membaca token portal dari `localStorage` dan memakai session jamaah. Ini menghilangkan manfaat utama cookie `HttpOnly` yang sudah disiapkan backend.
- **Bukti:** Pola berisiko:
  ```js
  res.cookie('jamaah_session', sessionToken, getPortalCookieOptions(...));
  res.json({ session_token: sessionToken, ... });
  ```
  ```ts
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  ```
- **Rekomendasi:** Jangan kirim token session ke JavaScript. Gunakan cookie `HttpOnly; Secure; SameSite=Lax/Strict` sebagai satu-satunya mekanisme session. Ubah API portal agar membaca cookie server-side, hapus penyimpanan token di `localStorage`, dan rotasi session lama.

### [HIGH] JWT agent berlaku 365 hari dan tidak ada revocation/status/role refresh
- **Kategori:** JWT & Session
- **Lokasi:** `server.js:729-771`, `server.js:1848-1884`, `src/utils/authUtils.ts:15-18`
- **Deskripsi:** Login menandatangani JWT dengan expiry 365 hari. `authMiddleware` dan `adminOnly` mempercayai claim token (`id`, `role`, `slug`) tanpa memuat ulang status/role agent dari database untuk setiap request. Tidak ditemukan mekanisme blacklist/revoke token.
- **Dampak:** Token yang bocor tetap dapat dipakai sampai satu tahun. Jika agent direject, dihapus, atau admin didemote, token lama berpotensi tetap membawa role/status lama sampai expired, terutama pada endpoint admin yang hanya mengecek claim `role`.
- **Bukti:** Pola berisiko:
  ```js
  jwt.sign({ id, slug, role }, JWT_SECRET, { expiresIn: '365d' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: '...' });
  ```
- **Rekomendasi:** Pendekkan access token (misalnya 15-60 menit), gunakan refresh token yang dapat direvoke/rotasi, dan validasi status/role terkini dari DB atau token version pada request sensitif. Tambahkan mekanisme revoke saat password berubah, status berubah, agent dihapus, atau role admin dicabut.

### [HIGH] Endpoint CAPI event publik dapat dipakai untuk spoof event atas nama agent lain
- **Kategori:** Access Control / Abuse
- **Lokasi:** `server.js:4778-4795`, `server.js:4929`
- **Deskripsi:** `POST /api/capi/:slug/event` publik dan hanya bergantung pada slug agent. Slug adalah informasi publik. Endpoint memakai token Meta agent yang tersimpan server-side untuk mengirim event. Rate limit yang ditemukan bersifat in-memory per slug dan relatif longgar.
- **Dampak:** Siapa pun yang mengetahui slug dapat mengirim event palsu ke Meta Pixel agent tersebut. Ini dapat merusak atribusi iklan, kualitas audience, optimasi conversion, dan log analytics agent.
- **Bukti:** Endpoint publik:
  ```js
  app.post('/api/capi/:slug/event', async (req, res) => { ... });
  ```
  `POST /api/capi/:slug/login` hanya mengembalikan sukses/gagal dan tidak menjadi session guard untuk endpoint event/config.
- **Rekomendasi:** Tambahkan shared secret per agent/site, HMAC signature, nonce/timestamp, atau token embed yang berbeda dari slug. Validasi origin tidak cukup karena request server-to-server mudah dipalsukan. Pisahkan endpoint publik tracking dari endpoint konfigurasi dan tambahkan rate limit persistent.

### [HIGH] CAPI/Jamaah credential encryption downgrade ke plaintext jika key tidak tersedia
- **Kategori:** Crypto / Secret
- **Lokasi:** `server.js:4160-4178`, `server.js:4067`, `server.js:4097`
- **Deskripsi:** Saat `CAPI_ENCRYPTION_KEY` kosong, fungsi enkripsi langsung mengembalikan plaintext. Decrypt juga menerima data tanpa format terenkripsi sebagai plaintext. Mode AES-256-GCM dengan IV random sudah baik saat key ada, tetapi fallback ini membuat secret baru atau legacy dapat tersimpan tanpa enkripsi.
- **Dampak:** Salah konfigurasi environment akan menyebabkan access token Meta dan password jamaah tersimpan plaintext di database/service role storage. Jika DB/log backup bocor, credential langsung dapat dipakai.
- **Bukti:** Pola berisiko:
  ```js
  if (!CAPI_ENCRYPTION_KEY || !text) return text;
  if (!CAPI_ENCRYPTION_KEY || !data || !data.includes(':')) return data;
  ```
- **Rekomendasi:** Jadikan `CAPI_ENCRYPTION_KEY` wajib di startup. Tolak penyimpanan credential jika key tidak valid. Validasi panjang key base64 menjadi 32 byte. Buat migrasi terkontrol untuk mengenkripsi ulang nilai legacy plaintext dan beri marker versi format ciphertext.

### [HIGH] `/api/awapi/test` dapat dipakai agent untuk menguji kode/key AWAPI arbitrary dan melihat sample data
- **Kategori:** Access Control
- **Lokasi:** `server.js:5154-5206`
- **Deskripsi:** Endpoint terautentikasi menerima `awapi_key` dan `awapi_code` dari body, membangun URL AWAPI dari input tersebut, lalu mengembalikan jumlah data dan sample jamaah/umrah. Komentar di kode menyebut upstream belum memvalidasi key secara benar.
- **Dampak:** Agent biasa dapat melakukan enumerasi kode AWAPI milik agent lain dan melihat sample data operasional, walaupun belum menyimpan konfigurasi itu sebagai miliknya. Ini memperbesar dampak kelemahan AWAPI upstream.
- **Bukti:** Pola berisiko:
  ```js
  const { awapi_key, awapi_code } = req.body;
  // upstream does not validate x-api-key properly
  res.json({ count, sample: rows.slice(0, 3).map(...) });
  ```
- **Rekomendasi:** Batasi endpoint ini ke admin atau hanya izinkan test terhadap konfigurasi AWAPI yang sudah terikat ke `req.user.id`. Jangan mengembalikan sample PII pada test koneksi. Tambahkan audit log untuk percobaan kode/key.

### [HIGH] Endpoint publik berbasis OpenAI dapat disalahgunakan untuk cost bombing
- **Kategori:** Rate Limit / Abuse
- **Lokasi:** `server.js:927-1009`, `server.js:1325-1620`
- **Deskripsi:** `POST /api/ai-copy` publik, CORS `*`, dan tidak terlihat memiliki auth/rate limit sebelum memanggil OpenAI. `POST /api/ask-ai/:slug/:jadwalId` juga publik; ada rate limit 10 request/menit per IP in-memory, tetapi key IP memakai header yang mudah dipengaruhi proxy dan cache hanya bekerja untuk pertanyaan identik.
- **Dampak:** Penyerang anonim dapat mengirim banyak request unik untuk memicu biaya OpenAI. Pada link publik yang viral, trafik tidak sah dapat menghabiskan quota/budget dan memperlambat layanan.
- **Bukti:** Endpoint publik:
  ```js
  app.post('/api/ai-copy', async (req, res) => { ... OpenAI ... });
  app.post('/api/ask-ai/:slug/:jadwalId', async (req, res) => { ... OpenAI ... });
  ```
- **Rekomendasi:** Tambahkan rate limit persistent per IP, slug, jadwal, dan fingerprint; batasi panjang input; tambahkan quota per agent; gunakan queue/circuit breaker; cache semantic atau normalized question; dan pertimbangkan CAPTCHA/turnstile untuk endpoint publik yang mahal.

### [MEDIUM] Login, forgot password, dan registrasi belum memiliki rate limit dan masih memungkinkan enumerasi
- **Kategori:** Rate Limit / Auth
- **Lokasi:** `server.js:1848-1898`, `server.js:1908-2012`, `server.js:2084-2162`
- **Deskripsi:** Endpoint login, register, dan forgot-password tidak terlihat memakai limiter khusus. Login membedakan user tidak ditemukan dan password salah. Forgot-password mengembalikan 404 jika email tidak terdaftar.
- **Dampak:** Penyerang dapat brute-force password, enumerate email/slug yang terdaftar, dan melakukan spam pembuatan akun pending atau spam reset link.
- **Bukti:** Pola respons:
  ```js
  if (!agent) return res.status(404).json({ error: 'User not found' });
  if (!valid) return res.status(401).json({ error: 'Invalid password' });
  ```
- **Rekomendasi:** Tambahkan rate limit persistent per IP dan per identifier, lockout/backoff, respons generik untuk login/forgot-password, dan monitoring percobaan gagal. Registrasi sebaiknya dilindungi quota, CAPTCHA, atau moderasi tambahan.

### [MEDIUM] Reset PIN memakai generator non-cryptographic dan kebijakan lockout tidak sesuai klaim
- **Kategori:** JWT & Session / Rate Limit
- **Lokasi:** `server.js:2274-2284`, `server.js:2312-2358`
- **Deskripsi:** Verifikasi PIN memakai 5 attempt per 5 menit di memory, bukan lockout 15 menit seperti ekspektasi audit. Reset PIN membuat OTP dengan `Math.random()`, request reset tidak terlihat punya rate limit kuat, dan request baru dapat menimpa OTP lama.
- **Dampak:** Attacker yang bisa memicu reset berulang dapat mengganggu user, memperlemah audit trail, dan lockout in-memory hilang saat proses restart. OTP non-cryptographic tidak ideal untuk mekanisme keamanan.
- **Bukti:** Pola berisiko:
  ```js
  const otp = Math.random().toString().slice(2, 8);
  ```
- **Rekomendasi:** Gunakan `crypto.randomInt`/CSPRNG, rate limit per agent/IP/device, lockout sesuai kebijakan 15 menit, simpan attempt/lockout secara persistent, dan jangan reset attempt hanya dengan request OTP baru.

### [MEDIUM] Upload gambar mempercayai MIME dari client dan tidak selalu memverifikasi magic bytes
- **Kategori:** Input Validation
- **Lokasi:** `server.js:2817-2868`, `server.js:2962-2977`, `server.js:3852-3866`, `server.js:3975-3988`
- **Deskripsi:** Beberapa endpoint upload base64 foto/OG image mengecek data URI atau field `mime`, tetapi tidak konsisten memverifikasi signature file sebenarnya. Batas ukuran ada di beberapa endpoint, namun validasi content-type berbasis client dapat dipalsukan.
- **Dampak:** File non-image dapat diunggah dengan MIME palsu. Jika storage/CDN menyajikan file dengan content-type berbahaya atau browser melakukan sniffing, ini dapat menjadi vektor XSS/content spoofing.
- **Bukti:** Pola berisiko:
  ```js
  const mime = req.body.mime;
  if (!/^image\//.test(mime)) return res.status(400).json(...);
  ```
- **Rekomendasi:** Decode base64 lalu validasi magic bytes server-side untuk PNG/JPEG/WebP yang diizinkan. Paksa content-type aman saat upload, gunakan nama file yang digenerate server, enforce ukuran setelah decode, dan tolak SVG kecuali disanitasi ketat.

### [MEDIUM] Security headers global belum memadai
- **Kategori:** Config
- **Lokasi:** `server.js` global middleware/static serving
- **Deskripsi:** Tidak ditemukan middleware security header seperti Helmet atau konfigurasi manual yang konsisten untuk CSP, `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`, HSTS, dan Referrer-Policy.
- **Dampak:** Dampak XSS stored menjadi lebih besar karena tidak ada CSP yang membatasi script source. Tanpa `nosniff` dan frame control, risiko content sniffing/clickjacking juga meningkat, terutama pada halaman publik jamaah-facing.
- **Bukti:** Grep tidak menemukan konfigurasi global untuk CSP/Helmet, sementara server banyak melakukan SSR string replacement dan static serving.
- **Rekomendasi:** Tambahkan header global: CSP bertahap dengan nonce/hash untuk script yang sah, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, HSTS untuk HTTPS, dan `frame-ancestors` sesuai kebutuhan embed. Uji agar halaman public embed yang memang perlu tetap berfungsi.

### [MEDIUM] CORS preflight terlalu permisif pada beberapa endpoint Bearer/public
- **Kategori:** Config
- **Lokasi:** `server.js:1009-1014`, `server.js:1325-1330`, `server.js:1840-1844`, `server.js:2406-2417`, `server.js:4789-4795`, `server.js:11122-11127`, `server.js:13824`
- **Deskripsi:** Banyak preflight mengembalikan `Access-Control-Allow-Origin: *` dan mengizinkan header `Authorization`. Karena tidak memakai `Access-Control-Allow-Credentials`, ini bukan langsung cookie leak, tetapi terlalu longgar untuk endpoint yang memakai Bearer token dan endpoint publik yang mahal.
- **Dampak:** Website pihak ketiga dapat memanggil API dari browser korban jika token tersedia di JS atau jika aplikasi client memasukkan Bearer token. Ini memperbesar dampak XSS/token exposure dan abuse endpoint publik.
- **Bukti:** Pola berisiko:
  ```js
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' });
  ```
- **Rekomendasi:** Gunakan allowlist origin per environment. Pisahkan CORS endpoint publik embed dari API internal/admin. Jangan izinkan `Authorization` untuk origin `*`; validasi `Origin` dan log origin yang ditolak.

### [MEDIUM] Dependency audit menunjukkan kerentanan critical/high
- **Kategori:** Dependency
- **Lokasi:** `package.json`, `package-lock.json`, hasil `npm audit --json`
- **Deskripsi:** `npm audit` read-only menghasilkan 25 vulnerability: 1 critical, 10 high, 14 moderate. Paket yang muncul antara lain `jspdf` (critical), `axios` (beberapa SSRF/header/prototype pollution advisory), `path-to-regexp`/router, `undici`, `rollup`, `vite`/`esbuild`, `serialize-javascript`, dan paket build/service worker lain.
- **Dampak:** Exploitability tergantung path penggunaan, tetapi paket seperti `axios`, router/path matching, PDF generation, build tooling, dan browser bundle dapat mempengaruhi server-side request, XSS, atau supply chain.
- **Bukti:** Ringkasan audit:
  ```text
  vulnerabilities: total 25, critical 1, high 10, moderate 14
  ```
- **Rekomendasi:** Lakukan triage dependency terpisah tanpa `npm audit fix` otomatis. Upgrade paket direct yang aman lebih dulu (`axios`, `jspdf`, `vite`, `rollup`/plugin terkait), lalu verifikasi regression test/build. Untuk package transitive, gunakan override hanya jika kompatibilitas sudah diuji.

### [MEDIUM] `booking_persiapan` memakai primary key `id_umroh` saja sehingga berisiko bentrok lintas agent
- **Kategori:** Access Control / RLS
- **Lokasi:** `migrations/20260515000000_portal_jamaah.sql:30-42`, `server.js:12947-12950`, `server.js:13293-13312`
- **Deskripsi:** Tabel `booking_persiapan` menjadikan `id_umroh` sebagai primary key dan upsert memakai conflict `id_umroh`, sementara data juga memiliki `agent_id`. Read path sudah memfilter `agent_id`, tetapi constraint global pada `id_umroh` dapat menyebabkan overwrite atau konflik jika ID booking tidak unik global.
- **Dampak:** Jika `id_umroh` dapat sama di dua agent/source, satu agent dapat menimpa checklist persiapan booking agent lain atau gagal menyimpan data sendiri. Karena server memakai service role, RLS tidak melindungi operasi ini.
- **Bukti:** Pola schema/upsert:
  ```sql
  CREATE TABLE booking_persiapan (
    id_umroh TEXT PRIMARY KEY,
    agent_id UUID NOT NULL
  );
  ```
  ```js
  upsert(payload, { onConflict: 'id_umroh' });
  ```
- **Rekomendasi:** Gunakan composite uniqueness `(agent_id, id_umroh)` dan upsert dengan conflict key yang sama. Audit data existing sebelum migrasi. Tambahkan test dua agent dengan `id_umroh` sama.

### [MEDIUM] Beberapa error path dapat membocorkan detail internal/upstream
- **Kategori:** Config / Information Disclosure
- **Lokasi:** `server.js:927-1009`, beberapa handler eksternal AWAPI/OpenAI/Telegram
- **Deskripsi:** Sebagian handler mengembalikan detail error upstream ke client, misalnya body error OpenAI atau pesan upstream. Pola umum `{ error: '...' }` sudah ada, tetapi belum konsisten menahan detail internal.
- **Dampak:** Penyerang dapat memperoleh informasi tentang provider, validasi upstream, quota, prompt failure, atau struktur response internal. Ini membantu enumeration dan abuse.
- **Bukti:** Pola berisiko:
  ```js
  return res.status(502).json({ error: 'OpenAI API error', details: errBody });
  ```
- **Rekomendasi:** Standarkan error response publik ke pesan generik dan simpan detail di server log saja. Gunakan correlation ID agar debugging tetap bisa dilakukan tanpa membocorkan detail ke client.

### [LOW] Public GET `/api/bio/:slug/config` dapat membuat default config di database
- **Kategori:** Config / Abuse
- **Lokasi:** `server.js:3786-3796`
- **Deskripsi:** Endpoint publik untuk membaca bio config dapat melakukan insert default config ketika data belum ada. GET publik menjadi operasi yang memutasi database.
- **Dampak:** Bot atau scanner yang mengakses slug valid dapat memicu write tidak perlu. Dampaknya relatif terbatas, tetapi ini melanggar idempotency GET dan dapat membuat noise/biaya DB.
- **Bukti:** Pola berisiko:
  ```js
  if (!data) {
    await supabase.from('bio_configs').insert(defaultConfig);
  }
  ```
- **Rekomendasi:** Pindahkan auto-create ke endpoint admin/authenticated atau lakukan lazy default di memori tanpa insert pada request publik.

### [LOW] RLS portal di migration belum terlihat memiliki policy eksplisit
- **Kategori:** RLS / Config
- **Lokasi:** `migrations/20260515000000_portal_jamaah.sql:37-42`
- **Deskripsi:** Migration mengaktifkan RLS pada `jamaah_portal_tokens`, `jamaah_portal_sessions`, dan `booking_persiapan`, tetapi file migration yang diaudit tidak menunjukkan policy. Karena server menggunakan service role, operasi server bypass RLS, sehingga kontrol akses tetap harus ada di aplikasi.
- **Dampak:** Jika suatu saat client Supabase ANON diberi akses langsung ke tabel ini, default deny mungkin memblokir aplikasi atau policy tambahan yang salah dapat membuka data lintas agent. Saat ini risiko utama tetap pada aplikasi service-role, bukan RLS.
- **Bukti:** Pola migration:
  ```sql
  ALTER TABLE jamaah_portal_tokens ENABLE ROW LEVEL SECURITY;
  ALTER TABLE jamaah_portal_sessions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE booking_persiapan ENABLE ROW LEVEL SECURITY;
  ```
- **Rekomendasi:** Dokumentasikan policy RLS yang diharapkan dan pastikan tidak ada client direct access ke tabel sensitif. Jika ingin defense-in-depth, gunakan RPC/security definer yang aman atau client policy teruji per agent/jamaah.

### [INFO] CAPI config tidak ditemukan terbuka untuk publik pada versi ini
- **Kategori:** Access Control
- **Lokasi:** `server.js:4216-4238`, endpoint `GET /api/capi/:slug/config`
- **Deskripsi:** Endpoint config CAPI memakai `authMiddleware` dan helper authorization yang mengecek owner/admin sebelum mengembalikan konfigurasi. Ini menjawab fokus audit: endpoint config tidak terlihat mengembalikan Meta access token terdekripsi hanya berdasarkan slug.
- **Dampak:** Risiko public token disclosure pada endpoint ini tidak terkonfirmasi. Namun token tetap sensitif karena endpoint owner/admin memang dapat melihat token terdekripsi.
- **Bukti:** Pola aman:
  ```js
  app.get('/api/capi/:slug/config', authMiddleware, async (req, res) => {
    const agent = await getAuthorizedCapiAgent(req, res);
    if (!agent) return;
  });
  ```
- **Rekomendasi:** Pertahankan owner/admin check, audit test endpoint ini secara otomatis, dan pertimbangkan tidak pernah mengembalikan full access token setelah konfigurasi awal.

### [INFO] File Playwright legacy `jamaah-api.js` tidak diaudit mendalam
- **Kategori:** Config
- **Lokasi:** `jamaah-api.js`
- **Deskripsi:** Sesuai instruksi audit, file Playwright legacy tidak disentuh selain dicatat sebagai area risiko. File otomasi browser legacy biasanya berisiko menyimpan cookie/session, credential, atau bypass flow produksi jika masih dipakai.
- **Dampak:** Tidak ada klaim temuan spesifik dari file ini dalam audit ini, tetapi file legacy sebaiknya dipastikan tidak berada di runtime production path.
- **Bukti:** File ada di repository dan termasuk kategori legacy yang disebut eksplisit oleh instruksi audit.
- **Rekomendasi:** Pada audit lanjutan, review terpisah file ini dalam mode read-only dengan fokus credential handling, storage session, dan apakah ada path production yang masih memanggilnya.

## Prioritas Perbaikan

| Prioritas | Temuan | Severity | Alasan |
| ---: | --- | --- | --- |
| 1 | AWAPI refresh IDOR lintas agent | CRITICAL | Kebocoran PII/data booking lintas agent dengan token agent biasa |
| 2 | Document proxy SSRF prefix bypass | CRITICAL | Dapat mencapai host internal/metadata dan berisiko membocorkan cookie upstream |
| 3 | Tracked CAPI access token di `data/capi/*.json` | CRITICAL | Secret aktif berpotensi sudah bocor lewat repository/history |
| 4 | Stored XSS pada SSR fallback/flight share | HIGH | Halaman publik dapat menjalankan script dari data agent/upstream |
| 5 | Portal session token di localStorage dan magic-link reusable | HIGH | Link/token bocor memberi akses jamaah berulang dan mudah dicuri via XSS |
| 6 | Itinerary publik SSRF/cache poisoning/OpenAI cost | HIGH | Unauthenticated SSRF dan abuse biaya |
| 7 | JWT 365 hari tanpa revoke/status refresh | HIGH | Token bocor atau role stale bertahan lama |
| 8 | CAPI event publik dapat spoof Meta event | HIGH | Merusak tracking/ads agent hanya dengan mengetahui slug |
| 9 | Hardcoded fallback secret/kredensial default | CRITICAL | Salah konfigurasi bisa membuat JWT bisa dipalsukan atau kredensial dipakai |
| 10 | Endpoint auth publik tanpa rate limit/enumerasi | MEDIUM | Brute-force, spam registrasi, dan enumerasi akun |

## Verifikasi Tambahan yang Disarankan

- Buat test IDOR dua agent untuk semua endpoint yang menerima `:id`, `:slug`, `jamaah_id`, `id_umroh`, atau ID dari body.
- Jalankan secret scanning terhadap git history, bukan hanya working tree.
- Jalankan dynamic SSRF tests di staging dengan host allowlist dan server metadata dummy, tanpa menyentuh production.
- Tambahkan test XSS SSR yang membaca HTML mentah untuk `<title>`, meta tag, canonical, dan JSON-LD.
- Audit policy RLS langsung di Supabase dashboard/SQL read-only (`SELECT` policy metadata) karena migration lokal belum tentu mencerminkan state production.
