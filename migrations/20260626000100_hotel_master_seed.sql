-- Seed hotel_master with the 13 canonical hotels actually referenced by active
-- 1448/1449 schedules. Facts are curated (stars/distance/walk/view/elderly) and
-- can be refined later via the admin CRUD. `aliases` are the NORMALIZED raw-name
-- variants (uppercase, star markers + /SETARAF stripped, spaces collapsed) so the
-- canonicalizer in lib/hotel-master.js can resolve messy paket_hotel strings.
-- Idempotent: re-running upserts curated columns but preserves photo_url if set.

INSERT INTO hotel_master
  (slug, name, city, stars, distance_label, walk_minutes, view_haram, elderly_friendly, facilities, description, aliases, sort_order)
VALUES
  -- ── Mekkah ──
  ('pullman-zamzam', 'Pullman ZamZam Makkah', 'mekkah', 5, '±50m', 1, true, true,
   '["View Masjidil Haram","Food court & retail","Lift banyak","Dekat lift menuju mataf"]'::jsonb,
   'Bagian dari kompleks Abraj Al Bait (Zamzam Tower) tepat di depan Masjidil Haram. Sebagian kamar menghadap Ka''bah. Sangat cocok untuk lansia karena akses tercepat ke pelataran.',
   '["PULLMAN ZAMZAM"]'::jsonb, 10),

  ('movenpick-hajar-tower', 'Movenpick Hajar Tower Makkah', 'mekkah', 5, '±100m', 2, true, true,
   '["Sebagian view Haram","Terhubung area komersial","Lift banyak"]'::jsonb,
   'Menara di kompleks Abraj Al Bait, sangat dekat dengan gerbang Masjidil Haram. Akses jalan kaki singkat, ramah untuk jamaah lansia.',
   '["MOVENPICK"]'::jsonb, 20),

  ('jumeirah-jabal-omar', 'Jumeirah Jabal Omar Makkah', 'mekkah', 5, '±250m', 4, false, true,
   '["Hotel mewah","Akses skywalk ke Haram","Restoran beragam"]'::jsonb,
   'Hotel bintang 5 premium di kawasan Jabal Omar dengan akses pedestrian/skywalk menuju Masjidil Haram. Pilihan jamaah yang mengutamakan kenyamanan.',
   '["JUMEIRAH JABAL OMAR MAKKAH"]'::jsonb, 30),

  ('prestige-elaf-al-mashaer', 'Prestige Ex Elaf Al Mashaer', 'mekkah', 4, '±300m', 5, false, true,
   '["Dekat Zamzam area","Shuttle/akses jalan kaki"]'::jsonb,
   'Hotel di kawasan dekat Masjidil Haram, jarak jalan kaki sekitar 5 menit. Sering dipakai paket tier menengah.',
   '["PRESTIGE EX ELAF AL MASHAER"]'::jsonb, 40),

  ('al-massa-grand', 'Al Massa Grand', 'mekkah', 4, '±400m', 6, false, false,
   '["Kawasan jabal omar/ajyad","Akses jalan kaki sedang"]'::jsonb,
   'Hotel bintang 4 dengan jarak sekitar 400m ke Masjidil Haram. Cocok untuk paket hemat dengan tetap dekat ke area Haram.',
   '["AL MASSA GRAND"]'::jsonb, 50),

  ('anjum-makkah', 'Anjum Hotel Makkah', 'mekkah', 4, '±450m', 6, false, false,
   '["Hotel besar","Banyak kamar","Restoran prasmanan"]'::jsonb,
   'Hotel berkapasitas besar di kawasan Jabal Omar, jarak jalan kaki sekitar 6 menit ke Masjidil Haram.',
   '["ANJUM"]'::jsonb, 60),

  ('al-massa-dar-al-fayzeen', 'Al Massa Dar Al Fayzeen', 'mekkah', 4, '±1.8km', null, false, false,
   '["Layanan shuttle bus ke Haram"]'::jsonb,
   'Hotel bintang 4 yang lebih jauh dari Masjidil Haram (±1.8km); umumnya disediakan layanan shuttle. Kurang ideal untuk jamaah lansia yang ingin sering ke Haram.',
   '["AL MASSA DAR AL FAYZEEN"]'::jsonb, 70),

  -- ── Madinah ──
  ('al-haram-madinah', 'Al Haram Madinah', 'madinah', 4, '±50m', 1, true, true,
   '["Menghadap Masjid Nabawi","Akses tercepat","Lift"]'::jsonb,
   'Hotel tepat di depan Masjid Nabawi. Sebagian kamar menghadap masjid. Sangat ramah lansia karena akses jalan kaki paling singkat.',
   '["AL HARAM"]'::jsonb, 10),

  ('anwar-al-madinah-movenpick', 'Anwar Al Madinah Movenpick', 'madinah', 5, '±200m', 3, false, true,
   '["Hotel bintang 5","Restoran beragam","Dekat gerbang Nabawi"]'::jsonb,
   'Hotel bintang 5 di area sekitar Masjid Nabawi dengan fasilitas lengkap. Jarak jalan kaki singkat menuju pelataran.',
   '["ANWAR ALMADINAH MOVENPICK","ANWAR AL MADINAH MOVENPICK"]'::jsonb, 20),

  ('al-ritz-al-madinah', 'Al Ritz Al Madinah', 'madinah', 4, '±300m', 4, false, true,
   '["Kawasan pusat","Akses jalan kaki sedang"]'::jsonb,
   'Hotel bintang 4 di kawasan sekitar Masjid Nabawi, jarak jalan kaki sekitar 4 menit. Hotel Madinah yang paling sering dipakai paket.',
   '["AL RITZ AL MADINAH"]'::jsonb, 30),

  ('odst-al-madinah', 'ODST Al Madinah', 'madinah', 3, '±200m', 3, false, true,
   '["Hotel ekonomis","Dekat area Nabawi"]'::jsonb,
   'Hotel kelas ekonomis di kawasan Masjid Nabawi dengan jarak jalan kaki sekitar 3 menit. Sering dipakai paket hemat.',
   '["ODST ALMADINAH","ODST AL MADINAH"]'::jsonb, 40),

  ('province-al-sham', 'Province Al Sham', 'madinah', 4, '±300m', 4, false, false,
   '["Akses jalan kaki sedang"]'::jsonb,
   'Hotel di kawasan Masjid Nabawi, jarak jalan kaki sekitar 4 menit.',
   '["PROVINCE ALSHAM","PROVINCE AL SHAM"]'::jsonb, 50),

  ('triple-one-madinah', 'Triple One Madinah', 'madinah', 3, '±350m', 5, false, false,
   '["Hotel ekonomis"]'::jsonb,
   'Hotel kelas ekonomis di kawasan Madinah, jarak jalan kaki sekitar 5 menit ke Masjid Nabawi.',
   '["TRIPLE ONE"]'::jsonb, 60)

ON CONFLICT (slug) DO UPDATE SET
  name             = EXCLUDED.name,
  city             = EXCLUDED.city,
  stars            = EXCLUDED.stars,
  distance_label   = EXCLUDED.distance_label,
  walk_minutes     = EXCLUDED.walk_minutes,
  view_haram       = EXCLUDED.view_haram,
  elderly_friendly = EXCLUDED.elderly_friendly,
  facilities       = EXCLUDED.facilities,
  description      = EXCLUDED.description,
  aliases          = EXCLUDED.aliases,
  sort_order       = EXCLUDED.sort_order,
  updated_at       = now();
