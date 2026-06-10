-- Pax jamaah jaringan untuk calendar dashboard. Kolom pax warisan scrape
-- legacy = kuota grup nasional (identik seat_total umroh_schedules), bukan
-- jumlah jamaah ter-booking — dashboard butuh hitungan jamaah jaringan agent
-- (tabel jamaah). jadwal_id diisi hasil mapping baris kalender → jadwal
-- (lib/calendar-jadwal-match.js); pax_jamaah NULL berarti belum/tak ter-map
-- (frontend fallback ke pax legacy).
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS jadwal_id text;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS pax_jamaah integer;

-- Agregat jumlah jamaah jaringan per jadwal. Dedup (id_umroh, jm_id) karena
-- booking yang sama bisa tercatat di lebih dari satu agent.
CREATE OR REPLACE VIEW jamaah_network_pax AS
SELECT raw_data->>'id_jadwal' AS jadwal_id,
       count(DISTINCT (id_umroh, jm_id))::int AS pax
FROM jamaah
WHERE COALESCE(raw_data->>'id_jadwal', '') <> ''
GROUP BY 1;

-- View berjalan sebagai owner (melewati RLS jamaah) — batasi ke service_role.
REVOKE ALL ON jamaah_network_pax FROM anon, authenticated;
GRANT SELECT ON jamaah_network_pax TO service_role;

NOTIFY pgrst, 'reload schema';
