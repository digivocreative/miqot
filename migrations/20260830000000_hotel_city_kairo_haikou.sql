-- Buka kategori kota baru di Direktori Hotel: kairo & haikou (permintaan user
-- 2026-08-30). Ditemukan lewat audit "hotel dipakai di paket 1448H tapi belum
-- ada di menu Hotel" — TIBA PYRAMID/GAWHARET AL AHRAM HOTEL/PYRAMIDS GEM PLAZA
-- (ekstensi Mesir) dan MEILAN INTERNASIONAL AIRPORT HOTEL (ekstensi Haikou)
-- dipakai di paket_hotel tapi tak punya kategori kota di tabel hotels.
-- Bukan kota masjid → tanpa HOTEL_CITY_LANDMARKS, sama seperti turki/dubai.
BEGIN;

ALTER TABLE hotels DROP CONSTRAINT hotels_city_check;
ALTER TABLE hotels ADD CONSTRAINT hotels_city_check
  CHECK (city IN ('mekkah','madinah','turki','dubai','kairo','haikou'));

ALTER TABLE hotel_city_banners DROP CONSTRAINT hotel_city_banners_city_check;
ALTER TABLE hotel_city_banners ADD CONSTRAINT hotel_city_banners_city_check
  CHECK (city IN ('mekkah','madinah','turki','dubai','kairo','haikou'));

COMMIT;
NOTIFY pgrst, 'reload schema';
