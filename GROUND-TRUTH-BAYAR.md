# Ground Truth `jamaah.bayar` - Fase 2A

Tanggal: 2026-05-24 WIB.
Status: **BLOCKED sebelum canonical source bisa dipilih**.

Scope yang dijalankan:

- Baca kode lokal.
- `SELECT` read-only ke Supabase production.
- HTTP GET read-only ke AWAPI/upstream.
- Percobaan akses SSH read-only ke VPS untuk menjalankan fetch dari production network.

Yang **tidak** dijalankan:

- Tidak ada `UPDATE` / `INSERT` / `DELETE` / `UPSERT` / `ALTER` ke production DB.
- Tidak ada patch kode sync.
- Tidak menjalankan `scripts/test-perlengkapan-upsert.js`.
- Tidak melakukan login POST ke legacy panel, karena instruksi 2A membatasi HTTP ke GET read-only.

## Blocker

2A mensyaratkan fetch live dari **VPS production**. Dari workspace ini:

- `ssh` ke `VPS_PUBLIC_IP` port 22 timeout.
- SSH agent lokal tidak punya identity.
- Beberapa host lama di `known_hosts` menolak auth (`Permission denied`) atau host-key mismatch.
- AWAPI via origin langsung `http://115.124.86.220` timeout dari workspace.
- AWAPI via `https://jadwal.alhijaz.co` merespons untuk request tanpa key, tetapi request valid dengan agent key ke endpoint live SITI menghasilkan Cloudflare `522 Connection timed out`.
- Legacy detail GET tanpa session mengembalikan `Sesi Anda habis, silahkan re-login!!`; live legacy detail tidak bisa diambil dengan GET saja tanpa session.

Karena dua sumber live yang diminta belum bisa diambil, canonical payment source **belum boleh dipilih**.

## DB Snapshot Read-Only

Snapshot ini hanya kondisi DB saat query, bukan ground truth live.

| Agent | ID Umroh | JM ID | Nama | DB bayar | DB sisa | DB paket | raw source | raw endpoint | raw bayar | raw sisa | raw gross | raw harga | raw diskon | legacy net dari raw |
|---|---|---|---|---:|---:|---|---|---|---:|---:|---:|---:|---:|---:|
| indowisata | `AIW0028864` | `JM999999990000062962` | SITI KOMARIAH | 5.000.000 | 23.900.000 | HEMAT Quard | `umrah_detail` | NULL | NULL | NULL | 5.000.000 | 28.900.000 | 0 | 5.000.000 |
| dewi | `AIW0026379` | `JM999999990000056152` | EDHI JULIANTORO | 40.900.000 | 0 | UHUD | `umrah_detail` | `dh` | 40.900.000 | 0 | 39.900.000 | 39.900.000 | 500.000 | 39.400.000 |
| dewi | `AIW0026379` | `JM999999990000056153` | LINDA RAHAYU | 40.900.000 | 0 | UHUD | `umrah_detail` | `dh` | 40.900.000 | 0 | 39.900.000 | 39.900.000 | 500.000 | 39.400.000 |
| dewi | `AIW0026379` | `JM999999990000056154` | GIOVINAZZI FABIAN ALIDI | 40.900.000 | 0 | UHUD | `umrah_detail` | `dh` | 40.900.000 | 0 | 39.900.000 | 39.900.000 | 500.000 | 39.400.000 |
| dewi | `AIW0026379` | `JM999999990000056155` | QOTRUNNADA KEOLA ALIDI | 40.900.000 | 0 | UHUD | `umrah_detail` | `dh` | 40.900.000 | 0 | 39.900.000 | 39.900.000 | 500.000 | 39.400.000 |

Notes:

- SITI sedang berada di state legacy detail: `bayar=5.000.000`, `raw_data.bayar_gross=5.000.000`.
- Empat baris dewi sedang berada di state campuran: kolom `bayar=raw_data.bayar=40.900.000` dari AWAPI `dh`, tetapi `raw_data.source='umrah_detail'` dan `raw_data.bayar_gross=39.900.000` dari legacy detail.
- Untuk empat baris dewi, formula legacy net dari raw detail adalah `39.900.000 - 500.000 = 39.400.000`, sedangkan AWAPI/DB saat snapshot menunjukkan `40.900.000`.

## Percobaan Fetch Live

### AWAPI

Endpoint yang perlu diambil:

- `GET /awapi/gu/SM715/jamaah/JM999999990000062962`
- `GET /awapi/gu/SM715/umrah/AIW0028864`
- `GET /awapi/gu/SM01224/jamaah/JM999999990000056152` sampai `...56155`
- `GET /awapi/gu/SM01224/umrah/AIW0026379`

Hasil dari workspace:

- Origin direct `http://115.124.86.220/...`: network timeout.
- Cloudflare upstream `https://jadwal.alhijaz.co/...` dengan credential valid: endpoint SITI `/jamaah/...62962` return `522 Connection timed out` setelah sekitar 19,7 detik.
- Request dummy tanpa API key ke Cloudflare upstream return `401 API Key is missing`, jadi route-nya ada, tetapi request valid ke origin tidak selesai dari network workspace.

### Legacy detail

Endpoint yang perlu diambil:

- `GET /aiw/staff/pages/main.php?route=umrah&act=edit&id=AIW0028864`
- `GET /aiw/staff/pages/main.php?route=umrah&act=edit&id=AIW0026379`

Hasil dari workspace:

- GET tanpa session return `Sesi Anda habis, silahkan re-login!!`.
- Untuk mengambil live detail diperlukan session legacy. Membuat session membutuhkan login POST, tetapi POST login tidak saya jalankan karena instruksi 2A membatasi HTTP ke GET read-only.

## Kesimpulan 2A

Canonical source untuk payment **belum bisa dipilih** berdasarkan data live, karena fetch live AWAPI dan legacy detail belum berhasil dari production network.

Nilai benar untuk lima baris juga **belum bisa ditetapkan** secara empiris:

- SITI: kandidat nilai dari DB/raw detail sekarang = 5.000.000; audit sebelumnya menangkap AWAPI/list-like state = 15.000.000. Perlu live AWAPI + live legacy.
- Empat baris dewi: kandidat nilai dari AWAPI/DB sekarang = 40.900.000; kandidat legacy net dari raw detail = 39.400.000; kandidat legacy gross = 39.900.000. Perlu live AWAPI + live legacy.

## Langkah yang Dibutuhkan

Pilih salah satu:

1. Berikan akses SSH/non-interaktif ke VPS production agar fetch 2A dijalankan dari sana.
2. Jalankan script/read-only commands 2A langsung di VPS dan berikan output sanitized.
3. Beri approval eksplisit untuk melakukan login POST ke legacy panel dari workspace sebagai prasyarat GET detail legacy, sambil tetap tanpa mutasi DB.

Setelah data live tersedia, barulah checkpoint canonical bisa diputuskan dan Fase 2B boleh dimulai.
