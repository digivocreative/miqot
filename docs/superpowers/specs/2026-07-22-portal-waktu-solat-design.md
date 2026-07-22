# Widget Waktu Solat Mekkah & Madinah — Portal Jamaah

Tanggal: 2026-07-22
Status: Design disetujui, siap ke rencana implementasi

## Tujuan

Menampilkan jadwal solat kota Mekkah & Madinah di Portal Jamaah sebagai satu
kartu di Beranda, sehingga jamaah (dan calon jamaah) bisa melihat waktu solat
di Tanah Suci sekilas tanpa membuka aplikasi lain.

## Keputusan produk (hasil brainstorming)

- **Penempatan:** kartu di **Beranda** (bukan menu/route sendiri).
- **Isi tiap kota:** solat berikutnya + hitung mundur, plus deret 5 waktu ringkas.
- **Tata letak dua kota:** ikut lokasi jamaah (best-effort), **default Mekkah**,
  kota lain via tab.

## Non-tujuan (YAGNI)

- Tidak ada menu/route baru, tidak ada halaman detail penuh (hanya kartu Beranda).
- Tidak ada notifikasi/adzan/audio.
- Tidak ada kalkulasi arah kiblat.
- Tidak ada pemilihan metode hitung oleh pengguna (dipaku ke Umm al-Qura).
- Tidak ada backend baru — API dipanggil langsung dari browser (pola equran.id).

## Arsitektur

Mengikuti pola pembaca Al-Quran yang sudah ada (`lib/quranApi.ts` +
`hooks/useQuran*` + halaman): modul fetch murni, hook, lalu komponen presentasi.

```
src/components/portal-jamaah/
  lib/prayerTimesApi.ts       ← fetch + cache Aladhan, tipe, helper murni
  hooks/usePrayerTimes.ts     ← muat kedua kota + tick "sekarang"
  components/PrayerTimesCard.tsx  ← UI kartu (light/dark)
  pages/BerandaPage.tsx       ← sisipkan kartu (edit)
```

Karena ini hanya kartu Beranda, **tidak menyentuh** 5 titik sinkron route enum
(`usePortalRoute.ts`, `PortalJamaahRouter.tsx`, `portalMenu.ts`,
`PortalDashboard.tsx`, `portalAlerts/portalTasks`). Lihat memori
`reference_portal_jamaah_routes`.

### Sumber data — Aladhan API

- Endpoint: `GET https://api.aladhan.com/v1/timings/DD-MM-YYYY?latitude=<lat>&longitude=<lng>&method=4`
  - `method=4` = **Umm al-Qura University, Makkah** (metode resmi Arab Saudi).
  - `DD-MM-YYYY` = tanggal **hari ini menurut zona Asia/Riyadh** (lihat "Zona waktu").
- Koordinat tetap (dikodekan konstan, tak perlu geolokasi perangkat):
  - Mekkah: `lat 21.4225, lng 39.8262`
  - Madinah: `lat 24.4672, lng 39.6111`
- CORS `*` sudah dipastikan → dipanggil langsung dari browser, tanpa proxy backend.
- Respons yang dipakai (terverifikasi 2026-07-22):
  - `data.timings.{Fajr,Sunrise,Dhuhr,Asr,Maghrib,Isha}` — string `"HH:MM"` waktu lokal Riyadh.
  - `data.meta.timezone` = `"Asia/Riyadh"`.
  - `data.date.hijri.{day, month.en/ar, year}` — untuk label tanggal Hijriah.
- **Waktu yang ditampilkan:** hanya 5 solat wajib (Subuh/Fajr, Dzuhur, Ashar,
  Maghrib, Isya). `Sunrise` diambil untuk internal (batas akhir Subuh) tapi tidak
  wajib dirender sebagai "waktu solat".

### Zona waktu (titik kebenaran paling rawan)

Mekkah & Madinah berada di `Asia/Riyadh` (UTC+3, tanpa DST). Jam perangkat jamaah
umumnya WIB (UTC+7). Maka:

- **"Sekarang" dan "solat berikutnya" WAJIB dihitung dalam waktu Riyadh**, bukan
  `new Date()` lokal perangkat. Gunakan `Intl.DateTimeFormat('en-GB', {timeZone:
  'Asia/Riyadh', hour12:false, ...})` untuk mendapat jam & tanggal Riyadh saat ini.
- **"Hari ini" untuk kunci cache & parameter tanggal API** juga ditentukan di zona
  Riyadh (tengah malam Riyadh, bukan tengah malam WIB) supaya jadwal berganti hari
  tepat waktu.
- Kartu menampilkan label kecil penegas, mis. "Waktu Arab Saudi (WIB−4 jam)".

Helper murni yang mengisolasi ini:
- `getRiyadhNow(): { dateKey: string /* "DD-MM-YYYY" */, minutesOfDay: number }`
  — turunkan dari `Intl` parts, tanpa bergantung pada offset perangkat.
