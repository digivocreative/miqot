-- Kalender: tambah pax_terisi = kursi terisi nasional (seat_total - seat_sisa
-- dari umroh_schedules via mapping jadwal_id). Keputusan user 10 Jun 2026:
-- angka utama kalender = isi grup nasional, bukan jamaah jaringan (pax_jamaah
-- tetap dipelihara sebagai metrik porsi jaringan utk MCP/analitik).
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS pax_terisi integer;

NOTIFY pgrst, 'reload schema';
