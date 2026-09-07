import { useEffect, useState } from 'react';

import type { PublicHotel } from '@/lib/hotelThumbs';

// Direktori hanya berisi puluhan hotel dan berubah sangat jarang, jadi diambil
// SEKALI per sesi lalu dipakai ulang oleh setiap kartu yang dibuka. Promise-nya
// yang di-cache, bukan hasilnya: dua rail yang dibuka hampir bersamaan tidak
// memicu dua permintaan.
let inflight: Promise<PublicHotel[]> | null = null;

function loadDirectory(): Promise<PublicHotel[]> {
  inflight ??= fetch('/api/hotels/public')
    .then((r) => (r.ok ? r.json() : null))
    .then((body) => (Array.isArray(body?.data) ? (body.data as PublicHotel[]) : []))
    // Direktori adalah pemanis: tanpa foto, rail tetap menampilkan nama,
    // bintang, dan jarak. Kegagalan di sini tidak boleh merah di halaman publik.
    .catch(() => []);
  return inflight;
}

/**
 * Direktori hotel publik (nama, kota, bintang, jarak, area, satu foto sampul).
 * Array kosong saat belum termuat atau saat pengambilan gagal.
 */
export function usePublicHotels(): PublicHotel[] {
  const [hotels, setHotels] = useState<PublicHotel[]>([]);

  useEffect(() => {
    let alive = true;
    loadDirectory().then((data) => {
      if (alive) setHotels(data);
    });
    return () => {
      alive = false;
    };
  }, []);

  return hotels;
}

export default usePublicHotels;
