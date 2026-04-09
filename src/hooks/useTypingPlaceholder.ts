import { useState, useEffect, useRef } from 'react';

const CATATAN_PLACEHOLDERS = [
  // === DEAL & BONUS ===
  "Bonus sarung + sajadah travel",
  "Cashback Rp500rb setelah kepulangan",
  "Free koper cabin size 20 inch",
  "Bonus oleh-oleh kurma 2kg",
  "Dapat potongan Rp1jt karena repeat order",
  "Janji upgrade koper ke 24 inch",
  "Free laundry 5kg selama perjalanan",
  "Bonus mukena travel + tasbih digital",
  "Diskon 2% karena referral dari Bu Siti",
  "Bonus foto profesional di Masjidil Haram",

  // === PEMBAYARAN ===
  "DP cicil 2x, lunas sebelum H-30",
  "Bayar via transfer BCA, konfirmasi manual",
  "Minta invoice resmi untuk kantor",
  "Cicilan ke-3 jatuh tempo 15 Agustus",
  "Pelunasan ditunggu sebelum Ramadhan",
  "DP kedua via BSI, bukti sudah dikirim WA",
  "Pembayaran dari anak, atas nama Rina",
  "Minta kwitansi terpisah untuk DP dan pelunasan",

  // === REQUEST KHUSUS ===
  "Request seat window, baris depan",
  "Minta kamar dekat lift, lantai rendah",
  "Butuh kursi roda di bandara",
  "Minta 1 kamar dengan Bu Aminah",
  "Tidak bisa naik tangga, minta kamar lantai 1",
  "Minta jadwal penerbangan pagi",
  "Request bus paling depan saat ziarah",
  "Mau sekamar dengan anaknya (Dian)",
  "Minta hotel view Masjid kalau available",

  // === KESEHATAN & CATATAN PENTING ===
  "Alergi kacang, info ke tour leader",
  "Riwayat asma, bawa inhaler sendiri",
  "Vegetarian, request makanan khusus",
  "Pakai alat bantu dengar",
  "Tidak kuat jalan jauh, perlu wheelchair",
  "Bawa obat darah tinggi, simpan di tas kabin",
  "Lansia 75 tahun, butuh pendampingan ekstra",
  "Diabetes, hindari makanan manis berlebih",

  // === DOKUMEN & PERLENGKAPAN ===
  "Paspor baru, belum ada visa",
  "Foto paspor sudah dikirim via WA",
  "Ukuran baju batik: XL",
  "Paspor expired, proses perpanjangan",
  "Belum punya paspor, bantu urus",
  "Surat mahram sudah diurus",
  "Ukuran sepatu 42 untuk sandal haji",

  // === UPGRADE & PERUBAHAN ===
  "Upgrade hotel Madinah ke Quad",
  "Minta pindah ke paket Plus kalau ada seat",
  "Awalnya Triple, upgrade ke Double",
  "Pindah dari grup 168 ke grup 170",
  "Cancel lama, re-book paket baru",
  "Minta extend 3 hari di Jeddah",

  // === LAIN-LAIN ===
  "Pertama kali umroh, butuh bimbingan ekstra",
  "Repeat jamaah, sudah 3x umroh",
  "Suami-istri, pastikan 1 grup",
  "Ikut rombongan masjid Al-Ikhlas Bekasi",
  "Titip salam untuk Tour Leader Pak Hendra",
  "Minta diingatkan bawa adapter colokan listrik",
  "Gabung dari kota lain, ketemu di bandara",
];

function shuffle(): number[] {
  const arr = Array.from({ length: CATATAN_PLACEHOLDERS.length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function useTypingPlaceholder(isEditing: boolean): string {
  const [placeholder, setPlaceholder] = useState('');
  const idxRef = useRef<number[]>([]);
  const posRef = useRef(0);

  useEffect(() => {
    if (!isEditing) {
      setPlaceholder('');
      return;
    }

    if (idxRef.current.length === 0) idxRef.current = shuffle();

    let charIdx = 0;
    let deleting = false;
    let timeout: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const current = () => CATATAN_PLACEHOLDERS[idxRef.current[posRef.current]];

    const tick = () => {
      if (cancelled) return;
      const text = current();

      if (!deleting) {
        charIdx++;
        setPlaceholder(text.slice(0, charIdx));
        if (charIdx >= text.length) {
          timeout = setTimeout(() => { deleting = true; tick(); }, 1800);
          return;
        }
        timeout = setTimeout(tick, 45 + Math.random() * 35);
      } else {
        charIdx--;
        setPlaceholder(text.slice(0, charIdx));
        if (charIdx <= 0) {
          deleting = false;
          posRef.current++;
          if (posRef.current >= idxRef.current.length) {
            idxRef.current = shuffle();
            posRef.current = 0;
          }
          timeout = setTimeout(tick, 400);
          return;
        }
        timeout = setTimeout(tick, 25);
      }
    };

    tick();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [isEditing]);

  return placeholder;
}
