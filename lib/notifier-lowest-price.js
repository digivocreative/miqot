// Harga "mulai" untuk pesan Telegram — WAJIB sama dengan header kartu paket
// (src/lib/packagePricing.ts HEADER_ROOMS). Dulu pakai daftar-hitam
// (buang Infant/Single saja), sehingga tipe kamar baru dari API seperti
// "No-bed" (anak tanpa kasur, 3–3,5 jt lebih murah dari Quard) ikut jadi
// harga termurah dan notifikasi "Paket baru" selalu lebih murah dari aplikasi.
// Daftar-putih: tipe kamar apa pun yang ditambah API di masa depan tetap di luar.
const HEADER_ROOMS = ['Quard', 'Triple', 'Double'];

export function getLowestPrice(paketHarga) {
  if (!paketHarga || typeof paketHarga !== 'object') return { lowest: null, roomType: '', paketType: '' };
  let lowest = Infinity;
  let roomType = '';
  let paketType = '';
  for (const [pType, rooms] of Object.entries(paketHarga)) {
    if (!rooms || typeof rooms !== 'object') continue;
    for (const rType of HEADER_ROOMS) {
      const numPrice = parseInt(rooms[rType], 10);
      if (!isNaN(numPrice) && numPrice > 0 && numPrice < lowest) {
        lowest = numPrice;
        roomType = rType;
        paketType = pType;
      }
    }
  }
  return lowest === Infinity
    ? { lowest: null, roomType: '', paketType: '' }
    : { lowest, roomType, paketType };
}
