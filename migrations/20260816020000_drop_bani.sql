-- Fitur Bani (asisten AI in-app di /dashboard/bani) dihapus 2026-08-16.
--
-- Kode pendukungnya sudah dibuang dari repo: lib/bani-{access,glossary,
-- orchestrator,telegram}.js, src/components/bani/*, src/lib/bani*, endpoint
-- /api/bani/{ask,telegram}, dan wiring dashboard. Yang TETAP hidup adalah
-- lib/bani-tools.js + lib/bani-itinerary-index.js — registry tool itu dipakai
-- mcp-server.js dan tidak menyentuh tabel di bawah.
--
-- Migrasi ini membereskan sisa jejaknya di database:
--   1. tabel glosarium yang hanya dibaca lib/bani-glossary.js (sudah terhapus),
--   2. event analitik Bani, atas permintaan eksplisit pemilik data.
--
-- Penghapusan analitik TIDAK bisa dibatalkan. Jalankan sesudah deploy, supaya
-- event dari instance lama yang masih menyala ikut tersapu.

BEGIN;

-- 1. Glosarium istilah Bani ("tahun baru", "umroh dulu", dst.)
DROP TABLE IF EXISTS public.bani_glossary;

-- 2. Riwayat analitik. Nama event dikunci ke tiga ini saja supaya tidak ada
--    permukaan lain yang ikut terhapus.
DELETE FROM public.analytics_events
 WHERE event_name IN ('open_bani', 'bani_ask', 'bani_telegram');

DELETE FROM public.analytics_events_daily
 WHERE event_name IN ('open_bani', 'bani_ask', 'bani_telegram');

COMMIT;
