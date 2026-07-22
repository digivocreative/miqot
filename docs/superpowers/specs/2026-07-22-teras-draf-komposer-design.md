# Spec: Draf Komposer Teras

Tanggal: 2026-07-22
Status: menunggu review user

## Tujuan

Ketikan di komposer Teras (utas di feed maupun balasan/komentar) tidak hilang saat tab tertutup, halaman berpindah, atau aplikasi di-refresh. Utas bisa sampai 10 segmen — investasi ketikan yang besar untuk hilang karena satu kali salah pencet.

## Ruang lingkup

- **Termasuk:** komposer utama di feed (multi-segmen) dan komposer balasan/komentar di detail kiriman (per kiriman).
- **Tidak termasuk:** lampiran media (blob belum terunggah sampai tombol Kirim ditekan; tidak muat dan tidak pantas disimpan di localStorage), draf lintas perangkat (butuh backend — sengaja tidak dibangun), daftar multi-draf ala X/Twitter.

## Model

Satu slot per konteks, auto-save, pulih otomatis tanpa prompt.

### Penyimpanan & kunci

localStorage, best-effort: semua operasi dibungkus try/catch; gagal baca/tulis (quota penuh, mode privat) = fitur diam-diam nonaktif, tidak pernah memunculkan error ke user.

- Komposer utama: `teras:draft:<agentId>:feed`
- Balasan: `teras:draft:<agentId>:reply:<postId>`

`agentId` ada di kunci supaya draf tidak bocor antar-akun pada perangkat yang sama.

### Bentuk data

```json
{ "v": 1, "savedAt": 1753142400000, "segments": ["teks segmen 1", "teks segmen 2"] }
```

- Komposer utama: `segments` = array isi `body` per segmen (urut). Segmen direkonstruksi saat pemulihan lewat `blankComposerSegment()` + isi `body`; `key`/`id` baru dibuat ulang (client_id idempotensi memang harus baru).
- Balasan: `segments` berisi satu elemen (input komentar tunggal, state `commentPanel.input`).
- `v` = versi skema; versi tak dikenal → draf dibuang.

### Auto-save

- Debounce ±500 ms setiap teks berubah.
- Semua teks kosong (trim) → kunci dihapus. Mengosongkan komposer = membuang draf; tidak ada tombol "hapus draf" terpisah.
- Media tidak disimpan. Jika ada lampiran terpasang saat draf tersimpan, komposer menampilkan keterangan kecil: "Lampiran tidak ikut tersimpan di draf".

### Pemulihan

- Saat komposer di-mount **dan masih kosong**, draf diisikan langsung tanpa prompt. Komposer yang sudah berisi (mis. navigasi internal tanpa unmount) tidak ditimpa.
- Kedaluwarsa: draf dengan `savedAt` lebih tua dari **7 hari** diabaikan dan kuncinya dihapus saat dibaca.

### Kebersihan

- Kirim sukses → kunci konteks itu dihapus.
- Pemangkasan draf balasan: maksimal **20 kunci** `reply:*` per agent; saat menyimpan yang baru, kunci dengan `savedAt` terlama dibuang. Kunci feed tidak ikut dihitung.

## Struktur kode

- **`src/lib/terasDraft.ts` (baru):** logika murni — serialisasi/deserialisasi + validasi bentuk, cek kedaluwarsa, pembentukan kunci, pemangkasan reply. Tanpa dependensi React; menerima objek storage sebagai parameter supaya bisa diuji unit tanpa jsdom-localStorage sungguhan.
- **Hook tipis di TerasPage.tsx:** memanggil modul di atas; efek debounce untuk simpan, satu kali baca saat mount untuk pulihkan. State komposer yang ada (`composerSegments`, `commentPanel.input`) tidak berubah bentuk — draf hanya membaca/menulisnya dari luar.
- Tidak ada migrasi DB, tidak ada endpoint baru, tidak ada perubahan server.js.

## Penanganan galat

- localStorage tak tersedia/penuh: fitur nonaktif senyap.
- Data korup/versi tak dikenal di kunci draf: kunci dihapus, komposer mulai kosong.
- JSON.parse dibungkus try/catch — nilai apa pun yang tidak lolos validasi bentuk diperlakukan sebagai korup.

## Pengujian

- Unit test `src/lib/terasDraft.ts`: simpan→muat bulat-balik, kedaluwarsa 7 hari, pemangkasan 20 kunci, data korup, storage yang melempar.
- Verifikasi FE: `tsc` + `vite build` (gate build, bukan tsc-bersih — ada ~6 error pre-existing).
- E2E manual (dijalankan user): ketik utas → refresh → ketikan pulih; kirim → refresh → komposer kosong; ketik balasan di kiriman A → buka kiriman B → kembali ke A → balasan pulih; pasang lampiran → lihat keterangan lampiran tidak tersimpan.