- `computeNextPrayer(timings, nowMinutes): { name, timeLabel, minutesUntil } | null`
  — jika semua waktu hari ini sudah lewat (setelah Isya), "berikutnya" = Subuh
  besok (tampilkan penanda "besok"; `minutesUntil` melintasi tengah malam).

### Cache

- `localStorage`, kunci `portal_prayer_<city>_<DD-MM-YYYY>` → simpan `timings` +
  `hijri`. Fetch sekali per kota per hari (Riyadh). Memory-cache di modul juga,
  seperti `quranApi.ts`.
- Saat offline / fetch gagal tapi ada cache hari ini → pakai cache.
- Bersihkan/abaikan entri tanggal lama secara pasif (tulis kunci baru; entri lama
  tidak mengganggu karena kunci mengandung tanggal).

## Resolusi kota utama (best-effort, default Mekkah)

Helper murni `resolvePrimaryCity(schedule, booking, riyadhDateKey): 'mekkah' | 'madinah'`:

1. **Default = `'mekkah'`.**
2. Naikkan ke `'madinah'` HANYA jika **kedua** syarat ini benar:
   - Perjalanan sedang berlangsung: tanggal Riyadh hari ini berada di rentang
     `booking.tgl_berangkat`..`booking.tgl_pulang` (inklusif; abaikan bila salah
     satu null).
   - Lokasi hari-berjalan di `schedule.itinerary` memuat kata kunci "madinah"
     (case-insensitive), sementara tidak lebih kuat menyebut Mekkah pada hari yang
     sama.
3. Bila `itinerary` tidak bisa di-parse (bertipe `unknown`/teks bebas) → tetap
   default Mekkah. Deteksi sengaja **konservatif**: lebih baik salah ke Mekkah
   (kota utama umroh) daripada menebak keliru.

Kota utama hanya menentukan **tab mana yang aktif saat pertama render**; kedua
kota selalu terjangkau lewat tab. Pengguna yang menekan tab lain mengalahkan
resolusi otomatis untuk sesi itu.

## UI kartu (`PrayerTimesCard`)

Lebar `max-w-lg` (sama seperti kolom Beranda), gaya konsisten dengan kartu portal
lain (rounded-2xl, border, shadow-sm, varian dark). Struktur:

1. **Header:** ikon + judul "Waktu Solat", tanggal Hijriah, label zona
   ("Waktu Arab Saudi").
2. **Tab Mekkah / Madinah** — tab kota utama aktif default.
3. **Sorotan solat berikutnya (kota aktif):** nama solat + jam + hitung mundur,
   mis. "Maghrib · 19:04 · 2j 14m lagi". Update tiap detik (atau tiap menit untuk
   hemat; detik lebih hidup — pilih detik dengan `requestAnimationFrame`/interval
   ringan). Tandai "besok" bila melewati Isya.
4. **Deret 5 waktu ringkas:** Subuh–Isya sejajar; waktu yang sudah lewat diredupkan,
   solat berikutnya di-highlight.

### State

- **Loading:** skeleton (placeholder baris), tidak menggeser layout Beranda.
- **Error tanpa cache:** kartu fallback ringkas — ikon + "Jadwal solat tak
  tersedia" + subteks kecil; **tidak** menaikkan error ke Beranda.
- **Offline dengan cache:** render normal dari cache; opsional tanda "tersimpan".

## Pengujian

- **Unit (murni, deterministik):**
  - `computeNextPrayer` — sebelum Subuh, di antara waktu, tepat di waktu, setelah
    Isya (→ Subuh besok).
  - `getRiyadhNow` — pemetaan jam/tanggal Riyadh benar untuk beberapa waktu UTC
    (termasuk kasus lintas-tengah-malam WIB vs Riyadh).
  - `resolvePrimaryCity` — default Mekkah; naik ke Madinah saat rentang+keyword
    cocok; tetap Mekkah saat itinerary tak bisa diparse / di luar rentang.
- **Komponen/integrasi:** gate FE = `tsc` + `npm run build` (ada ~6 error tsc
  pre-existing di luar portal — bukan blok). E2E/manual dijalankan oleh user
  (lihat memori `feedback_user_runs_e2e_tests`).
- **Manual checklist untuk user:** buka Beranda portal → kartu muncul di bawah
  Smart Alerts; tab Mekkah/Madinah berganti; hitung mundur bergerak; matikan
  jaringan lalu reload → cache dipakai; ubah jam perangkat ke WIB tengah malam →
  jadwal masih menunjuk hari Riyadh yang benar.

## Risiko & catatan

- **Ketergantungan Aladhan.** Jika API turun dan belum ada cache → fallback ringkas;
  tidak merusak Beranda. Tidak ada SLA; dapat diganti sumber lain di modul `lib`
  tanpa menyentuh UI.
- **Akurasi lokasi.** Deteksi kota utama sengaja lemah/konservatif karena
  `schedule.itinerary` bertipe bebas; ini cuma memengaruhi tab default, bukan
  kebenaran data.
- **Metode hitung.** Dipaku ke Umm al-Qura (`method=4`) — otoritas resmi Saudi;
  tidak diekspos ke pengguna.
